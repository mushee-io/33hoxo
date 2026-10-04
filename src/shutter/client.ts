import { assertHex, type Hex } from "../protocol/hex.js";
import type { ShutterEncryptionData } from "../protocol/types.js";

export type ShutterNetwork = "chiado" | "gnosis";

const NETWORKS: Record<ShutterNetwork, { baseUrl: string; apiAddress: string }> = {
  chiado: {
    baseUrl: "https://shutter-api.chiado.staging.shutter.network/api",
    apiAddress: "0xd150bbf86C686de1a25820A94c2C2397e0bC54ab",
  },
  gnosis: {
    baseUrl: "https://shutter-api.shutter.network/api",
    apiAddress: "0x228DefCF37Da29475F0EE2B9E4dfAeDc3b0746bc",
  },
};

type ClientOptions = {
  network?: ShutterNetwork;
  apiKey?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
};

type IdentityPayload = {
  eon: number;
  eon_key: Hex;
  identity: Hex;
  identity_prefix: Hex;
  epoch_id?: Hex;
  tx_hash?: Hex;
};

type DecryptionKeyPayload = {
  decryption_key: Hex;
  decryption_timestamp: number;
  identity: Hex;
};

export class ShutterApiClient {
  readonly network: ShutterNetwork;
  readonly baseUrl: string;
  readonly apiAddress: string;

  private readonly apiKey?: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(options: ClientOptions = {}) {
    this.network = options.network ?? "chiado";
    this.baseUrl = NETWORKS[this.network].baseUrl;
    this.apiAddress = NETWORKS[this.network].apiAddress;
    this.apiKey = options.apiKey;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.timeoutMs = options.timeoutMs ?? 12_000;
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const headers = new Headers(init?.headers);
      headers.set("accept", "application/json");
      if (init?.body) headers.set("content-type", "application/json");
      if (this.apiKey) headers.set("authorization", `Bearer ${this.apiKey}`);

      const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
        ...init,
        headers,
        signal: controller.signal,
      });

      if (!response.ok) {
        const body = await response.text().catch(() => "");
        throw new Error(
          `Shutter API request failed: ${response.status} ${response.statusText}${body ? ` — ${body}` : ""}`,
        );
      }
      return response.json() as Promise<T>;
    } finally {
      clearTimeout(timer);
    }
  }

  async registerTimeIdentity(input: {
    decryptionTimestamp: number;
    identityPrefix: Hex;
  }): Promise<IdentityPayload> {
    if (!Number.isInteger(input.decryptionTimestamp) || input.decryptionTimestamp <= 0) {
      throw new Error("decryptionTimestamp must be a positive Unix timestamp.");
    }
    assertHex(input.identityPrefix, "identityPrefix");

    return this.request<IdentityPayload>("/time/register_identity", {
      method: "POST",
      body: JSON.stringify({
        decryptionTimestamp: input.decryptionTimestamp,
        identityPrefix: input.identityPrefix,
      }),
    });
  }

  async getEncryptionData(identityPrefix: Hex): Promise<ShutterEncryptionData> {
    assertHex(identityPrefix, "identityPrefix");
    const query = new URLSearchParams({
      address: this.apiAddress,
      identityPrefix,
    });
    const raw = await this.request<IdentityPayload>(
      `/time/get_data_for_encryption?${query.toString()}`,
    );

    assertHex(raw.eon_key, "eon_key");
    assertHex(raw.identity, "identity");
    assertHex(raw.identity_prefix, "identity_prefix");
    if (raw.epoch_id) assertHex(raw.epoch_id, "epoch_id");

    return {
      eon: raw.eon,
      eonKey: raw.eon_key,
      identity: raw.identity,
      identityPrefix: raw.identity_prefix,
      epochId: raw.epoch_id,
    };
  }

  async getDecryptionKey(identity: Hex): Promise<DecryptionKeyPayload> {
    assertHex(identity, "identity");
    const query = new URLSearchParams({ identity });
    const raw = await this.request<DecryptionKeyPayload>(
      `/time/get_decryption_key?${query.toString()}`,
    );
    assertHex(raw.decryption_key, "decryption_key");
    return raw;
  }

  async checkAuthentication(): Promise<unknown> {
    return this.request("/check_authentication");
  }
}
