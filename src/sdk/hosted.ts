import { ConfidentialMarketsClient } from "./client.js";
import { HttpGatewayTransport } from "./httpTransport.js";
import { ShutterApiClient, type ShutterNetwork } from "../shutter/client.js";

export type Hosted33HoxoClientOptions = {
  baseUrl: string;
  apiKey?: string;
  shutterNetwork?: ShutterNetwork;
  fetchImpl?: typeof fetch;
};

export function createHosted33HoxoClient(options: Hosted33HoxoClientOptions) {
  const baseUrl = options.baseUrl.replace(/\/$/, "");
  const fetchImpl = options.fetchImpl ?? fetch;

  const proxiedShutterFetch: typeof fetch = async (input, init) => {
    const raw =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;
    const upstream = new URL(raw);
    const path = `${upstream.pathname}${upstream.search}`;
    return fetchImpl(
      `${baseUrl}/api/shutter?network=${options.shutterNetwork ?? "chiado"}&path=${encodeURIComponent(path)}`,
      init,
    );
  };

  const shutter = new ShutterApiClient({
    network: options.shutterNetwork ?? "chiado",
    fetchImpl: proxiedShutterFetch,
  });

  const transport = new HttpGatewayTransport({
    baseUrl,
    apiKey: options.apiKey,
    fetchImpl,
  });

  return new ConfidentialMarketsClient(shutter, transport);
}
