import { expect, test } from '@playwright/test';
import { mockAuthenticatedApp } from './support/appMocks';
import { expectNoHorizontalPageOverflow } from './support/mobileAssertions';

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockAuthenticatedApp(page);
});

test('uses mobile bottom navigation with global add and more sheets', async ({ page }) => {
  await page.goto('/#/homework');

  await expect(page.getByRole('navigation', { name: 'Mobile primary navigation' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add anything' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Toggle menu' })).toHaveCount(0);
  await expectNoHorizontalPageOverflow(page);

  await page.getByRole('button', { name: 'More' }).click();
  await expect(page.getByRole('heading', { name: 'More' })).toBeVisible();
  await page.getByRole('button', { name: 'Notes' }).click();
  await expect(page).toHaveURL(/#\/notes$/);
  await expect(page.getByRole('heading', { name: 'Notes' })).toBeVisible();

  await page.getByRole('button', { name: 'More' }).click();
  await page.getByRole('button', { name: 'Courses' }).click();
  await expect(page).toHaveURL(/#\/courses$/);
  await expect(page.getByRole('heading', { name: 'Courses' })).toBeVisible();

  await page.getByRole('button', { name: 'More' }).click();
  await page.getByRole('button', { name: 'Class Schedule' }).click();
  await expect(page).toHaveURL(/#\/class-schedule$/);
  await expect(page.getByRole('heading', { name: 'Class Schedule' })).toBeVisible();

  await page.getByRole('button', { name: 'More' }).click();
  await page.getByRole('button', { name: 'Account' }).click();
  await expect(page).toHaveURL(/#\/account$/);
  await expect(page.getByRole('heading', { name: 'Account', exact: true })).toBeVisible();

  await page.getByRole('link', { name: 'Homework' }).click();
  await page.getByRole('button', { name: 'Add anything' }).click();
  await expect(page.getByRole('heading', { name: 'Add' })).toBeVisible();
  await page.getByRole('button', { name: 'Add Assignment' }).click();

  const dialog = page.getByRole('dialog').filter({ has: page.getByRole('heading', { name: 'Add Assignment' }) });
  await dialog.getByLabel('Assignment Name').fill('Mobile Bottom Nav Assignment');
  await dialog.getByLabel('Course').click();
  await page.getByRole('option', { name: /COMP30870/ }).click();
  await dialog.getByLabel('Due Date').fill('2026-07-22');
  await dialog.getByRole('button', { name: 'Add Assignment' }).click();

  await expect(page.getByText('Mobile Bottom Nav Assignment')).toBeVisible();
  await expectNoHorizontalPageOverflow(page);
});
