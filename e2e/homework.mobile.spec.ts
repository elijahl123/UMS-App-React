import { expect, test } from '@playwright/test';
import { mockAuthenticatedApp } from './support/appMocks';
import { expectNoHorizontalPageOverflow, watchForRuntimeErrors } from './support/mobileAssertions';

test.beforeEach(async ({ page }) => {
  await mockAuthenticatedApp(page);
});

test('keeps the homework importer usable on mobile viewports', async ({ page }) => {
  const runtimeErrors = watchForRuntimeErrors(page);

  await page.goto('/#/homework');

  await expect(page.getByRole('heading', { name: 'Homework' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Import Brightspace PDF' })).toBeVisible();
  await expectNoHorizontalPageOverflow(page);

  await page.getByRole('button', { name: 'Import Brightspace PDF' }).click();

  await expect(page.getByRole('button', { name: 'Hide Import' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'View walkthrough' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Choose PDF' })).toBeVisible();
  await expectNoHorizontalPageOverflow(page);

  const upcomingGroup = page.getByRole('button', { name: /Upcoming/ });
  await upcomingGroup.scrollIntoViewIfNeeded();
  await expect(upcomingGroup).toBeVisible();
  await expectNoHorizontalPageOverflow(page);

  await page.getByRole('button', { name: 'View walkthrough' }).click();

  await expect(page.getByRole('heading', { name: 'How to download the Brightspace calendar PDF' })).toBeVisible();
  await expect(page.getByText('Step 1 of 3')).toBeVisible();
  await expect(page.getByAltText(/Brightspace home page with the Calendar panel visible/i)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Close' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Back' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Next' })).toBeVisible();
  await expectNoHorizontalPageOverflow(page);

  await page.getByRole('button', { name: 'Next' }).click();

  await expect(page.getByText('Step 2 of 3')).toBeVisible();
  await expect(page.getByAltText(/Brightspace calendar page in Agenda view/i)).toBeVisible();
  await expect(page.getByText(/Keep event details visible in the print preview/i)).toBeVisible();
  await expectNoHorizontalPageOverflow(page);

  await page.getByRole('button', { name: 'Close' }).click();
  await expect(page.getByRole('heading', { name: 'How to download the Brightspace calendar PDF' })).toBeHidden();

  expect(runtimeErrors).toEqual([]);
});
