import type { ShutterNetwork } from "../shutter/client.js";

export type SolanaCluster = "devnet" | "mainnet-beta";

export type HoxoRuntimeConfig = {
  environment: "staging" | "production";
  shutterNetwork: ShutterNetwork;
  solanaCluster: SolanaCluster;
  mainnetEnabled: boolean;
  maxMainnetQuantityBaseUnits: string;
  allowedMainnetAdapters: string[];
  allowedMainnetMarkets: string[];
};

export function normalizeRuntimeConfig(input: Partial<HoxoRuntimeConfig>): HoxoRuntimeConfig {
  return {
    environment: input.environment === "production" ? "production" : "staging",
    shutterNetwork: input.shutterNetwork === "gnosis" ? "gnosis" : "chiado",
    solanaCluster: input.solanaCluster === "mainnet-beta" ? "mainnet-beta" : "devnet",
    mainnetEnabled: input.mainnetEnabled === true,
    maxMainnetQuantityBaseUnits: input.maxMainnetQuantityBaseUnits || "1000000",
    allowedMainnetAdapters: input.allowedMainnetAdapters?.filter(Boolean) ?? ["maryjane-solana-v1"],
    allowedMainnetMarkets: input.allowedMainnetMarkets?.filter(Boolean) ?? [],
  };
}
