# 33HOXO Delivery Milestones

## 1 — Confidential Market Protocol Specification

- universal intent schema
- application/chain/adapter routing
- order/bid/RFQ intent kinds
- amount, price, fill, slippage and expiry constraints
- secure nonce
- reveal condition
- canonical serialization
- deterministic commitment
- envelope format
- lifecycle and failure states
- public/private data boundary
- protocol versioning
- test vectors

**Current:** foundation implemented.

## 2 — Shutter Cryptography & Identity Layer

- Chiado + Gnosis configuration
- API authentication
- identity-prefix generation
- timed identity registration
- eon/encryption data retrieval
- local SDK encryption
- decryption-key retrieval
- local decryption
- timeouts/errors/retries
- browser WASM asset integration guidance
- cryptographic integration test against Chiado

**Current:** API client and crypto wrapper implemented; live integration test pending.

## 3 — Confidential Intent Gateway & Commitment Network

- ciphertext-only API
- envelope validation
- idempotent commitment submission
- cancellation policy
- public commitment status
- persistent Postgres adapter
- event/audit log
- rate limiting
- payload-size protection
- metrics and health endpoints

**Current:** service contract and in-memory implementation completed.

## 4 — Shutter Reveal & Decryption Engine

- reveal scheduling
- threshold key retrieval
- retry/backoff
- batch reveals
- worker idempotency
- dead-letter handling
- lifecycle transitions
- no plaintext persistence
- reveal proofs

**Current:** first time-trigger reveal engine implemented.

## 5 — Verification, Fairness & Security Engine

- commitment recomputation
- routing verification
- expiry checks
- replay protection
- nonce registry
- trader signatures
- authorization policy
- malformed payload rejection
- tamper proof
- verification receipt

**Current:** commitment/routing/expiry checks implemented; signature and replay layers next.

## 6 — Universal Settlement Adapter Framework

- adapter registry
- validate
- simulate
- prepare
- execute
- confirm
- execution receipt
- temporary/permanent failure taxonomy
- batch settlement interface
- partial-fill semantics

**Current:** base interface and registry implemented.

## 7 — Mary Jane Solana Reference Adapter

- map verified intent to Mary Jane market
- YES/NO outcome mapping
- BUY/SELL mapping
- price/quantity conversion
- USDG collateral checks
- Solana account discovery
- transaction preparation
- wallet authorization model
- execution and confirmation
- confidential batch order window
- settlement receipt

## 8 — Mary Jane Confidential Trading UX

- Standard / Confidential selector
- local encryption
- sealed-order confirmation
- commitment ID
- Shutter identity proof
- reveal countdown
- lifecycle viewer
- public sealed-order count
- reveal/batch result
- settlement explorer link
- proof viewer

## 9 — SDK, API & External Developer Platform

- publishable TypeScript SDK
- browser SDK
- server SDK
- REST service
- webhooks
- React hooks
- mock settlement adapter
- sandbox
- integration docs
- prediction-market example
- sealed-auction example

## 10 — Production Hardening & Grant Demonstration

- cryptographic integration suite
- negative/tamper tests
- replay tests
- load tests
- Shutter outage simulation
- settlement outage recovery
- security review
- architecture diagram
- live proof page
- premature-reveal demonstration
- live reveal
- verification proof
- Mary Jane Solana transaction proof
- reusable second example
- grant-ready documentation and demo
