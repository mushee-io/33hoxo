import { assertHex, type Hex } from "../protocol/hex.js";
import type { ConfidentialEnvelopeV1, PublicIntentRecord } from "../protocol/types.js";
import type { CommitmentStore } from "./store.js";

function envelopeFingerprint(envelope: ConfidentialEnvelopeV1): string {
  return [
    envelope.version,
    envelope.scheme,
    envelope.application,
    envelope.sourceChain,
    envelope.settlementAdapter,
    envelope.market,
    envelope.commitment.toLowerCase(),
    envelope.ciphertext.toLowerCase(),
    envelope.shutter.network,
    envelope.shutter.identity.toLowerCase(),
    envelope.shutter.identityPrefix.toLowerCase(),
    envelope.shutter.eon,
    envelope.shutter.epochId?.toLowerCase() ?? "",
    envelope.createdAt,
    envelope.revealAt,
    envelope.expiresAt ?? "",
  ].join("|");
}

export class ConfidentialIntentGateway {
  constructor(private readonly store: CommitmentStore) {}

  async submit(
    envelope: ConfidentialEnvelopeV1,
    now = Math.floor(Date.now() / 1000),
  ): Promise<PublicIntentRecord> {
    assertHex(envelope?.commitment, "commitment");

    // Exact retries remain idempotent even after the reveal window opens.
    const existing = await this.store.get(envelope.commitment);
    if (existing) {
      if (envelopeFingerprint(existing.envelope) !== envelopeFingerprint(envelope)) {
        throw new Error("Conflicting envelope already exists for this commitment.");
      }
      return existing;
    }

    this.validateEnvelope(envelope, now);

    const record: PublicIntentRecord = {
      commitment: envelope.commitment,
      envelope: structuredClone(envelope),
      state: "WAITING",
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
    if (now >= record.envelope.revealAt) {
      throw new Error("Cannot cancel after the reveal window has opened.");
    }
    if (!["SEALED", "WAITING"].includes(record.state)) {
      throw new Error(`Cannot cancel an intent in state ${record.state}.`);
    }
    return this.store.updateState(commitment, "CANCELLED", { now });
  }

  private validateEnvelope(envelope: ConfidentialEnvelopeV1, now: number): void {
    if (envelope.version !== 1) throw new Error("Unsupported envelope version.");
    if (envelope.scheme !== "shutter-threshold-encryption") throw new Error("Unsupported encryption scheme.");

    assertHex(envelope.commitment, "commitment");
    assertHex(envelope.ciphertext, "ciphertext");
    assertHex(envelope.shutter.identity, "Shutter identity");
    assertHex(envelope.shutter.identityPrefix, "Shutter identity prefix");

    if (!/^0x[0-9a-f]{64}$/i.test(envelope.commitment)) throw new Error("commitment must be a 32-byte SHA-256 hash.");
    if (!envelope.application.trim()) throw new Error("application is required.");
    if (!envelope.sourceChain.trim()) throw new Error("sourceChain is required.");
    if (!envelope.market.trim()) throw new Error("market is required.");
    if (!envelope.settlementAdapter.trim()) throw new Error("settlementAdapter is required.");
    if (!Number.isInteger(envelope.shutter.eon) || envelope.shutter.eon < 0) throw new Error("Shutter eon is invalid.");
    if (!Number.isInteger(envelope.createdAt) || envelope.createdAt <= 0) throw new Error("createdAt must be a positive Unix timestamp.");
    if (!Number.isInteger(envelope.revealAt) || envelope.revealAt <= 0) throw new Error("revealAt must be a positive Unix timestamp.");
    if (envelope.createdAt >= envelope.revealAt) throw new Error("createdAt must be earlier than revealAt.");
    if (now >= envelope.revealAt) throw new Error("Reveal window has already opened; late commitments are not accepted.");
    if (envelope.expiresAt != null && envelope.expiresAt <= envelope.revealAt) throw new Error("expiresAt must be later than revealAt.");
    if (envelope.expiresAt != null && now >= envelope.expiresAt) throw new Error("Intent is already expired.");
  }
}
