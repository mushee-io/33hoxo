export function publicIntent(record) {
  if (!record) return null;
  return {
    commitment: record.commitment,
    envelope: record.envelope,
    state: record.state,
    acceptedAt: record.acceptedAt,
    updatedAt: record.updatedAt,
    failureCode: record.failureCode,
    transactionId: record.transactionId,
  };
}
