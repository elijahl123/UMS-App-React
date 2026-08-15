import type { PoolClient } from 'pg';
import { pool } from './db';
import { ApiError, required, type Params } from './errors';
import { requestObjectDeletionQueueDrain } from './retention';

const imageIdPattern = /data-note-image-id\s*=\s*["']([0-9a-f-]{36})["']/gi;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function extractNoteImageIds(content: string): string[] {
  const ids: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = imageIdPattern.exec(content)) !== null) {
    if (!ids.includes(match[1])) ids.push(match[1]);
  }
  imageIdPattern.lastIndex = 0;
  return ids;
}

function requestedImageIds(params: Params, content: string): string[] {
  const supplied = params.imageIds ?? [];
  if (!Array.isArray(supplied) || supplied.some((id) => typeof id !== 'string')) {
    throw new ApiError('imageIds must be an array of strings', 400);
  }
  const ids = [...new Set(supplied as string[])];
  if (ids.some((id) => !uuidPattern.test(id))) throw new ApiError('INVALID_NOTE_IMAGE_ID', 400);
  const embedded = extractNoteImageIds(content);
  if (ids.length !== embedded.length || ids.some((id, index) => id !== embedded[index])) {
    throw new ApiError('NOTE_IMAGE_REFERENCES_MISMATCH', 400);
  }
  return ids;
}

async function reconcileImages(client: PoolClient, userId: string, noteId: string, imageIds: string[]) {
  if (imageIds.length > 0) {
    const available = await client.query<{ id: string }>(
      `
        SELECT id::text
        FROM note_images
        WHERE id = ANY($1::uuid[])
          AND user_id = $2
          AND status = 'ready'
          AND (note_id IS NULL OR note_id = $3::bigint);
      `,
      [imageIds, userId, noteId]
    );
    if (available.rows.length !== imageIds.length) throw new ApiError('NOTE_IMAGE_NOT_AVAILABLE', 400);
    await client.query(
      `UPDATE note_images SET note_id = $1::bigint, updated_at = NOW() WHERE id = ANY($2::uuid[]);`,
      [noteId, imageIds]
    );
    await client.query(
      `DELETE FROM note_images WHERE note_id = $1::bigint AND NOT (id = ANY($2::uuid[]));`,
      [noteId, imageIds]
    );
  } else {
    await client.query(`DELETE FROM note_images WHERE note_id = $1::bigint;`, [noteId]);
  }
}

export async function runNoteAction(name: string, params: Params): Promise<unknown[] | null> {
  if (!['createNote', 'updateNote', 'deleteNote'].includes(name)) return null;
  const userId = String(required(params, 'userId'));
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if (name === 'deleteNote') {
      await client.query(`DELETE FROM notes WHERE id = $1::bigint AND user_id = $2;`, [required(params, 'id'), userId]);
      await client.query('COMMIT');
      requestObjectDeletionQueueDrain();
      return [];
    }

    const title = String(required(params, 'title'));
    const content = typeof params.content === 'string' ? params.content : '';
    const imageIds = requestedImageIds(params, content);
    const courseId = params.courseId ?? null;
    const result = name === 'createNote'
      ? await client.query(
          `
            INSERT INTO notes (course_id, title, content, user_id)
            SELECT $1::bigint, $2, $3, $4
            WHERE $1::bigint IS NULL OR EXISTS (
              SELECT 1 FROM courses WHERE id = $1::bigint AND user_id = $4
            )
            RETURNING id, course_id, title, content, created_at, updated_at;
          `,
          [courseId, title, content, userId]
        )
      : await client.query(
          `
            UPDATE notes
            SET course_id = $1::bigint, title = $2, content = $3, updated_at = NOW()
            WHERE id = $4::bigint AND user_id = $5
              AND ($1::bigint IS NULL OR EXISTS (
                SELECT 1 FROM courses WHERE id = $1::bigint AND user_id = $5
              ))
            RETURNING id, course_id, title, content, created_at, updated_at;
          `,
          [courseId, title, content, required(params, 'id'), userId]
        );
    const note = result.rows[0];
    if (!note) throw new ApiError('NOTE_NOT_FOUND_OR_COURSE_NOT_AVAILABLE', 404);
    await reconcileImages(client, userId, String(note.id), imageIds);
    await client.query('COMMIT');
    if (name === 'updateNote') requestObjectDeletionQueueDrain();
    return result.rows;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}
