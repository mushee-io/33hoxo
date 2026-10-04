import type { Hex } from "../protocol/hex.js";
import type { IntentLifecycleState, PublicIntentRecord } from "../protocol/types.js";

export interface CommitmentStore {
  get(commitment: Hex): Promise<PublicIntentRecord | null>;
  put(record: PublicIntentRecord): Promise<void>;
  updateState(
    commitment: Hex,
    state: IntentLifecycleState,
    options?: { failureCode?: string; now?: number },
  ): Promise<PublicIntentRecord>;
}

export class InMemoryCommitmentStore implements CommitmentStore {
  private readonly records = new Map<Hex, PublicIntentRecord>();

  async get(commitment: Hex): Promise<PublicIntentRecord | null> {
    return this.records.get(commitment) ?? null;
  }

  async put(record: PublicIntentRecord): Promise<void> {
    this.records.set(record.commitment, structuredClone(record));
  }

  async updateState(
    commitment: Hex,
    state: IntentLifecycleState,
    options: { failureCode?: string; now?: number } = {},
  ): Promise<PublicIntentRecord> {
    const current = this.records.get(commitment);
    if (!current) throw new Error("Unknown commitment.");

    const next: PublicIntentRecord = {
      ...current,
      state,
      updatedAt: options.now ?? Math.floor(Date.now() / 1000),
      ...(options.failureCode ? { failureCode: options.failureCode } : {}),
    };
    this.records.set(commitment, next);
    return structuredClone(next);
  }
}
