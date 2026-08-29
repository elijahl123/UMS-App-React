import { expect, test, type Route } from '@playwright/test';
import { goOffline, goOnline, installOfflineControl, mockAuthenticatedApp } from './support/appMocks';

test.beforeEach(async ({ page }) => {
  await mockAuthenticatedApp(page);
  await installOfflineControl(page);
});

async function enableOfflineAccess(page: import('@playwright/test').Page) {
  await page.goto('/#/account');
  await page.getByRole('tab', { name: 'Preferences' }).click();
  const toggle = page.getByRole('switch', { name: 'Offline access' });
  await expect(toggle).toHaveAttribute('aria-checked', 'false');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-checked', 'true');
  // Enabling kicks off the initial download and nothing is on the device until
  // it lands. "Last synced" only renders once that whole pass is done.
  await expect(page.getByText(/Last synced/)).toBeVisible();
}

test('keeps working offline and syncs the changes on reconnect', async ({ page }) => {
  let creates = 0;
  await page.route('**/api/actions/createCourse', async (route) => {
    creates += 1;
    await route.fallback();
  });

  await enableOfflineAccess(page);

  // Visit the page once online so its data lands in the cache.
  await page.goto('/#/courses');
  await expect(page.getByText('Software Engineering Project')).toBeVisible();

  await goOffline(page);
  await page.reload();

  await expect(page.getByText('Software Engineering Project')).toBeVisible();
  await expect(page.getByText(/You are offline/)).toBeVisible();

  await page.getByRole('button', { name: 'Add Course' }).first().click();
  await page.getByLabel('Course Code').fill('OFF101');
  await page.getByLabel('Course Name').fill('Working Offline');
  await page.getByRole('button', { name: 'Add Course', exact: true }).last().click();

  await expect(page.getByText('Working Offline')).toBeVisible();
  await expect(page.getByText(/1 change waiting/)).toBeVisible();

  await goOnline(page);

  await expect(page.getByText(/waiting to sync/)).toBeHidden();
  await expect.poll(() => creates).toBe(1);
  await page.reload();

  // Present after a reload means it came back from the server, not the cache.
  await expect(page.getByText('Working Offline')).toHaveCount(1);
});

test('leaves the cache empty while offline access is off', async ({ page }) => {
  await page.goto('/#/courses');
  await expect(page.getByText('Software Engineering Project')).toBeVisible();

  await goOffline(page);
  await page.reload();

  await expect(page.getByText(/Turn on offline access in your account preferences/)).toBeVisible();
  await expect(page.getByText('Software Engineering Project')).toBeHidden();
});

test('shows a study plan offline and syncs a task checked off there', async ({ page }) => {
  const today = new Date().toISOString().slice(0, 10);
  const examDate = new Date(Date.now() + 14 * 86_400_000).toISOString().slice(0, 10);
  const tasks = [
    {
      id: 1,
      plan_id: 1,
      topic_id: 1,
      phase: 'learn',
      title: 'Learn & review: Architecture patterns',
      scheduled_date: today,
      estimated_minutes: 60,
      completed_at: null as string | null,
      sequence: 0,
    },
  ];
  const plan = {
    id: 1,
    course_id: 1,
    course_code: 'COMP30870',
    course_name: 'Software Engineering Project',
    course_color: 'course-emerald',
    course_homepage_url: null,
    exam_type: 'final',
    exam_date: examDate,
    target_date: examDate,
    start_date: today,
    timezone: 'UTC',
    archived: false,
    created_at: '2026-07-25T00:00:00.000Z',
    updated_at: '2026-07-25T00:00:00.000Z',
    total_tasks: 1,
    completed_tasks: 0,
    overdue_tasks: 0,
    study_days_left: 14,
    active_topics: 1,
    next_study_date: today,
    next_task_title: 'Learn & review: Architecture patterns',
  };
  const toggles: boolean[] = [];

  await page.route('**/api/study-plans**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());

    if (request.method() === 'PATCH' && url.pathname.endsWith('/tasks/1')) {
      const completed = Boolean((request.postDataJSON() as { completed: boolean }).completed);
      toggles.push(completed);
      tasks[0].completed_at = completed ? '2026-07-25T12:00:00.000Z' : null;
      plan.completed_tasks = completed ? 1 : 0;
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ id: '1', completedAt: tasks[0].completed_at }),
      });
      return;
    }

    const body = url.pathname.endsWith('/tasks')
      ? { from: url.searchParams.get('from'), to: url.searchParams.get('to'), tasks }
      : url.pathname.endsWith('/recovery')
        ? { planId: '1', needsRecovery: false, reasons: [], overdueMinutes: 0, overCapacityMinutes: 0, unscheduledMinutes: 0, unresolvedTasks: [], latestRevision: null }
        : /\/study-plans\/1$/.test(url.pathname)
          ? { plan, availability: [], topics: [{ id: 1, plan_id: 1, title: 'Architecture patterns', difficulty: 'medium', position: 0, active: true, total_tasks: 1, completed_tasks: plan.completed_tasks }] }
          : { plans: [plan] };
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) });
  });

  await enableOfflineAccess(page);

  // Never open the plan while online: the prefetch is what has to put it on the device.
  await goOffline(page);
  await page.goto('/#/courses/1/study-plans/1');

  await expect(page.getByRole('button', { name: 'Complete Learn & review: Architecture patterns' })).toBeVisible();
  await page.getByRole('button', { name: 'Complete Learn & review: Architecture patterns' }).click();

  // Ticking flips the accessible name, which is how the page reports the new state.
  const ticked = page.getByRole('button', { name: 'Mark Learn & review: Architecture patterns incomplete' });
  await expect(ticked).toBeVisible();
  await expect(ticked).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByText(/1 change waiting/)).toBeVisible();
  expect(toggles).toEqual([]);

  await goOnline(page);

  await expect(page.getByText(/waiting to sync/)).toBeHidden();
  expect(toggles).toEqual([true]);
});

