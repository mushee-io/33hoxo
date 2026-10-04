export type SettlementFailureCode =
  | "UNSUPPORTED_INTENT" | "SIMULATION_REJECTED" | "INSUFFICIENT_BALANCE"
  | "NO_LIQUIDITY" | "MARKET_CLOSED" | "MARKET_NOT_FOUND" | "WALLET_REJECTED"
  | "RPC_UNAVAILABLE" | "TRANSACTION_EXPIRED" | "CONFIRMATION_FAILED"
  | "REPLAY_DETECTED" | "TEMPORARY_FAILURE" | "PERMANENT_FAILURE";

export class SettlementError extends Error {
  constructor(
    readonly code: SettlementFailureCode,
    message: string,
    readonly retryable = false,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = "SettlementError";
  }
}

export function normalizeSettlementError(error: unknown): SettlementError {
  if (error instanceof SettlementError) return error;
  const message = error instanceof Error ? error.message : String(error);
  return new SettlementError("TEMPORARY_FAILURE", message, true, error);
}
