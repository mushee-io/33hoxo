const DEFAULT_PATH = "/api/order-place";

export default async function handler(req, res) {
  res.setHeader("cache-control", "no-store");

  if (req.method !== "POST") {
    res.setHeader("allow", "POST");
    return res.status(405).json({ error: "Method not allowed." });
  }

  const configured = process.env.MARYJANE_ORDER_PLACE_URL || "https://maryjane-blue.vercel.app/api/order-place";

  let target;
  try {
    target = new URL(configured);
  } catch {
    return res.status(500).json({
      code: "MARYJANE_BAD_CONFIG",
      error: "MARYJANE_ORDER_PLACE_URL is not a valid absolute URL.",
    });
  }

  if (!target.pathname || target.pathname === "/") {
    target.pathname = DEFAULT_PATH;
  }

  try {
    const upstream = await fetch(target, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify(req.body ?? {}),
      signal: AbortSignal.timeout(30000),
    });

    const body = await upstream.text();
    const contentType = upstream.headers.get("content-type");
    if (contentType) res.setHeader("content-type", contentType);

    return res.status(upstream.status).send(body);
  } catch (error) {
    console.error("33HOXO Mary Jane proxy error", error);
    return res.status(502).json({
      code: "MARYJANE_UPSTREAM_FAILED",
      error: "Mary Jane order preparation request failed.",
    });
  }
}
