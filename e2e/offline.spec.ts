import { expect, test } from '@playwright/test';
import { goOffline, goOnline, installOfflineControl, mockAuthenticatedApp } from './support/appMocks';

test.beforeEach(async ({ page }) => {
  await mockAuthenticatedApp(page);
  await installOfflineControl(page);
});

async function enableOfflineAccess(page: import('@playwright/test').Page) {
  await page.goto('/#/account');
  await page.getByRole('tab', { name: 'Preferences' }).click();
  const toggle = page.getByRole('switch', { name: 'Offline access' });
  await expect(toggle).toHaveAttribute('aria-checked', 'false');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-checked', 'true');
}

test('keeps working offline and syncs the changes on reconnect', async ({ page }) => {
  await enableOfflineAccess(page);

  // Visit the page once online so its data lands in the cache.
  await page.goto('/#/courses');
  await expect(page.getByText('Software Engineering Project')).toBeVisible();

  await goOffline(page);
  await page.reload();

  await expect(page.getByText('Software Engineering Project')).toBeVisible();
  await expect(page.getByText(/You are offline/)).toBeVisible();

  await page.getByRole('button', { name: 'Add Course' }).first().click();
  await page.getByLabel('Course Code').fill('OFF101');
  await page.getByLabel('Course Name').fill('Working Offline');
  await page.getByRole('button', { name: 'Add Course', exact: true }).last().click();

  await expect(page.getByText('Working Offline')).toBeVisible();
  await expect(page.getByText(/1 change waiting/)).toBeVisible();

  await goOnline(page);

  await expect(page.getByText(/waiting to sync/)).toBeHidden();
  await page.reload();

  // Present after a reload means it came back from the server, not the cache.
  await expect(page.getByText('Working Offline')).toBeVisible();
});

test('leaves the cache empty while offline access is off', async ({ page }) => {
  await page.goto('/#/courses');
  await expect(page.getByText('Software Engineering Project')).toBeVisible();

  await goOffline(page);
  await page.reload();

  await expect(page.getByText(/Turn on offline access in your account preferences/)).toBeVisible();
  await expect(page.getByText('Software Engineering Project')).toBeHidden();
});
