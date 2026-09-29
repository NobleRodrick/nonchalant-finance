/**
 * Idempotency for financial submissions.
 * Forms send a client-generated key; a retried or double-clicked submission with the same
 * key returns the original result instead of recording the money twice.
 */
export function normalizeIdempotencyKey(key) {
  if (!key) return null;
  const k = String(key).trim();
  if (!/^[A-Za-z0-9_-]{8,100}$/.test(k)) return null;
  return k;
}

export async function findIdempotentTransaction(client, organizationId, key) {
  if (!key) return null;
  return client.transaction.findUnique({
    where: { organizationId_idempotencyKey: { organizationId, idempotencyKey: key } },
  });
}
