import type { Hex } from "../protocol/hex.js";
import { SettlementError } from "../settlement/errors.js";

export interface NonceRegistry {
  reserve(trader: string, nonce: Hex, expiresAt?: number): Promise<void>;
  release(trader: string, nonce: Hex): Promise<void>;
  has(trader: string, nonce: Hex): Promise<boolean>;
}

export class InMemoryNonceRegistry implements NonceRegistry {
  private readonly values = new Map<string, number | null>();

  private key(trader: string, nonce: Hex): string {
    // Trader identifiers are intentionally case-sensitive. This matters for
    // Solana base58 public keys and other non-EVM identity schemes.
    return `${trader}:${nonce.toLowerCase()}`;
  }

  private purge(now = Math.floor(Date.now() / 1000)): void {
    for (const [key, expiry] of this.values.entries()) {
      if (expiry != null && expiry <= now) this.values.delete(key);
    }
  }

  async reserve(trader: string, nonce: Hex, expiresAt?: number): Promise<void> {
    this.purge();
    const key = this.key(trader, nonce);
    if (this.values.has(key)) {
      throw new SettlementError("REPLAY_DETECTED", "Intent nonce has already been reserved.", false);
    }
    this.values.set(key, expiresAt ?? null);
  }

  async release(trader: string, nonce: Hex): Promise<void> {
    this.values.delete(this.key(trader, nonce));
  }

  async has(trader: string, nonce: Hex): Promise<boolean> {
    this.purge();
    return this.values.has(this.key(trader, nonce));
  }
}
