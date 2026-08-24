import { expect, test, type Route } from '@playwright/test';
import { mockAuthenticatedApp } from './support/appMocks';

async function fulfillJson(route: Route, payload: unknown) {
  await route.fulfill({ contentType: 'application/json', body: JSON.stringify(payload) });
}

const summary = (id: number, courseCode: string, courseColor: string, examDate: string, overdueTasks = 0) => ({
  id,
  course_id: id,
  course_code: courseCode,
  course_name: `${courseCode} Course`,
  course_color: courseColor,
  exam_type: id === 2 ? 'midterm' : 'final',
  exam_date: examDate,
  start_date: '2026-07-01',
  timezone: 'America/Los_Angeles',
  archived: false,
  created_at: '2026-07-01T00:00:00.000Z',
  updated_at: '2026-07-25T00:00:00.000Z',
  total_tasks: 20,
  completed_tasks: id * 3,
  overdue_tasks: overdueTasks,
  study_days_left: 12,
  active_topics: 6,
  next_study_date: '2026-07-26',
  next_task_title: `Review ${courseCode}`,
  local_today: '2026-07-25',
});

test('dashboard widgets fill the available desktop height without affecting mobile flow', async ({ page }) => {
  await mockAuthenticatedApp(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/#/');

  const desktopLayout = await page.getByTestId('dashboard-widget-grid').evaluate((grid) => {
    const gridRect = grid.getBoundingClientRect();
    const mainRect = grid.closest('main')?.getBoundingClientRect();
    return {
      gridBottom: gridRect.bottom,
      mainBottom: mainRect?.bottom ?? window.innerHeight,
      flexGrow: getComputedStyle(grid).flexGrow,
    };
  });
  expect(desktopLayout.flexGrow).toBe('1');
  expect(desktopLayout.mainBottom - desktopLayout.gridBottom).toBeLessThanOrEqual(24);

  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(async () =>
    page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)
  ).toBe(true);
  await expect(page.getByTestId('dashboard-widget-grid')).toBeVisible();
});

