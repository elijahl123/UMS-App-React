import { beforeEach, describe, expect, it, vi } from 'vitest';

const query = vi.fn();
const deleteNoteImageObject = vi.fn();
vi.mock('../db', () => ({ pool: { query } }));
vi.mock('../noteImageStorage', () => ({
  noteImageStorageConfigured: () => true,
  deleteNoteImageObject,
}));

describe('note image object retention', () => {
  beforeEach(() => {
    query.mockReset();
    deleteNoteImageObject.mockReset();
  });

  it('deletes queued objects idempotently and removes successful queue entries', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ object_key: 'notes/hash/one.png', attempts: 0 }] })
      .mockResolvedValue({ rows: [] });
    deleteNoteImageObject.mockResolvedValue(undefined);
    const { drainObjectDeletionQueue } = await import('../retention');

    await expect(drainObjectDeletionQueue()).resolves.toEqual({ deleted: 1, failed: 0 });
    expect(deleteNoteImageObject).toHaveBeenCalledWith('notes/hash/one.png');
    expect(query).toHaveBeenLastCalledWith(expect.stringContaining('DELETE FROM object_storage_deletion_queue'), ['notes/hash/one.png']);
  });

  it('retains failed queue entries with a later retry time', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ object_key: 'notes/hash/retry.png', attempts: 0 }] })
      .mockResolvedValue({ rows: [] });
    deleteNoteImageObject.mockRejectedValue(new Error('temporary outage'));
    const { drainObjectDeletionQueue } = await import('../retention');

    await expect(drainObjectDeletionQueue()).resolves.toEqual({ deleted: 0, failed: 1 });
    expect(query).toHaveBeenLastCalledWith(
      expect.stringContaining('next_attempt_at'),
      ['notes/hash/retry.png', 1, 120, 'Error: temporary outage']
    );
  });
});
