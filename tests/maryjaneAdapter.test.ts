import { describe,expect,it,vi } from "vitest";
import { MaryJaneSolanaAdapter,type ConfidentialIntentV1 } from "../src/index.js";

const intent:ConfidentialIntentV1={
  version:1,application:"maryjane",sourceChain:"solana:devnet",settlementAdapter:"maryjane-solana-v1",
  market:"Market111",trader:"Wallet111",kind:"LIMIT_ORDER",action:"BUY",outcome:"YES",priceBps:6200,
  quantityBaseUnits:"500000000",collateralAsset:"USDG",allowPartialFill:true,
  nonce:"0x00000000000000000000000000000021",createdAt:100,revealAt:200,expiresAt:500
};

describe("Mary Jane adapter",()=>{
  it("maps to order-place request before wallet execution",async()=>{
    let capturedBody:unknown;
    const fetchImpl:typeof fetch=vi.fn(async(_input:RequestInfo|URL,init?:RequestInit)=>{
      capturedBody=init?.body?JSON.parse(String(init.body)):undefined;
      return new Response(JSON.stringify({transactionBase64:"dHhieXRlcw==",lastValidBlockHeight:99}),
        {status:200,headers:{"content-type":"application/json"}});
    }) as unknown as typeof fetch;

    const wallet={signAndSend:vi.fn(async()=>"solana-signature"),confirm:vi.fn(async()=>true)};
    const adapter=new MaryJaneSolanaAdapter({orderPlaceUrl:"https://example.test/api/order-place",wallet,fetchImpl});

    const plan=await adapter.prepare(intent,"0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc");
    expect(capturedBody).toEqual({
      wallet:"Wallet111",market:"Market111",side:"YES",kind:"BUY",priceBps:6200,sharesBaseUnits:"500000000"
    });

    const submitted=await adapter.execute(plan);
    const receipt=await adapter.confirm(submitted);
    expect(receipt.status).toBe("CONFIRMED");
    expect(receipt.transactionId).toBe("solana-signature");
  });
});
