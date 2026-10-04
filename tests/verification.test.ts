import { describe, expect, it } from "vitest";
import {
  createIntentCommitment,
  verifyRevealedIntent,
  type ConfidentialEnvelopeV1,
  type ConfidentialIntentV1,
} from "../src/index.js";

const intent: ConfidentialIntentV1 = {
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
  allowPartialFill: true,
  nonce: "0x00000000000000000000000000000003",
  createdAt: 100,
  revealAt: 200,
  expiresAt: 400,
};

async function envelope(): Promise<ConfidentialEnvelopeV1> {
  return {
    version: 1,
    scheme: "shutter-threshold-encryption",
    application: intent.application,
    sourceChain: intent.sourceChain,
    settlementAdapter: intent.settlementAdapter,
    market: intent.market,
    commitment: await createIntentCommitment(intent),
    ciphertext: "0x0102",
    shutter: {
      network: "chiado",
      identity: "0x0102",
      identityPrefix: "0x0304",
      eon: 1,
    },
    createdAt: intent.createdAt,
    revealAt: intent.revealAt,
    expiresAt: intent.expiresAt,
  };
}

describe("reveal verification", () => {
  it("accepts the exact committed intent after reveal", async () => {
    const result = await verifyRevealedIntent(await envelope(), intent, 250);
    expect(result.ok).toBe(true);
  });

  it("rejects a modified order", async () => {
    const modified = { ...intent, priceBps: 7000 };
    const result = await verifyRevealedIntent(await envelope(), modified, 250);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("TAMPERED");
  });

  it("refuses verification before reveal", async () => {
    const result = await verifyRevealedIntent(await envelope(), intent, 199);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("TOO_EARLY");
  });
});
