import crypto from 'node:crypto';
import path from 'node:path';
import { Router, type NextFunction, type Request, type Response } from 'express';
import multer from 'multer';
import { fileTypeFromBuffer } from 'file-type';
import { requireContentReadAccess, requireFullWriteAccess } from '../access';
import { pool } from '../db';
import { ApiError } from '../errors';
import { createNoteImageViewUrl, putNoteImage } from '../noteImageStorage';
import { requestObjectDeletionQueueDrain } from '../retention';

export const NOTE_IMAGE_MAX_BYTES = 10 * 1024 * 1024;
const allowedTypes = new Map([
  ['image/jpeg', 'jpg'],
  ['image/png', 'png'],
  ['image/webp', 'webp'],
  ['image/gif', 'gif'],
]);
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: NOTE_IMAGE_MAX_BYTES, files: 1 },
});

export const noteImagesRouter = Router();

function routeError(res: Response, err: unknown) {
  if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: { message: 'IMAGE_TOO_LARGE' } });
  }
  const status = err instanceof ApiError ? err.status : 500;
  const message = err instanceof Error ? err.message : 'NOTE_IMAGE_REQUEST_FAILED';
  if (status >= 500) console.error('[note-images] request failed', err);
  return res.status(status).json({ error: { message } });
}

function runUpload(req: Request, res: Response, next: (err?: unknown) => void) {
  upload.single('image')(req, res, next);
}

function safeFilename(value: string, extension: string): string {
  const basename = path.basename(value || `note-image.${extension}`)
    .split('')
    .filter((character) => {
      const code = character.charCodeAt(0);
      return code > 31 && code !== 127;
    })
    .join('')
    .trim()
    .slice(0, 180);
  return basename || `note-image.${extension}`;
}

noteImagesRouter.post('/', requireFullWriteAccess, runUpload, async (req, res) => {
  const imageId = crypto.randomUUID();
  let rowCreated = false;
  try {
    const file = req.file;
    if (!file) throw new ApiError('IMAGE_FILE_REQUIRED', 400);
    const bytes = new Uint8Array(file.buffer.buffer, file.buffer.byteOffset, file.buffer.byteLength);
    const detected = await fileTypeFromBuffer(bytes);
    const extension = detected ? allowedTypes.get(detected.mime) : undefined;
    if (!detected || !extension) throw new ApiError('UNSUPPORTED_IMAGE_TYPE', 415);
    const declaredType = file.mimetype === 'image/jpg' ? 'image/jpeg' : file.mimetype;
    if (declaredType !== detected.mime) throw new ApiError('IMAGE_TYPE_MISMATCH', 415);

    const userId = req.auth!.uid;
    const userHash = crypto.createHash('sha256').update(userId).digest('hex').slice(0, 24);
    const objectKey = `notes/${userHash}/${imageId}.${extension}`;
    const originalFilename = safeFilename(file.originalname, extension);

    await pool.query(
      `
        INSERT INTO note_images (
          id, user_id, object_key, original_filename, content_type, byte_size, status
        ) VALUES ($1::uuid, $2, $3, $4, $5, $6, 'pending');
      `,
      [imageId, userId, objectKey, originalFilename, detected.mime, file.size]
    );
    rowCreated = true;
    await putNoteImage({ objectKey, body: file.buffer, contentType: detected.mime });
    await pool.query(
      `UPDATE note_images SET status = 'ready', uploaded_at = NOW(), updated_at = NOW() WHERE id = $1::uuid;`,
      [imageId]
    );
    const view = await createNoteImageViewUrl(objectKey);
    return res.status(201).json({
      image: { id: imageId, originalFilename, contentType: detected.mime, byteSize: file.size },
      ...view,
    });
  } catch (err) {
    if (rowCreated) {
      await pool.query(`DELETE FROM note_images WHERE id = $1::uuid;`, [imageId]).catch(() => undefined);
      requestObjectDeletionQueueDrain();
    }
    return routeError(res, err);
  }
});

noteImagesRouter.get('/:imageId/url', requireContentReadAccess, async (req, res) => {
  try {
    if (!uuidPattern.test(req.params.imageId)) throw new ApiError('INVALID_NOTE_IMAGE_ID', 400);
    const result = await pool.query<{ object_key: string }>(
      `SELECT object_key FROM note_images WHERE id = $1::uuid AND user_id = $2 AND status = 'ready';`,
      [req.params.imageId, req.auth!.uid]
    );
    const image = result.rows[0];
    if (!image) throw new ApiError('NOTE_IMAGE_NOT_FOUND', 404);
    res.setHeader('Cache-Control', 'no-store');
    return res.json(await createNoteImageViewUrl(image.object_key));
  } catch (err) {
    return routeError(res, err);
  }
});

noteImagesRouter.delete('/:imageId', requireFullWriteAccess, async (req, res) => {
  try {
    if (!uuidPattern.test(req.params.imageId)) throw new ApiError('INVALID_NOTE_IMAGE_ID', 400);
    const result = await pool.query(
      `DELETE FROM note_images WHERE id = $1::uuid AND user_id = $2 AND note_id IS NULL RETURNING id;`,
      [req.params.imageId, req.auth!.uid]
    );
    if (!result.rows[0]) throw new ApiError('NOTE_IMAGE_ATTACHED_OR_NOT_FOUND', 409);
    requestObjectDeletionQueueDrain();
    return res.json({ success: true });
  } catch (err) {
    return routeError(res, err);
  }
});

noteImagesRouter.use((err: unknown, _req: Request, res: Response, next: NextFunction) => {
  void next;
  return routeError(res, err);
});
