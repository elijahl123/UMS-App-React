import { expect, test } from '@playwright/test';
import { createMockOnboarding, mockAuthenticatedApp } from './support/appMocks';

test('new users can set up essentials and enter the live feature tour', async ({ page }) => {
  await mockAuthenticatedApp(page, { onboarding: createMockOnboarding() });
  await page.goto('/#/');

  await expect(page.getByRole('heading', { name: /welcome/i })).toBeVisible();
  await page.getByRole('button', { name: 'Start setup' }).click();
  await page.getByRole('button', { name: 'Use this course' }).click();
  await page.getByRole('button', { name: 'Do this later' }).click();
  await page.getByRole('button', { name: 'Do this later' }).click();
  await page.getByRole('button', { name: 'Set up later' }).click();

  await expect(page.getByRole('heading', { name: 'Your day at a glance' })).toBeVisible();
  await expect(page.getByTestId('onboarding-spotlight')).toHaveAttribute('data-spotlight-status', 'target');
  const delayedCalendarLayout = await page.addStyleTag({ content: '[data-tour="calendar"] { display: none !important; }' });
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(page).toHaveURL(/#\/calendar$/);
  await expect(page.getByRole('heading', { name: 'Plan everything in Calendar' })).toBeVisible();
  await expect(page.getByTestId('onboarding-spotlight')).toHaveAttribute('data-spotlight-status', 'fallback');

  await delayedCalendarLayout.evaluate((element) => element.parentNode?.removeChild(element));
  await expect(page.getByTestId('onboarding-spotlight')).toHaveAttribute('data-spotlight-status', 'target');

  const remainingStages = [
    { heading: 'Keep deadlines under control', path: 'homework' },
    { heading: 'Build your weekly rhythm', path: 'class-schedule' },
    { heading: 'Write notes where they belong', path: 'notes' },
    { heading: 'Courses connect everything', path: 'courses' },
  ];

  for (const stage of remainingStages) {
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`#/${stage.path}$`));
    await expect(page.getByRole('heading', { name: stage.heading })).toBeVisible();
    await expect(page.getByTestId('onboarding-spotlight')).toHaveAttribute('data-spotlight-status', 'target');
  }

  // "How Study Plans work" is an informational dialog step, not a page spotlight.
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'How Plans work' })).toBeVisible();
  await page.getByRole('button', { name: 'Continue' }).click();

  const finalStages = [
    { heading: 'Move quickly and add from anywhere', path: '' },
    { heading: 'Connections and preferences', path: 'account' },
  ];

  for (const [index, stage] of finalStages.entries()) {
    await expect(page).toHaveURL(new RegExp(`#/${stage.path}$`));
    await expect(page.getByRole('heading', { name: stage.heading })).toBeVisible();
    await expect(page.getByTestId('onboarding-spotlight')).toHaveAttribute('data-spotlight-status', 'target');
    if (index < finalStages.length - 1) await page.getByRole('button', { name: 'Next', exact: true }).click();
  }

  await page.getByRole('button', { name: 'Complete tour' }).click();
  await expect(page.getByRole('heading', { name: 'You’re ready to get organized' })).toBeVisible();
});

test('skipping leaves a resumable Getting Started checklist', async ({ page }) => {
  await mockAuthenticatedApp(page, { onboarding: createMockOnboarding() });
  await page.goto('/#/');

  await page.getByRole('button', { name: 'Skip walkthrough' }).click();
  await expect(page.getByRole('heading', { name: 'Getting Started' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Resume walkthrough' })).toBeVisible();
});

test('offers offline access during setup, off unless the user turns it on', async ({ page }) => {
  await mockAuthenticatedApp(page, { onboarding: createMockOnboarding() });
  await page.goto('/#/');

  await page.getByRole('button', { name: 'Start setup' }).click();
  await page.getByRole('button', { name: 'Use this course' }).click();
  await page.getByRole('button', { name: 'Do this later' }).click();
  await page.getByRole('button', { name: 'Do this later' }).click();

  await expect(page.getByRole('heading', { name: 'Connect your planning tools' })).toBeVisible();
  const toggle = page.getByRole('switch', { name: 'Work offline' });
  await expect(toggle).toHaveAttribute('aria-checked', 'false');

  // Nothing is stored until the user asks for it.
  expect(await page.evaluate(() => window.localStorage.getItem('ums.offlineSync'))).toBeNull();

  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-checked', 'true');
  await expect.poll(() => page.evaluate(() => window.localStorage.getItem('ums.offlineSync'))).toBe('on');

  await page.getByRole('button', { name: 'Continue to app tour' }).click();
  await expect(page.getByRole('heading', { name: 'Your day at a glance' })).toBeVisible();
  // The tour overlay covers the app, so leave it before reading the account page.
  await page.getByRole('button', { name: 'Skip', exact: true }).click();

  // The walkthrough switch is the same setting the account page owns.
  await page.getByRole('button', { name: 'Account', exact: true }).click();
  await expect(page).toHaveURL(/#\/account$/);
  await page.getByRole('tab', { name: 'Preferences' }).click();
  await expect(page.getByRole('switch', { name: 'Offline access' })).toHaveAttribute('aria-checked', 'true');
});

test('leaves offline access off when the walkthrough is skipped past it', async ({ page }) => {
  await mockAuthenticatedApp(page, { onboarding: createMockOnboarding() });
  await page.goto('/#/');

  await page.getByRole('button', { name: 'Start setup' }).click();
  await page.getByRole('button', { name: 'Use this course' }).click();
  await page.getByRole('button', { name: 'Do this later' }).click();
  await page.getByRole('button', { name: 'Do this later' }).click();
  await page.getByRole('button', { name: 'Set up later' }).click();

  await expect(page.getByRole('heading', { name: 'Your day at a glance' })).toBeVisible();
  expect(await page.evaluate(() => window.localStorage.getItem('ums.offlineSync'))).toBeNull();
  await page.getByRole('button', { name: 'Skip', exact: true }).click();

  await page.getByRole('button', { name: 'Account', exact: true }).click();
  await expect(page).toHaveURL(/#\/account$/);
  await page.getByRole('tab', { name: 'Preferences' }).click();
  await expect(page.getByRole('switch', { name: 'Offline access' })).toHaveAttribute('aria-checked', 'false');
});
