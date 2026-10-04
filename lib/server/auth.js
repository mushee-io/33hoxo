function configuredKeys() {
  return (process.env.HOXO_API_KEYS || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

export function requireApiKey(req) {
  const keys = configuredKeys();
  const production = process.env.HOXO_ENV === "production";
  if (keys.length === 0 && !production) return true;

  const auth = req.headers.authorization || "";
  const supplied = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!supplied || !keys.includes(supplied)) {
    const error = new Error("Unauthorized.");
    error.status = 401;
    throw error;
  }
  return true;
}

export function requireCron(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    const error = new Error("CRON_SECRET is not configured.");
    error.status = 503;
    throw error;
  }
  const auth = req.headers.authorization || "";
  if (auth !== `Bearer ${secret}`) {
    const error = new Error("Unauthorized cron request.");
    error.status = 401;
    throw error;
  }
}
