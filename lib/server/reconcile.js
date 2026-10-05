import {
  executingCandidates,
  markExecuted,
  markSettlementFailed,
} from "./intentStore.js";
import { getSignatureStatusRaw } from "./solanaRpc.js";

export async function reconcileExecutingSettlements(limit = 50) {
  const records = await executingCandidates(limit);
  const results = [];

  for (const record of records) {
    const signature = record.transactionId;
    if (!signature) continue;

    try {
      const status = await getSignatureStatusRaw(signature);

      if (status?.err) {
        await markSettlementFailed(
          record.commitment,
          signature,
          "SOLANA_TRANSACTION_FAILED",
        );
        results.push({
          commitment: record.commitment,
          signature,
          status: "FAILED",
          error: status.err,
        });
        continue;
      }

      const confirmation = status?.confirmationStatus || "unknown";
      if (confirmation === "confirmed" || confirmation === "finalized") {
        await markExecuted(record.commitment, signature);
        results.push({
          commitment: record.commitment,
          signature,
          status: "EXECUTED",
          confirmation,
        });
      } else {
        results.push({
          commitment: record.commitment,
          signature,
          status: "PENDING",
          confirmation,
        });
      }
    } catch (error) {
      results.push({
        commitment: record.commitment,
        signature,
        status: "RETRYABLE",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return results;
}
