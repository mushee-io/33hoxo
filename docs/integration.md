# 33HOXO Integration

33HOXO separates Shutter confidentiality from application settlement.

## Mary Jane

Register `MaryJaneSolanaAdapter` with an application-owned wallet bridge and the existing Mary Jane `/api/order-place` endpoint. A verified intent maps:

- trader -> wallet
- market -> market
- outcome -> YES/NO side
- action -> BUY/SELL kind
- priceBps -> priceBps
- quantityBaseUnits -> sharesBaseUnits

Mary Jane returns an unsigned Solana transaction. The user wallet signs and broadcasts it; 33HOXO never receives a private key.

## SDK

`ConfidentialMarketsClient.sealIntent()` registers a timed Shutter identity, obtains encryption data, encrypts locally, builds the deterministic commitment, and submits only the ciphertext envelope.

## Execution

`SettlementExecutionEngine` reserves the trader nonce, validates, simulates, prepares, executes and confirms through the selected adapter.

## Reuse proof

`SealedAuctionAdapter` demonstrates the same protocol with `SEALED_BID` intents. Shutter encryption, commitment storage, reveal and verification remain unchanged.
