import { expect, test, type Page } from '@playwright/test';
import { mockAuthenticatedApp } from './support/appMocks';

function watchForRuntimeErrors(page: Page) {
  const errors: string[] = [];

  page.on('pageerror', (error) => {
    errors.push(error.message);
  });

  page.on('console', (message) => {
    if (message.type() === 'error') {
      errors.push(message.text());
    }
  });

  return errors;
}

async function expectNoHorizontalPageOverflow(page: Page) {
  const metrics = await page.evaluate(() => {
    const documentWidth = document.documentElement.scrollWidth;
    const bodyWidth = document.body.scrollWidth;
    const offenders = Array.from(document.querySelectorAll('body *'))
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return {
          tag: element.tagName.toLowerCase(),
          className: typeof element.className === 'string' ? element.className : '',
          text: (element.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 80),
          left: Math.round(rect.left),
          right: Math.round(rect.right),
          width: Math.round(rect.width),
        };
      })
      .filter((entry) => entry.left < -2 || entry.right > window.innerWidth + 2)
      .sort((a, b) => b.right - a.right)
      .slice(0, 5);

    return {
      offenders,
      widestContent: Math.max(documentWidth, bodyWidth),
      viewportWidth: window.innerWidth,
    };
  });

  expect(metrics.widestContent, JSON.stringify(metrics.offenders, null, 2)).toBeLessThanOrEqual(metrics.viewportWidth + 2);
}

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
