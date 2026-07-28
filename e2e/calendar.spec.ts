import { expect, test } from '@playwright/test';
import { mockAuthenticatedApp } from './support/appMocks';

test.beforeEach(async ({ page }) => {
  await mockAuthenticatedApp(page);
});

test('renders differentiated connected ranges and the end-date event control', async ({ page }) => {
  await page.goto('/#/calendar');

  await expect(page.getByLabel('Calendar item filters')).toContainText('Assignment');
  await expect(page.getByLabel('Calendar item filters')).toContainText('Course time');
  const eventSegments = page.getByTitle('Event: Project demo, 2026-07-20 through 2026-07-23');
  await expect(eventSegments).toHaveCount(4);
  await expect(eventSegments.nth(0)).toHaveCSS('background-color', 'rgb(248, 173, 157)');

  await page.getByRole('button', { name: 'Hide Study plan' }).click();
  await expect(page.getByRole('button', { name: 'Show Study plan' })).toHaveAttribute('aria-pressed', 'false');

  await page.getByRole('button', { name: 'Hide Event' }).click();
  await expect(
    page.getByTitle('Event: Project demo, 2026-07-20 through 2026-07-23')
  ).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Show Event' })).toHaveAttribute('aria-pressed', 'false');

  await page.getByRole('button', { name: 'Show Event' }).click();
  await expect(
    page.getByTitle('Event: Project demo, 2026-07-20 through 2026-07-23')
  ).toHaveCount(4);

  await page.getByRole('button', { name: 'Add Event' }).click();
  await expect(page.getByLabel('End Date (optional)')).toBeVisible();
});

test.describe('mobile calendar', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('shows compact type markers and the full range on the selected day', async ({ page }) => {
    await page.goto('/#/calendar');

    await expect(page.getByLabel('Calendar item filters')).toContainText('Course');
    await expect(
      page.getByTitle('Event: Project demo, 2026-07-20 through 2026-07-23').nth(0)
    ).toHaveCSS('background-color', 'rgb(240, 128, 128)');
    await page.getByRole('button', { name: /July 21, 2026/ }).click();
    await expect(page.getByText('Project demo')).toBeVisible();
    await expect(page.getByText(/Jul 20 .* Jul 23, 2026/)).toBeVisible();
    const eventCard = page.getByRole('button', { name: /Project demo/ });
    await expect(eventCard.getByText('Event', { exact: true })).toBeVisible();
  });
});
