import { expect, test } from '@playwright/test';
import { mockAuthenticatedApp } from './support/appMocks';

test.beforeEach(async ({ page }) => {
  await mockAuthenticatedApp(page);
});

test('toggles and persists dark mode from the mobile More sheet', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/#/');

  await page.getByRole('button', { name: /^more$/i }).click();
  await page.getByRole('switch', { name: /switch to dark mode/i }).click();

  await expect(page.locator('html')).toHaveClass(/dark/);
  await expect.poll(() => page.evaluate(() => localStorage.getItem('ums.theme'))).toBe('dark');

  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.locator('html')).toHaveClass(/dark/);
});

