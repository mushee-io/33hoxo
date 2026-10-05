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
  console.error("33HOXO API error", error);
  return res.status(error?.status || fallback).json({
    error: error instanceof Error ? error.message : String(error),
  });
}

async function handleHealth(req, res) {
  const { runtimeConfig } = await import("../lib/server/runtime.js");
  const config = runtimeConfig();
  return res.status(200).json({
    service: "33hoxo",
    status: "ok",
    protocolVersion: 1,
    shutterNetwork: config.shutterNetwork,
    settlement: config.solanaCluster,
    adapters: ["maryjane-solana-v1", "sealed-auction-v1"],
  });
}

async function handleConfig(req, res) {
  const { runtimeConfig } = await import("../lib/server/runtime.js");
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
  const { runtimeConfig } = await import("../lib/server/runtime.js");
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
    const { createWalletChallenge } = await import("../lib/server/walletAuth.js");
    return res.status(200).json(
      createWalletChallenge(String(req.query.wallet || ""))
    );
  } catch (error) {
    return errorResponse(res, error);
  }
}

async function handleShutter(req, res) {
  const { runtimeConfig } = await import("../lib/server/runtime.js");
  const { shutterBase } = await import("../lib/server/shutter.js");
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
    return errorResponse(res, error, 502);
  }
}

async function handleMaryJane(req, res) {
  if (req.method !== "POST") return methodNotAllowed(res, "POST");

  try {
    const { runtimeConfig, requireMainnetSafety } =
      await import("../lib/server/runtime.js");
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
    return errorResponse(res, error, 502);
  }
}

async function handleIntents(req, res) {
  try {
    const { insertIntent, listIntents } =
      await import("../lib/server/intentStore.js");
    const { publicIntent } = await import("../lib/server/publicIntent.js");

    if (req.method === "GET") {
      const records = await listIntents(req.query.limit);
      return res.status(200).json({
        intents: records.map(publicIntent),
      });
    }

    if (req.method === "POST") {
      const { authorizeIntentWrite } = await import("../lib/server/auth.js");
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
    const { getIntent } = await import("../lib/server/intentStore.js");
    const { publicIntent } = await import("../lib/server/publicIntent.js");
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
    const { authorizeOwnedIntent } = await import("../lib/server/auth.js");
    const { cancelIntent, getIntent } =
      await import("../lib/server/intentStore.js");
    const { publicIntent } = await import("../lib/server/publicIntent.js");
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
    const { authorizeOwnedIntent } = await import("../lib/server/auth.js");
    const { getIntent } = await import("../lib/server/intentStore.js");
    const { revealOne } = await import("../lib/server/revealOne.js");
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
    const { requireCron } = await import("../lib/server/auth.js");
    const { revealCandidates, rowToRecord } =
      await import("../lib/server/intentStore.js");
    const { revealOne } = await import("../lib/server/revealOne.js");
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
    const { authorizeOwnedIntent } = await import("../lib/server/auth.js");
    const { getIntent, markExecuting } =
      await import("../lib/server/intentStore.js");
    const { publicIntent } = await import("../lib/server/publicIntent.js");
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
    const { authorizeOwnedIntent } = await import("../lib/server/auth.js");
    const { runtimeConfig } = await import("../lib/server/runtime.js");
    const { getIntent, markExecuted } =
      await import("../lib/server/intentStore.js");
    const { getSignatureStatusRaw } =
      await import("../lib/server/solanaRpc.js");
    const { publicIntent } = await import("../lib/server/publicIntent.js");

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
    const result = await getSignatureStatusRaw(signature);

    if (result?.err) {
      return res.status(409).json({
        status: "FAILED",
        error: result.err,
      });
    }

    const status = result?.confirmationStatus || "unknown";
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


async function handleVerify(req, res) {
  if (req.method !== "POST") return methodNotAllowed(res, "POST");
  try {
    const { authorizeOwnedIntent } = await import("../lib/server/auth.js");
    const { getIntent, markVerified } =
      await import("../lib/server/intentStore.js");
    const { verifyRevealedForRecord } =
      await import("../lib/server/verifyRevealed.js");
    const { publicIntent } = await import("../lib/server/publicIntent.js");

    const commitment = String(req.query.commitment || "");
    const record = await getIntent(commitment);
    if (!record) {
      return res.status(404).json({ error: "Unknown commitment." });
    }
    authorizeOwnedIntent(req, record);

    const revealedIntent = req.body?.intent;
    verifyRevealedForRecord(record, revealedIntent);
    await markVerified(commitment, revealedIntent);

    const updated = await getIntent(commitment);
    return res.status(200).json(publicIntent(updated));
  } catch (error) {
    return errorResponse(res, error);
  }
}

async function handleWorker(req, res) {
  try {
    const { requireWorkerAuth } = await import("../lib/server/auth.js");
    const { revealCandidates, rowToRecord } =
      await import("../lib/server/intentStore.js");
    const { revealOne } = await import("../lib/server/revealOne.js");
    const { reconcileExecutingSettlements } =
      await import("../lib/server/reconcile.js");

    await requireWorkerAuth(req);
    if (req.method !== "GET" && req.method !== "POST") {
      return methodNotAllowed(res, "GET, POST");
    }

    const revealRows = await revealCandidates(50);
    const reveals = [];
    for (const row of revealRows) {
      reveals.push(await revealOne(rowToRecord(row)));
    }

    const settlements = await reconcileExecutingSettlements(50);

    return res.status(200).json({
      reveals,
      settlements,
      processed: reveals.length + settlements.length,
    });
  } catch (error) {
    return errorResponse(res, error);
  }
}

export default async function handler(req, res) {
  res.setHeader("cache-control", "no-store");

  try {
    const route = String(req.query.route || "");

    switch (route) {
      case "health":
        return await handleHealth(req, res);
      case "config":
        return await handleConfig(req, res);
      case "readiness":
        return await handleReadiness(req, res);
      case "auth/challenge":
        return await handleAuthChallenge(req, res);
      case "shutter":
        return await handleShutter(req, res);
      case "maryjane":
        return await handleMaryJane(req, res);
      case "v1/intents":
        return await handleIntents(req, res);
      case "v1/intent":
        return await handleIntent(req, res);
      case "v1/intent/cancel":
        return await handleCancel(req, res);
      case "v1/intent/reveal":
        return await handleReveal(req, res);
      case "v1/intent/verify":
        return await handleVerify(req, res);
      case "internal/reveal":
        return await handleInternalReveal(req, res);
      case "internal/worker":
        return await handleWorker(req, res);
      case "settlement/submit":
        return await handleSettlementSubmit(req, res);
      case "settlement/status":
        return await handleSettlementStatus(req, res);
      default:
        return res.status(404).json({ error: "Unknown API route." });
    }
  } catch (error) {
    return errorResponse(res, error);
  }
}
