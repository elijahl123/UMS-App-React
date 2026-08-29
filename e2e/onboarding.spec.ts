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
