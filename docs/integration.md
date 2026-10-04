# 33HOXO Integration

33HOXO separates Shutter confidentiality from application settlement.

## Mary Jane

Register `MaryJaneSolanaAdapter` with an application-owned wallet bridge and the existing Mary Jane `/api/order-place` endpoint.

A verified intent maps:

- trader -> wallet
- market -> market
- outcome -> YES/NO side
- action -> BUY/SELL kind
- priceBps -> priceBps
- quantityBaseUnits -> sharesBaseUnits

During `prepare()`, the adapter asks Mary Jane for an unsigned Solana transaction. The settlement engine then reserves the trader nonce immediately before `execute()`. The user's wallet signs/broadcasts the prepared transaction; 33HOXO never receives a private key.

Once execution begins, 33HOXO conservatively keeps the nonce reserved even if confirmation becomes ambiguous. This avoids duplicate settlement. Production systems should reconcile the transaction signature before deciding whether a failed execution can be retried.

## SDK

`ConfidentialMarketsClient.sealIntent()`:

1. generates a random Shutter identity prefix,
2. registers a time-trigger identity,
3. validates the returned prefix,
4. uses the registration's eon key/identity directly,
5. encrypts the canonical intent locally,
6. submits only the ciphertext envelope.

## Execution

`SettlementExecutionEngine`:

1. checks reveal time and expiry,
2. recomputes the intent commitment,
3. validates the adapter,
4. simulates,
5. prepares,
6. reserves the trader nonce,
7. executes,
8. confirms.

## Reuse proof

`SealedAuctionAdapter` demonstrates the same protocol with `SEALED_BID` intents. Shutter encryption, commitment storage, reveal and verification remain unchanged.

## Browser setup

Before browser-side encryption, follow `docs/browser.md` to serve the Shutter SDK's `blst.js` and `blst.wasm` assets.
