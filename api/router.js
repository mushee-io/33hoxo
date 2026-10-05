import { Connection } from "@solana/web3.js";
import { runtimeConfig, requireMainnetSafety } from "../lib/server/runtime.js";
import { shutterBase } from "../lib/server/shutter.js";
import { createWalletChallenge } from "../lib/server/walletAuth.js";
import {
  authorizeIntentWrite,
  authorizeOwnedIntent,
  requireCron,
} from "../lib/server/auth.js";
import {
  insertIntent,
  listIntents,
  getIntent,
  cancelIntent,
  revealCandidates,
  rowToRecord,
  markExecuting,
  markExecuted,
} from "../lib/server/intentStore.js";
import { publicIntent } from "../lib/server/publicIntent.js";
import { revealOne } from "../lib/server/revealOne.js";

const ALLOWED_SHUTTER_PATHS = new Set([
  "/api/check_authentication",
  "/api/time/register_identity",
  "/api/time/get_data_for_encryption",
  "/api/time/get_decryption_key",
]);

function methodNotAllowed(res, allow) {
  res.setHeader("allow", allow);
  return res.status(405).json({ error: "Method not allowed." });
}

function errorResponse(res, error, fallback = 500) {
  return res.status(error?.status || fallback).json({
    error: error instanceof Error ? error.message : String(error),
  });
}

async function handleHealth(req, res) {
  return res.status(200).json({
    service: "33hoxo",
    status: "ok",
    protocolVersion: 1,
    shutterNetwork: runtimeConfig().shutterNetwork,
    settlement: runtimeConfig().solanaCluster,
    adapters: ["maryjane-solana-v1", "sealed-auction-v1"],
  });
}

async function handleConfig(req, res) {
  const config = runtimeConfig();
  return res.status(200).json({
    environment: config.environment,
    shutterNetwork: config.shutterNetwork,
    solanaCluster: config.solanaCluster,
    mainnetEnabled: config.mainnetEnabled,
    maxMainnetQuantityBaseUnits: config.maxMainnetQuantityBaseUnits,
    allowedMainnetAdapters: config.allowedMainnetAdapters,
    allowedMainnetMarkets: config.allowedMainnetMarkets,
  });
}

async function handleReadiness(req, res) {
  const config = runtimeConfig();
  const checks = {
    database: Boolean(process.env.DATABASE_URL),
    walletAuth: Boolean(process.env.HOXO_AUTH_SECRET),
    cronSecret: Boolean(process.env.CRON_SECRET),
    shutterNetworkConfigured: Boolean(process.env.SHUTTER_NETWORK),
    solanaRpc: Boolean(process.env.SOLANA_RPC_URL),
    maryJaneDevnet: Boolean(process.env.MARYJANE_ORDER_PLACE_URL),
    externalApiKeys: Boolean(process.env.HOXO_API_KEYS),
    mainnetBackend:
      config.solanaCluster !== "mainnet-beta" ||
      Boolean(process.env.MARYJANE_MAINNET_ORDER_PLACE_URL),
    mainnetSafetyGate:
      config.solanaCluster !== "mainnet-beta" || config.mainnetEnabled,
    mainnetMarkets:
      config.solanaCluster !== "mainnet-beta" ||
      config.allowedMainnetMarkets.length > 0,
  };

  const requiredForStaging = [
    "database",
    "walletAuth",
    "cronSecret",
    "shutterNetworkConfigured",
    "solanaRpc",
    "maryJaneDevnet",
  ];
  const requiredForMainnet = [
    ...requiredForStaging,
    "mainnetBackend",
    "mainnetSafetyGate",
    "mainnetMarkets",
  ];
  const required =
    config.solanaCluster === "mainnet-beta"
      ? requiredForMainnet
      : requiredForStaging;
  const missing = required.filter((key) => !checks[key]);

  return res.status(missing.length ? 503 : 200).json({
    ready: missing.length === 0,
    environment: config.environment,
    shutterNetwork: config.shutterNetwork,
    solanaCluster: config.solanaCluster,
    checks,
    missing,
  });
}

async function handleAuthChallenge(req, res) {
  if (req.method !== "GET") return methodNotAllowed(res, "GET");
  try {
    return res.status(200).json(
      createWalletChallenge(String(req.query.wallet || ""))
    );
  } catch (error) {
    return errorResponse(res, error);
  }
}

