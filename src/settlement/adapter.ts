import type { Hex } from "../protocol/hex.js";
import type { ConfidentialIntentV1 } from "../protocol/types.js";

export type SettlementSimulation = {
  executable: boolean;
  reason?: string;
  estimatedFillBaseUnits?: string;
  estimatedCostBaseUnits?: string;
  estimatedFeeBaseUnits?: string;
  metadata?: Record<string, string | number | boolean | null>;
};

export type ExecutionPlan = {
  adapter: string;
  commitment: Hex;
  instructions: unknown;
};

export type ExecutionReceipt = {
  adapter: string;
  commitment: Hex;
  status: "SUBMITTED" | "CONFIRMED" | "FAILED";
  transactionId?: string;
  executedAt: number;
  metadata?: Record<string, string | number | boolean | null>;
};

export interface SettlementAdapter {
  readonly id: string;
  validate(intent: ConfidentialIntentV1): Promise<void>;
  simulate(intent: ConfidentialIntentV1): Promise<SettlementSimulation>;
  prepare(intent: ConfidentialIntentV1, commitment: Hex): Promise<ExecutionPlan>;
  execute(plan: ExecutionPlan): Promise<ExecutionReceipt>;
  confirm(receipt: ExecutionReceipt): Promise<ExecutionReceipt>;
}

export class SettlementAdapterRegistry {
  private readonly adapters = new Map<string, SettlementAdapter>();

  register(adapter: SettlementAdapter): void {
    if (this.adapters.has(adapter.id)) throw new Error(`Settlement adapter already registered: ${adapter.id}`);
    this.adapters.set(adapter.id, adapter);
  }
  has(id: string): boolean { return this.adapters.has(id); }
  list(): string[] { return [...this.adapters.keys()].sort(); }
  get(id: string): SettlementAdapter {
    const adapter = this.adapters.get(id);
    if (!adapter) throw new Error(`Unknown settlement adapter: ${id}`);
    return adapter;
  }
}
