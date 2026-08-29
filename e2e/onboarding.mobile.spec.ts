import { expect, test } from '@playwright/test';
import { createMockOnboarding, mockAuthenticatedApp } from './support/appMocks';

test('mobile first-run onboarding is skippable and keeps a resumable checklist', async ({ page }) => {
  await mockAuthenticatedApp(page, { onboarding: createMockOnboarding() });
  await page.goto('/#/');

  await expect(page.getByRole('heading', { name: 'Welcome, E2E!' })).toBeVisible();
  await page.getByRole('button', { name: 'Skip walkthrough' }).click();
  await expect(page.getByRole('heading', { name: 'Getting Started' })).toBeVisible();
  await expect(page.getByLabel('Resume walkthrough')).toBeVisible();
  await expect(page.getByRole('button', { name: 'View steps' })).toBeVisible();
  const compactCard = await page.getByTestId('getting-started-card').boundingBox();
  expect(compactCard?.height).toBeLessThan(230);

  await page.getByRole('button', { name: 'View steps' }).click();
  await expect(page.getByRole('button', { name: 'Hide steps' })).toBeVisible();
});

test('every mobile feature-tour stage finds its responsive spotlight target', async ({ page }) => {
  await mockAuthenticatedApp(page, { onboarding: createMockOnboarding() });
  await page.goto('/#/');

  await page.getByRole('button', { name: 'Start setup' }).click();
  await page.getByRole('button', { name: 'Use this course' }).click();
  await page.getByRole('button', { name: 'Do this later' }).click();
  await page.getByRole('button', { name: 'Do this later' }).click();
  await page.getByRole('button', { name: 'Set up later' }).click();

  const stages = [
    'Your day at a glance',
    'Plan everything in Calendar',
    'Keep deadlines under control',
    'Build your weekly rhythm',
    'Write notes where they belong',
    'Courses connect everything',
  ];

  for (const heading of stages) {
    await expect(page.getByRole('heading', { name: heading })).toBeVisible();
    await expect(page.getByTestId('onboarding-spotlight')).toHaveAttribute('data-spotlight-status', 'target');
    await page.getByRole('button', { name: 'Next', exact: true }).click();
  }

  // "How Study Plans work" is an informational dialog step, not a page spotlight.
  await expect(page.getByRole('heading', { name: 'How Plans work' })).toBeVisible();
  await page.getByRole('button', { name: 'Continue' }).click();

  const finalStages = ['Move quickly and add from anywhere', 'Connections and preferences'];

  for (const [index, heading] of finalStages.entries()) {
    await expect(page.getByRole('heading', { name: heading })).toBeVisible();
    await expect(page.getByTestId('onboarding-spotlight')).toHaveAttribute('data-spotlight-status', 'target');
    if (index < finalStages.length - 1) await page.getByRole('button', { name: 'Next', exact: true }).click();
  }
});
