import express, { type NextFunction, type Request, type Response } from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../errors';
import { NOTE_IMAGE_MAX_BYTES } from '../noteImageConversion';
import { smallHeic } from './fixtures/noteImageFixtures';

const query = vi.fn();
const putNoteImage = vi.fn();
const processNoteImage = vi.fn();
const requestObjectDeletionQueueDrain = vi.fn();
const createNoteImageViewUrl = vi.fn(async () => ({
  url: 'https://umstatic.nyc3.digitaloceanspaces.com/private?signature=test',
  expiresAt: '2026-08-15T01:15:00.000Z',
}));

vi.mock('../db', () => ({ pool: { query } }));
vi.mock('../noteImageStorage', () => ({ putNoteImage, createNoteImageViewUrl }));
vi.mock('../noteImageProcessor', () => ({ processNoteImage }));
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
    processNoteImage.mockReset().mockImplementation(async (body: Buffer) => ({
      body: Buffer.from([0xff, 0xd8, 0xff, 0xd9]),
      contentType: 'image/jpeg',
      extension: 'jpg',
      converted: true,
      width: 1,
      height: 1,
      sourceBytes: body.length,
    }));
    createNoteImageViewUrl.mockClear();
    requestObjectDeletionQueueDrain.mockClear();
  });

  it('validates and stores a private raster image before returning a temporary view URL', async () => {
    const response = await request(await testApp())
      .post('/api/note-images')
      .attach('image', png, { filename: 'diagram.png', contentType: 'image/png' });

    expect(response.status).toBe(201);
    expect(response.body.image).toMatchObject({ originalFilename: 'diagram.jpg', contentType: 'image/jpeg', byteSize: 4 });
    expect(response.body.url).toContain('signature=test');
    expect(processNoteImage).toHaveBeenCalledWith(png, 'image/png');
    expect(putNoteImage).toHaveBeenCalledWith(expect.objectContaining({
      contentType: 'image/jpeg',
      body: Buffer.from([0xff, 0xd8, 0xff, 0xd9]),
      objectKey: expect.stringMatching(/\.jpg$/),
    }));
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

  it('accepts HEIC aliases and an iOS-style generic MIME type when the signature and extension match', async () => {
    const declared = await request(await testApp())
      .post('/api/note-images')
      .attach('image', smallHeic, { filename: 'IMG_1234.HEIC', contentType: 'image/heif' });
    expect(declared.status).toBe(201);
    expect(processNoteImage).toHaveBeenLastCalledWith(smallHeic, 'image/heic');
    expect(declared.body.image.originalFilename).toBe('IMG_1234.jpg');

    const generic = await request(await testApp())
      .post('/api/note-images')
      .attach('image', smallHeic, { filename: 'camera-roll.heic', contentType: 'application/octet-stream' });
    expect(generic.status).toBe(201);
  });

  it('returns a useful error when conversion fails before storage', async () => {
    processNoteImage.mockRejectedValueOnce(new ApiError('IMAGE_CONVERSION_FAILED', 422));
    const response = await request(await testApp())
      .post('/api/note-images')
      .attach('image', png, { filename: 'diagram.png', contentType: 'image/png' });

    expect(response.status).toBe(422);
    expect(response.body.error.message).toBe('IMAGE_CONVERSION_FAILED');
    expect(putNoteImage).not.toHaveBeenCalled();
  });

  it('rejects source files larger than 25 MB before conversion', async () => {
    const response = await request(await testApp())
      .post('/api/note-images')
      .attach('image', Buffer.alloc(NOTE_IMAGE_MAX_BYTES + 1), {
        filename: 'too-large.heic',
        contentType: 'image/heic',
      });

    expect(response.status).toBe(413);
    expect(response.body.error.message).toBe('IMAGE_TOO_LARGE');
    expect(processNoteImage).not.toHaveBeenCalled();
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
