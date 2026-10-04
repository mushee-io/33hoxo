import { describe, expect, it } from "vitest";
import {
  ConfidentialIntentGateway,
  InMemoryCommitmentStore,
  type ConfidentialEnvelopeV1,
} from "../src/index.js";

const envelope: ConfidentialEnvelopeV1 = {
  version: 1,
  scheme: "shutter-threshold-encryption",
  application: "maryjane",
  sourceChain: "solana:devnet",
  settlementAdapter: "maryjane-solana-v1",
  market: "market-1",
  commitment: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  ciphertext: "0x0102",
  shutter: {
    network: "chiado",
    identity: "0x0102",
    identityPrefix: "0x0304",
    eon: 1,
  },
  createdAt: 100,
  revealAt: 200,
  expiresAt: 300,
};

describe("confidential intent gateway", () => {
  it("stores ciphertext envelopes and is idempotent", async () => {
    const gateway = new ConfidentialIntentGateway(new InMemoryCommitmentStore());

    const first = await gateway.submit(envelope, 150);
    const second = await gateway.submit(envelope, 151);

    expect(first.state).toBe("WAITING");
    expect(second.acceptedAt).toBe(first.acceptedAt);
    expect(second.envelope.ciphertext).toBe("0x0102");
  });

  it("allows cancellation before reveal", async () => {
    const gateway = new ConfidentialIntentGateway(new InMemoryCommitmentStore());
    await gateway.submit(envelope, 150);
    const cancelled = await gateway.cancel(envelope.commitment, 160);
    expect(cancelled.state).toBe("CANCELLED");
  });
});
