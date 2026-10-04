import type { Hex } from "../protocol/hex.js";
import type { ConfidentialIntentV1 } from "../protocol/types.js";
import type { ExecutionPlan, ExecutionReceipt, SettlementAdapter, SettlementSimulation } from "../settlement/adapter.js";
import { SettlementError } from "../settlement/errors.js";

export type MaryJaneWalletBridge = {
  /**
   * Must return a transaction signature once a transaction has been submitted.
   * If it throws, callers must treat submission state as unknown and reconcile before retrying.
   */
  signAndSend(transactionBase64: string): Promise<string>;
  confirm(signature: string, context?: { lastValidBlockHeight?: number }): Promise<boolean>;
};

type PreparedMaryJaneTransaction = {
  transactionBase64: string;
  lastValidBlockHeight?: number;
};

export type MaryJaneSolanaAdapterOptions = {
  orderPlaceUrl: string;
  wallet: MaryJaneWalletBridge;
  fetchImpl?: typeof fetch;
};

export class MaryJaneSolanaAdapter implements SettlementAdapter {
  readonly id="maryjane-solana-v1";
  private readonly fetchImpl:typeof fetch;
  constructor(private readonly options:MaryJaneSolanaAdapterOptions){this.fetchImpl=options.fetchImpl??fetch;}

  async validate(intent:ConfidentialIntentV1):Promise<void>{
    if(intent.application!=="maryjane")throw new SettlementError("UNSUPPORTED_INTENT","Intent is not for Mary Jane.");
    if(!intent.sourceChain.toLowerCase().startsWith("solana"))throw new SettlementError("UNSUPPORTED_INTENT","Mary Jane adapter requires Solana.");
    if(!["YES","NO"].includes(intent.outcome))throw new SettlementError("UNSUPPORTED_INTENT","Mary Jane outcome must be YES or NO.");
    if(!["BUY","SELL"].includes(intent.action))throw new SettlementError("UNSUPPORTED_INTENT","Mary Jane action must be BUY or SELL.");
    if(intent.priceBps==null||intent.priceBps<1||intent.priceBps>9_999)throw new SettlementError("UNSUPPORTED_INTENT","Mary Jane price must be 1-9,999 bps.");
    if(BigInt(intent.quantityBaseUnits)<=0n)throw new SettlementError("UNSUPPORTED_INTENT","Mary Jane quantity must be positive.");
  }

  async simulate(intent:ConfidentialIntentV1):Promise<SettlementSimulation>{
    await this.validate(intent);
    const quantity=BigInt(intent.quantityBaseUnits);
    const estimatedCost=intent.action==="BUY"?(quantity*BigInt(intent.priceBps!))/10_000n:quantity;
    return{executable:true,estimatedFillBaseUnits:intent.quantityBaseUnits,estimatedCostBaseUnits:estimatedCost.toString(),
      metadata:{side:intent.outcome,action:intent.action,market:intent.market}};
  }

  async prepare(intent:ConfidentialIntentV1,commitment:Hex):Promise<ExecutionPlan>{
    await this.validate(intent);
    const response=await this.fetchImpl(this.options.orderPlaceUrl,{
      method:"POST",
      headers:{"content-type":"application/json",accept:"application/json"},
      body:JSON.stringify({
        wallet:intent.trader,
        market:intent.market,
        side:intent.outcome,
        kind:intent.action,
        priceBps:intent.priceBps,
        sharesBaseUnits:intent.quantityBaseUnits,
      }),
    });
    const body=await response.json().catch(()=>({})) as Record<string,unknown>;
    if(!response.ok){
      const code=typeof body.code==="string"?body.code:"";
      const message=typeof body.error==="string"?body.error:"Mary Jane order preparation failed.";
      if(code==="INSUFFICIENT_BALANCE")throw new SettlementError("INSUFFICIENT_BALANCE",message,true);
      const retryable=response.status===408||response.status===429||response.status>=500;
      throw new SettlementError(retryable?"TEMPORARY_FAILURE":"PERMANENT_FAILURE",message,retryable);
    }
    if(typeof body.transactionBase64!=="string"||!body.transactionBase64){
      throw new SettlementError("PERMANENT_FAILURE","Mary Jane did not return an unsigned transaction.");
    }
    const prepared:PreparedMaryJaneTransaction={
      transactionBase64:body.transactionBase64,
      lastValidBlockHeight:typeof body.lastValidBlockHeight==="number"?body.lastValidBlockHeight:undefined,
    };
    return{adapter:this.id,commitment,instructions:prepared};
  }

  async execute(plan:ExecutionPlan):Promise<ExecutionReceipt>{
    if(plan.adapter!==this.id)throw new SettlementError("UNSUPPORTED_INTENT","Execution plan targets the wrong adapter.");
    const prepared=plan.instructions as PreparedMaryJaneTransaction;
    if(!prepared?.transactionBase64)throw new SettlementError("PERMANENT_FAILURE","Prepared Mary Jane transaction is missing.");
    let signature:string;
    try{signature=await this.options.wallet.signAndSend(prepared.transactionBase64);}
    catch(error){
      throw new SettlementError("WALLET_REJECTED",error instanceof Error?error.message:"Wallet submission failed.",false,error);
    }
    return{
      adapter:this.id,commitment:plan.commitment,status:"SUBMITTED",transactionId:signature,
      executedAt:Math.floor(Date.now()/1000),
      metadata:{lastValidBlockHeight:prepared.lastValidBlockHeight??null},
    };
  }

  async confirm(receipt:ExecutionReceipt):Promise<ExecutionReceipt>{
    if(!receipt.transactionId)throw new SettlementError("CONFIRMATION_FAILED","Missing Solana transaction signature.",true);
    const lastValidBlockHeight=typeof receipt.metadata?.lastValidBlockHeight==="number"?receipt.metadata.lastValidBlockHeight:undefined;
    const confirmed=await this.options.wallet.confirm(receipt.transactionId,{lastValidBlockHeight});
    if(!confirmed)throw new SettlementError("CONFIRMATION_FAILED","Solana transaction was not confirmed.",true);
    return{...receipt,status:"CONFIRMED",executedAt:Math.floor(Date.now()/1000)};
  }
}
