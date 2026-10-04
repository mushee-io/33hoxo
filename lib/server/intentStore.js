import { sql } from "./db.js";

function rowToRecord(row) {
  return {
    commitment: row.commitment,
    envelope: row.envelope,
    state: row.state,
    acceptedAt: Number(row.accepted_at),
    updatedAt: Number(row.updated_at),
    failureCode: row.failure_code || undefined,
    revealedIntent: row.revealed_intent || undefined,
    transactionId: row.transaction_id || undefined,
  };
}

export async function insertIntent(envelope) {
  const db = sql();
  const existing = await db`
    SELECT * FROM confidential_intents
    WHERE commitment = ${envelope.commitment}
    LIMIT 1
  `;
  if (existing.length) {
    const current = rowToRecord(existing[0]);
    if (JSON.stringify(current.envelope) !== JSON.stringify(envelope)) {
      const error = new Error("Conflicting envelope already exists for this commitment.");
      error.status = 409;
      throw error;
    }
    return current;
  }

  const now = Math.floor(Date.now() / 1000);
  if (now >= Number(envelope.revealAt)) {
    const error = new Error("Reveal window has already opened; late commitments are not accepted.");
    error.status = 400;
    throw error;
  }

  const rows = await db`
    INSERT INTO confidential_intents
      (commitment, envelope, state, accepted_at, updated_at, reveal_at, expires_at)
    VALUES
      (
        ${envelope.commitment},
        ${JSON.stringify(envelope)}::jsonb,
        'WAITING',
        ${now},
        ${now},
        ${Number(envelope.revealAt)},
        ${envelope.expiresAt == null ? null : Number(envelope.expiresAt)}
      )
    RETURNING *
  `;
  return rowToRecord(rows[0]);
}

export async function getIntent(commitment) {
  const db = sql();
  const rows = await db`
    SELECT * FROM confidential_intents
    WHERE commitment = ${commitment}
    LIMIT 1
  `;
  return rows.length ? rowToRecord(rows[0]) : null;
}

export async function cancelIntent(commitment) {
  const db = sql();
  const now = Math.floor(Date.now() / 1000);
  const rows = await db`
    UPDATE confidential_intents
    SET state = 'CANCELLED', updated_at = ${now}, failure_code = NULL
    WHERE commitment = ${commitment}
      AND state = 'WAITING'
      AND reveal_at > ${now}
    RETURNING *
  `;
  if (!rows.length) {
    const error = new Error("Intent cannot be cancelled in its current state or after reveal.");
    error.status = 409;
    throw error;
  }
  return rowToRecord(rows[0]);
}

export async function revealCandidates(limit = 50) {
  const db = sql();
  const now = Math.floor(Date.now() / 1000);
  return db`
    SELECT *
    FROM confidential_intents
    WHERE state IN ('WAITING','REVEALABLE')
      AND reveal_at <= ${now}
      AND (expires_at IS NULL OR expires_at > ${now})
    ORDER BY reveal_at ASC
    LIMIT ${limit}
  `;
}

export async function markRevealable(commitment, failureCode = null) {
  const db = sql();
  const now = Math.floor(Date.now() / 1000);
  await db`
    UPDATE confidential_intents
    SET state = 'REVEALABLE', failure_code = ${failureCode}, updated_at = ${now}
    WHERE commitment = ${commitment}
  `;
}

export async function markVerified(commitment, revealedIntent) {
  const db = sql();
  const now = Math.floor(Date.now() / 1000);
  await db`
    UPDATE confidential_intents
    SET state = 'VERIFIED',
        revealed_intent = ${JSON.stringify(revealedIntent)}::jsonb,
        failure_code = NULL,
        updated_at = ${now}
    WHERE commitment = ${commitment}
  `;
}

export async function markInvalid(commitment, failureCode) {
  const db = sql();
  const now = Math.floor(Date.now() / 1000);
  await db`
    UPDATE confidential_intents
    SET state = 'INVALID', failure_code = ${failureCode}, updated_at = ${now}
    WHERE commitment = ${commitment}
  `;
}

export async function markExecuted(commitment, transactionId) {
  const db = sql();
  const now = Math.floor(Date.now() / 1000);
  await db`
    UPDATE confidential_intents
    SET state = 'EXECUTED',
        transaction_id = ${transactionId},
        failure_code = NULL,
        updated_at = ${now}
    WHERE commitment = ${commitment}
  `;
}
