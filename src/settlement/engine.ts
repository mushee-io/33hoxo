import type { Hex } from "../protocol/hex.js";
import { createIntentCommitment } from "../protocol/commitment.js";
import type { ConfidentialIntentV1 } from "../protocol/types.js";
import type { NonceRegistry } from "../security/replay.js";
import type { ExecutionReceipt, SettlementAdapterRegistry, SettlementSimulation } from "./adapter.js";
import { SettlementError, normalizeSettlementError } from "./errors.js";

export type SettlementExecutionResult = { simulation:SettlementSimulation; receipt:ExecutionReceipt };

export class SettlementExecutionEngine {
  constructor(private readonly registry:SettlementAdapterRegistry,private readonly nonces?:NonceRegistry) {}

  async executeVerified(
    intent:ConfidentialIntentV1,
    commitment:Hex,
    now=Math.floor(Date.now()/1000),
  ):Promise<SettlementExecutionResult> {
    if (now < intent.revealAt) throw new SettlementError("INTENT_NOT_REVEALED","Intent reveal time has not been reached.");
    if (intent.expiresAt != null && now >= intent.expiresAt) throw new SettlementError("INTENT_EXPIRED","Intent has expired.");

    const computed = await createIntentCommitment(intent);
    if (computed.toLowerCase() !== commitment.toLowerCase()) {
      throw new SettlementError("COMMITMENT_MISMATCH","Intent does not match the verified commitment.");
    }

    const adapter=this.registry.get(intent.settlementAdapter);
    let nonceReserved=false;
    try {
      if (this.nonces) { await this.nonces.reserve(intent.trader,intent.nonce,intent.expiresAt); nonceReserved=true; }
      await adapter.validate(intent);
      const simulation=await adapter.simulate(intent);
      if (!simulation.executable) throw new SettlementError("SIMULATION_REJECTED",simulation.reason||"Settlement simulation rejected the intent.");
      const plan=await adapter.prepare(intent,commitment);
      const submitted=await adapter.execute(plan);
      const receipt=submitted.status==="SUBMITTED"?await adapter.confirm(submitted):submitted;
      if (receipt.status!=="CONFIRMED") throw new SettlementError("CONFIRMATION_FAILED","Settlement did not reach confirmed state.",true);
      return {simulation,receipt};
    } catch(error) {
      const normalized=normalizeSettlementError(error);
      if (nonceReserved&&this.nonces&&normalized.retryable) await this.nonces.release(intent.trader,intent.nonce);
      throw normalized;
    }
  }
}
