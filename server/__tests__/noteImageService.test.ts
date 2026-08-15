import { beforeEach, describe, expect, it, vi } from 'vitest';

const clientQuery = vi.fn();
const client = { query: clientQuery, release: vi.fn() };
const requestObjectDeletionQueueDrain = vi.fn();
vi.mock('../db', () => ({ pool: { connect: vi.fn(async () => client) } }));
vi.mock('../retention', () => ({ requestObjectDeletionQueueDrain }));

const firstImage = 'aa4d6333-ef70-48a7-810d-dfb4bde01d70';

describe('note image reconciliation', () => {
  beforeEach(() => {
    clientQuery.mockReset().mockImplementation(async (sql: string) => {
      if (sql.includes('INSERT INTO notes')) {
        return { rows: [{ id: 42, course_id: null, title: 'Diagrams', content: '', created_at: '', updated_at: '' }] };
      }
      if (sql.includes('SELECT id::text') && sql.includes('FROM note_images')) {
        return { rows: [{ id: firstImage }] };
      }
      return { rows: [] };
    });
    client.release.mockClear();
    requestObjectDeletionQueueDrain.mockClear();
  });

  it('associates ready owned images in the same transaction as note creation', async () => {
    const { runNoteAction } = await import('../notes');
    const content = `<p>See this:</p><img data-note-image-id="${firstImage}" alt="Diagram">`;
    const result = await runNoteAction('createNote', {
      title: 'Diagrams', content, imageIds: [firstImage], userId: 'user-1', courseId: null,
    });

    expect(result).toHaveLength(1);
    expect(clientQuery.mock.calls.some(([sql]) => String(sql).includes('UPDATE note_images SET note_id'))).toBe(true);
    expect(clientQuery).toHaveBeenLastCalledWith('COMMIT');
    expect(client.release).toHaveBeenCalled();
  });

  it('rolls back when an image is not ready, owned, or available to the note', async () => {
    clientQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('INSERT INTO notes')) return { rows: [{ id: 42 }] };
      if (sql.includes('SELECT id::text')) return { rows: [] };
      return { rows: [] };
    });
    const { runNoteAction } = await import('../notes');
    const content = `<img data-note-image-id="${firstImage}" alt="Diagram">`;

    await expect(runNoteAction('createNote', {
      title: 'Diagrams', content, imageIds: [firstImage], userId: 'user-1',
    })).rejects.toThrow('NOTE_IMAGE_NOT_AVAILABLE');
    expect(clientQuery).toHaveBeenCalledWith('ROLLBACK');
  });

  it('rejects request metadata that does not match the canonical image nodes', async () => {
    const { runNoteAction } = await import('../notes');
    await expect(runNoteAction('createNote', {
      title: 'Mismatch', content: `<img data-note-image-id="${firstImage}">`, imageIds: [], userId: 'user-1',
    })).rejects.toThrow('NOTE_IMAGE_REFERENCES_MISMATCH');
    expect(clientQuery).toHaveBeenCalledWith('ROLLBACK');
  });

  it('queues immediate object cleanup after an image is removed and the note is saved', async () => {
    clientQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('UPDATE notes')) return { rows: [{ id: 42 }] };
      return { rows: [] };
    });
    const { runNoteAction } = await import('../notes');

    await runNoteAction('updateNote', {
      id: 42, title: 'Without image', content: '<p>Image removed</p>', imageIds: [], userId: 'user-1',
    });

    expect(clientQuery.mock.calls.some(([sql]) => String(sql).includes('DELETE FROM note_images'))).toBe(true);
    expect(clientQuery).toHaveBeenCalledWith('COMMIT');
    expect(requestObjectDeletionQueueDrain).toHaveBeenCalledOnce();
  });

  it('queues immediate object cleanup after deleting a note', async () => {
    const { runNoteAction } = await import('../notes');

    await runNoteAction('deleteNote', { id: 42, userId: 'user-1' });

    expect(clientQuery).toHaveBeenCalledWith(
      expect.stringContaining('DELETE FROM notes'),
      [42, 'user-1']
    );
    expect(clientQuery).toHaveBeenCalledWith('COMMIT');
    expect(requestObjectDeletionQueueDrain).toHaveBeenCalledOnce();
  });
});
