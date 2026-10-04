import { Connection } from "@solana/web3.js";
import { requireApiKey } from "../../lib/server/auth.js";
import { runtimeConfig } from "../../lib/server/runtime.js";
import { markExecuted } from "../../lib/server/intentStore.js";

export default async function handler(req, res) {
  res.setHeader("cache-control", "no-store");
  try {
    requireApiKey(req);
    if (req.method !== "POST") {
      res.setHeader("allow", "POST");
      return res.status(405).json({ error: "Method not allowed." });
    }

    const signature = String(req.body?.signature || "");
    const commitment = String(req.body?.commitment || "");
    if (!signature || !commitment) {
      return res.status(400).json({ error: "signature and commitment are required." });
    }

    const config = runtimeConfig();
    const rpc = process.env.SOLANA_RPC_URL ||
      (config.solanaCluster === "mainnet-beta"
        ? "https://api.mainnet-beta.solana.com"
        : "https://api.devnet.solana.com");

    const connection = new Connection(rpc, "confirmed");
    const result = await connection.getSignatureStatus(signature, { searchTransactionHistory: true });

    if (result.value?.err) {
      return res.status(409).json({ status: "FAILED", error: result.value.err });
    }

    const status = result.value?.confirmationStatus || "unknown";
    if (status === "confirmed" || status === "finalized") {
      await markExecuted(commitment, signature);
      return res.status(200).json({ status: "CONFIRMED", signature, cluster: config.solanaCluster });
    }

    return res.status(202).json({ status: "PENDING", signature, cluster: config.solanaCluster });
  } catch (error) {
    return res.status(error.status || 500).json({
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
