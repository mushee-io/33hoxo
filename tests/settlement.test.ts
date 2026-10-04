import { describe, expect, it } from "vitest";
import { InMemoryNonceRegistry, SettlementAdapterRegistry, SettlementExecutionEngine, type ConfidentialIntentV1, type ExecutionPlan, type ExecutionReceipt, type SettlementAdapter, type SettlementSimulation } from "../src/index.js";

const intent:ConfidentialIntentV1={
  version:1,application:"test",sourceChain:"test",settlementAdapter:"test-adapter",market:"market",trader:"trader",
  kind:"LIMIT_ORDER",action:"BUY",outcome:"YES",priceBps:5000,quantityBaseUnits:"100",allowPartialFill:false,
  nonce:"0x00000000000000000000000000000020",createdAt:1_700_000_000,revealAt:1_700_000_100,expiresAt:2_000_000_000
};
class Adapter implements SettlementAdapter {
  readonly id="test-adapter";
  async validate():Promise<void>{}
  async simulate():Promise<SettlementSimulation>{return{executable:true}}
  async prepare(_:ConfidentialIntentV1,commitment:`0x${string}`):Promise<ExecutionPlan>{return{adapter:this.id,commitment,instructions:{}}}
  async execute(plan:ExecutionPlan):Promise<ExecutionReceipt>{return{adapter:this.id,commitment:plan.commitment,status:"SUBMITTED",transactionId:"tx-1",executedAt:1}}
  async confirm(receipt:ExecutionReceipt):Promise<ExecutionReceipt>{return{...receipt,status:"CONFIRMED"}}
}
describe("settlement engine",()=>{
  it("runs through confirmation",async()=>{
    const registry=new SettlementAdapterRegistry();registry.register(new Adapter());
    const engine=new SettlementExecutionEngine(registry,new InMemoryNonceRegistry());
    const out=await engine.executeVerified(intent,"0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
    expect(out.receipt.status).toBe("CONFIRMED");
  });
  it("blocks nonce replay",async()=>{
    const registry=new SettlementAdapterRegistry();registry.register(new Adapter());
    const engine=new SettlementExecutionEngine(registry,new InMemoryNonceRegistry());
    const commitment="0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
    await engine.executeVerified(intent,commitment);
    await expect(engine.executeVerified(intent,commitment)).rejects.toMatchObject({code:"REPLAY_DETECTED"});
  });
});
