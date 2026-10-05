import { Connection } from "@solana/web3.js";
import { runtimeConfig } from "./runtime.js";
import {
  executingCandidates,
  markExecuted,
  markSettlementFailed,
} from "./intentStore.js";

export async function reconcileExecutingSettlements(limit = 50) {
  const config = runtimeConfig();
  const rpc =
    process.env.SOLANA_RPC_URL ||
    (config.solanaCluster === "mainnet-beta"
      ? "https://api.mainnet-beta.solana.com"
      : "https://api.devnet.solana.com");

  const connection = new Connection(rpc, "confirmed");
  const records = await executingCandidates(limit);
  const results = [];

  for (const record of records) {
    const signature = record.transactionId;
    if (!signature) continue;

    try {
      const status = await connection.getSignatureStatus(signature, {
        searchTransactionHistory: true,
      });

      if (status.value?.err) {
        await markSettlementFailed(
          record.commitment,
          signature,
          "SOLANA_TRANSACTION_FAILED",
        );
        results.push({
          commitment: record.commitment,
          signature,
          status: "FAILED",
        });
        continue;
      }

      const confirmation = status.value?.confirmationStatus || "unknown";
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
