import { verifyWalletAuth } from "./walletAuth.js";

function configuredKeys() {
  return (process.env.HOXO_API_KEYS || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

export function hasValidApiKey(req) {
  const keys = configuredKeys();
  if (!keys.length) return false;
  const auth = req.headers.authorization || "";
  const supplied = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  return !!supplied && keys.includes(supplied);
}

export function requireApiKey(req) {
  if (!hasValidApiKey(req)) {
    const error = new Error("Unauthorized.");
    error.status = 401;
    throw error;
  }
  return true;
}

export function authorizeIntentWrite(req) {
  if (hasValidApiKey(req)) {
    const ownerWallet = String(req.headers["x-33hoxo-owner-wallet"] || "") || null;
    return { mode: "api-key", ownerWallet };
  }
  const auth = verifyWalletAuth(req);
  return { mode: "wallet", ownerWallet: auth.wallet };
}

export function authorizeOwnedIntent(req, record) {
  if (hasValidApiKey(req)) return { mode: "api-key" };
  const auth = verifyWalletAuth(req);
  if (!record?.ownerWallet || record.ownerWallet !== auth.wallet) {
    const error = new Error("Wallet is not authorized for this intent.");
    error.status = 403;
    throw error;
  }
  return { mode: "wallet", ownerWallet: auth.wallet };
}

export function requireCron(req) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    const error = new Error("CRON_SECRET is not configured.");
    error.status = 503;
    throw error;
  }
  const auth = req.headers.authorization || "";
  if (auth !== `Bearer ${cronSecret}`) {
    const error = new Error("Unauthorized cron request.");
    error.status = 401;
    throw error;
  }
}


export async function requireWorkerAuth(req) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = String(req.headers.authorization || "");

  if (cronSecret && authHeader === `Bearer ${cronSecret}`) {
    return { mode: "cron-secret" };
  }

  try {
    const { verifyGitHubWorkerOidc } = await import("./githubOidc.js");
    return await verifyGitHubWorkerOidc(req);
  } catch (cause) {
    const error = new Error("Unauthorized worker request.");
    error.status = cause?.status || 401;
    throw error;
  }
}
