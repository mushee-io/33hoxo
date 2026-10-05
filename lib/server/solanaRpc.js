import { runtimeConfig } from "./runtime.js";

export function solanaRpcUrl() {
  const config = runtimeConfig();
  return (
    process.env.SOLANA_RPC_URL ||
    (config.solanaCluster === "mainnet-beta"
      ? "https://api.mainnet-beta.solana.com"
      : "https://api.devnet.solana.com")
  );
}

export async function getSignatureStatusRaw(signature) {
  const rpc = solanaRpcUrl();
  const response = await fetch(rpc, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "getSignatureStatuses",
      params: [[signature], { searchTransactionHistory: true }],
    }),
    signal: AbortSignal.timeout(15000),
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`Solana RPC HTTP ${response.status}.`);
  }
  if (body?.error) {
    throw new Error(
      typeof body.error?.message === "string"
        ? body.error.message
        : "Solana RPC returned an error.",
    );
  }

  return body?.result?.value?.[0] ?? null;
}
