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

function validateEnvelope(envelope) {
  if (!envelope || typeof envelope !== "object") throw Object.assign(new Error("Envelope is required."), { status: 400 });
  if (envelope.version !== 1) throw Object.assign(new Error("Unsupported envelope version."), { status: 400 });
  if (envelope.scheme !== "shutter-threshold-encryption") throw Object.assign(new Error("Unsupported encryption scheme."), { status: 400 });
  if (!/^0x[0-9a-f]{64}$/i.test(String(envelope.commitment || ""))) throw Object.assign(new Error("Invalid commitment hash."), { status: 400 });
  if (!/^0x[0-9a-f]+$/i.test(String(envelope.ciphertext || ""))) throw Object.assign(new Error("Invalid ciphertext."), { status: 400 });
  if (!["chiado","gnosis"].includes(envelope.shutter?.network)) throw Object.assign(new Error("Invalid Shutter network."), { status: 400 });
  if (!Number.isInteger(Number(envelope.revealAt)) || Number(envelope.revealAt) <= 0) throw Object.assign(new Error("Invalid revealAt."), { status: 400 });
  if (!String(envelope.application || "").trim()) throw Object.assign(new Error("application is required."), { status: 400 });
  if (!String(envelope.market || "").trim()) throw Object.assign(new Error("market is required."), { status: 400 });
  if (!String(envelope.settlementAdapter || "").trim()) throw Object.assign(new Error("settlementAdapter is required."), { status: 400 });
}

export async function insertIntent(envelope) {
  validateEnvelope(envelope);
  const db = sql();
  const existing = await db`
    SELECT * FROM confidential_intents
    WHERE commitment = ${envelope.commitment}
    LIMIT 1
  `;
  if (existing.length) {
    const current = rowToRecord(existing[0]);
    const same =
      current.envelope.ciphertext === envelope.ciphertext &&
      current.envelope.shutter?.identity === envelope.shutter?.identity &&
      current.envelope.revealAt === envelope.revealAt &&
      current.envelope.market === envelope.market &&
      current.envelope.settlementAdapter === envelope.settlementAdapter;
    if (!same) {
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

export async function markExecuting(commitment, transactionId) {
  const db = sql();
  const now = Math.floor(Date.now() / 1000);
  const rows = await db`
    UPDATE confidential_intents
    SET state = 'EXECUTING',
        transaction_id = ${transactionId},
        failure_code = NULL,
        updated_at = ${now}
    WHERE commitment = ${commitment}
      AND state = 'VERIFIED'
      AND transaction_id IS NULL
    RETURNING *
  `;
  if (!rows.length) {
    const error = new Error("Intent is not in a state that can accept a settlement signature.");
    error.status = 409;
    throw error;
  }
  return rowToRecord(rows[0]);
}

export async function markExecuted(commitment, transactionId) {
  const db = sql();
  const now = Math.floor(Date.now() / 1000);
  const rows = await db`
    UPDATE confidential_intents
    SET state = 'EXECUTED',
        failure_code = NULL,
        updated_at = ${now}
    WHERE commitment = ${commitment}
      AND state = 'EXECUTING'
      AND transaction_id = ${transactionId}
    RETURNING *
  `;
  if (!rows.length) {
    const error = new Error("Settlement signature does not match the recorded execution.");
    error.status = 409;
    throw error;
  }
  return rowToRecord(rows[0]);
}
