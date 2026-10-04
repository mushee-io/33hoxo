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
  revealed_intent jsonb,
  transaction_id text,
  failure_code text
);

CREATE INDEX IF NOT EXISTS confidential_intents_state_reveal_idx
  ON confidential_intents (state, reveal_at);

CREATE INDEX IF NOT EXISTS confidential_intents_updated_idx
  ON confidential_intents (updated_at DESC);
