import { describe, expect, it } from "vitest";
import {
  canonicalizeIntent,
  createIntentCommitment,
  createIntentNonce,
  type ConfidentialIntentV1,
} from "../src/index.js";

function intent(overrides: Partial<ConfidentialIntentV1> = {}): ConfidentialIntentV1 {
  return {
    version: 1,
    application: "maryjane",
    sourceChain: "solana:devnet",
    settlementAdapter: "maryjane-solana-v1",
    market: "market-1",
    trader: "wallet-1",
    kind: "LIMIT_ORDER",
    action: "BUY",
    outcome: "YES",
    priceBps: 6200,
    quantityBaseUnits: "500000000",
    collateralAsset: "USDG",
    allowPartialFill: true,
    nonce: createIntentNonce(),
    createdAt: 1_800_000_000,
    revealAt: 1_800_000_030,
    expiresAt: 1_800_000_300,
    metadata: { z: 1, a: "first" },
    ...overrides,
  };
}

describe("confidential intent protocol", () => {
  it("canonicalizes object keys deterministically", () => {
    const a = intent({ nonce: "0x00000000000000000000000000000001", metadata: { z: 1, a: "first" } });
    const b = intent({ nonce: "0x00000000000000000000000000000001", metadata: { a: "first", z: 1 } });
    expect(canonicalizeIntent(a)).toBe(canonicalizeIntent(b));
  });

  it("creates deterministic commitments", async () => {
    const value = intent({ nonce: "0x00000000000000000000000000000002" });
    expect(await createIntentCommitment(value)).toBe(await createIntentCommitment(value));
  });

  it("rejects invalid reveal windows", () => {
    const value = intent({ revealAt: 1_800_000_000 });
    expect(() => canonicalizeIntent(value)).toThrow(/revealAt/);
  });
});
