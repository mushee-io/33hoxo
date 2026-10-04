import { hexToUtf8, randomHex, utf8ToHex, type Hex } from "./hex.js";
import type { ConfidentialIntentV1 } from "./types.js";

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, entry]) => entry !== undefined)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, entry]) => [key, stable(entry)]),
    );
  }
  return value;
}

export function validateIntent(intent: ConfidentialIntentV1): void {
  if (intent.version !== 1) throw new Error("Unsupported intent version.");
  for (const [label, value] of [
    ["application", intent.application],
    ["sourceChain", intent.sourceChain],
    ["settlementAdapter", intent.settlementAdapter],
    ["market", intent.market],
    ["trader", intent.trader],
    ["outcome", intent.outcome],
  ] as const) {
    if (!value.trim()) throw new Error(`${label} is required.`);
  }

  const quantity = BigInt(intent.quantityBaseUnits);
  if (quantity <= 0n) throw new Error("quantityBaseUnits must be positive.");

  if (intent.priceBps != null) {
    if (!Number.isInteger(intent.priceBps) || intent.priceBps < 0 || intent.priceBps > 10_000) {
      throw new Error("priceBps must be an integer from 0 to 10,000.");
    }
  }

  if (intent.slippageBps != null) {
    if (!Number.isInteger(intent.slippageBps) || intent.slippageBps < 0 || intent.slippageBps > 10_000) {
      throw new Error("slippageBps must be an integer from 0 to 10,000.");
    }
  }

  for (const [label, value] of [
    ["createdAt", intent.createdAt],
    ["revealAt", intent.revealAt],
  ] as const) {
    if (!Number.isInteger(value) || value <= 0) throw new Error(`${label} must be a positive Unix timestamp.`);
  }

  if (intent.revealAt <= intent.createdAt) {
    throw new Error("revealAt must be later than createdAt.");
  }
  if (intent.expiresAt != null && intent.expiresAt <= intent.revealAt) {
    throw new Error("expiresAt must be later than revealAt.");
  }

  if (!/^0x[0-9a-f]{32}$/i.test(intent.nonce)) {
    throw new Error("nonce must be exactly 16 random bytes.");
  }
}

export function canonicalizeIntent(intent: ConfidentialIntentV1): string {
  validateIntent(intent);
  return JSON.stringify(stable(intent));
}

export function encodeIntent(intent: ConfidentialIntentV1): Hex {
  return utf8ToHex(canonicalizeIntent(intent));
}

export function decodeIntent(encoded: Hex): ConfidentialIntentV1 {
  const parsed = JSON.parse(hexToUtf8(encoded)) as ConfidentialIntentV1;
  validateIntent(parsed);
  return parsed;
}

export function createIntentNonce(): Hex {
  return randomHex(16);
}
