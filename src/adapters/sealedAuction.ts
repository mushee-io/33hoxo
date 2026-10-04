import type { Hex } from "../protocol/hex.js";
import type { ConfidentialIntentV1 } from "../protocol/types.js";
import type { ExecutionPlan, ExecutionReceipt, SettlementAdapter, SettlementSimulation } from "../settlement/adapter.js";
import { SettlementError } from "../settlement/errors.js";

export type SealedAuctionExecutor = { submit(input: { auction: string; bidder: string; amountBaseUnits: string; commitment: Hex }): Promise<string> };

export class SealedAuctionAdapter implements SettlementAdapter {
  readonly id = "sealed-auction-v1";
  constructor(private readonly executor: SealedAuctionExecutor) {}
  async validate(intent: ConfidentialIntentV1): Promise<void> {
    if (intent.kind !== "SEALED_BID" || intent.action !== "BID") throw new SettlementError("UNSUPPORTED_INTENT", "Adapter requires SEALED_BID/BID.");
    if (BigInt(intent.quantityBaseUnits) <= 0n) throw new SettlementError("UNSUPPORTED_INTENT", "Bid amount must be positive.");
  }
  async simulate(intent: ConfidentialIntentV1): Promise<SettlementSimulation> { await this.validate(intent); return { executable: true, estimatedCostBaseUnits: intent.quantityBaseUnits }; }
  async prepare(intent: ConfidentialIntentV1, commitment: Hex): Promise<ExecutionPlan> {
    await this.validate(intent);
    return { adapter: this.id, commitment, instructions: { auction: intent.market, bidder: intent.trader, amountBaseUnits: intent.quantityBaseUnits } };
  }
  async execute(plan: ExecutionPlan): Promise<ExecutionReceipt> {
    const input = plan.instructions as { auction: string; bidder: string; amountBaseUnits: string };
    const transactionId = await this.executor.submit({ ...input, commitment: plan.commitment });
    return { adapter: this.id, commitment: plan.commitment, status: "SUBMITTED", transactionId, executedAt: Math.floor(Date.now() / 1000) };
  }
  async confirm(receipt: ExecutionReceipt): Promise<ExecutionReceipt> { return { ...receipt, status: "CONFIRMED" }; }
}
