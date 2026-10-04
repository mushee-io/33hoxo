import { describe, expect, it } from "vitest";
import { InMemoryNonceRegistry, SettlementAdapterRegistry, SettlementExecutionEngine, type ConfidentialIntentV1, type ExecutionPlan, type ExecutionReceipt, type SettlementAdapter, type SettlementSimulation } from "../src/index.js";

const intent:ConfidentialIntentV1={version:1,application:"test",sourceChain:"test",settlementAdapter:"test-adapter",market:"market",trader:"trader",kind:"LIMIT_ORDER",action:"BUY",outcome:"YES",priceBps:5000,quantityBaseUnits:"100",allowPartialFill:false,nonce:"0x00000000000000000000000000000020",createdAt:100,revealAt:200,expiresAt:500};
class Adapter implements SettlementAdapter {
  readonly id="test-adapter";
  async validate():Promise<void>{}
  async simulate():Promise<SettlementSimulation>{return{executable:true}}
  async prepare(_:ConfidentialIntentV1,commitment:`0x${string}`):Promise<ExecutionPlan>{return{adapter:this.id,commitment,instructions:{}}}
  async execute(plan:ExecutionPlan):Promise<ExecutionReceipt>{return{adapter:this.id,commitment:plan.commitment,status:"SUBMITTED",transactionId:"tx-1",executedAt:1}}
  async confirm(receipt:ExecutionReceipt):Promise<ExecutionReceipt>{return{...receipt,status:"CONFIRMED"}}
}
describe("settlement engine",()=>{
  it("runs through confirmation",async()=>{const r=new SettlementAdapterRegistry();r.register(new Adapter());const e=new SettlementExecutionEngine(r,new InMemoryNonceRegistry());const out=await e.executeVerified(intent,"0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");expect(out.receipt.status).toBe("CONFIRMED")});
  it("blocks nonce replay",async()=>{const r=new SettlementAdapterRegistry();r.register(new Adapter());const e=new SettlementExecutionEngine(r,new InMemoryNonceRegistry());const c="0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";await e.executeVerified(intent,c);await expect(e.executeVerified(intent,c)).rejects.toMatchObject({code:"REPLAY_DETECTED"})});
});
