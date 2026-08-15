import express, { type NextFunction, type Request, type Response } from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../errors';

const query = vi.fn();
const putNoteImage = vi.fn();
const requestObjectDeletionQueueDrain = vi.fn();
const createNoteImageViewUrl = vi.fn(async () => ({
  url: 'https://umstatic.nyc3.digitaloceanspaces.com/private?signature=test',
  expiresAt: '2026-08-15T01:15:00.000Z',
}));

vi.mock('../db', () => ({ pool: { query } }));
vi.mock('../noteImageStorage', () => ({ putNoteImage, createNoteImageViewUrl }));
vi.mock('../retention', () => ({ requestObjectDeletionQueueDrain }));
vi.mock('../access', () => {
  const allow = (req: Request, _res: Response, next: NextFunction) => {
    req.auth = { uid: 'user-1', email: 'student@example.com', role: 'viewer' };
    next();
  };
  return { requireFullWriteAccess: allow, requireContentReadAccess: allow };
});

const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZQmcAAAAASUVORK5CYII=',
  'base64'
);

async function testApp() {
  const { noteImagesRouter } = await import('../routes/noteImages');
  const app = express();
  app.use('/api/note-images', noteImagesRouter);
  return app;
}

describe('private note image routes', () => {
  beforeEach(() => {
    query.mockReset().mockResolvedValue({ rows: [] });
    putNoteImage.mockReset().mockResolvedValue(undefined);
    createNoteImageViewUrl.mockClear();
    requestObjectDeletionQueueDrain.mockClear();
  });

  it('validates and stores a private raster image before returning a temporary view URL', async () => {
    const response = await request(await testApp())
      .post('/api/note-images')
      .attach('image', png, { filename: 'diagram.png', contentType: 'image/png' });

    expect(response.status).toBe(201);
    expect(response.body.image).toMatchObject({ originalFilename: 'diagram.png', contentType: 'image/png' });
    expect(response.body.url).toContain('signature=test');
    expect(putNoteImage).toHaveBeenCalledWith(expect.objectContaining({ contentType: 'image/png', body: png }));
    expect(query.mock.calls.some(([sql]) => String(sql).includes("status = 'ready'"))).toBe(true);
  });

  it('rejects a declared type that does not match the actual image bytes', async () => {
    const response = await request(await testApp())
      .post('/api/note-images')
      .attach('image', png, { filename: 'fake.jpg', contentType: 'image/jpeg' });

    expect(response.status).toBe(415);
    expect(response.body.error.message).toBe('IMAGE_TYPE_MISMATCH');
    expect(putNoteImage).not.toHaveBeenCalled();
  });

  it('surfaces storage permission failures as a useful service error', async () => {
    putNoteImage.mockRejectedValueOnce(new ApiError('IMAGE_STORAGE_ACCESS_DENIED', 503));
    const response = await request(await testApp())
      .post('/api/note-images')
      .attach('image', png, { filename: 'diagram.png', contentType: 'image/png' });

    expect(response.status).toBe(503);
    expect(response.body.error.message).toBe('IMAGE_STORAGE_ACCESS_DENIED');
    expect(query.mock.calls.some(([sql]) => String(sql).includes('DELETE FROM note_images'))).toBe(true);
  });

  it('returns view URLs only for images owned by the authenticated user', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    const missing = await request(await testApp()).get('/api/note-images/aa4d6333-ef70-48a7-810d-dfb4bde01d70/url');
    expect(missing.status).toBe(404);

    query.mockResolvedValueOnce({ rows: [{ object_key: 'notes/hash/image.png' }] });
    const found = await request(await testApp()).get('/api/note-images/aa4d6333-ef70-48a7-810d-dfb4bde01d70/url');
    expect(found.status).toBe(200);
    expect(query).toHaveBeenLastCalledWith(expect.stringContaining('user_id = $2'), expect.any(Array));
  });

  it('deletes an unattached upload and starts storage cleanup', async () => {
    query.mockResolvedValueOnce({ rows: [{ id: 'aa4d6333-ef70-48a7-810d-dfb4bde01d70' }] });

    const response = await request(await testApp())
      .delete('/api/note-images/aa4d6333-ef70-48a7-810d-dfb4bde01d70');

    expect(response.status).toBe(200);
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('note_id IS NULL'),
      ['aa4d6333-ef70-48a7-810d-dfb4bde01d70', 'user-1']
    );
    expect(requestObjectDeletionQueueDrain).toHaveBeenCalledOnce();
  });

  it('defines a deletion trigger so cascades cannot orphan stored objects', async () => {
    const migration = await import('node:fs/promises').then(({ readFile }) =>
      readFile('migrations/1783930000_add_private_note_images.sql', 'utf8')
    );
    expect(migration).toContain('note_images_enqueue_object_deletion');
    expect(migration).toContain('object_storage_deletion_queue');
    expect(migration).toMatch(/REFERENCES notes \(id\) ON DELETE CASCADE/);
  });
});