async function handleShutter(req, res) {
  const config = runtimeConfig();
  const requested = Array.isArray(req.query?.network)
    ? req.query.network[0]
    : req.query?.network;
  const network =
    requested === "gnosis" || requested === "chiado"
      ? requested
      : config.shutterNetwork;

  if (config.environment === "production" && network !== config.shutterNetwork) {
    return res.status(403).json({
      error: "Requested Shutter network is not enabled for this deployment.",
    });
  }

  const upstreamBase = shutterBase(network);
  const rawPath = Array.isArray(req.query?.path)
    ? req.query.path[0]
    : req.query?.path;

  if (typeof rawPath !== "string" || !rawPath.startsWith("/api/")) {
    return res.status(400).json({
      error: "A valid Shutter API path is required.",
    });
  }

  const target = new URL(rawPath, upstreamBase);
  if (
    target.origin !== upstreamBase ||
    !ALLOWED_SHUTTER_PATHS.has(target.pathname)
  ) {
    return res.status(403).json({
      error: "Shutter proxy path is not allowed.",
    });
  }

  const method = String(req.method || "GET").toUpperCase();
  if (method !== "GET" && method !== "POST") {
    return methodNotAllowed(res, "GET, POST");
  }

  const headers = { accept: "application/json" };
  if (method === "POST") headers["content-type"] = "application/json";
  if (process.env.SHUTTER_API_KEY) {
    headers.authorization = `Bearer ${process.env.SHUTTER_API_KEY}`;
  }

  try {
    const upstream = await fetch(target, {
      method,
      headers,
      body: method === "POST" ? JSON.stringify(req.body ?? {}) : undefined,
      signal: AbortSignal.timeout(30000),
    });

    const body = await upstream.text();
    const contentType = upstream.headers.get("content-type");
    if (contentType) res.setHeader("content-type", contentType);
    res.setHeader("x-33hoxo-shutter-network", network);
    return res.status(upstream.status).send(body);
  } catch (error) {
    console.error("33HOXO Shutter proxy error", error);
    return res.status(502).json({
      error: "Shutter upstream request failed.",
    });
  }
}

async function handleMaryJane(req, res) {
  if (req.method !== "POST") return methodNotAllowed(res, "POST");

  try {
    const config = runtimeConfig();
    const requestedCluster =
      req.body?.cluster === "mainnet-beta" ? "mainnet-beta" : "devnet";

    if (requestedCluster !== config.solanaCluster) {
      return res.status(409).json({
        code: "CLUSTER_MISMATCH",
        error: `Deployment is configured for ${config.solanaCluster}, not ${requestedCluster}.`,
      });
    }

    if (requestedCluster === "mainnet-beta") {
      requireMainnetSafety(config);

      if (!config.allowedMainnetAdapters.includes("maryjane-solana-v1")) {
        return res.status(403).json({
          code: "ADAPTER_NOT_ALLOWED",
          error: "Mary Jane adapter is not allowlisted for mainnet beta.",
        });
      }

      const market = String(req.body?.market || "");
      if (
        config.allowedMainnetMarkets.length > 0 &&
        !config.allowedMainnetMarkets.includes(market)
      ) {
        return res.status(403).json({
          code: "MARKET_NOT_ALLOWED",
          error: "Market is not allowlisted for mainnet beta.",
        });
      }

      const quantity = BigInt(String(req.body?.sharesBaseUnits || "0"));
      const max = BigInt(config.maxMainnetQuantityBaseUnits);
      if (quantity <= 0n || quantity > max) {
        return res.status(403).json({
          code: "MAINNET_QUANTITY_CAP",
          error: `Mainnet beta quantity must be between 1 and ${max.toString()} base units.`,
        });
      }
    }

    const configured =
      requestedCluster === "mainnet-beta"
        ? process.env.MARYJANE_MAINNET_ORDER_PLACE_URL
        : process.env.MARYJANE_ORDER_PLACE_URL ||
          "https://maryjane-blue.vercel.app/api/order-place";

    if (!configured) {
      return res.status(503).json({
        code: "MARYJANE_NOT_CONFIGURED",
        error: `Mary Jane ${requestedCluster} order endpoint is not configured.`,
      });
    }

    const upstream = await fetch(new URL(configured), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify({
        wallet: req.body?.wallet,
        market: req.body?.market,
        side: req.body?.side,
        kind: req.body?.kind,
        priceBps: req.body?.priceBps,
        sharesBaseUnits: req.body?.sharesBaseUnits,
      }),
      signal: AbortSignal.timeout(30000),
    });

    const body = await upstream.text();
    const contentType = upstream.headers.get("content-type");
    if (contentType) res.setHeader("content-type", contentType);
    res.setHeader("x-33hoxo-solana-cluster", requestedCluster);
    return res.status(upstream.status).send(body);
  } catch (error) {
    console.error("33HOXO Mary Jane proxy error", error);
    return res
      .status(error?.code === "MAINNET_DISABLED" ? 403 : 502)
      .json({
        code: error?.code || "MARYJANE_UPSTREAM_FAILED",
        error:
          error instanceof Error
            ? error.message
            : "Mary Jane order preparation request failed.",
      });
  }
}

async function handleIntents(req, res) {
  try {
    if (req.method === "GET") {
      const records = await listIntents(req.query.limit);
      return res.status(200).json({
        intents: records.map(publicIntent),
      });
    }

    if (req.method === "POST") {
      const auth = authorizeIntentWrite(req);
      const record = await insertIntent(req.body, auth.ownerWallet);
      return res.status(202).json(publicIntent(record));
    }

    return methodNotAllowed(res, "GET, POST");
  } catch (error) {
    return errorResponse(res, error);
  }
}

