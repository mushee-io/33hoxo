import { describe, expect, it } from "vitest";
import {
  enforceSettlementPolicy,
  normalizeRuntimeConfig,
  type ConfidentialIntentV1,
} from "../src/index.js";

const intent: ConfidentialIntentV1 = {
  version: 1,
  application: "maryjane",
  sourceChain: "solana:mainnet-beta",
  settlementAdapter: "maryjane-solana-v1",
  market: "market-mainnet-1",
  trader: "Wallet111",
  kind: "LIMIT_ORDER",
  action: "BUY",
  outcome: "YES",
  priceBps: 5000,
  quantityBaseUnits: "100",
  allowPartialFill: false,
  nonce: "0x00000000000000000000000000000066",
  createdAt: 100,
  revealAt: 200,
  expiresAt: 500,
};

describe("mainnet beta policy", () => {
  it("blocks mainnet by default", () => {
    const config = normalizeRuntimeConfig({
      solanaCluster: "mainnet-beta",
      mainnetEnabled: false,
    });
    expect(() => enforceSettlementPolicy(intent, config)).toThrow(/disabled/i);
  });

  it("enforces quantity caps and market allowlists", () => {
    const config = normalizeRuntimeConfig({
      solanaCluster: "mainnet-beta",
      mainnetEnabled: true,
      maxMainnetQuantityBaseUnits: "99",
      allowedMainnetAdapters: ["maryjane-solana-v1"],
      allowedMainnetMarkets: ["market-mainnet-1"],
    });
    expect(() => enforceSettlementPolicy(intent, config)).toThrow(/quantity/i);
  });

  it("allows explicitly gated mainnet beta intents", () => {
    const config = normalizeRuntimeConfig({
      solanaCluster: "mainnet-beta",
      mainnetEnabled: true,
      maxMainnetQuantityBaseUnits: "100",
      allowedMainnetAdapters: ["maryjane-solana-v1"],
      allowedMainnetMarkets: ["market-mainnet-1"],
    });
    expect(() => enforceSettlementPolicy(intent, config)).not.toThrow();
  });
});
