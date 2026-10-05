import { runtimeConfig } from "../lib/server/runtime.js";

export default function handler(req, res) {
  res.setHeader("cache-control", "no-store");
  const config = runtimeConfig();

  const checks = {
    database: Boolean(process.env.DATABASE_URL),
    walletAuth: Boolean(process.env.HOXO_AUTH_SECRET),
    cronSecret: Boolean(process.env.CRON_SECRET),
    shutterNetworkConfigured: Boolean(process.env.SHUTTER_NETWORK),
    solanaRpc: Boolean(process.env.SOLANA_RPC_URL),
    maryJaneDevnet: Boolean(process.env.MARYJANE_ORDER_PLACE_URL),
    externalApiKeys: Boolean(process.env.HOXO_API_KEYS),
    mainnetBackend: config.solanaCluster !== "mainnet-beta" || Boolean(process.env.MARYJANE_MAINNET_ORDER_PLACE_URL),
    mainnetSafetyGate: config.solanaCluster !== "mainnet-beta" || config.mainnetEnabled,
    mainnetMarkets: config.solanaCluster !== "mainnet-beta" || config.allowedMainnetMarkets.length > 0,
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

  const required = config.solanaCluster === "mainnet-beta"
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
