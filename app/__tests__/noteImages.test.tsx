import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import {
  deleteUnattachedNoteImage,
  extractNoteImageIdsFromHtml,
  uploadNoteImage,
} from '@/app/lib/noteImages/client';

vi.mock('@/app/lib/noteImages/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/app/lib/noteImages/client')>()),
  uploadNoteImage: vi.fn(async () => ({
    image: {
      id: 'aa4d6333-ef70-48a7-810d-dfb4bde01d70',
      originalFilename: 'lecture-diagram.png',
      contentType: 'image/png',
      byteSize: 12,
    },
    url: 'https://spaces.example/private-image?signature=temporary',
    expiresAt: '2026-08-15T01:15:00.000Z',
  })),
  getNoteImageUrl: vi.fn(async () => ({
    url: 'https://spaces.example/private-image?signature=refreshed',
    expiresAt: '2026-08-15T01:15:00.000Z',
  })),
  deleteUnattachedNoteImage: vi.fn(async () => undefined),
}));

describe('note image editor', () => {
  beforeAll(() => {
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn(() => 'blob:preview') });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
  });

  it('uploads from the picker and persists only the managed image ID and alt text', async () => {
    vi.doUnmock('@/app/components/widgets/RichTextEditor');
    const { default: RichTextEditor } = await import('@/app/components/widgets/RichTextEditor');
    const user = userEvent.setup();
    const onChange = vi.fn();
    const onUploadStateChange = vi.fn();
    render(<RichTextEditor content="" onChange={onChange} onUploadStateChange={onUploadStateChange} />);

    const file = new File(['image bytes'], 'lecture-diagram.png', { type: 'image/png' });
    await user.upload(screen.getByLabelText(/upload note images/i), file);

    await waitFor(() => expect(uploadNoteImage).toHaveBeenCalledWith(file));
    await waitFor(() => expect(screen.getByRole('img', { name: 'lecture-diagram' })).toBeInTheDocument());
    const savedHtml = onChange.mock.calls.map(([html]) => String(html)).find((html) => html.includes('data-note-image-id'));
    expect(savedHtml).toContain('data-note-image-id="aa4d6333-ef70-48a7-810d-dfb4bde01d70"');
    expect(savedHtml).toContain('alt="lecture-diagram"');
    expect(savedHtml).not.toContain('spaces.example');
    expect(extractNoteImageIdsFromHtml(savedHtml!)).toEqual(['aa4d6333-ef70-48a7-810d-dfb4bde01d70']);
    expect(onUploadStateChange).toHaveBeenCalledWith(true);
    expect(onUploadStateChange).toHaveBeenLastCalledWith(false);

    await user.click(screen.getByRole('button', { name: /^remove$/i }));
    await waitFor(() => expect(deleteUnattachedNoteImage).toHaveBeenCalledWith(
      'aa4d6333-ef70-48a7-810d-dfb4bde01d70'
    ));
    expect(screen.queryByRole('img', { name: 'lecture-diagram' })).not.toBeInTheDocument();
  });
});
