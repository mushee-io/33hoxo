import { describe, expect, it, vi } from "vitest";
import { ShutterApiClient } from "../src/index.js";

describe("Shutter API live response envelopes", () => {
  it("unwraps the message payload returned by live time/register_identity", async () => {
    const fetchImpl: typeof fetch = vi.fn(async () =>
      new Response(JSON.stringify({
        message: {
          eon: 7,
          eon_key: "abcdef",
          identity: "1234",
          identity_prefix: "aa".repeat(32),
          tx_hash: "beef",
        },
      }), { status: 200, headers: { "content-type": "application/json" } })
    ) as unknown as typeof fetch;

    const client = new ShutterApiClient({ fetchImpl });
    const identityPrefix = ("0x" + "aa".repeat(32)) as `0x${string}`;
    const result = await client.registerTimeIdentity({
      decryptionTimestamp: 2_000_000_000,
      identityPrefix,
    });

    expect(result.eon).toBe(7);
    expect(result.eon_key).toBe("0xabcdef");
    expect(result.identity).toBe("0x1234");
    expect(result.identity_prefix).toBe(identityPrefix);
    expect(result.tx_hash).toBe("0xbeef");
  });

  it("unwraps message payload for decryption keys", async () => {
    const fetchImpl: typeof fetch = vi.fn(async () =>
      new Response(JSON.stringify({
        message: {
          decryption_key: "cafe",
          decryption_timestamp: 2_000_000_000,
          identity: "1234",
        },
      }), { status: 200, headers: { "content-type": "application/json" } })
    ) as unknown as typeof fetch;

    const client = new ShutterApiClient({ fetchImpl });
    const result = await client.getDecryptionKey("0x1234");

    expect(result.decryption_key).toBe("0xcafe");
    expect(result.identity).toBe("0x1234");
  });
});
