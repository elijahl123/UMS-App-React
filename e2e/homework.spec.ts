import { expect, test } from '@playwright/test';
import { mockAuthenticatedApp } from './support/appMocks';

test.beforeEach(async ({ page }) => {
  await mockAuthenticatedApp(page);
});

test('adds an assignment from the homework page', async ({ page }) => {
  await page.goto('/#/homework');

  await expect(page.getByRole('heading', { name: 'Homework' })).toBeVisible();
  await page.getByRole('button', { name: 'Add Assignment' }).click();

  await page.getByLabel('Assignment Name').fill('Read test strategy notes');
  await page.getByLabel('Course').click();
  await page.getByRole('option', { name: /COMP30870/ }).click();
  await page.getByLabel('Due Date').fill('2026-07-30');
  await page.getByLabel('Due Time (optional)').fill('16:30');
  await page.getByLabel('Description (optional)').fill('Capture the highest-risk regression paths.');
  await page.getByRole('button', { name: 'Add Assignment' }).click();

  await expect(page.getByText('Read test strategy notes')).toBeVisible();
});
