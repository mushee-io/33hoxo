CREATE TABLE IF NOT EXISTS confidential_intents (
  commitment text PRIMARY KEY,
  envelope jsonb NOT NULL,
  state text NOT NULL CHECK (
    state IN (
      'WAITING','REVEALABLE','VERIFIED','EXECUTING','EXECUTED',
      'CANCELLED','EXPIRED','INVALID','TAMPERED','SETTLEMENT_FAILED'
    )
  ),
  accepted_at bigint NOT NULL,
  updated_at bigint NOT NULL,
  reveal_at bigint NOT NULL,
  expires_at bigint,
  owner_wallet text,
  revealed_intent jsonb,
  transaction_id text,
  failure_code text
);

ALTER TABLE confidential_intents
  ADD COLUMN IF NOT EXISTS owner_wallet text;

CREATE INDEX IF NOT EXISTS confidential_intents_state_reveal_idx
  ON confidential_intents (state, reveal_at);

CREATE INDEX IF NOT EXISTS confidential_intents_updated_idx
  ON confidential_intents (updated_at DESC);

CREATE INDEX IF NOT EXISTS confidential_intents_owner_idx
  ON confidential_intents (owner_wallet, accepted_at DESC);