test('study focus is responsive, themed, urgent, and revalidates once after completion', async ({ page }) => {
  await mockAuthenticatedApp(page);
  const courseCodes = ['COMP31020', 'MATH10210', 'MST20050', 'CHEM10100', 'HIST20200', 'BIO20500', 'PHYS30100', 'ART11000'];
  const courseColors = ['course-peridot', 'course-ruby', 'course-sapphire', 'course-citrine', 'course-amethyst', 'course-emerald', 'course-tourmaline', 'course-diamond'];
  const plans = courseCodes.map((courseCode, index) => summary(
    index + 1,
    courseCode,
    courseColors[index],
    `2026-08-${String(index + 5).padStart(2, '0')}`,
    index === 0 ? 2 : 0
  ));
  let dashboardRequests = 0;
  const completedTasks = new Set<string>();
  let noteRequests = 0;

  await page.route('**/api/study-plans/dashboard**', async (route) => {
    dashboardRequests += 1;
    const tasks = Array.from({ length: 30 }, (_, index) => {
      const courseIndex = index === 29 ? 7 : index % 7;
      return {
      id: `task-${index + 1}`,
      plan_id: courseIndex + 1,
      topic_id: index + 1,
      phase: index % 2 === 0 ? 'practice' : 'recall',
      title: `Study task ${index + 1}`,
      scheduled_date: '2026-07-25',
      estimated_minutes: 30,
      completed_at: null,
      sequence: index,
      course_id: courseIndex + 1,
      course_code: courseCodes[courseIndex],
      course_name: `${courseCodes[courseIndex]} Course`,
      course_color: courseColors[courseIndex],
      course_homepage_url: courseIndex === 0 ? 'https://courses.example.edu/comp31020' : null,
      };
    }).filter((task) => !completedTasks.has(task.id));
    await fulfillJson(route, {
      plans,
      tasks,
      activePlanCount: plans.length,
      overduePlanCount: 1,
      recoveryPlanCount: 1,
      urgentPlan: plans[0],
      nextStudyDate: '2026-07-26',
    });
  });

  await page.route('**/api/study-plans/1/tasks/task-1', async (route) => {
    completedTasks.add('task-1');
    await fulfillJson(route, { id: 'task-1', completedAt: '2026-07-25T12:00:00.000Z' });
  });
  await page.route('**/api/study-plans/8/tasks/task-30', async (route) => {
    completedTasks.add('task-30');
    await fulfillJson(route, { id: 'task-30', completedAt: '2026-07-25T12:00:00.000Z' });
  });
  await page.route('**/api/study-plans/1/tasks/task-1/note', async (route) => {
    noteRequests += 1;
    await fulfillJson(route, { noteId: '99', created: noteRequests === 1 });
  });
  await page.context().route('https://courses.example.edu/**', async (route) => {
    await route.fulfill({ contentType: 'text/html', body: '<title>Course homepage</title>' });
  });

  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/#/');
  await expect(page.getByRole('heading', { name: 'Study Focus' })).toBeVisible();
  await expect(page.getByText('30 tasks · 8 classes · 15h remaining')).toBeVisible();
  await expect(page.getByText('8 active plans · nearest first')).toBeVisible();
  await expect(page.getByText('COMP31020 Final')).toBeVisible();
  await expect(page.getByText('MATH10210 Midterm')).toBeVisible();
  await expect(page.getByText('MST20050 Final')).toBeVisible();
  await expect(page.getByText('ART11000 Final')).toBeVisible();
  await expect(page.getByText('1 plan needs replanning')).toBeVisible();
  await expect(page.getByRole('button', { name: /^Complete Study task/ })).toHaveCount(22);
  await expect(page.getByRole('button', { name: /^Show \d+ more/ })).toHaveCount(7);
  await expect(page.getByRole('button', { name: 'Complete Study task 29 for COMP31020', exact: true })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'ART11000' })).toBeVisible();

  for (const testId of ['study-task-scroll', 'study-plan-scroll']) {
    const scrollState = await page.getByTestId(testId).evaluate((element) => ({
      clientHeight: element.clientHeight,
      scrollHeight: element.scrollHeight,
      overflowY: getComputedStyle(element).overflowY,
    }));
    expect(scrollState.overflowY).toBe('auto');
    expect(scrollState.scrollHeight).toBeGreaterThan(scrollState.clientHeight);
  }

  const expandCompTasks = page.getByRole('button', { name: 'Show 2 more tasks for COMP31020', exact: true });
  await expect(expandCompTasks).toHaveAttribute('aria-expanded', 'false');
  await expandCompTasks.click();
  await expect(page.getByRole('button', { name: 'Complete Study task 29 for COMP31020', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Show fewer tasks for COMP31020', exact: true })).toHaveAttribute('aria-expanded', 'true');

  await page.getByRole('button', { name: 'Open notes for Study task 1', exact: true }).click();
  await expect(page).toHaveURL(/#\/notes\/99$/);
  expect(noteRequests).toBe(1);
  expect(completedTasks.size).toBe(0);
  await page.goBack();
  await expect(page.getByRole('heading', { name: 'Study Focus' })).toBeVisible();

  const popupPromise = page.waitForEvent('popup');
  await page.getByRole('button', { name: 'Open COMP31020 homepage' }).first().click();
  const popup = await popupPromise;
  await expect(popup).toHaveURL('https://courses.example.edu/comp31020');
  expect(completedTasks.size).toBe(0);

  const requestsBeforeCompletion = dashboardRequests;
  await page.getByRole('button', { name: 'Complete Study task 1 for COMP31020', exact: true }).click();
  await expect.poll(() => dashboardRequests).toBe(requestsBeforeCompletion + 1);
  await expect(page.getByRole('button', { name: 'Complete Study task 1 for COMP31020', exact: true })).toHaveCount(0);
  await expect(page.getByText('29 tasks · 8 classes · 14h 30m remaining')).toBeVisible();

  const requestsBeforeLastClassCompletion = dashboardRequests;
  await page.getByRole('button', { name: 'Complete Study task 30 for ART11000', exact: true }).click();
  await expect.poll(() => dashboardRequests).toBe(requestsBeforeLastClassCompletion + 1);
  await expect(page.getByRole('heading', { name: 'ART11000' })).toHaveCount(0);
  await expect(page.getByText('28 tasks · 7 classes · 14h remaining')).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByText('COMP31020 Final')).toBeVisible();
  await expect(page.getByText('MATH10210 Midterm')).toBeVisible();
  const mobileNoteButton = page.getByRole('button', { name: 'Open notes for Study task 2', exact: true });
  const mobileHomepageButton = page.getByRole('button', { name: 'Open COMP31020 homepage' }).first();
  await expect(mobileNoteButton).toBeVisible();
  await expect(mobileHomepageButton).toBeVisible();
  expect((await mobileNoteButton.boundingBox())?.height).toBeGreaterThanOrEqual(44);
  expect((await mobileHomepageButton.boundingBox())?.height).toBeGreaterThanOrEqual(44);
  await expect(page.getByRole('link', { name: /View all today/i })).toHaveCount(0);
  await expect.poll(async () => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);

  await page.setViewportSize({ width: 320, height: 844 });
  await expect(page.getByText('28 tasks · 7 classes · 14h remaining')).toBeVisible();
  await expect(page.getByText('ART11000 Final')).toBeVisible();
  await expect.poll(async () => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});
