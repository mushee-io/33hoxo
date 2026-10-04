import type { ConfidentialIntentV1 } from "../protocol/types.js";
import type { HoxoRuntimeConfig } from "../production/config.js";
import { SettlementError } from "./errors.js";

export function enforceSettlementPolicy(
  intent: ConfidentialIntentV1,
  config: HoxoRuntimeConfig,
): void {
  const mainnetIntent =
    intent.sourceChain === "solana:mainnet-beta" ||
    config.solanaCluster === "mainnet-beta";

  if (!mainnetIntent) return;

  if (!config.mainnetEnabled) {
    throw new SettlementError(
      "PERMANENT_FAILURE",
      "Mainnet settlement is disabled by 33HOXO runtime policy.",
      false,
    );
  }

  if (!config.allowedMainnetAdapters.includes(intent.settlementAdapter)) {
    throw new SettlementError(
      "UNSUPPORTED_INTENT",
      `Adapter is not allowlisted for mainnet beta: ${intent.settlementAdapter}`,
      false,
    );
  }

  if (
    config.allowedMainnetMarkets.length > 0 &&
    !config.allowedMainnetMarkets.includes(intent.market)
  ) {
    throw new SettlementError(
      "UNSUPPORTED_INTENT",
      "Market is not allowlisted for 33HOXO mainnet beta.",
      false,
    );
  }

  const quantity = BigInt(intent.quantityBaseUnits);
  const max = BigInt(config.maxMainnetQuantityBaseUnits);
  if (quantity > max) {
    throw new SettlementError(
      "UNSUPPORTED_INTENT",
      `Mainnet beta quantity exceeds safety cap of ${max.toString()} base units.`,
      false,
    );
  }
}
