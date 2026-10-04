import { runtimeConfig } from "../lib/server/runtime.js";
import { shutterBase } from "../lib/server/shutter.js";

const ALLOWED_PATHS = new Set([
  "/api/check_authentication",
  "/api/time/register_identity",
  "/api/time/get_data_for_encryption",
  "/api/time/get_decryption_key",
]);

export default async function handler(req, res) {
  res.setHeader("cache-control", "no-store");

  const config = runtimeConfig();
  const requested = Array.isArray(req.query?.network) ? req.query.network[0] : req.query?.network;
  const network = requested === "gnosis" || requested === "chiado"
    ? requested
    : config.shutterNetwork;

  if (config.environment === "production" && network !== config.shutterNetwork) {
    return res.status(403).json({ error: "Requested Shutter network is not enabled for this deployment." });
  }

  const upstreamBase = shutterBase(network);
  const rawPath = Array.isArray(req.query?.path) ? req.query.path[0] : req.query?.path;
  if (typeof rawPath !== "string" || !rawPath.startsWith("/api/")) {
    return res.status(400).json({ error: "A valid Shutter API path is required." });
  }

  const target = new URL(rawPath, upstreamBase);
  if (target.origin !== upstreamBase || !ALLOWED_PATHS.has(target.pathname)) {
    return res.status(403).json({ error: "Shutter proxy path is not allowed." });
  }

  const method = String(req.method || "GET").toUpperCase();
  if (method !== "GET" && method !== "POST") {
    res.setHeader("allow", "GET, POST");
    return res.status(405).json({ error: "Method not allowed." });
  }

  const headers = { accept: "application/json" };
  if (method === "POST") headers["content-type"] = "application/json";
  if (process.env.SHUTTER_API_KEY) {
    headers.authorization = `Bearer ${process.env.SHUTTER_API_KEY}`;
  }

  try {
    const upstream = await fetch(target, {
      method,
      headers,
      body: method === "POST" ? JSON.stringify(req.body ?? {}) : undefined,
      signal: AbortSignal.timeout(30000),
    });

    const body = await upstream.text();
    const contentType = upstream.headers.get("content-type");
    if (contentType) res.setHeader("content-type", contentType);
    res.setHeader("x-33hoxo-shutter-network", network);
    return res.status(upstream.status).send(body);
  } catch (error) {
    console.error("33HOXO Shutter proxy error", error);
    return res.status(502).json({ error: "Shutter upstream request failed." });
  }
}
