import { describe,expect,it } from "vitest";
import { ConfidentialIntentGateway,InMemoryCommitmentStore,buildConfidentialOrderViewModel,createGatewayApi,type ConfidentialEnvelopeV1 } from "../src/index.js";

const envelope:ConfidentialEnvelopeV1={
  version:1,scheme:"shutter-threshold-encryption",application:"maryjane",sourceChain:"solana:devnet",
  settlementAdapter:"maryjane-solana-v1",market:"market-1",
  commitment:"0xdddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
  ciphertext:"0x01020304",shutter:{network:"chiado",identity:"0x0102",identityPrefix:"0x0304",eon:9},
  createdAt:2_000_000_000,revealAt:2_000_000_100,expiresAt:2_000_001_000
};
describe("API and UX",()=>{
  it("exposes lifecycle",async()=>{
    const gateway=new ConfidentialIntentGateway(new InMemoryCommitmentStore());
    const api=createGatewayApi(gateway);
    expect((await api({method:"POST",path:"/v1/intents",body:envelope})).status).toBe(202);
    expect((await api({method:"GET",path:`/v1/intents/${envelope.commitment}`})).status).toBe(200);
  });
  it("hides plaintext from public view",async()=>{
    const gateway=new ConfidentialIntentGateway(new InMemoryCommitmentStore());
    const record=await gateway.submit(envelope,2_000_000_050);
    const view=buildConfidentialOrderViewModel(record,undefined,2_000_000_070);
    expect(view.headline).toBe("Protected by Shutter");
    expect(view.secondsUntilReveal).toBe(30);
    expect(view.privateDetails).toBeUndefined();
  });
});
