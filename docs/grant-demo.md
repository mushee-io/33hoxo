# Grant Demo Sequence

1. Create Mary Jane order intent.
2. Encrypt locally with Shutter.
3. Submit ciphertext + commitment.
4. Show public proof metadata while side/price/size remain unreadable to the gateway.
5. Attempt reveal before trigger.
6. Obtain threshold decryption material after trigger.
7. Recompute commitment and verify exact intent.
8. Reserve trader nonce.
9. Map verified intent through `maryjane-solana-v1`.
10. User wallet signs the unsigned Mary Jane transaction.
11. Show Solana confirmation and 33HOXO execution proof.
12. Repeat with `sealed-auction-v1` to prove the workflow is reusable.
