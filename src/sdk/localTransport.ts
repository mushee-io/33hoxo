import type { Hex } from "../protocol/hex.js";
import type { ConfidentialEnvelopeV1, PublicIntentRecord } from "../protocol/types.js";
import type { ConfidentialIntentGateway } from "../gateway/service.js";
import type { ConfidentialGatewayTransport } from "./client.js";

export class LocalGatewayTransport implements ConfidentialGatewayTransport {
  constructor(private readonly gateway: ConfidentialIntentGateway) {}
  submit(envelope: ConfidentialEnvelopeV1): Promise<PublicIntentRecord> { return this.gateway.submit(envelope); }
  get(commitment: Hex): Promise<PublicIntentRecord | null> { return this.gateway.get(commitment); }
  cancel(commitment: Hex): Promise<PublicIntentRecord> { return this.gateway.cancel(commitment); }
}
