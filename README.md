# 33HOXO — Shutter Confidential Markets

33HOXO is reusable confidential-market infrastructure powered by Shutter threshold encryption.

It lets market applications accept encrypted trading intents, keep them sealed until an agreed reveal condition, verify the revealed intent, and route it into a settlement adapter.

Mary Jane is the first planned reference implementation, not the protocol itself.

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
Verification / replay protection
   |
Settlement adapter
   |
Solana / EVM / auction / DEX / OTC
```

## Current build scope

The first build establishes:

1. protocol types and canonical intent encoding
2. deterministic commitment hashing
3. Shutter time-trigger API adapter
4. local Shutter encryption/decryption wrapper
5. encrypted commitment lifecycle and in-memory gateway
6. verification primitives
7. settlement-adapter interface

See `MILESTONES.md` and `docs/architecture.md`.

## Development target

- Shutter Chiado for development
- time-based reveal for the first Solana/Mary Jane integration
- TypeScript SDK-first architecture
- no plaintext order persistence

## Important privacy boundary

33HOXO provides **pre-reveal confidentiality and fairness**. It does not claim to make all post-settlement blockchain activity permanently private.

## Status

Foundation build in progress.
