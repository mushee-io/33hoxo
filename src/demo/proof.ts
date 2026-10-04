import type { ExecutionReceipt } from "../settlement/adapter.js";
import type { PublicIntentRecord } from "../protocol/types.js";

export type ConfidentialExecutionProof = {
  protocol:"33hoxo"; version:1; commitment:string; ciphertext:string; application:string; market:string; revealAt:number;
  shutter:{network:string;identity:string;eon:number}; lifecycleState:string;
  settlement?:{adapter:string;transactionId?:string;status:string;executedAt:number};
};

export function createExecutionProof(record:PublicIntentRecord,receipt?:ExecutionReceipt):ConfidentialExecutionProof {
  return {
    protocol:"33hoxo",version:1,commitment:record.commitment,ciphertext:record.envelope.ciphertext,
    application:record.envelope.application,market:record.envelope.market,revealAt:record.envelope.revealAt,
    shutter:{network:record.envelope.shutter.network,identity:record.envelope.shutter.identity,eon:record.envelope.shutter.eon},
    lifecycleState:record.state,
    ...(receipt ? {settlement:{adapter:receipt.adapter,transactionId:receipt.transactionId,status:receipt.status,executedAt:receipt.executedAt}} : {}),
  };
}
