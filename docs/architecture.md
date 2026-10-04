# 33HOXO Architecture

## Mission

33HOXO is a reusable confidential-execution layer for markets.

It is not a private prediction market. Prediction markets are one integration class.

The protocol accepts a canonical intent, encrypts it locally with Shutter, stores only an encrypted commitment, waits for the reveal condition, verifies the plaintext against the original commitment, and passes the verified intent to an application-specific settlement adapter.

## Trust boundary

### Before reveal

The commitment service may know:

- application ID
- market routing ID
- source chain
- settlement adapter
- Shutter identity/eon metadata
- reveal timestamp
- ciphertext
- commitment hash
- submission timing

It must not learn from 33HOXO storage:

- action
- outcome/side
- limit price
- quantity
- max spend
- minimum fill
- slippage
- private application metadata encoded inside the intent

### After reveal

The reveal worker receives plaintext only when Shutter releases the applicable decryption material.

The worker verifies it and forwards it to execution. The ciphertext store deliberately does not persist the revealed plaintext.

Post-settlement information may be public on the destination chain. 33HOXO therefore claims pre-reveal confidentiality/fairness, not permanent transaction anonymity.

## Components

### Protocol

`src/protocol/`

Defines:

- canonical intent
- stable serialization
- cryptographic commitment
- protocol versions
- lifecycle states
- envelope schema

### Shutter adapter

`src/shutter/`

Responsibilities:

- time-trigger identity registration
- encryption-data retrieval
- decryption-key retrieval
- local client-side encryption
- local decryption

V1 uses time triggers because the first reference settlement path is Solana while Shutter event triggers are EVM-event oriented.

### Gateway

`src/gateway/`

Receives ciphertext envelopes.

Critical invariant:

> The gateway never requires or stores plaintext intents.

V1 includes an in-memory store to make the protocol testable. Persistent Postgres/Redis adapters are a later milestone.

### Reveal engine

`src/reveal/`

Lifecycle:

```
WAITING
  |
  | revealAt reached
  v
DECRYPTING
  |
  v
REVEALED
  |
  | commitment + routing verification
  v
VERIFIED
```

The engine returns the verified plaintext to the execution caller without writing it back to the ciphertext store.

### Verification engine

Checks:

- reveal time
- expiry
- application
- source chain
- market
- settlement adapter
- canonical commitment

Later hardening adds trader signatures, nonce registry, replay protection and authorization policies.

### Settlement adapters

`src/settlement/`

Adapters isolate application/chain execution from confidentiality.

Target adapters:

1. `maryjane-solana-v1`
2. generic sealed auction
3. EVM intent adapter
4. RFQ/OTC adapter

An adapter implements validation, simulation, preparation, execution and confirmation.

## Reference flow

```
Trader / dApp
     |
     | create canonical intent
     v
33HOXO Protocol SDK
     |
     | local Shutter encryption
     v
Ciphertext Envelope
     |
     v
Commitment Gateway
     |
     | waits
     v
Shutter Keyper Network
     |
     | decryption key after trigger
     v
Reveal Engine
     |
     | verify exact commitment
     v
Verified Intent
     |
     v
Settlement Adapter Registry
     |
     +---- Mary Jane / Solana
     +---- Auction
     +---- DEX
     +---- RFQ / OTC
```

## Security invariants

1. Plaintext is encrypted before gateway submission.
2. Commitment is computed over canonical plaintext.
3. Routing metadata in the revealed intent must equal the public envelope.
4. A changed plaintext must fail commitment verification.
5. An intent must not be treated as executable before its reveal condition.
6. Expired intents must never execute.
7. Commitment submission is idempotent.
8. Plaintext must not be written into the ciphertext store.
9. Settlement adapters cannot alter the committed intent; they only translate a verified intent into execution.
10. Protocol versioning must make incompatible upgrades explicit.
