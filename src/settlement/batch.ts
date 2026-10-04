import type { Hex } from "../protocol/hex.js";
import type { ConfidentialIntentV1 } from "../protocol/types.js";
import type { ExecutionReceipt } from "./adapter.js";
import { SettlementExecutionEngine } from "./engine.js";

export type BatchItem = { commitment: Hex; intent: ConfidentialIntentV1 };
export type BatchSettlementResult = { commitment: Hex; status: "CONFIRMED" | "FAILED"; receipt?: ExecutionReceipt; error?: string };

export class BatchSettlementCoordinator {
  constructor(private readonly engine: SettlementExecutionEngine) {}
  async settle(items: BatchItem[]): Promise<BatchSettlementResult[]> {
    const results: BatchSettlementResult[] = [];
    for (const item of items) {
      try {
        const { receipt } = await this.engine.executeVerified(item.intent, item.commitment);
        results.push({ commitment: item.commitment, status: "CONFIRMED", receipt });
      } catch (error) {
        results.push({ commitment: item.commitment, status: "FAILED", error: error instanceof Error ? error.message : String(error) });
      }
    }
    return results;
  }
}
