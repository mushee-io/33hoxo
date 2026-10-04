export function runtimeConfig() {
  const environment = process.env.HOXO_ENV === "production" ? "production" : "staging";
  const shutterNetwork = process.env.SHUTTER_NETWORK === "gnosis" ? "gnosis" : "chiado";
  const solanaCluster = process.env.SOLANA_CLUSTER === "mainnet-beta" ? "mainnet-beta" : "devnet";
  const acknowledged = process.env.MAINNET_ACK === "I_UNDERSTAND_REAL_FUNDS";
  const mainnetEnabled = process.env.ENABLE_MAINNET === "true" && acknowledged;

  return {
    environment,
    shutterNetwork,
    solanaCluster,
    mainnetEnabled,
    maxMainnetQuantityBaseUnits: process.env.MAINNET_MAX_QUANTITY_BASE_UNITS || "1000000",
    allowedMainnetAdapters: (process.env.MAINNET_ALLOWED_ADAPTERS || "maryjane-solana-v1")
      .split(",").map((x) => x.trim()).filter(Boolean),
    allowedMainnetMarkets: (process.env.MAINNET_ALLOWED_MARKETS || "")
      .split(",").map((x) => x.trim()).filter(Boolean),
  };
}

export function requireMainnetSafety(config = runtimeConfig()) {
  if (config.solanaCluster !== "mainnet-beta") return;
  if (!config.mainnetEnabled) {
    const error = new Error("Mainnet beta is disabled. Set ENABLE_MAINNET=true and MAINNET_ACK=I_UNDERSTAND_REAL_FUNDS.");
    error.code = "MAINNET_DISABLED";
    throw error;
  }
}
