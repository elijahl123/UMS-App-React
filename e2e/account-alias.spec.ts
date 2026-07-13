import { expect, test } from '@playwright/test';
import { mockAuthenticatedApp, mockSecondaryEmailLogin, mockSecondaryGoogleLogin } from './support/appMocks';

const primaryEmail = 'elijah.kane.1972@gmail.com';
const googleAliasEmail = 'elijahkanelopez@gmail.com';

test('account page shows the primary account email when signed in with a connected Google email', async ({ page }) => {
  await mockAuthenticatedApp(page, {
    user: {
      id: 'primary-user-uid',
      email: googleAliasEmail,
      firstName: 'Elijah',
      lastName: 'Kane',
      createdAt: '2026-01-01T00:00:00.000Z',
      emailVerified: true,
      connectedProviders: ['password', 'google.com'],
    },
    firebaseLookupUser: {
      localId: 'primary-user-uid',
      email: googleAliasEmail,
      displayName: 'Elijah Kane',
      emailVerified: true,
      createdAt: '1767225600000',
      providerUserInfo: [
        { providerId: 'password', email: primaryEmail },
        { providerId: 'google.com', email: googleAliasEmail },
      ],
    },
    authSession: {
      userId: 'primary-user-uid',
      loginUid: 'primary-user-uid',
      email: googleAliasEmail,
      linkedToPrimary: false,
      user: {
        id: 'primary-user-uid',
        email: primaryEmail,
        firstName: 'Elijah',
        lastName: 'Kane',
        createdAt: '2026-01-01T00:00:00.000Z',
        emailVerified: true,
        connectedProviders: ['password', 'google.com'],
      },
    },
    accountEmails: {
      primaryEmail,
      loginEmail: googleAliasEmail,
      emails: [
        {
          id: 'google-email-1',
          email: googleAliasEmail,
          source: 'google',
          verified: true,
          verifiedAt: '2026-07-13T00:00:00.000Z',
          verificationExpiresAt: null,
          createdAt: '2026-07-13T00:00:00.000Z',
        },
      ],
    },
  });

  await page.goto('/#/account');

  const main = page.getByRole('main');
  const primaryRow = main.getByText(primaryEmail, { exact: true }).locator('xpath=ancestor::div[contains(@class, "justify-between")][1]');
  await expect(primaryRow).toContainText(primaryEmail);
  await expect(primaryRow).toContainText('Primary');
  await expect(primaryRow).toContainText('Email');
  await expect(primaryRow).not.toContainText(googleAliasEmail);

  const googleRow = main.getByText('Google account', { exact: true }).locator('xpath=ancestor::div[contains(@class, "justify-between")][1]');
  await expect(googleRow).toContainText(googleAliasEmail);
  await expect(main.getByText('1 Google account connected.')).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Email', exact: true })).toHaveValue(primaryEmail);
});

