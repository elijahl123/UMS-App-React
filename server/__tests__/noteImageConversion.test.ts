import { afterAll, describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { convertNoteImage, NOTE_IMAGE_MAX_EDGE } from '../noteImageConversion';
import { closeNoteImageProcessor, processNoteImage } from '../noteImageProcessor';
import { smallHeic } from './fixtures/noteImageFixtures';

describe('note image conversion', () => {
  afterAll(async () => closeNoteImageProcessor());

  it('decodes HEIC and stores the primary image as a metadata-free JPEG', async () => {
    const result = await processNoteImage(smallHeic, 'image/heic');
    const metadata = await sharp(result.body).metadata();

    expect(result).toMatchObject({ contentType: 'image/jpeg', extension: 'jpg', converted: true });
    expect(metadata.format).toBe('jpeg');
    expect(metadata.width).toBe(31);
    expect(metadata.height).toBe(32);
    expect(metadata.exif).toBeUndefined();
    expect(metadata.xmp).toBeUndefined();
  });

  it('auto-orients, bounds, and removes metadata from camera images', async () => {
    const source = await sharp({
      create: { width: 3000, height: 1000, channels: 3, background: '#3b82f6' },
    }).withMetadata({ orientation: 6 }).jpeg({ quality: 95 }).toBuffer();

    const result = await convertNoteImage(source, 'image/jpeg');
    const metadata = await sharp(result.body).metadata();

    expect(metadata.width).toBeLessThanOrEqual(NOTE_IMAGE_MAX_EDGE);
    expect(metadata.height).toBe(NOTE_IMAGE_MAX_EDGE);
    expect(metadata.width).toBeCloseTo(853, -1);
    expect(metadata.orientation).toBeUndefined();
    expect(metadata.exif).toBeUndefined();
  });

  it('flattens transparent static images onto white and converts WebP to JPEG', async () => {
    const transparentPng = await sharp({
      create: { width: 8, height: 8, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
    }).png().toBuffer();
    const whiteJpeg = await convertNoteImage(transparentPng, 'image/png');
    const pixel = await sharp(whiteJpeg.body).raw().toBuffer();
    expect([...pixel.subarray(0, 3)]).toEqual([255, 255, 255]);

    const webp = await sharp({
      create: { width: 20, height: 10, channels: 3, background: '#16a34a' },
    }).webp().toBuffer();
    const convertedWebp = await convertNoteImage(webp, 'image/webp');
    expect((await sharp(convertedWebp.body).metadata()).format).toBe('jpeg');
  });

  it('preserves GIF files so animation is never flattened', async () => {
    const gif = Buffer.from('R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==', 'base64');
    const result = await convertNoteImage(gif, 'image/gif');

    expect(result).toMatchObject({ contentType: 'image/gif', extension: 'gif', converted: false });
    expect(result.body).toEqual(gif);
  });

  it('preserves animated WebP files instead of reducing them to one frame', async () => {
    const twoFrameGif = Buffer.from(
      '47494638396101000100800000000000ffffff21ff0b4e45545343415045322e30030100000021f904000a0000002c000000000100010000020244010021f904000a0000002c00000000010001000002024c01003b',
      'hex'
    );
    const animatedWebp = await sharp(twoFrameGif, { animated: true }).webp({ loop: 0 }).toBuffer();
    expect((await sharp(animatedWebp, { animated: true }).metadata()).pages).toBe(2);

    const result = await convertNoteImage(animatedWebp, 'image/webp');
    expect(result).toMatchObject({ contentType: 'image/webp', extension: 'webp', converted: false });
    expect(result.body).toEqual(animatedWebp);
  });

  it('rejects decompression-sized images over 50 megapixels', async () => {
    const oversized = await sharp({
      create: { width: 8000, height: 7000, channels: 3, background: '#ffffff' },
    }).png().toBuffer();

    await expect(convertNoteImage(oversized, 'image/png')).rejects.toThrow('IMAGE_DIMENSIONS_TOO_LARGE');
  });
});
