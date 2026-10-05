import { createHash } from "node:crypto";

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, entry]) => entry !== undefined)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, entry]) => [key, stable(entry)])
    );
  }
  return value;
}

export function commitmentOf(intent) {
  const canonical = JSON.stringify(stable(intent));
  return "0x" + createHash("sha256")
    .update(Buffer.from(canonical, "utf8"))
    .digest("hex");
}

export function verifyRevealedForRecord(record, intent) {
  if (!record || !intent || typeof intent !== "object") {
    const error = new Error("A revealed intent is required.");
    error.status = 400;
    throw error;
  }

  const envelope = record.envelope;
  const actual = commitmentOf(intent);
  if (actual.toLowerCase() !== record.commitment.toLowerCase()) {
    const error = new Error("Revealed intent does not match the sealed commitment.");
    error.status = 409;
    throw error;
  }

  const fields = [
    ["application", envelope.application],
    ["sourceChain", envelope.sourceChain],
    ["settlementAdapter", envelope.settlementAdapter],
    ["market", envelope.market],
    ["createdAt", envelope.createdAt],
    ["revealAt", envelope.revealAt],
    ["expiresAt", envelope.expiresAt ?? null],
  ];

  for (const [key, expected] of fields) {
    const actualValue = intent[key] ?? null;
    if (actualValue !== expected) {
      const error = new Error(`Revealed intent public metadata mismatch: ${key}.`);
      error.status = 409;
      throw error;
    }
  }

  if (record.ownerWallet && intent.trader !== record.ownerWallet) {
    const error = new Error("Revealed trader does not match the authenticated wallet owner.");
    error.status = 403;
    throw error;
  }

  const now = Math.floor(Date.now() / 1000);
  if (now < Number(envelope.revealAt)) {
    const error = new Error("Intent cannot be verified before reveal time.");
    error.status = 409;
    throw error;
  }
  if (envelope.expiresAt != null && now >= Number(envelope.expiresAt)) {
    const error = new Error("Intent has expired.");
    error.status = 409;
    throw error;
  }

  return true;
}
