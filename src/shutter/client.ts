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

export type ShutterApiClientOptions = {
  network?: ShutterNetwork;
  apiKey?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
};

export type ShutterIdentityRegistration = {
  eon: number;
  eon_key: Hex;
  identity: Hex;
  identity_prefix: Hex;
  epoch_id?: Hex;
  tx_hash?: Hex;
};

export type ShutterDecryptionKey = {
  decryption_key: Hex;
  decryption_timestamp: number;
  identity: Hex;
};

export class ShutterApiError extends Error {
  constructor(
    readonly status: number | null,
    message: string,
    readonly retryable: boolean,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = "ShutterApiError";
  }
}

export class ShutterApiClient {
  readonly network: ShutterNetwork;
  readonly baseUrl: string;
  readonly apiAddress: string;

  private readonly apiKey?: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(options: ShutterApiClientOptions = {}) {
    this.network = options.network ?? "chiado";
    this.baseUrl = NETWORKS[this.network].baseUrl;
    this.apiAddress = NETWORKS[this.network].apiAddress;
    this.apiKey = options.apiKey;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.timeoutMs = options.timeoutMs ?? 30_000;
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const headers = new Headers(init?.headers);
      headers.set("accept", "application/json");
      if (init?.body) headers.set("content-type", "application/json");
      if (this.apiKey) headers.set("authorization", `Bearer ${this.apiKey}`);

      let response: Response;
      try {
        response = await this.fetchImpl(`${this.baseUrl}${path}`, {
          ...init,
          headers,
          signal: controller.signal,
        });
      } catch (error) {
        const timedOut = controller.signal.aborted;
        throw new ShutterApiError(
          null,
          timedOut ? "Shutter API request timed out." : "Shutter API network request failed.",
          true,
          error,
        );
      }

      if (!response.ok) {
        const body = await response.text().catch(() => "");
        const retryable = response.status === 408 || response.status === 429 || response.status >= 500;
        throw new ShutterApiError(
          response.status,
          `Shutter API request failed: ${response.status} ${response.statusText}${body ? ` — ${body}` : ""}`,
          retryable,
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
  }): Promise<ShutterIdentityRegistration> {
    if (!Number.isInteger(input.decryptionTimestamp) || input.decryptionTimestamp <= 0) {
      throw new Error("decryptionTimestamp must be a positive Unix timestamp.");
    }
    assertHex(input.identityPrefix, "identityPrefix");

    const raw = await this.request<ShutterIdentityRegistration>("/time/register_identity", {
      method: "POST",
      body: JSON.stringify({
        decryptionTimestamp: input.decryptionTimestamp,
        identityPrefix: input.identityPrefix,
      }),
    });

    assertHex(raw.eon_key, "eon_key");
    assertHex(raw.identity, "identity");
    assertHex(raw.identity_prefix, "identity_prefix");
    if (raw.epoch_id) assertHex(raw.epoch_id, "epoch_id");
    if (!Number.isInteger(raw.eon) || raw.eon < 0) throw new Error("Shutter API returned an invalid eon.");
    return raw;
  }

  async getEncryptionData(identityPrefix: Hex): Promise<ShutterEncryptionData> {
    assertHex(identityPrefix, "identityPrefix");
    const query = new URLSearchParams({
      address: this.apiAddress,
      identityPrefix,
    });
    const raw = await this.request<ShutterIdentityRegistration>(
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

  async getDecryptionKey(identity: Hex): Promise<ShutterDecryptionKey> {
    assertHex(identity, "identity");
    const query = new URLSearchParams({ identity });
    const raw = await this.request<ShutterDecryptionKey>(
      `/time/get_decryption_key?${query.toString()}`,
    );
    assertHex(raw.decryption_key, "decryption_key");
    assertHex(raw.identity, "identity");
    if (!Number.isInteger(raw.decryption_timestamp) || raw.decryption_timestamp < 0) {
      throw new Error("Shutter API returned an invalid decryption timestamp.");
    }
    return raw;
  }

  async checkAuthentication(): Promise<unknown> {
    return this.request("/check_authentication");
  }
}
