# 33HOXO Delivery Milestones

## 1 — Confidential Market Protocol Specification
Canonical intent schema, deterministic commitment, protocol lifecycle and confidentiality boundary.
**Status:** implemented.

## 2 — Shutter Cryptography & Identity Layer
Chiado/Gnosis client, timed identity registration, encryption-data retrieval and local SDK encryption/decryption.
**Status:** implemented and live-tested on Chiado.

## 3 — Confidential Intent Gateway & Commitment Network
Ciphertext-only admission, validation, idempotent submission and cancellation.
**Status:** implemented.

## 4 — Shutter Reveal & Decryption Engine
Timed key retrieval, decryption, lifecycle transitions and no plaintext persistence before reveal.
**Status:** implemented and live-tested.

## 5 — Verification, Fairness & Security Engine
Commitment/routing/expiry verification plus replay protection.
**Status:** implemented.

## 6 — Universal Settlement Adapter Framework
Registry, validate/simulate/prepare/execute/confirm, failure taxonomy and batch coordinator.
**Status:** implemented.

## 7 — Mary Jane Solana Reference Adapter
Verified intent mapping to Mary Jane order preparation, wallet-owned signing boundary and confirmation.
**Status:** implemented.

## 8 — Mary Jane Confidential Trading UX
Confidential order lifecycle, proof UI and wallet integration.
**Status:** implemented.

## 9 — SDK, API & External Developer Platform
Client SDK, transport, portable API and webhooks.
**Status:** implemented.

## 10 — Production Hardening & Grant Demonstration
Replay, tamper, load, Shutter crypto-vector and packaging tests.
**Status:** implemented.

## 11 — Production Intent Network
Persistent Postgres/Neon intent schema, API-key protected intent routes and reveal worker endpoint.
**Status:** implemented; operator must configure DATABASE_URL, API keys and scheduler.

## 12 — Production Mary Jane Settlement
Production settlement proxy, wallet-owned transaction signing, execution registration and Solana reconciliation.
**Status:** implemented. Mainnet Mary Jane URL remains operator configuration.

## 13 — Shutter Mainnet
Environment-driven Chiado/Gnosis routing, production Shutter proxy and per-intent reveal-network preservation.
**Status:** implemented. Default remains Chiado until operator switches SHUTTER_NETWORK=gnosis.

## 14 — External SDK / API
Hosted SDK factory, HTTP gateway transport, Bearer API authentication, persistent intent API and integration runbook.
**Status:** implemented.

## 15 — Mainnet Beta
Explicit kill switch, acknowledgement flag, adapter allowlist, market allowlist, quantity cap, cluster-aware Mary Jane routing and mainnet-safe transaction reconciliation.
**Status:** implemented but disabled by default. Operator must supply production RPC/market/backend and deliberately enable the safety gate.
