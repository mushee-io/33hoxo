import type { Hex } from "./hex.js";

export type ConfidentialIntentKind =
  | "LIMIT_ORDER"
  | "MARKET_ORDER"
  | "SEALED_BID"
  | "RFQ"
  | "CUSTOM";

export type ConfidentialIntentAction = "BUY" | "SELL" | "BID" | "QUOTE" | "CUSTOM";

export type ConfidentialIntentV1 = {
  version: 1;
  application: string;
  sourceChain: string;
  settlementAdapter: string;
  market: string;
  trader: string;

  kind: ConfidentialIntentKind;
  action: ConfidentialIntentAction;
  outcome: string;

  priceBps?: number;
  quantityBaseUnits: string;
  collateralAsset?: string;
  maxSpendBaseUnits?: string;
  minFillBaseUnits?: string;
  allowPartialFill: boolean;
  slippageBps?: number;

  nonce: Hex;
  createdAt: number;
  revealAt: number;
  expiresAt?: number;

  metadata?: Record<string, string | number | boolean | null>;
};

export type ShutterEncryptionData = {
  eon: number;
  eonKey: Hex;
  identity: Hex;
  identityPrefix: Hex;
  epochId?: Hex;
};

export type ConfidentialEnvelopeV1 = {
  version: 1;
  scheme: "shutter-threshold-encryption";
  application: string;
  sourceChain: string;
  settlementAdapter: string;
  market: string;

  commitment: Hex;
  ciphertext: Hex;

  shutter: {
    network: "chiado" | "gnosis";
    identity: Hex;
    identityPrefix: Hex;
    eon: number;
    epochId?: Hex;
  };

  createdAt: number;
  revealAt: number;
  expiresAt?: number;
};

export type IntentLifecycleState =
  | "SEALED"
  | "WAITING"
  | "REVEALABLE"
  | "DECRYPTING"
  | "REVEALED"
  | "VERIFIED"
  | "EXECUTABLE"
  | "EXECUTED"
  | "CANCELLED"
  | "EXPIRED"
  | "INVALID"
  | "TAMPERED"
  | "SETTLEMENT_FAILED";

export type PublicIntentRecord = {
  commitment: Hex;
  envelope: ConfidentialEnvelopeV1;
  state: IntentLifecycleState;
  acceptedAt: number;
  updatedAt: number;
  failureCode?: string;
};
