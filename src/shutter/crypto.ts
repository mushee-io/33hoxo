import { createIntentCommitment } from "../protocol/commitment.js";
import { decodeIntent, encodeIntent } from "../protocol/intent.js";
import { assertHex, randomHex, type Hex } from "../protocol/hex.js";
import type {
  ConfidentialEnvelopeV1,
  ConfidentialIntentV1,
  ShutterEncryptionData,
} from "../protocol/types.js";
import type { ShutterNetwork } from "./client.js";

type ShutterSdk = {
  encryptData(
    message: Hex,
    identityPreimage: Hex,
    eonKey: Hex,
    sigma: Hex,
  ): Promise<Hex>;
  decrypt(ciphertext: Hex, decryptionKey: Hex): Promise<Hex>;
};

let sdkPromise: Promise<ShutterSdk> | null = null;

async function loadShutterSdk(): Promise<ShutterSdk> {
  if (sdkPromise) return sdkPromise;

  sdkPromise = (async () => {
    const isNode =
      typeof process !== "undefined" &&
      typeof process.versions?.node === "string" &&
      typeof window === "undefined";

    if (isNode) {
      // The upstream 0.0.2 ESM BLST bundle contains a dynamic require("fs"),
      // which fails in Node ESM/Vitest. Its published CommonJS export supports
      // the Node BLST path, so load that condition explicitly.
      const nodeModuleSpecifier = "node:module";
      const { createRequire } = await import(
        /* @vite-ignore */ nodeModuleSpecifier
      );
      const require = createRequire(import.meta.url);
      return require("@shutter-network/shutter-sdk") as ShutterSdk;
    }

    return (await import("@shutter-network/shutter-sdk")) as ShutterSdk;
  })();

  return sdkPromise;
}

export async function encryptShutterData(
  message: Hex,
  identityPreimage: Hex,
  eonKey: Hex,
  sigma: Hex,
): Promise<Hex> {
  assertHex(message, "message");
  assertHex(identityPreimage, "identityPreimage");
  assertHex(eonKey, "eonKey");
  assertHex(sigma, "sigma");
  const sdk = await loadShutterSdk();
  return sdk.encryptData(message, identityPreimage, eonKey, sigma);
}

export async function decryptShutterData(
  ciphertext: Hex,
  decryptionKey: Hex,
): Promise<Hex> {
  assertHex(ciphertext, "ciphertext");
  assertHex(decryptionKey, "decryptionKey");
  const sdk = await loadShutterSdk();
  return sdk.decrypt(ciphertext, decryptionKey);
}

export async function encryptConfidentialIntent(input: {
  intent: ConfidentialIntentV1;
  network: ShutterNetwork;
  encryptionData: ShutterEncryptionData;
}): Promise<ConfidentialEnvelopeV1> {
  const { intent, network, encryptionData } = input;
  const message = encodeIntent(intent);
  const commitment = await createIntentCommitment(intent);
  const sigma = randomHex(32);

  const ciphertext = await encryptShutterData(
    message,
    encryptionData.identity,
    encryptionData.eonKey,
    sigma,
  );

  return {
    version: 1,
    scheme: "shutter-threshold-encryption",
    application: intent.application,
    sourceChain: intent.sourceChain,
    settlementAdapter: intent.settlementAdapter,
    market: intent.market,
    commitment,
    ciphertext,
    shutter: {
      network,
      identity: encryptionData.identity,
      identityPrefix: encryptionData.identityPrefix,
      eon: encryptionData.eon,
      epochId: encryptionData.epochId,
    },
    createdAt: intent.createdAt,
    revealAt: intent.revealAt,
    expiresAt: intent.expiresAt,
  };
}

export async function decryptConfidentialIntent(
  envelope: ConfidentialEnvelopeV1,
  decryptionKey: Hex,
): Promise<ConfidentialIntentV1> {
  const decrypted = await decryptShutterData(envelope.ciphertext, decryptionKey);
  return decodeIntent(decrypted);
}
