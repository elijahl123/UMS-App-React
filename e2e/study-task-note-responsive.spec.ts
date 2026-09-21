import { expect, test, type Locator, type Page, type Route } from '@playwright/test';
import { mockAuthenticatedApp } from './support/appMocks';
import { expectNoHorizontalPageOverflow, watchForRuntimeErrors } from './support/mobileAssertions';

async function fulfillJson(route: Route, payload: unknown) {
  await route.fulfill({ contentType: 'application/json', body: JSON.stringify(payload) });
}

// A title long enough to squeeze the banner's text column against its buttons.
const taskTitle = 'Deepen: A deliberately long graph algorithms topic title';

const plan = {
  id: 1,
  course_id: 1,
  course_code: 'COMP30870',
  course_name: 'Software Engineering Project',
  course_color: 'course-emerald',
  course_homepage_url: 'https://courses.example.edu/comp30870',
  exam_type: 'final',
  exam_date: '2099-08-20',
  start_date: '2026-07-20',
  timezone: 'America/Los_Angeles',
  archived: false,
  created_at: '2026-07-20T00:00:00.000Z',
  updated_at: '2026-07-20T00:00:00.000Z',
  total_tasks: 1,
  completed_tasks: 0,
  overdue_tasks: 0,
  study_days_left: 1,
  active_topics: 1,
  next_study_date: '2026-07-29',
  next_task_title: taskTitle,
};

const task = {
  id: 1,
  plan_id: 1,
  topic_id: 1,
  phase: 'learn',
  title: taskTitle,
  scheduled_date: '2026-07-29',
  estimated_minutes: 60,
  completed_at: null,
  sequence: 0,
};

async function boundingBox(locator: Locator) {
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  return box!;
}

function overlaps(a: { x: number; y: number; width: number; height: number }, b: typeof a) {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

async function mockPlanWithTaskNote(page: Page) {
  await page.route('**/api/study-plans**', async (route) => {
    const url = new URL(route.request().url());
    if (/\/tasks\/1\/note$/.test(url.pathname)) {
      await fulfillJson(route, { noteId: 1, created: false });
      return;
    }
    if (/\/tasks\/1$/.test(url.pathname)) {
      await fulfillJson(route, { id: 1, completedAt: '2026-07-29T12:00:00.000Z' });
      return;
    }
    if (/\/study-plans\/1\/tasks$/.test(url.pathname)) {
      await fulfillJson(route, {
        from: url.searchParams.get('from'),
        to: url.searchParams.get('to'),
        tasks: [task],
      });
      return;
    }
    if (/\/study-plans\/1\/recovery$/.test(url.pathname)) {
      await fulfillJson(route, { planId: 1, needsRecovery: false });
      return;
    }
    if (/\/study-plans\/1$/.test(url.pathname)) {
      await fulfillJson(route, {
        plan,
        availability: [{ plan_id: 1, weekday: 3, minutes: 60 }],
        topics: [{
          id: 1,
          plan_id: 1,
          title: 'Graph algorithms',
          difficulty: 'medium',
          position: 0,
          active: true,
          total_tasks: 1,
          completed_tasks: 0,
        }],
        tasks: [task],
      });
      return;
    }
    if (url.pathname.endsWith('/dashboard')) {
      await fulfillJson(route, {
        plans: [],
        tasks: [],
        activePlanCount: 0,
        overduePlanCount: 0,
        recoveryPlanCount: 0,
        urgentPlan: null,
        nextStudyDate: null,
      });
      return;
    }
    await fulfillJson(route, { plans: [plan] });
  });
}

test('keeps the study task note banner and editor actions clear from phone to wide desktop', async ({ page }) => {
  const errors = watchForRuntimeErrors(page);
  await mockAuthenticatedApp(page);
  await mockPlanWithTaskNote(page);

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/#/courses/1/study-plans/1');
  await page.getByRole('button', { name: new RegExp(`open notes for ${taskTitle}`, 'i') }).click();

  const banner = page.getByRole('region', { name: /study plan task/i });
  await expect(banner).toBeVisible();

  const complete = banner.getByRole('button', { name: new RegExp(`mark ${taskTitle} complete`, 'i') });
  const backToPlan = banner.getByRole('button', { name: /back to study plan/i });
  const save = page.getByRole('button', { name: /save changes/i });
  const bell = page.getByRole('button', { name: /notifications/i });

  for (const width of [375, 768, 1024, 1280, 1920]) {
    await page.setViewportSize({ width, height: width < 700 ? 760 : 900 });

    await expect(complete, `complete button at ${width}px`).toBeVisible();
    await expect(backToPlan, `back button at ${width}px`).toBeVisible();

    // The banner's own controls must never sit on top of each other.
    expect(
      overlaps(await boundingBox(complete), await boundingBox(backToPlan)),
      `banner buttons overlap at ${width}px`
    ).toBe(false);

    // The notification bell floats over the bottom-right corner from md up.
    // The editor's save action has to stay clear of it.
    if (await bell.isVisible()) {
      expect(
        overlaps(await boundingBox(save), await boundingBox(bell)),
        `save button sits under the notification bell at ${width}px`
      ).toBe(false);
    }

    await expectNoHorizontalPageOverflow(page);
  }

  // The task can be checked off here and the plan is one click away.
  await complete.click();
  await expect(banner.getByRole('button', { name: new RegExp(`mark ${taskTitle} incomplete`, 'i') })).toBeVisible();
  await backToPlan.click();
  await expect(page.getByRole('heading', { name: /final exam/i, level: 1 })).toBeVisible();

  expect(errors).toEqual([]);
});
