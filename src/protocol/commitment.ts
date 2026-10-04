import { bytesToHex, hexToBytes, type Hex } from "./hex.js";
import { encodeIntent } from "./intent.js";
import type { ConfidentialIntentV1 } from "./types.js";

export async function sha256Hex(value: Hex): Promise<Hex> {
  const digest = await crypto.subtle.digest("SHA-256", hexToBytes(value));
  return bytesToHex(new Uint8Array(digest));
}

export async function createIntentCommitment(intent: ConfidentialIntentV1): Promise<Hex> {
  return sha256Hex(encodeIntent(intent));
}
