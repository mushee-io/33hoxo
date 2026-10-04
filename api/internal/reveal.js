import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { requireCron } from "../../lib/server/auth.js";
import {
  revealCandidates,
  markInvalid,
  markRevealable,
  markVerified,
} from "../../lib/server/intentStore.js";
import { shutterRequest } from "../../lib/server/shutter.js";

const require = createRequire(import.meta.url);
const shutterSdk = require("@shutter-network/shutter-sdk");

function normalizeHex(value) {
  if (typeof value !== "string") throw new Error("Expected hex string.");
  return value.startsWith("0x") ? value : `0x${value}`;
}

function unwrap(value) {
  return value?.message && typeof value.message === "object"
    ? value.message
    : value;
}

function hexToUtf8(hex) {
  return Buffer.from(normalizeHex(hex).slice(2), "hex").toString("utf8");
}

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

function commitmentOf(intent) {
  const canonical = JSON.stringify(stable(intent));
  return "0x" + createHash("sha256").update(Buffer.from(canonical, "utf8")).digest("hex");
}

export default async function handler(req, res) {
  res.setHeader("cache-control", "no-store");
  try {
    requireCron(req);
    if (req.method !== "POST" && req.method !== "GET") {
      res.setHeader("allow", "GET, POST");
      return res.status(405).json({ error: "Method not allowed." });
    }

    const candidates = await revealCandidates(50);
    const results = [];

    for (const row of candidates) {
      const envelope = row.envelope;
      const network = envelope?.shutter?.network === "gnosis" ? "gnosis" : "chiado";

      try {
        const response = await shutterRequest(
          network,
          `/api/time/get_decryption_key?identity=${encodeURIComponent(envelope.shutter.identity)}`
        );
        const key = unwrap(response);

        if (
          normalizeHex(key.identity).toLowerCase() !==
          normalizeHex(envelope.shutter.identity).toLowerCase()
        ) {
          await markInvalid(envelope.commitment, "KEY_IDENTITY_MISMATCH");
          results.push({ commitment: envelope.commitment, network, status: "INVALID" });
          continue;
        }

        const decrypted = await shutterSdk.decrypt(
          normalizeHex(envelope.ciphertext),
          normalizeHex(key.decryption_key)
        );
        const revealed = JSON.parse(hexToUtf8(decrypted));

        if (commitmentOf(revealed).toLowerCase() !== envelope.commitment.toLowerCase()) {
          await markInvalid(envelope.commitment, "TAMPERED");
          results.push({ commitment: envelope.commitment, network, status: "TAMPERED" });
          continue;
        }

        await markVerified(envelope.commitment, revealed);
        results.push({ commitment: envelope.commitment, network, status: "VERIFIED" });
      } catch (error) {
        if (error?.status === 404 || error?.status === 429 || error?.status >= 500) {
          await markRevealable(envelope.commitment, "KEY_NOT_READY");
          results.push({ commitment: envelope.commitment, network, status: "RETRYABLE" });
        } else {
          await markInvalid(envelope.commitment, "REVEAL_FAILED");
          results.push({ commitment: envelope.commitment, network, status: "INVALID" });
        }
      }
    }

    return res.status(200).json({
      processed: results.length,
      results,
    });
  } catch (error) {
    return res.status(error.status || 500).json({
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
