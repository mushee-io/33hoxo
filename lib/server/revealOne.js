import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import {
  markInvalid,
  markRevealable,
  markVerified,
} from "./intentStore.js";
import { shutterRequest } from "./shutter.js";

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

export async function revealOne(record) {
  const envelope = record.envelope;
  const now = Math.floor(Date.now() / 1000);

  if (now < Number(envelope.revealAt)) {
    return { commitment: envelope.commitment, status: "WAITING" };
  }
  if (envelope.expiresAt != null && now >= Number(envelope.expiresAt)) {
    await markInvalid(envelope.commitment, "EXPIRED");
    return { commitment: envelope.commitment, status: "EXPIRED" };
  }

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
      return { commitment: envelope.commitment, network, status: "INVALID" };
    }

    const decrypted = await shutterSdk.decrypt(
      normalizeHex(envelope.ciphertext),
      normalizeHex(key.decryption_key)
    );
    const revealed = JSON.parse(Buffer.from(normalizeHex(decrypted).slice(2), "hex").toString("utf8"));

    if (commitmentOf(revealed).toLowerCase() !== envelope.commitment.toLowerCase()) {
      await markInvalid(envelope.commitment, "TAMPERED");
      return { commitment: envelope.commitment, network, status: "TAMPERED" };
    }

    if (record.ownerWallet && revealed.trader !== record.ownerWallet) {
      await markInvalid(envelope.commitment, "OWNER_MISMATCH");
      return { commitment: envelope.commitment, network, status: "OWNER_MISMATCH" };
    }

    await markVerified(envelope.commitment, revealed);
    return { commitment: envelope.commitment, network, status: "VERIFIED" };
  } catch (error) {
    if (error?.status === 404 || error?.status === 429 || error?.status >= 500) {
      await markRevealable(envelope.commitment, "KEY_NOT_READY");
      return { commitment: envelope.commitment, network, status: "RETRYABLE" };
    }
    await markInvalid(envelope.commitment, "REVEAL_FAILED");
    return {
      commitment: envelope.commitment,
      network,
      status: "INVALID",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
