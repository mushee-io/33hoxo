import { runtimeConfig } from "../lib/server/runtime.js";

export default function handler(req, res) {
  res.setHeader("cache-control", "no-store");
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
