import { expect, test } from '@playwright/test';
import { mockAuthenticatedApp } from './support/appMocks';
import { smallHeic } from '../server/__tests__/fixtures/noteImageFixtures';

const imageId = 'aa4d6333-ef70-48a7-810d-dfb4bde01d70';
const pixel = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZQmcAAAAASUVORK5CYII=';

test('uploads a private inline HEIC image and saves only its managed ID', async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 851 });
  await mockAuthenticatedApp(page);

  let saved: { content?: string; imageIds?: string[] } = {};
  page.on('request', (request) => {
    if (request.method() === 'POST' && request.url().endsWith('/api/actions/createNote')) {
      saved = request.postDataJSON() as typeof saved;
    }
  });
  await page.route('**/api/note-images', async (route) => {
    await route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({
        image: { id: imageId, originalFilename: 'lecture-diagram.jpg', contentType: 'image/jpeg', byteSize: 68 },
        url: `data:image/png;base64,${pixel}`,
        expiresAt: '2026-08-15T01:15:00.000Z',
      }),
    });
  });

  await page.goto('/#/notes/new');
  await page.getByPlaceholder('Note title').fill('Lecture diagram');
  await page.getByLabel('Upload note images').setInputFiles({
    name: 'lecture-diagram.HEIC',
    mimeType: 'image/heic',
    buffer: smallHeic,
  });

  await expect(page.getByRole('img', { name: 'lecture-diagram' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Create Note' })).toBeEnabled();
  await page.getByRole('button', { name: 'Create Note' }).click();
  await expect(page).toHaveURL(/#\/notes$/);

  expect(saved.imageIds).toEqual([imageId]);
  expect(saved.content).toContain(`data-note-image-id="${imageId}"`);
  expect(saved.content).not.toContain('data:image');
});
