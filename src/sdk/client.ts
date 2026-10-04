import type { Hex } from "../protocol/hex.js";
import { randomHex } from "../protocol/hex.js";
import type { ConfidentialEnvelopeV1, ConfidentialIntentV1, PublicIntentRecord, ShutterEncryptionData } from "../protocol/types.js";
import { encryptConfidentialIntent } from "../shutter/crypto.js";
import { ShutterApiClient } from "../shutter/client.js";

export interface ConfidentialGatewayTransport {
  submit(envelope: ConfidentialEnvelopeV1): Promise<PublicIntentRecord>;
  get(commitment: Hex): Promise<PublicIntentRecord | null>;
  cancel(commitment: Hex): Promise<PublicIntentRecord>;
}
export type SealResult = { envelope: ConfidentialEnvelopeV1; record: PublicIntentRecord };

export class ConfidentialMarketsClient {
  constructor(private readonly shutter: ShutterApiClient, private readonly gateway: ConfidentialGatewayTransport) {}

  async sealIntent(intent: ConfidentialIntentV1): Promise<SealResult> {
    const identityPrefix = randomHex(32);
    const registration = await this.shutter.registerTimeIdentity({
      decryptionTimestamp: intent.revealAt,
      identityPrefix,
    });

    if (registration.identity_prefix.toLowerCase() !== identityPrefix.toLowerCase()) {
      throw new Error("Shutter registration returned a different identity prefix.");
    }

    const encryptionData: ShutterEncryptionData = {
      eon: registration.eon,
      eonKey: registration.eon_key,
      identity: registration.identity,
      identityPrefix: registration.identity_prefix,
      epochId: registration.epoch_id,
    };

    const envelope = await encryptConfidentialIntent({
      intent,
      network: this.shutter.network,
      encryptionData,
    });
    return { envelope, record: await this.gateway.submit(envelope) };
  }

  status(commitment: Hex): Promise<PublicIntentRecord | null> {
    return this.gateway.get(commitment);
  }

  cancel(commitment: Hex): Promise<PublicIntentRecord> {
    return this.gateway.cancel(commitment);
  }
}
