import { runtimeConfig, requireMainnetSafety } from "../lib/server/runtime.js";

const DEFAULT_DEVNET =
  "https://maryjane-blue.vercel.app/api/order-place";

export default async function handler(req, res) {
  res.setHeader("cache-control", "no-store");

  if (req.method !== "POST") {
    res.setHeader("allow", "POST");
    return res.status(405).json({ error: "Method not allowed." });
  }

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

      const adapter = "maryjane-solana-v1";
      if (!config.allowedMainnetAdapters.includes(adapter)) {
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
        : process.env.MARYJANE_ORDER_PLACE_URL || DEFAULT_DEVNET;

    if (!configured) {
      return res.status(503).json({
        code: "MARYJANE_NOT_CONFIGURED",
        error: `Mary Jane ${requestedCluster} order endpoint is not configured.`,
      });
    }

    const target = new URL(configured);
    const upstream = await fetch(target, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
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
    return res.status(error?.code === "MAINNET_DISABLED" ? 403 : 502).json({
      code: error?.code || "MARYJANE_UPSTREAM_FAILED",
      error: error instanceof Error ? error.message : "Mary Jane order preparation request failed.",
    });
  }
}
