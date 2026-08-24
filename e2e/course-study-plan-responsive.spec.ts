import { expect, test, type Route } from '@playwright/test';
import { mockAuthenticatedApp } from './support/appMocks';
import { expectNoHorizontalPageOverflow, watchForRuntimeErrors } from './support/mobileAssertions';

async function fulfillJson(route: Route, payload: unknown) {
  await route.fulfill({ contentType: 'application/json', body: JSON.stringify(payload) });
}

const plan = {
  id: 1,
  course_id: 1,
  course_code: 'COMP30870',
  course_name: 'Software Engineering Project With A Long Responsive Title',
  course_color: 'course-emerald',
  course_homepage_url: 'https://courses.example.edu/comp30870',
  exam_type: 'final',
  exam_date: '2026-08-20',
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
  next_task_title: 'Learn & review: A deliberately long graph algorithms topic',
};

const task = {
  id: 1,
  plan_id: 1,
  topic_id: 1,
  phase: 'learn',
  title: 'Learn & review: A deliberately long graph algorithms topic',
  scheduled_date: '2026-07-29',
  estimated_minutes: 60,
  completed_at: null,
  sequence: 0,
};

test('keeps Course and Study Plan controls usable from narrow phone to wide desktop', async ({ page }) => {
  await mockAuthenticatedApp(page);
  await page.route('**/api/study-plans**', async (route) => {
    const url = new URL(route.request().url());
    if (/\/study-plans\/1\/tasks$/.test(url.pathname)) {
      await fulfillJson(route, {
        from: url.searchParams.get('from'),
        to: url.searchParams.get('to'),
        tasks: [task],
      });
      return;
    }
    if (/\/study-plans\/1$/.test(url.pathname)) {
      await fulfillJson(route, {
        plan,
        availability: [{ plan_id: 1, weekday: 3, minutes: 60 }],
        topics: [{
          id: 1,
          plan_id: 1,
          title: 'A deliberately long graph algorithms topic',
          difficulty: 'medium',
          position: 0,
          active: true,
          total_tasks: 1,
          completed_tasks: 0,
        }],
      });
      return;
    }
    await fulfillJson(route, { plans: [plan] });
  });

  const runtimeErrors = watchForRuntimeErrors(page);
  for (const width of [320, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });

    await page.goto('/#/courses/1');
    await expect(page.getByRole('heading', { name: 'Software Engineering Project' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Homepage' })).toBeVisible();
    await expectNoHorizontalPageOverflow(page);

    await page.goto('/#/courses/1/study-plans/1');
    const noteButton = page.getByRole('button', {
      name: /open notes for learn & review: a deliberately long graph algorithms topic/i,
    });
    const homepageButton = page.getByRole('button', { name: /open comp30870 homepage/i });
    await expect(noteButton).toBeVisible();
    await expect(homepageButton).toBeVisible();
    await expectNoHorizontalPageOverflow(page);

    if (width < 768) {
      const noteBox = await noteButton.boundingBox();
      const homepageBox = await homepageButton.boundingBox();
      expect(noteBox?.height).toBeGreaterThanOrEqual(44);
      expect(homepageBox?.height).toBeGreaterThanOrEqual(44);
    }
  }
  expect(runtimeErrors).toEqual([]);
});
