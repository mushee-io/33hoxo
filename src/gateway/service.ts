import { assertHex, type Hex } from "../protocol/hex.js";
import type { ConfidentialEnvelopeV1, PublicIntentRecord } from "../protocol/types.js";
import type { CommitmentStore } from "./store.js";

export class ConfidentialIntentGateway {
  constructor(private readonly store: CommitmentStore) {}

  async submit(
    envelope: ConfidentialEnvelopeV1,
    now = Math.floor(Date.now() / 1000),
  ): Promise<PublicIntentRecord> {
    this.validateEnvelope(envelope, now);

    const existing = await this.store.get(envelope.commitment);
    if (existing) return existing;

    const record: PublicIntentRecord = {
      commitment: envelope.commitment,
      envelope: structuredClone(envelope),
      state: now >= envelope.revealAt ? "REVEALABLE" : "WAITING",
      acceptedAt: now,
      updatedAt: now,
    };
    await this.store.put(record);
    return record;
  }

  async get(commitment: Hex): Promise<PublicIntentRecord | null> {
    assertHex(commitment, "commitment");
    return this.store.get(commitment);
  }

  async cancel(
    commitment: Hex,
    now = Math.floor(Date.now() / 1000),
  ): Promise<PublicIntentRecord> {
    const record = await this.store.get(commitment);
    if (!record) throw new Error("Unknown commitment.");
    if (!["SEALED", "WAITING"].includes(record.state)) {
      throw new Error(`Cannot cancel an intent in state ${record.state}.`);
    }
    return this.store.updateState(commitment, "CANCELLED", { now });
  }

  private validateEnvelope(envelope: ConfidentialEnvelopeV1, now: number): void {
    if (envelope.version !== 1) throw new Error("Unsupported envelope version.");
    if (envelope.scheme !== "shutter-threshold-encryption") {
      throw new Error("Unsupported encryption scheme.");
    }

    assertHex(envelope.commitment, "commitment");
    assertHex(envelope.ciphertext, "ciphertext");
    assertHex(envelope.shutter.identity, "Shutter identity");
    assertHex(envelope.shutter.identityPrefix, "Shutter identity prefix");

    if (!envelope.application.trim()) throw new Error("application is required.");
    if (!envelope.market.trim()) throw new Error("market is required.");
    if (!envelope.settlementAdapter.trim()) throw new Error("settlementAdapter is required.");
    if (!Number.isInteger(envelope.revealAt) || envelope.revealAt <= 0) {
      throw new Error("revealAt must be a positive Unix timestamp.");
    }
    if (envelope.expiresAt != null && envelope.expiresAt <= envelope.revealAt) {
      throw new Error("expiresAt must be later than revealAt.");
    }
    if (envelope.expiresAt != null && now >= envelope.expiresAt) {
      throw new Error("Intent is already expired.");
    }
  }
}