async function handleIntent(req, res) {
  if (req.method !== "GET") return methodNotAllowed(res, "GET");
  try {
    const record = await getIntent(String(req.query.commitment || ""));
    if (!record) {
      return res.status(404).json({ error: "Unknown commitment." });
    }
    return res.status(200).json(publicIntent(record));
  } catch (error) {
    return errorResponse(res, error);
  }
}

async function handleCancel(req, res) {
  if (req.method !== "POST") return methodNotAllowed(res, "POST");
  try {
    const commitment = String(req.query.commitment || "");
    const existing = await getIntent(commitment);
    if (!existing) {
      return res.status(404).json({ error: "Unknown commitment." });
    }
    authorizeOwnedIntent(req, existing);
    return res.status(200).json(publicIntent(await cancelIntent(commitment)));
  } catch (error) {
    return errorResponse(res, error);
  }
}

async function handleReveal(req, res) {
  if (req.method !== "POST") return methodNotAllowed(res, "POST");
  try {
    const commitment = String(req.query.commitment || "");
    const record = await getIntent(commitment);
    if (!record) {
      return res.status(404).json({ error: "Unknown commitment." });
    }
    authorizeOwnedIntent(req, record);
    const result = await revealOne(record);
    return res
      .status(result.status === "RETRYABLE" ? 202 : 200)
      .json(result);
  } catch (error) {
    return errorResponse(res, error);
  }
}

async function handleInternalReveal(req, res) {
  try {
    requireCron(req);
    if (req.method !== "GET" && req.method !== "POST") {
      return methodNotAllowed(res, "GET, POST");
    }
    const rows = await revealCandidates(50);
    const results = [];
    for (const row of rows) {
      results.push(await revealOne(rowToRecord(row)));
    }
    return res.status(200).json({
      processed: results.length,
      results,
    });
  } catch (error) {
    return errorResponse(res, error);
  }
}

async function handleSettlementSubmit(req, res) {
  if (req.method !== "POST") return methodNotAllowed(res, "POST");
  try {
    const commitment = String(req.body?.commitment || "");
    const signature = String(req.body?.signature || "");
    if (!commitment || !signature) {
      return res.status(400).json({
        error: "commitment and signature are required.",
      });
    }

    const existing = await getIntent(commitment);
    if (!existing) {
      return res.status(404).json({ error: "Unknown commitment." });
    }
    authorizeOwnedIntent(req, existing);
    const record = await markExecuting(commitment, signature);
    return res.status(202).json(publicIntent(record));
  } catch (error) {
    return errorResponse(res, error);
  }
}

async function handleSettlementStatus(req, res) {
  if (req.method !== "POST") return methodNotAllowed(res, "POST");

  try {
    const signature = String(req.body?.signature || "");
    const commitment = String(req.body?.commitment || "");
    if (!signature || !commitment) {
      return res.status(400).json({
        error: "signature and commitment are required.",
      });
    }

    const record = await getIntent(commitment);
    if (!record) {
      return res.status(404).json({ error: "Unknown commitment." });
    }
    authorizeOwnedIntent(req, record);

    if (
      record.state !== "EXECUTING" ||
      record.transactionId !== signature
    ) {
      return res.status(409).json({
        error: "Settlement signature is not registered for this commitment.",
      });
    }

    const config = runtimeConfig();
    const rpc =
      process.env.SOLANA_RPC_URL ||
      (config.solanaCluster === "mainnet-beta"
        ? "https://api.mainnet-beta.solana.com"
        : "https://api.devnet.solana.com");

    const connection = new Connection(rpc, "confirmed");
    const result = await connection.getSignatureStatus(signature, {
      searchTransactionHistory: true,
    });

    if (result.value?.err) {
      return res.status(409).json({
        status: "FAILED",
        error: result.value.err,
      });
    }

    const status = result.value?.confirmationStatus || "unknown";
    if (status === "confirmed" || status === "finalized") {
      const executed = await markExecuted(commitment, signature);
      return res.status(200).json({
        status: "CONFIRMED",
        signature,
        cluster: config.solanaCluster,
        intent: publicIntent(executed),
      });
    }

    return res.status(202).json({
      status: "PENDING",
      signature,
      cluster: config.solanaCluster,
    });
  } catch (error) {
    return errorResponse(res, error);
  }
}

export default async function handler(req, res) {
  res.setHeader("cache-control", "no-store");

  const route = String(req.query.route || "");

  switch (route) {
    case "health":
      return handleHealth(req, res);
    case "config":
      return handleConfig(req, res);
    case "readiness":
      return handleReadiness(req, res);
    case "auth/challenge":
      return handleAuthChallenge(req, res);
    case "shutter":
      return handleShutter(req, res);
    case "maryjane":
      return handleMaryJane(req, res);
    case "v1/intents":
      return handleIntents(req, res);
    case "v1/intent":
      return handleIntent(req, res);
    case "v1/intent/cancel":
      return handleCancel(req, res);
    case "v1/intent/reveal":
      return handleReveal(req, res);
    case "internal/reveal":
      return handleInternalReveal(req, res);
    case "settlement/submit":
      return handleSettlementSubmit(req, res);
    case "settlement/status":
      return handleSettlementStatus(req, res);
    default:
      return res.status(404).json({ error: "Unknown API route." });
  }
}
