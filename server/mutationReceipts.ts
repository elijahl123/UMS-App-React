import { pool } from './db';
import { ApiError } from './errors';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function readClientMutationId(body: unknown): string | null {
  const value = (body as { clientMutationId?: unknown } | null)?.clientMutationId;
  if (typeof value !== 'string' || !value) return null;
  if (!uuidPattern.test(value)) throw new ApiError('INVALID_CLIENT_MUTATION_ID', 400);
  return value;
}

interface ClaimedReceipt {
  /** The stored answer from the first time this mutation ran. */
  replayOf: unknown[] | null;
}

/**
 * Claims a mutation id for this request. A claim that is already held means the
 * client is retrying a write the server has seen, so the original result is
 * returned instead of running it a second time.
 */
export async function claimMutation(
  userId: string,
  clientMutationId: string,
  action: string
): Promise<ClaimedReceipt> {
  const claim = await pool.query(
    `
      INSERT INTO mutation_receipts (user_id, client_mutation_id, action)
      VALUES ($1, $2::uuid, $3)
      ON CONFLICT (user_id, client_mutation_id) DO NOTHING
      RETURNING client_mutation_id;
    `,
    [userId, clientMutationId, action]
  );
  if (claim.rowCount === 1) return { replayOf: null };

  const existing = await pool.query<{ result: unknown[] | null; completed_at: Date | null }>(
    `SELECT result, completed_at FROM mutation_receipts WHERE user_id = $1 AND client_mutation_id = $2::uuid;`,
    [userId, clientMutationId]
  );
  const receipt = existing.rows[0];

  // Claimed but unfinished: the first attempt is still running, or died partway.
  // Replaying now could double-write, so ask the client to come back.
  if (!receipt?.completed_at) throw new ApiError('MUTATION_IN_PROGRESS', 409);

  return { replayOf: receipt.result ?? [] };
}

export async function completeMutation(
  userId: string,
  clientMutationId: string,
  result: unknown[]
): Promise<void> {
  await pool.query(
    `
      UPDATE mutation_receipts
      SET result = $3::jsonb, completed_at = NOW()
      WHERE user_id = $1 AND client_mutation_id = $2::uuid;
    `,
    [userId, clientMutationId, JSON.stringify(result)]
  );
}

/** Frees a claim whose mutation failed, so the client can retry it cleanly. */
export async function releaseMutation(userId: string, clientMutationId: string): Promise<void> {
  await pool.query(
    `DELETE FROM mutation_receipts WHERE user_id = $1 AND client_mutation_id = $2::uuid AND completed_at IS NULL;`,
    [userId, clientMutationId]
  );
}
