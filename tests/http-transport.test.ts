import { describe, expect, it, vi } from "vitest";
import {
  HttpGatewayTransport,
  type ConfidentialEnvelopeV1,
} from "../src/index.js";

const envelope: ConfidentialEnvelopeV1 = {
  version: 1,
  scheme: "shutter-threshold-encryption",
  application: "test",
  sourceChain: "solana:devnet",
  settlementAdapter: "mock",
  market: "m",
  commitment: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  ciphertext: "0x0102",
  shutter: {
    network: "chiado",
    identity: "0x0102",
    identityPrefix: "0x0304",
    eon: 1,
  },
  createdAt: 100,
  revealAt: 200,
  expiresAt: 400,
};

describe("hosted gateway transport", () => {
  it("sends Bearer auth and sealed envelope", async () => {
    let auth = "";
    let payload: unknown;
    const fetchImpl: typeof fetch = vi.fn(async (_input, init) => {
      auth = new Headers(init?.headers).get("authorization") || "";
      payload = init?.body ? JSON.parse(String(init.body)) : undefined;
      return new Response(JSON.stringify({
        commitment: envelope.commitment,
        envelope,
        state: "WAITING",
        acceptedAt: 150,
        updatedAt: 150,
      }), { status: 202, headers: { "content-type": "application/json" } });
    }) as unknown as typeof fetch;

    const transport = new HttpGatewayTransport({
      baseUrl: "https://hoxo.example",
      apiKey: "secret",
      fetchImpl,
    });
    await transport.submit(envelope);

    expect(auth).toBe("Bearer secret");
    expect(payload).toEqual(envelope);
  });

  it("returns null for unknown commitments", async () => {
    const fetchImpl: typeof fetch = vi.fn(async () =>
      new Response(JSON.stringify({ error: "Unknown commitment." }), {
        status: 404,
        headers: { "content-type": "application/json" },
      })
    ) as unknown as typeof fetch;

    const transport = new HttpGatewayTransport({
      baseUrl: "https://hoxo.example",
      fetchImpl,
    });

    await expect(transport.get(envelope.commitment)).resolves.toBeNull();
  });
});
