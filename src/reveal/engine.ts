import type { Hex } from "../protocol/hex.js";
import type { ConfidentialIntentV1 } from "../protocol/types.js";
import type { CommitmentStore } from "../gateway/store.js";
import { decryptConfidentialIntent } from "../shutter/crypto.js";
import { ShutterApiError, type ShutterApiClient } from "../shutter/client.js";
import { verifyRevealedIntent } from "../verification/verify.js";

export type RevealResult =
  | { status: "WAITING" }
  | { status: "RETRYABLE"; code: string }
  | { status: "CANCELLED" }
  | { status: "VERIFIED"; intent: ConfidentialIntentV1 }
  | { status: "FAILED"; code: string };

export class RevealEngine {
  constructor(private readonly store: CommitmentStore, private readonly shutter: ShutterApiClient) {}

  async process(commitment: Hex, now = Math.floor(Date.now() / 1000)): Promise<RevealResult> {
    const record = await this.store.get(commitment);
    if (!record) throw new Error("Unknown commitment.");
    if (record.state === "CANCELLED") return { status:"CANCELLED" };

    if (record.envelope.expiresAt != null && now >= record.envelope.expiresAt) {
      await this.store.updateState(commitment, "EXPIRED", { now });
      return { status:"FAILED", code:"EXPIRED" };
    }

    if (now < record.envelope.revealAt) {
      await this.store.updateState(commitment, "WAITING", { now });
      return { status:"WAITING" };
    }

    await this.store.updateState(commitment, "REVEALABLE", { now });

    let key;
    try {
      key = await this.shutter.getDecryptionKey(record.envelope.shutter.identity);
    } catch (error) {
      if (error instanceof ShutterApiError && (error.status === 404 || error.retryable)) {
        await this.store.updateState(commitment, "REVEALABLE", { failureCode:"KEY_NOT_READY", now });
        return { status:"RETRYABLE", code:"KEY_NOT_READY" };
      }
      await this.store.updateState(commitment, "INVALID", { failureCode:"KEY_RETRIEVAL_FAILED", now });
      throw error;
    }

    if (key.identity.toLowerCase() !== record.envelope.shutter.identity.toLowerCase()) {
      await this.store.updateState(commitment, "INVALID", { failureCode:"KEY_IDENTITY_MISMATCH", now });
      return { status:"FAILED", code:"KEY_IDENTITY_MISMATCH" };
    }
    if (key.decryption_timestamp > now) {
      await this.store.updateState(commitment, "REVEALABLE", { failureCode:"KEY_TIMESTAMP_IN_FUTURE", now });
      return { status:"RETRYABLE", code:"KEY_TIMESTAMP_IN_FUTURE" };
    }

    await this.store.updateState(commitment, "DECRYPTING", { now });
    try {
      const intent = await decryptConfidentialIntent(record.envelope, key.decryption_key);
      await this.store.updateState(commitment, "REVEALED", { now });

      const verification = await verifyRevealedIntent(record.envelope, intent, now);
      if (!verification.ok) {
        await this.store.updateState(
          commitment,
          verification.code === "TAMPERED" ? "TAMPERED" : "INVALID",
          { failureCode:verification.code, now },
        );
        return { status:"FAILED", code:verification.code };
      }

      await this.store.updateState(commitment, "VERIFIED", { now });
      return { status:"VERIFIED", intent };
    } catch (error) {
      await this.store.updateState(commitment, "INVALID", { failureCode:"DECRYPTION_FAILED", now });
      throw error;
    }
  }
}
