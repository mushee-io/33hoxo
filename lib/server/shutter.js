const NETWORKS = {
  chiado: "https://shutter-api.chiado.staging.shutter.network",
  gnosis: "https://shutter-api.shutter.network",
};

export function shutterBase(network) {
  return NETWORKS[network === "gnosis" ? "gnosis" : "chiado"];
}

export async function shutterRequest(network, path, init = {}) {
  const headers = new Headers(init.headers);
  headers.set("accept", "application/json");
  if (init.body) headers.set("content-type", "application/json");
  if (process.env.SHUTTER_API_KEY) {
    headers.set("authorization", `Bearer ${process.env.SHUTTER_API_KEY}`);
  }

  const response = await fetch(`${shutterBase(network)}${path}`, {
    ...init,
    headers,
    signal: AbortSignal.timeout(30000),
  });
  const text = await response.text();
  let body;
  try { body = JSON.parse(text); }
  catch { body = { raw: text }; }

  if (!response.ok) {
    const error = new Error(
      typeof body?.message === "string"
        ? body.message
        : `Shutter request failed with HTTP ${response.status}.`
    );
    error.status = response.status;
    throw error;
  }
  return body;
}
