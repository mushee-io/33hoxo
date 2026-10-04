import type { Hex } from "../protocol/hex.js";
import { randomHex } from "../protocol/hex.js";
import type { ConfidentialEnvelopeV1, ConfidentialIntentV1, PublicIntentRecord } from "../protocol/types.js";
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
    await this.shutter.registerTimeIdentity({ decryptionTimestamp: intent.revealAt, identityPrefix });
    const encryptionData = await this.retryEncryptionData(identityPrefix);
    const envelope = await encryptConfidentialIntent({ intent, network:this.shutter.network, encryptionData });
    return { envelope, record: await this.gateway.submit(envelope) };
  }
  status(commitment: Hex): Promise<PublicIntentRecord | null> { return this.gateway.get(commitment); }
  cancel(commitment: Hex): Promise<PublicIntentRecord> { return this.gateway.cancel(commitment); }
  private async retryEncryptionData(identityPrefix: Hex) {
    let last: unknown;
    for (let attempt=0; attempt<6; attempt+=1) {
      try { return await this.shutter.getEncryptionData(identityPrefix); }
      catch (error) { last=error; await new Promise(resolve=>setTimeout(resolve,250*(attempt+1))); }
    }
    throw last instanceof Error ? last : new Error("Shutter encryption data did not become available.");
  }
}
