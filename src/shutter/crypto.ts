import { decrypt, encryptData } from "@shutter-network/shutter-sdk";
import { createIntentCommitment } from "../protocol/commitment.js";
import { decodeIntent, encodeIntent } from "../protocol/intent.js";
import { assertHex, randomHex, type Hex } from "../protocol/hex.js";
import type {
  ConfidentialEnvelopeV1,
  ConfidentialIntentV1,
  ShutterEncryptionData,
} from "../protocol/types.js";
import type { ShutterNetwork } from "./client.js";

export async function encryptConfidentialIntent(input: {
  intent: ConfidentialIntentV1;
  network: ShutterNetwork;
  encryptionData: ShutterEncryptionData;
}): Promise<ConfidentialEnvelopeV1> {
  const { intent, network, encryptionData } = input;
  const message = encodeIntent(intent);
  const commitment = await createIntentCommitment(intent);
  const sigma = randomHex(32);

  // Shutter calls the registered identity the identity preimage in the SDK.
  const ciphertext = await encryptData(
    message,
    encryptionData.identity,
    encryptionData.eonKey,
    sigma,
  );
  assertHex(ciphertext, "ciphertext");

  return {
    version: 1,
    scheme: "shutter-threshold-encryption",
    application: intent.application,
    sourceChain: intent.sourceChain,
    settlementAdapter: intent.settlementAdapter,
    market: intent.market,
    commitment,
    ciphertext,
    shutter: {
      network,
      identity: encryptionData.identity,
      identityPrefix: encryptionData.identityPrefix,
      eon: encryptionData.eon,
      epochId: encryptionData.epochId,
    },
    createdAt: intent.createdAt,
    revealAt: intent.revealAt,
    expiresAt: intent.expiresAt,
  };
}

export async function decryptConfidentialIntent(
  envelope: ConfidentialEnvelopeV1,
  decryptionKey: Hex,
): Promise<ConfidentialIntentV1> {
  assertHex(decryptionKey, "decryptionKey");
  const decrypted = await decrypt(envelope.ciphertext, decryptionKey);
  assertHex(decrypted, "decrypted intent");
  return decodeIntent(decrypted);
}
