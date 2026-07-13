import { expect, test } from '@playwright/test';
import { mockPublicAppApis } from './support/appMocks';

test.beforeEach(async ({ page }) => {
  await mockPublicAppApis(page);
});

test.describe('authentication routes', () => {
  test('renders the login screen and navigates to signup', async ({ page }) => {
    await page.goto('/#/login');

    await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
    await expect(page.getByLabel('Email')).toBeVisible();
    await expect(page.getByLabel('Password')).toBeVisible();

    await page.getByRole('link', { name: 'Sign up' }).click();

    await expect(page).toHaveURL(/#\/signup$/);
    await expect(page.getByRole('heading', { name: 'Create your account' })).toBeVisible();
  });

  test('shows client-side validation on an empty login submission', async ({ page }) => {
    await page.goto('/#/login');

    await page.getByRole('button', { name: 'Log In' }).click();

    await expect(page.getByText('Email is required')).toBeVisible();
    await expect(page.getByText('Password is required')).toBeVisible();
  });

  test('redirects protected routes to login', async ({ page }) => {
    await page.goto('/#/homework');

    await expect(page).toHaveURL(/#\/login$/);
    await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
  });
});
