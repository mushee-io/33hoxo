export type Hex = `0x${string}`;

export function isHex(value: unknown): value is Hex {
  return typeof value === "string" && /^0x(?:[0-9a-f]{2})*$/i.test(value);
}

export function assertHex(value: unknown, label = "value"): asserts value is Hex {
  if (!isHex(value)) {
    throw new Error(`${label} must be a 0x-prefixed even-length hex string.`);
  }
}

export function bytesToHex(bytes: Uint8Array): Hex {
  return `0x${Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

export function hexToBytes(hex: Hex): Uint8Array {
  assertHex(hex, "hex");
  const body = hex.slice(2);
  const out = new Uint8Array(body.length / 2);
  for (let i = 0; i < out.length; i += 1) {
    out[i] = Number.parseInt(body.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

export function utf8ToHex(value: string): Hex {
  return bytesToHex(new TextEncoder().encode(value));
}

export function hexToUtf8(value: Hex): string {
  return new TextDecoder().decode(hexToBytes(value));
}

export function randomHex(byteLength: number): Hex {
  if (!Number.isInteger(byteLength) || byteLength <= 0) {
    throw new Error("byteLength must be a positive integer.");
  }
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return bytesToHex(bytes);
}
