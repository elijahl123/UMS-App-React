import decodeHeic from 'heic-decode';
import sharp from 'sharp';

export const NOTE_IMAGE_MAX_BYTES = 25 * 1024 * 1024;
export const NOTE_IMAGE_MAX_PIXELS = 50_000_000;
export const NOTE_IMAGE_MAX_EDGE = 2560;
export const NOTE_IMAGE_JPEG_QUALITY = 82;

export const HEIC_MIME_TYPES = new Set([
  'image/heic',
  'image/heif',
  'image/heic-sequence',
  'image/heif-sequence',
]);

export type SupportedNoteImageMime =
  | 'image/jpeg'
  | 'image/png'
  | 'image/apng'
  | 'image/webp'
  | 'image/gif'
  | 'image/heic'
  | 'image/heif'
  | 'image/heic-sequence'
  | 'image/heif-sequence';

export interface ProcessedNoteImage {
  body: Buffer;
  contentType: 'image/jpeg' | 'image/png' | 'image/apng' | 'image/webp' | 'image/gif';
  extension: 'jpg' | 'png' | 'webp' | 'gif';
  converted: boolean;
  width?: number;
  height?: number;
}

export class NoteImageConversionError extends Error {
  constructor(public readonly code: 'IMAGE_DIMENSIONS_TOO_LARGE' | 'IMAGE_CONVERSION_FAILED') {
    super(code);
    this.name = 'NoteImageConversionError';
  }
}

function assertDimensions(width: number | undefined, height: number | undefined) {
  if (!width || !height || !Number.isSafeInteger(width) || !Number.isSafeInteger(height)) {
    throw new NoteImageConversionError('IMAGE_CONVERSION_FAILED');
  }
  if (width * height > NOTE_IMAGE_MAX_PIXELS) {
    throw new NoteImageConversionError('IMAGE_DIMENSIONS_TOO_LARGE');
  }
}

async function encodeJpeg(
  input: Buffer,
  raw?: { width: number; height: number; channels: 4 }
): Promise<ProcessedNoteImage> {
  const pipeline = sharp(input, raw
    ? { raw, limitInputPixels: NOTE_IMAGE_MAX_PIXELS, failOn: 'error' }
    : { limitInputPixels: NOTE_IMAGE_MAX_PIXELS, failOn: 'error' });
  const { data, info } = await pipeline
    .autoOrient()
    .toColourspace('srgb')
    .flatten({ background: '#ffffff' })
    .resize({
      width: NOTE_IMAGE_MAX_EDGE,
      height: NOTE_IMAGE_MAX_EDGE,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .jpeg({ quality: NOTE_IMAGE_JPEG_QUALITY, progressive: true, mozjpeg: true })
    .toBuffer({ resolveWithObject: true });
  return {
    body: data,
    contentType: 'image/jpeg',
    extension: 'jpg',
    converted: true,
    width: info.width,
    height: info.height,
  };
}

async function convertHeic(body: Buffer): Promise<ProcessedNoteImage> {
  let images: Awaited<ReturnType<typeof decodeHeic.all>> | null = null;
  try {
    images = await decodeHeic.all({ buffer: body });
    const primary = images[0];
    if (!primary) throw new NoteImageConversionError('IMAGE_CONVERSION_FAILED');
    assertDimensions(primary.width, primary.height);
    const decoded = await primary.decode();
    assertDimensions(decoded.width, decoded.height);
    const pixels = Buffer.from(decoded.data);
    return await encodeJpeg(pixels, { width: decoded.width, height: decoded.height, channels: 4 });
  } finally {
    images?.dispose();
  }
}

function unchangedAnimatedImage(
  body: Buffer,
  contentType: SupportedNoteImageMime,
  width?: number,
  height?: number
): ProcessedNoteImage {
  if (contentType === 'image/gif') {
    return { body, contentType, extension: 'gif', converted: false, width, height };
  }
  if (contentType === 'image/png' || contentType === 'image/apng') {
    return { body, contentType, extension: 'png', converted: false, width, height };
  }
  if (contentType === 'image/webp') {
    return { body, contentType, extension: 'webp', converted: false, width, height };
  }
  throw new NoteImageConversionError('IMAGE_CONVERSION_FAILED');
}

export async function convertNoteImage(
  body: Buffer,
  contentType: SupportedNoteImageMime
): Promise<ProcessedNoteImage> {
  try {
    if (HEIC_MIME_TYPES.has(contentType)) return await convertHeic(body);

    const metadata = await sharp(body, {
      animated: true,
      limitInputPixels: NOTE_IMAGE_MAX_PIXELS,
      failOn: 'error',
    }).metadata();
    const frameHeight = metadata.pageHeight ?? metadata.height;
    assertDimensions(metadata.width, frameHeight);

    if (contentType === 'image/gif' || contentType === 'image/apng' || (metadata.pages ?? 1) > 1) {
      return unchangedAnimatedImage(body, contentType, metadata.width, frameHeight);
    }
    return await encodeJpeg(body);
  } catch (err) {
    if (err instanceof NoteImageConversionError) throw err;
    const message = err instanceof Error ? err.message : '';
    if (/pixel limit|input image exceeds pixel limit/i.test(message)) {
      throw new NoteImageConversionError('IMAGE_DIMENSIONS_TOO_LARGE');
    }
    throw new NoteImageConversionError('IMAGE_CONVERSION_FAILED');
  }
}
