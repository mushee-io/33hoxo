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

    const computed=await createIntentCommitment(intent);
    if (computed.toLowerCase()!==commitment.toLowerCase()) {
      throw new SettlementError("COMMITMENT_MISMATCH","Intent does not match the verified commitment.");
    }

    const adapter=this.registry.get(intent.settlementAdapter);

    // Validation/simulation/preparation are allowed to fail without consuming the nonce.
    await adapter.validate(intent);
    const simulation=await adapter.simulate(intent);
    if (!simulation.executable) {
      throw new SettlementError("SIMULATION_REJECTED",simulation.reason||"Settlement simulation rejected the intent.");
    }
    const plan=await adapter.prepare(intent,commitment);

    // Reserve immediately before the first operation that can produce a settlement.
    if (this.nonces) await this.nonces.reserve(intent.trader,intent.nonce,intent.expiresAt);

    try {
      const submitted=await adapter.execute(plan);
      const receipt=submitted.status==="SUBMITTED"?await adapter.confirm(submitted):submitted;
      if (receipt.status!=="CONFIRMED") {
        throw new SettlementError("CONFIRMATION_FAILED","Settlement did not reach confirmed state.",true);
      }
      return {simulation,receipt};
    } catch(error) {
      // Once execution begins, keep the nonce reserved. A failed confirmation can be
      // ambiguous: releasing here could allow a duplicate settlement if the first tx lands.
      throw normalizeSettlementError(error);
    }
  }
}
