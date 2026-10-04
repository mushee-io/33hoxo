import { bytesToHex, hexToBytes, type Hex } from "./hex.js";
import { encodeIntent } from "./intent.js";
import type { ConfidentialIntentV1 } from "./types.js";

export async function sha256Hex(value: Hex): Promise<Hex> {
  const bytes = hexToBytes(value);
  const input = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
  const digest = await crypto.subtle.digest("SHA-256", input);
  return bytesToHex(new Uint8Array(digest));
}

export async function createIntentCommitment(intent: ConfidentialIntentV1): Promise<Hex> {
  return sha256Hex(encodeIntent(intent));
}
