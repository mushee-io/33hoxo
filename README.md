# 33HOXO - Shutter Confidential Markets

33HOXO is reusable confidential-market infrastructure powered by Shutter threshold encryption.

It lets market applications accept encrypted trading intents, keep them sealed until an agreed reveal condition, verify the revealed intent, and route it into an application-specific settlement adapter.

Mary Jane is the first reference adapter target, not the protocol itself.

## Core flow

```
Application
   |
Canonical confidential intent
   |
Client-side Shutter encryption
   |
Encrypted commitment gateway
   |
Threshold reveal
   |
Integrity / replay verification
   |
Settlement adapter
   |
Solana / auction / DEX / RFQ / OTC
```

## Implemented foundation

1. canonical intent protocol and deterministic commitments
2. Shutter Chiado/Gnosis time-trigger client
3. local Shutter SDK encryption/decryption wrapper
4. ciphertext-only commitment gateway
5. timed reveal and verification engine
6. settlement registry, execution engine and batch coordinator
7. Mary Jane Solana reference adapter
8. confidential-order view model and proof demo
9. publishable TypeScript package surface, portable API and signed webhooks
10. regression, load-smoke, security and grant-demo documentation

See `MILESTONES.md`, `docs/architecture.md`, `docs/security-review.md` and `docs/browser.md`.

## Browser requirement

The official Shutter SDK requires `/blst.js` and `/blst.wasm` to be served by browser applications. Follow `docs/browser.md` before enabling browser-side encryption.

## Development target

- Shutter Chiado for development
- time-based reveal for the first Solana/Mary Jane integration
- TypeScript SDK-first architecture
- no plaintext order persistence in the commitment store
- application-owned wallet signing; 33HOXO never handles trader private keys

## Important privacy boundary

33HOXO provides **pre-reveal confidentiality and fairness**. It does not claim to make all post-settlement blockchain activity permanently private.

## Current integration status

The 33HOXO core and Mary Jane adapter are implemented and tested in this repository.

The live Mary Jane application does **not yet import 33HOXO**, and its current `public/` directory does not yet serve the Shutter browser WASM assets. A live Chiado timed-reveal transaction plus a real Mary Jane Solana settlement proof are still required before calling the end-to-end deployment complete.
