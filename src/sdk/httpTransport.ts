import type { Hex } from "../protocol/hex.js";
import type { ConfidentialEnvelopeV1, PublicIntentRecord } from "../protocol/types.js";
import type { ConfidentialGatewayTransport } from "./client.js";

export type HttpGatewayTransportOptions = {
  baseUrl: string;
  apiKey?: string;
  fetchImpl?: typeof fetch;
};

export class HttpGatewayTransport implements ConfidentialGatewayTransport {
  private readonly baseUrl: string;
  private readonly apiKey?: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: HttpGatewayTransportOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
    this.apiKey = options.apiKey;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  private headers(): Headers {
    const headers = new Headers({ accept: "application/json" });
    if (this.apiKey) headers.set("authorization", `Bearer ${this.apiKey}`);
    return headers;
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const headers = this.headers();
    if (init?.body) headers.set("content-type", "application/json");
    const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
      ...init,
      headers,
    });
    const body = await response.json().catch(() => ({})) as Record<string, unknown>;
    if (!response.ok) {
      const message = typeof body.error === "string"
        ? body.error
        : `33HOXO API request failed with HTTP ${response.status}.`;
      throw new Error(message);
    }
    return body as T;
  }

  submit(envelope: ConfidentialEnvelopeV1): Promise<PublicIntentRecord> {
    return this.request("/api/v1/intents", {
      method: "POST",
      body: JSON.stringify(envelope),
    });
  }

  get(commitment: Hex): Promise<PublicIntentRecord | null> {
    return this.request(`/api/v1/intents/${commitment}`);
  }

  cancel(commitment: Hex): Promise<PublicIntentRecord> {
    return this.request(`/api/v1/intents/${commitment}/cancel`, {
      method: "POST",
    });
  }
}
