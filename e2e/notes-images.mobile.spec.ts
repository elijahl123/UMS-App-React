import { expect, test } from '@playwright/test';
import { smallHeic } from '../server/__tests__/fixtures/noteImageFixtures';
import { mockAuthenticatedApp } from './support/appMocks';

const imageId = 'aa4d6333-ef70-48a7-810d-dfb4bde01d70';
const pixel = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZQmcAAAAASUVORK5CYII=';

test('accepts an iPhone HEIC camera-roll image in the mobile note editor', async ({ page }) => {
  await mockAuthenticatedApp(page);
  await page.route('**/api/note-images', async (route) => {
    await route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({
        image: {
          id: imageId,
          originalFilename: 'IMG_1234.jpg',
          contentType: 'image/jpeg',
          byteSize: 549,
        },
        url: `data:image/png;base64,${pixel}`,
        expiresAt: '2026-08-15T01:15:00.000Z',
      }),
    });
  });

  await page.goto('/#/notes/new');
  await page.getByLabel('Upload note images').setInputFiles({
    name: 'IMG_1234.HEIC',
    mimeType: 'image/heic',
    buffer: smallHeic,
  });

  await expect(page.getByRole('img', { name: 'IMG_1234' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Finish Image Uploads' })).not.toBeVisible();
});
