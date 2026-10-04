import type { ConfidentialIntentV1, PublicIntentRecord } from "../protocol/types.js";

export type TradingMode = "STANDARD" | "CONFIDENTIAL";
export type ConfidentialOrderViewModel = {
  mode: TradingMode; headline: string; state: PublicIntentRecord["state"]; commitment: string;
  revealAt: number; secondsUntilReveal: number; shutterNetwork: string; shutterIdentity: string; market: string;
  privateDetails?: { action: string; outcome: string; quantityBaseUnits: string; priceBps?: number };
  proof: { commitment: string; identity: string; eon: number; scheme: string };
};

const HEADLINES: Record<PublicIntentRecord["state"], string> = {
  SEALED:"Order sealed", WAITING:"Protected by Shutter", REVEALABLE:"Reveal available", DECRYPTING:"Decrypting threshold ciphertext",
  REVEALED:"Order revealed", VERIFIED:"Order verified", EXECUTABLE:"Ready for settlement", EXECUTED:"Settlement confirmed",
  CANCELLED:"Order cancelled", EXPIRED:"Order expired", INVALID:"Order rejected", TAMPERED:"Integrity check failed", SETTLEMENT_FAILED:"Settlement failed",
};

export function buildConfidentialOrderViewModel(record: PublicIntentRecord, localIntent?: ConfidentialIntentV1, now = Math.floor(Date.now()/1000)): ConfidentialOrderViewModel {
  return {
    mode:"CONFIDENTIAL", headline:HEADLINES[record.state], state:record.state, commitment:record.commitment,
    revealAt:record.envelope.revealAt, secondsUntilReveal:Math.max(0, record.envelope.revealAt-now),
    shutterNetwork:record.envelope.shutter.network, shutterIdentity:record.envelope.shutter.identity, market:record.envelope.market,
    ...(localIntent ? { privateDetails:{ action:localIntent.action, outcome:localIntent.outcome, quantityBaseUnits:localIntent.quantityBaseUnits, priceBps:localIntent.priceBps } } : {}),
    proof:{ commitment:record.commitment, identity:record.envelope.shutter.identity, eon:record.envelope.shutter.eon, scheme:record.envelope.scheme },
  };
}

export class ConfidentialTradeController {
  private mode: TradingMode = "STANDARD";
  setMode(mode: TradingMode): void { this.mode = mode; }
  getMode(): TradingMode { return this.mode; }
  isConfidential(): boolean { return this.mode === "CONFIDENTIAL"; }
}
