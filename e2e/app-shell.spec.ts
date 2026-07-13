import { expect, test } from '@playwright/test';
import { mockAuthenticatedApp, testUser } from './support/appMocks';

test.beforeEach(async ({ page }) => {
  await mockAuthenticatedApp(page);
});

test('loads the authenticated dashboard shell and navigates primary sections', async ({ page }) => {
  await page.goto('/#/');

  await expect(page.getByRole('heading', { name: 'Upcoming Assignments' })).toBeVisible();
  await expect(page.getByText('Architecture Review')).toBeVisible();
  await expect(page.getByText('Legacy Migration Brief')).toBeVisible();
  await expect(page.getByText(testUser.email)).toBeVisible();

  await page.getByRole('link', { name: /Homework/ }).click();
  await expect(page).toHaveURL(/#\/homework$/);
  await expect(page.getByRole('heading', { name: 'Homework' })).toBeVisible();

  await page.getByRole('link', { name: 'Calendar' }).click();
  await expect(page).toHaveURL(/#\/calendar$/);
  await expect(page.getByRole('button', { name: 'Add Event' })).toBeVisible();
});