test('warns before logging out with changes still waiting to sync', async ({ page }) => {
  await enableOfflineAccess(page);
  await page.goto('/#/courses');
  await expect(page.getByText('Software Engineering Project')).toBeVisible();

  await goOffline(page);
  await page.getByRole('button', { name: 'Add Course' }).first().click();
  await page.getByLabel('Course Code').fill('LOG101');
  await page.getByLabel('Course Name').fill('Unsynced Work');
  await page.getByRole('button', { name: 'Add Course', exact: true }).last().click();
  await expect(page.getByText(/1 change waiting/)).toBeVisible();

  // Playwright dismisses dialogs when nothing handles them, which is the "cancel" path.
  const dismissed: string[] = [];
  page.once('dialog', (dialog) => {
    dismissed.push(dialog.message());
    void dialog.dismiss();
  });
  await page.getByRole('button', { name: 'Log Out' }).click();

  expect(dismissed[0]).toContain('1 change you made offline');
  await expect(page.getByText(/1 change waiting/)).toBeVisible();

  page.once('dialog', (dialog) => void dialog.accept());
  await page.getByRole('button', { name: 'Log Out' }).click();

  await expect(page).toHaveURL(/#\/login$/);
});

test('does not duplicate a queued change when its response is lost', async ({ page }) => {
  const serverCourses: Array<Record<string, unknown>> = [
    { id: 1, code: 'COMP30870', name: 'Software Engineering Project', color: 'course-emerald', homepage_url: null },
  ];
  const receipts = new Map<string, unknown>();
  let writes = 0;
  let dropResponse = false;

  const json = (route: Route, payload: unknown) =>
    route.fulfill({ contentType: 'application/json', body: JSON.stringify(payload) });

  await page.route('**/api/actions/loadCourses', (route) => json(route, serverCourses));
  await page.route('**/api/actions/createCourse', async (route) => {
    const body = route.request().postDataJSON() as {
      code: string;
      name: string;
      color?: string;
      clientMutationId?: string;
    };

    // The receipt rule the real server applies: a mutation id it has already
    // completed replays its stored answer instead of writing again.
    if (body.clientMutationId && receipts.has(body.clientMutationId)) {
      return json(route, receipts.get(body.clientMutationId));
    }

    writes += 1;
    const created = {
      id: serverCourses.length + 1,
      code: body.code,
      name: body.name,
      color: body.color ?? 'course-diamond',
      homepage_url: null,
    };
    serverCourses.push(created);
    if (body.clientMutationId) receipts.set(body.clientMutationId, [created]);

    // Committed on the server, but the client never gets to hear about it.
    if (dropResponse) return route.abort('connectionreset');
    return json(route, [created]);
  });

  await enableOfflineAccess(page);
  await page.goto('/#/courses');
  await goOffline(page);

  await page.getByRole('button', { name: 'Add Course' }).first().click();
  await page.getByLabel('Course Code').fill('DUP101');
  await page.getByLabel('Course Name').fill('Only Once');
  await page.getByRole('button', { name: 'Add Course', exact: true }).last().click();
  await expect(page.getByText(/1 change waiting/)).toBeVisible();

  dropResponse = true;
  await goOnline(page);
  await expect.poll(() => writes).toBe(1);

  // The queued record survived the lost response, so reconnecting sends it again.
  dropResponse = false;
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect(page.getByText(/waiting to sync/)).toBeHidden();

  expect(writes).toBe(1);
  expect(serverCourses.filter((course) => course.name === 'Only Once')).toHaveLength(1);
});

test('boots from the offline copy when the network accepts but never answers', async ({ page }) => {
  await enableOfflineAccess(page);
  await page.goto('/#/courses');
  await expect(page.getByText('Software Engineering Project')).toBeVisible();

  // The nastier case than being offline: sockets connect and nothing comes
  // back, so navigator.onLine stays true and every request runs to its timeout.
  // Path predicates, not globs: '**/api/**' would also match the app's own
  // module URLs, such as /app/lib/api/client.ts.
  const hang = () => new Promise<void>(() => {});
  await page.route((url) => url.pathname.startsWith('/api/'), hang);
  await page.route((url) => url.hostname.endsWith('googleapis.com'), hang);

  const startedAt = Date.now();
  await page.reload({ waitUntil: 'commit' });

  // Boot must not wait on any of it. Generous next to the request timeouts this
  // used to serialise, and far under the ~38s it took before.
  await expect(page.getByText('Software Engineering Project')).toBeVisible({ timeout: 10_000 });
  expect(Date.now() - startedAt).toBeLessThan(10_000);
});
