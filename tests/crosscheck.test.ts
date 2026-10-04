import { describe,expect,it } from "vitest";
import {
  ConfidentialIntentGateway,InMemoryCommitmentStore,InMemoryNonceRegistry,RevealEngine,
  SettlementAdapterRegistry,SettlementExecutionEngine,ShutterApiError,createIntentCommitment,
  type ConfidentialEnvelopeV1,type ConfidentialIntentV1,type ExecutionPlan,type ExecutionReceipt,
  type SettlementAdapter,type SettlementSimulation,type ShutterApiClient,
} from "../src/index.js";

function envelope(overrides:Partial<ConfidentialEnvelopeV1>={}):ConfidentialEnvelopeV1{
  return{
    version:1,scheme:"shutter-threshold-encryption",application:"test",sourceChain:"solana:devnet",
    settlementAdapter:"noop",market:"market",
    commitment:"0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    ciphertext:"0x0102",shutter:{network:"chiado",identity:"0x0102",identityPrefix:"0x0304",eon:1},
    createdAt:100,revealAt:200,expiresAt:400,...overrides,
  };
}

describe("cross-check regressions",()=>{
  it("rejects new commitments submitted after reveal",async()=>{
    const gateway=new ConfidentialIntentGateway(new InMemoryCommitmentStore());
    await expect(gateway.submit(envelope(),200)).rejects.toThrow(/late commitments/i);
  });

  it("keeps exact retries idempotent after reveal",async()=>{
    const gateway=new ConfidentialIntentGateway(new InMemoryCommitmentStore());
    const first=await gateway.submit(envelope(),150);
    const retry=await gateway.submit(envelope(),250);
    expect(retry.acceptedAt).toBe(first.acceptedAt);
  });

  it("rejects cancellation after reveal even if state is still WAITING",async()=>{
    const gateway=new ConfidentialIntentGateway(new InMemoryCommitmentStore());
    const first=await gateway.submit(envelope(),150);
    await expect(gateway.cancel(first.commitment,200)).rejects.toThrow(/after the reveal window/i);
  });

  it("rejects conflicting ciphertext for an existing commitment",async()=>{
    const gateway=new ConfidentialIntentGateway(new InMemoryCommitmentStore());
    await gateway.submit(envelope(),150);
    await expect(gateway.submit(envelope({ciphertext:"0x9999"}),151)).rejects.toThrow(/conflicting envelope/i);
  });

  it("keeps transient Shutter key failures retryable instead of invalid",async()=>{
    const store=new InMemoryCommitmentStore();
    const record=await new ConfidentialIntentGateway(store).submit(envelope(),150);
    const shutter={getDecryptionKey:async()=>{throw new ShutterApiError(404,"not ready",false);}} as unknown as ShutterApiClient;
    const result=await new RevealEngine(store,shutter).process(record.commitment,210);
    expect(result).toEqual({status:"RETRYABLE",code:"KEY_NOT_READY"});
    expect((await store.get(record.commitment))?.state).toBe("REVEALABLE");
  });

  it("blocks settlement if supplied commitment does not match intent",async()=>{
    const intent:ConfidentialIntentV1={
      version:1,application:"test",sourceChain:"test",settlementAdapter:"noop",market:"market",trader:"trader",
      kind:"LIMIT_ORDER",action:"BUY",outcome:"YES",priceBps:5000,quantityBaseUnits:"10",allowPartialFill:false,
      nonce:"0x00000000000000000000000000000040",createdAt:100,revealAt:200,expiresAt:2_000_000_000
    };
    class Adapter implements SettlementAdapter{
      readonly id="noop";async validate():Promise<void>{}
      async simulate():Promise<SettlementSimulation>{return{executable:true}}
      async prepare(_:ConfidentialIntentV1,c:`0x${string}`):Promise<ExecutionPlan>{return{adapter:this.id,commitment:c,instructions:{}}}
      async execute(p:ExecutionPlan):Promise<ExecutionReceipt>{return{adapter:this.id,commitment:p.commitment,status:"CONFIRMED",executedAt:1}}
      async confirm(r:ExecutionReceipt):Promise<ExecutionReceipt>{return r}
    }
    const registry=new SettlementAdapterRegistry();registry.register(new Adapter());
    const engine=new SettlementExecutionEngine(registry,new InMemoryNonceRegistry());
    await expect(engine.executeVerified(intent,"0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",300))
      .rejects.toMatchObject({code:"COMMITMENT_MISMATCH"});
    expect(await createIntentCommitment(intent)).not.toBe("0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb");
  });
});
