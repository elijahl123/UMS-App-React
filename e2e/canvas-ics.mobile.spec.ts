import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { expect, test } from '@playwright/test';
import { mockAuthenticatedApp } from './support/appMocks';
import { expectNoHorizontalPageOverflow, watchForRuntimeErrors } from './support/mobileAssertions';

function canvasCalendar(eventCount: number): string {
  const events = Array.from({ length: eventCount }, (_, index) => {
    const day = String((index % 28) + 1).padStart(2, '0');
    return [
      'BEGIN:VEVENT',
      `UID:canvas-event-${index + 1}`,
      `SUMMARY:Canvas Event ${index + 1}`,
      `DTSTART:202609${day}T090000`,
      'END:VEVENT',
    ].join('\r\n');
  }).join('\r\n');
  return `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Canvas//Calendar//EN\r\n${events}\r\nEND:VCALENDAR`;
}

test.beforeEach(async ({ page }) => {
  await mockAuthenticatedApp(page);
});

test('keeps a large Canvas calendar compact and shows download instructions', async ({ page }, testInfo) => {
  const runtimeErrors = watchForRuntimeErrors(page);
  const icsPath = testInfo.outputPath('large-canvas-calendar.ics');
  mkdirSync(dirname(icsPath), { recursive: true });
  writeFileSync(icsPath, canvasCalendar(55));

  await page.goto('/#/homework');
  await page.getByRole('button', { name: 'Import school calendar' }).click();
  await expect(page.getByRole('heading', { name: 'Import Brightspace assignments' })).toBeHidden();
  await expect(page.getByRole('heading', { name: 'Import Canvas calendar' })).toBeHidden();
  await page.getByRole('radio', { name: /Canvas/ }).click();
  await expect(page.getByRole('heading', { name: 'Import Canvas calendar' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Import Brightspace assignments' })).toBeHidden();

  await page.getByRole('button', { name: 'Hide Import' }).click();
  await page.getByRole('button', { name: 'Import school calendar' }).click();
  await expect(page.getByRole('radio', { name: /Canvas/ })).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByRole('heading', { name: 'Import Canvas calendar' })).toBeVisible();

  await page.getByRole('button', { name: 'View instructions' }).click();
  await expect(page.getByRole('heading', { name: 'How to download your Canvas .ics file' })).toBeVisible();
  await expect(page.getByText('At the bottom-right of the calendar page, click Calendar Feed.')).toBeVisible();
  await expect(page.getByText('In the pop-out window, click “click here to view this feed”.')).toBeVisible();
  await page.getByRole('button', { name: 'Close' }).click();

  await page.getByLabel('Canvas calendar .ics file').setInputFiles(icsPath);

  await expect(page.getByText('55 found')).toBeVisible();
  await expect(page.getByText('55 selected', { exact: true })).toBeVisible();
  await expect(page.getByText('Page 1 of 2 · 55 shown')).toBeVisible();
  await expect(page.getByText('Canvas Event 1', { exact: true })).toBeVisible();
  await expect(page.getByText('Canvas Event 51', { exact: true })).toBeHidden();

  await page.getByRole('button', { name: 'Next Canvas events page' }).click();
  await expect(page.getByText('Canvas Event 51', { exact: true })).toBeVisible();
  await expect(page.getByText('Page 2 of 2 · 55 shown')).toBeVisible();

  await page.getByLabel('Search Canvas events').fill('Canvas Event 55');
  await expect(page.getByText('Page 1 of 1 · 1 shown')).toBeVisible();
  await expect(page.getByText('Canvas Event 55', { exact: true })).toBeVisible();
  await expectNoHorizontalPageOverflow(page);
  expect(runtimeErrors).toEqual([]);
});
