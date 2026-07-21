import { expect, test, type Locator, type Page } from '@playwright/test';
import { mockAuthenticatedApp, mockPublicAppApis } from './support/appMocks';
import {
  dragMobilePage,
  expectMobileBottomNavVisible,
  expectNoHorizontalPageOverflow,
  swipeMobilePage,
  watchForRuntimeErrors,
} from './support/mobileAssertions';

async function openAuthenticatedRoute(page: Page, path: string) {
  await mockAuthenticatedApp(page);
  await page.goto(`/#${path}`);
}

test.describe('mobile public authentication', () => {
  test.beforeEach(async ({ page }) => {
    await mockPublicAppApis(page);
  });

  test('renders login and validates empty submission on mobile', async ({ page }) => {
    const runtimeErrors = watchForRuntimeErrors(page);

    await page.goto('/#/login');

    await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
    await expect(page.getByLabel('Email')).toBeVisible();
    await expect(page.getByLabel('Password')).toBeVisible();
    await expectNoHorizontalPageOverflow(page);

    await page.getByRole('button', { name: 'Log In' }).click();

    await expect(page.getByText('Email is required')).toBeVisible();
    await expect(page.getByText('Password is required')).toBeVisible();
    await expectNoHorizontalPageOverflow(page);
    expect(runtimeErrors).toEqual([]);
  });
});

