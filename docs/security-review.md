# Security Review

- plaintext intent is encrypted client-side
- gateway stores ciphertext, not plaintext
- commitment is over canonical plaintext
- revealed routing must match the public envelope
- tampered plaintext fails commitment verification
- nonce registry blocks confirmed-intent replay
- retryable settlement errors release the nonce for safe retry
- Mary Jane wallet signing is injected; 33HOXO never holds trader keys
- adapters translate verified intents but cannot change the original commitment
- V1 uses timed Shutter reveal and does not claim post-settlement anonymity
- in-memory gateway/nonce stores are development implementations; production deployments need durable transactional stores
- live Chiado round-trip testing remains required before production use
