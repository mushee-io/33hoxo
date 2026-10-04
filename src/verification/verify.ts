import { createIntentCommitment } from "../protocol/commitment.js";
import type {
  ConfidentialEnvelopeV1,
  ConfidentialIntentV1,
} from "../protocol/types.js";

export type VerificationResult =
  | { ok: true; intent: ConfidentialIntentV1 }
  | { ok: false; code: "TAMPERED" | "EXPIRED" | "ROUTING_MISMATCH" | "TOO_EARLY"; reason: string };

export async function verifyRevealedIntent(
  envelope: ConfidentialEnvelopeV1,
  intent: ConfidentialIntentV1,
  now = Math.floor(Date.now() / 1000),
): Promise<VerificationResult> {
  if (now < envelope.revealAt) {
    return { ok: false, code: "TOO_EARLY", reason: "Reveal timestamp has not been reached." };
  }

  if (intent.expiresAt != null && now >= intent.expiresAt) {
    return { ok: false, code: "EXPIRED", reason: "Intent has expired." };
  }

  if (
    intent.application !== envelope.application ||
    intent.sourceChain !== envelope.sourceChain ||
    intent.settlementAdapter !== envelope.settlementAdapter ||
    intent.market !== envelope.market ||
    intent.revealAt !== envelope.revealAt
  ) {
    return {
      ok: false,
      code: "ROUTING_MISMATCH",
      reason: "Revealed routing metadata does not match the sealed envelope.",
    };
  }

  const commitment = await createIntentCommitment(intent);
  if (commitment.toLowerCase() !== envelope.commitment.toLowerCase()) {
    return {
      ok: false,
      code: "TAMPERED",
      reason: "Revealed intent does not match the original commitment.",
    };
  }

  return { ok: true, intent };
}
