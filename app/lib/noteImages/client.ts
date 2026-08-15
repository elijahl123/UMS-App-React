import { apiFetch, getApiAuthHeaders } from '@/app/lib/api/client';

export const NOTE_IMAGE_ACCEPT = 'image/jpeg,image/png,image/webp,image/gif';
export const NOTE_IMAGE_MAX_BYTES = 10 * 1024 * 1024;

export interface UploadedNoteImage {
  image: {
    id: string;
    originalFilename: string;
    contentType: string;
    byteSize: number;
  };
  url: string;
  expiresAt: string;
}

async function imageResponse<T>(response: Response): Promise<T> {
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw payload ?? { error: { message: 'NOTE_IMAGE_REQUEST_FAILED' } };
  return payload as T;
}

export async function uploadNoteImage(file: File): Promise<UploadedNoteImage> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 2 * 60_000);
  const body = new FormData();
  body.append('image', file, file.name);
  try {
    return await imageResponse<UploadedNoteImage>(await apiFetch('/note-images', {
      method: 'POST',
      headers: getApiAuthHeaders(),
      body,
      signal: controller.signal,
    }));
  } finally {
    window.clearTimeout(timeout);
  }
}

export async function getNoteImageUrl(imageId: string): Promise<{ url: string; expiresAt: string }> {
  return imageResponse(await apiFetch(`/note-images/${encodeURIComponent(imageId)}/url`, {
    headers: getApiAuthHeaders(),
  }));
}

export async function deleteUnattachedNoteImage(imageId: string): Promise<void> {
  await imageResponse(await apiFetch(`/note-images/${encodeURIComponent(imageId)}`, {
    method: 'DELETE',
    headers: getApiAuthHeaders(),
  }));
}

export function extractNoteImageIdsFromHtml(html: string): string[] {
  if (typeof document === 'undefined') {
    return [...html.matchAll(/data-note-image-id=["']([0-9a-f-]{36})["']/gi)].map((match) => match[1]);
  }
  const template = document.createElement('template');
  template.innerHTML = html;
  return [...template.content.querySelectorAll<HTMLElement>('[data-note-image-id]')]
    .map((element) => element.dataset.noteImageId)
    .filter((id): id is string => Boolean(id));
}

export function noteImageErrorMessage(err: unknown): string {
  const code = (err as { error?: { message?: string } })?.error?.message
    ?? (err instanceof Error ? err.message : 'NOTE_IMAGE_REQUEST_FAILED');
  switch (code) {
    case 'IMAGE_TOO_LARGE': return 'Images must be 10 MB or smaller.';
    case 'UNSUPPORTED_IMAGE_TYPE': return 'Choose a JPEG, PNG, WebP, or GIF image.';
    case 'IMAGE_TYPE_MISMATCH': return 'The file contents do not match its image type.';
    case 'IMAGE_STORAGE_NOT_CONFIGURED': return 'Image storage is not configured yet.';
    case 'IMAGE_STORAGE_ACCESS_DENIED': return 'Image storage does not have write access to the configured Space.';
    case 'IMAGE_STORAGE_CREDENTIALS_INVALID': return 'Image storage credentials are invalid.';
    case 'IMAGE_STORAGE_BUCKET_NOT_FOUND': return 'The configured image-storage bucket was not found.';
    default: return 'The image could not be uploaded. Retry or remove it.';
  }
}