test.describe('mobile authenticated smoke tests', () => {
  test('loads the dashboard stack with bottom navigation', async ({ page }) => {
    const runtimeErrors = watchForRuntimeErrors(page);

    await openAuthenticatedRoute(page, '/');

    await expect(page.getByRole('heading', { name: 'Upcoming Assignments' })).toBeVisible();
    await expect(page.getByText('Architecture Review')).toBeVisible();
    await expectMobileBottomNavVisible(page);
    await expectNoHorizontalPageOverflow(page);
    expect(runtimeErrors).toEqual([]);
  });

  test('keeps the notes editor usable on mobile', async ({ page }) => {
    const runtimeErrors = watchForRuntimeErrors(page);

    await openAuthenticatedRoute(page, '/notes/new');

    await expect(page.getByRole('button', { name: 'Back to Notes' })).toBeVisible();
    await page.getByPlaceholder('Note title').fill('Mobile planning note');
    await page.locator('.ProseMirror').fill('This note was drafted on a mobile viewport.');

    await expect(page.getByRole('button', { name: 'Create Note' })).toBeEnabled();
    await page.getByRole('button', { name: 'Create Note' }).scrollIntoViewIfNeeded();
    await expect(page.getByRole('button', { name: 'Create Note' })).toBeVisible();
    await expectNoHorizontalPageOverflow(page);
    expect(runtimeErrors).toEqual([]);
  });

  test('loads billing outside the app shell on mobile', async ({ page }) => {
    const runtimeErrors = watchForRuntimeErrors(page);

    await openAuthenticatedRoute(page, '/billing');

    await expect(page.getByRole('heading', { name: 'Subscribe to UMS' })).toBeVisible();
    await expect(page.getByText('Your subscription is active.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Open app' })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Mobile primary navigation' })).toHaveCount(0);
    await expectNoHorizontalPageOverflow(page);
    expect(runtimeErrors).toEqual([]);
  });

  test('keeps calendar controls and dialogs usable on mobile', async ({ page }) => {
    const runtimeErrors = watchForRuntimeErrors(page);

    await openAuthenticatedRoute(page, '/calendar');

    await expect(page.getByRole('button', { name: 'Previous month' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Today' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Next month' })).toBeVisible();
    await expectMobileBottomNavVisible(page);
    await expectNoHorizontalPageOverflow(page);

    await page.getByRole('button', { name: 'Add Event' }).click();

    await expect(page.getByRole('dialog').filter({ has: page.getByRole('heading', { name: 'Add Event' }) })).toBeVisible();
    await expectNoHorizontalPageOverflow(page);
    expect(runtimeErrors).toEqual([]);
  });

  test('swipes between main app pages on mobile', async ({ page }) => {
    const runtimeErrors = watchForRuntimeErrors(page);

    await openAuthenticatedRoute(page, '/');

    await expect(page.getByRole('heading', { name: 'Upcoming Assignments' })).toBeVisible();
    await swipeMobilePage(page, 'left');
    await expect(page).toHaveURL(/#\/calendar$/);
    await expect(page.getByRole('button', { name: 'Add Event' })).toBeVisible();

    await swipeMobilePage(page, 'right');
    await expect(page).toHaveURL(/#\/$/);
    await expect(page.getByRole('heading', { name: 'Upcoming Assignments' })).toBeVisible();

    await swipeMobilePage(page, 'left');
    await swipeMobilePage(page, 'left');
    await expect(page).toHaveURL(/#\/homework$/);
    await expect(page.getByRole('heading', { name: 'Homework' })).toBeVisible();

    await swipeMobilePage(page, 'left');
    await expect(page).toHaveURL(/#\/notes$/);
    await expect(page.getByRole('heading', { name: 'Notes' })).toBeVisible();
    await expectNoHorizontalPageOverflow(page);
    expect(runtimeErrors).toEqual([]);
  });

  test('ignores vertical drags and protected interaction areas while swiping', async ({ page }) => {
    const runtimeErrors = watchForRuntimeErrors(page);

    await openAuthenticatedRoute(page, '/calendar');

    await dragMobilePage(page, { startX: 210, startY: 160, endX: 188, endY: 520 });
    await expect(page).toHaveURL(/#\/calendar$/);

    await page.getByRole('button', { name: 'Add Event' }).click();
    const dialog = page.getByRole('dialog').filter({ has: page.getByRole('heading', { name: 'Add Event' }) });
    await expect(dialog).toBeVisible();
    await dialog.dispatchEvent('pointerdown', {
      bubbles: true,
      clientX: 340,
      clientY: 360,
      isPrimary: true,
      pointerId: 44,
      pointerType: 'touch',
    });
    await dialog.dispatchEvent('pointerup', {
      bubbles: true,
      clientX: 40,
      clientY: 368,
      isPrimary: true,
      pointerId: 44,
      pointerType: 'touch',
    });
    await expect(page).toHaveURL(/#\/calendar$/);

    await openAuthenticatedRoute(page, '/notes/new');
    await page.locator('.ProseMirror').fill('This note should not trigger route swipes.');
    await expect(page.locator('[data-mobile-swipe-region="inactive"]')).toBeVisible();
    await expect(page).toHaveURL(/#\/notes\/new$/);
    await expectNoHorizontalPageOverflow(page);
    expect(runtimeErrors).toEqual([]);
  });

  const routeAudits: Array<{ path: string; primary: (page: Page) => Locator; hasShell: boolean }> = [
    { path: '/', primary: (page) => page.getByRole('heading', { name: 'Upcoming Assignments' }), hasShell: true },
    { path: '/calendar', primary: (page) => page.getByRole('button', { name: 'Add Event' }), hasShell: true },
    { path: '/class-schedule', primary: (page) => page.getByRole('heading', { name: 'Class Schedule' }), hasShell: true },
    { path: '/homework', primary: (page) => page.getByRole('heading', { name: 'Homework' }), hasShell: true },
    { path: '/notes', primary: (page) => page.getByRole('heading', { name: 'Notes' }), hasShell: true },
    { path: '/courses', primary: (page) => page.getByRole('heading', { name: 'Courses' }), hasShell: true },
    { path: '/account', primary: (page) => page.getByRole('heading', { name: 'Account', exact: true }), hasShell: true },
    { path: '/billing', primary: (page) => page.getByRole('heading', { name: 'Subscribe to UMS' }), hasShell: false },
  ];

  for (const route of routeAudits) {
    test(`renders ${route.path} without page-level horizontal overflow`, async ({ page }) => {
      const runtimeErrors = watchForRuntimeErrors(page);

      await openAuthenticatedRoute(page, route.path);

      await expect(route.primary(page)).toBeVisible();
      if (route.hasShell) {
        await expectMobileBottomNavVisible(page);
      }
      await expectNoHorizontalPageOverflow(page);
      expect(runtimeErrors).toEqual([]);
    });
  }
});
