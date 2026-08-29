import { beforeEach, describe, expect, it, vi } from 'vitest';

process.env.DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://user:pass@localhost:5432/test';

const query = vi.hoisted(() => vi.fn());
vi.mock('../db', () => ({ pool: { query } }));

const userId = 'user-1';
const mutationId = '3f1a2b7c-9d4e-4a6b-8c2d-5e7f10a3b4c9';

beforeEach(() => {
  query.mockReset();
});

describe('mutation receipts', () => {
  it('rejects a malformed client mutation id', async () => {
    const { readClientMutationId } = await import('../mutationReceipts');

    expect(readClientMutationId({ clientMutationId: mutationId })).toBe(mutationId);
    expect(readClientMutationId({})).toBeNull();
    expect(readClientMutationId({ clientMutationId: 42 })).toBeNull();
    expect(() => readClientMutationId({ clientMutationId: 'not-a-uuid' })).toThrow('INVALID_CLIENT_MUTATION_ID');
  });

  it('lets a first attempt through', async () => {
    const { claimMutation } = await import('../mutationReceipts');
    query.mockResolvedValueOnce({ rowCount: 1, rows: [{ client_mutation_id: mutationId }] });

    await expect(claimMutation(userId, mutationId, 'createCourse')).resolves.toEqual({ replayOf: null });
  });

  it('replays the original result instead of writing again', async () => {
    const { claimMutation } = await import('../mutationReceipts');
    const original = [{ id: 7, code: 'CS101' }];
    query
      .mockResolvedValueOnce({ rowCount: 0, rows: [] })
      .mockResolvedValueOnce({ rows: [{ result: original, completed_at: new Date() }] });

    await expect(claimMutation(userId, mutationId, 'createCourse')).resolves.toEqual({ replayOf: original });
  });

  it('refuses to run alongside an attempt that has not finished', async () => {
    const { claimMutation } = await import('../mutationReceipts');
    query
      .mockResolvedValueOnce({ rowCount: 0, rows: [] })
      .mockResolvedValueOnce({ rows: [{ result: null, completed_at: null }] });

    await expect(claimMutation(userId, mutationId, 'createCourse')).rejects.toMatchObject({
      message: 'MUTATION_IN_PROGRESS',
      status: 409,
    });
  });

  it('only frees a claim that never completed', async () => {
    const { releaseMutation } = await import('../mutationReceipts');
    query.mockResolvedValueOnce({ rowCount: 1, rows: [] });

    await releaseMutation(userId, mutationId);

    expect(query.mock.calls[0][0]).toContain('completed_at IS NULL');
  });
});
