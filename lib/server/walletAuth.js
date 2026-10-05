import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import bs58 from "bs58";
import nacl from "tweetnacl";

const TTL_MS = 5 * 60 * 1000;

function secret() {
  const value = process.env.HOXO_AUTH_SECRET;
  if (!value) {
    const error = new Error("HOXO_AUTH_SECRET is not configured.");
    error.status = 503;
    throw error;
  }
  return value;
}

function validateWallet(wallet) {
  try {
    const decoded = bs58.decode(wallet);
    if (decoded.length !== 32) throw new Error();
  } catch {
    const error = new Error("Invalid Solana wallet address.");
    error.status = 400;
    throw error;
  }
}

function mac(payload) {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

function challengeMessage(wallet, token, expiresAt) {
  return [
    "33HOXO authentication",
    `Wallet: ${wallet}`,
    `Challenge: ${token}`,
    `Expires: ${new Date(expiresAt).toISOString()}`,
  ].join("\n");
}

export function createWalletChallenge(wallet) {
  validateWallet(wallet);
  const expiresAt = Date.now() + TTL_MS;
  const payload = Buffer.from(JSON.stringify({
    wallet,
    nonce: randomBytes(16).toString("hex"),
    expiresAt,
  })).toString("base64url");

  const token = `${payload}.${mac(payload)}`;
  return {
    wallet,
    challenge: token,
    expiresAt,
    message: challengeMessage(wallet, token, expiresAt),
  };
}

export function verifyWalletAuth(req) {
  const wallet = String(req.headers["x-33hoxo-wallet"] || "");
  const token = String(req.headers["x-33hoxo-challenge"] || "");
  const signature = String(req.headers["x-33hoxo-signature"] || "");

  if (!wallet || !token || !signature) {
    const error = new Error("Wallet authentication headers are required.");
    error.status = 401;
    throw error;
  }
  validateWallet(wallet);

  const [payload, suppliedMac] = token.split(".");
  if (!payload || !suppliedMac) {
    const error = new Error("Invalid wallet challenge.");
    error.status = 401;
    throw error;
  }

  const expectedMac = mac(payload);
  const a = Buffer.from(suppliedMac);
  const b = Buffer.from(expectedMac);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    const error = new Error("Invalid wallet challenge signature.");
    error.status = 401;
    throw error;
  }

  let parsed;
  try {
    parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    const error = new Error("Invalid wallet challenge payload.");
    error.status = 401;
    throw error;
  }

  if (parsed.wallet !== wallet || Number(parsed.expiresAt) <= Date.now()) {
    const error = new Error("Wallet challenge is expired or belongs to another wallet.");
    error.status = 401;
    throw error;
  }

  const message = challengeMessage(wallet, token, Number(parsed.expiresAt));
  const messageBytes = new TextEncoder().encode(message);
  const signatureBytes = Buffer.from(signature, "base64");
  const publicKeyBytes = bs58.decode(wallet);

  if (!nacl.sign.detached.verify(messageBytes, signatureBytes, publicKeyBytes)) {
    const error = new Error("Wallet signature verification failed.");
    error.status = 401;
    throw error;
  }

  return { wallet, expiresAt: Number(parsed.expiresAt) };
}
