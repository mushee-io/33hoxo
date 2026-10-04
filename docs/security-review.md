# Security Review

## Enforced invariants

- plaintext intent is encrypted client-side
- gateway stores ciphertext, not plaintext
- commitment is SHA-256 over canonical plaintext
- new commitments are rejected after their reveal window opens
- exact retries remain idempotent, including after reveal
- conflicting ciphertext for an existing commitment is rejected
- cancellation is rejected after reveal time, even if a worker has not updated state yet
- the public REST cancellation route is denied unless the host provides an authorization callback
- revealed public metadata must match the sealed envelope
- tampered plaintext fails commitment verification
- transient Shutter key-release failures remain retryable rather than marking the order invalid
- the decryption-key identity must match the sealed Shutter identity
- settlement rechecks reveal time, expiry and commitment before execution
- nonce registry blocks replay
- nonce reservation happens only after validate/simulate/prepare, immediately before execution
- once execution starts, the nonce remains reserved on ambiguous failure to avoid double settlement
- Mary Jane wallet signing is injected; 33HOXO never holds trader keys
- adapters translate verified intents but cannot change the original commitment

## Known V1 boundaries

- V1 uses timed Shutter reveal and does not claim post-settlement anonymity
- the in-memory gateway/nonce stores are development implementations; production deployments need durable transactional stores/unique constraints
- distributed workers require durable locking/idempotency around reveal and settlement
- Mary Jane is adapter-tested but is not yet importing 33HOXO in the live app
- Mary Jane does not currently serve the Shutter SDK browser assets `/blst.js` and `/blst.wasm`
- live Chiado round-trip testing remains required before production use
- a real Mary Jane Solana settlement proof remains required before claiming end-to-end deployment