test('logging in with a secondary email shows the primary email marked as primary on the account page', async ({ page }) => {
  await mockSecondaryEmailLogin(page, {
    primaryUser: {
      id: 'primary-user-uid',
      email: primaryEmail,
      firstName: 'Elijah',
      lastName: 'Kane',
      createdAt: '2026-01-01T00:00:00.000Z',
      emailVerified: true,
      connectedProviders: ['password', 'google.com'],
    },
    secondaryEmail: googleAliasEmail,
    password: 'password123',
    accountEmails: {
      primaryEmail,
      loginEmail: googleAliasEmail,
      emails: [
        {
          id: 'google-email-1',
          email: googleAliasEmail,
          source: 'google',
          verified: true,
          verifiedAt: '2026-07-13T00:00:00.000Z',
          verificationExpiresAt: null,
          createdAt: '2026-07-13T00:00:00.000Z',
        },
      ],
    },
  });

  await page.goto('/#/login');
  await page.getByLabel('Email').fill(googleAliasEmail);
  await page.getByLabel('Password').fill('password123');
  await page.getByRole('button', { name: 'Log In' }).click();

  await expect(page).toHaveURL(/#\/$/);
  await expect(page.getByRole('heading', { name: 'Upcoming Assignments' })).toBeVisible();

  await page.goto('/#/account');

  const main = page.getByRole('main');
  const primaryRow = main.getByText(primaryEmail, { exact: true }).locator('xpath=ancestor::div[contains(@class, "justify-between")][1]');
  await expect(primaryRow).toContainText(primaryEmail);
  await expect(primaryRow).toContainText('Primary');
  await expect(primaryRow).not.toContainText(googleAliasEmail);

  const googleRow = main.getByText('Google account', { exact: true }).locator('xpath=ancestor::div[contains(@class, "justify-between")][1]');
  await expect(googleRow).toContainText(googleAliasEmail);
  await expect(page.getByRole('textbox', { name: 'Email', exact: true })).toHaveValue(primaryEmail);
});

test('logging in with Google using a secondary email shows the primary email marked as primary on the account page', async ({ page }) => {
  const googleIdToken = 'e2e-google-secondary-id-token';
  let googleOAuthRequest: URL | null = null;
  let firebaseGoogleLoginEmail: string | null = null;

  await mockSecondaryGoogleLogin(page, {
    primaryUser: {
      id: 'primary-user-uid',
      email: primaryEmail,
      firstName: 'Elijah',
      lastName: 'Kane',
      createdAt: '2026-01-01T00:00:00.000Z',
      emailVerified: true,
      connectedProviders: ['password', 'google.com'],
    },
    googleEmail: googleAliasEmail,
    googleIdToken,
    onGoogleOAuthRequest: (url) => {
      googleOAuthRequest = url;
    },
    onFirebaseGoogleSignIn: ({ email }) => {
      firebaseGoogleLoginEmail = email;
    },
    accountEmails: {
      primaryEmail,
      loginEmail: googleAliasEmail,
      emails: [
        {
          id: 'google-email-1',
          email: googleAliasEmail,
          source: 'google',
          verified: true,
          verifiedAt: '2026-07-13T00:00:00.000Z',
          verificationExpiresAt: null,
          createdAt: '2026-07-13T00:00:00.000Z',
        },
      ],
    },
  });

  await page.goto('/#/login');
  await page.getByRole('button', { name: 'Continue with Google' }).click();

  await expect(page).toHaveURL(/#\/$/);
  await expect(page.getByRole('heading', { name: 'Upcoming Assignments' })).toBeVisible();

  expect(googleOAuthRequest).not.toBeNull();
  expect(googleOAuthRequest?.searchParams.get('response_type')).toBe('id_token');
  expect(googleOAuthRequest?.searchParams.get('prompt')).toBe('select_account');
  expect(googleOAuthRequest?.searchParams.get('scope')).toContain('openid');
  expect(googleOAuthRequest?.searchParams.get('scope')).toContain('email');
  expect(googleOAuthRequest?.searchParams.get('scope')).toContain('profile');
  expect(firebaseGoogleLoginEmail).toBe(googleAliasEmail);

  const sidebar = page.locator('aside');
  await expect(sidebar.getByText(googleAliasEmail, { exact: true })).toBeVisible();
  await expect(sidebar.getByText(primaryEmail, { exact: true })).toHaveCount(0);

  await page.goto('/#/account');

  const main = page.getByRole('main');
  await expect(page.locator('aside').getByText(googleAliasEmail, { exact: true })).toBeVisible();
  const primaryRow = main.getByText(primaryEmail, { exact: true }).locator('xpath=ancestor::div[contains(@class, "justify-between")][1]');
  await expect(primaryRow).toContainText(primaryEmail);
  await expect(primaryRow).toContainText('Primary');
  await expect(primaryRow).not.toContainText(googleAliasEmail);

  const googleRow = main.getByText('Google account', { exact: true }).locator('xpath=ancestor::div[contains(@class, "justify-between")][1]');
  await expect(googleRow).toContainText(googleAliasEmail);
  await expect(main.getByText('1 Google account connected.')).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Email', exact: true })).toHaveValue(primaryEmail);
});
