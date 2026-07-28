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
  const plans = [
    summary(1, 'COMP31020', 'course-teal', '2026-08-05', 2),
    summary(2, 'MATH10210', 'course-red', '2026-08-12'),
    summary(3, 'MST20050', 'course-blue', '2026-08-20'),
  ];
  let dashboardRequests = 0;
  let completed = false;

  await page.route('**/api/study-plans/dashboard**', async (route) => {
    dashboardRequests += 1;
    const tasks = Array.from({ length: 6 }, (_, index) => ({
      id: `task-${index + 1}`,
      plan_id: index < 3 ? 1 : 2,
      topic_id: index + 1,
      phase: index % 2 === 0 ? 'practice' : 'recall',
      title: `Study task ${index + 1}`,
      scheduled_date: '2026-07-25',
      estimated_minutes: 30,
      completed_at: null,
      sequence: index,
      course_id: index < 3 ? 1 : 2,
      course_code: index < 3 ? 'COMP31020' : 'MATH10210',
      course_name: index < 3 ? 'Formal Foundations' : 'Calculus',
      course_color: index < 3 ? 'course-teal' : 'course-red',
    })).filter((task) => !completed || task.id !== 'task-1');
    await fulfillJson(route, {
      plans,
      tasks,
      activePlanCount: 3,
      overduePlanCount: 1,
      urgentPlan: plans[0],
      nextStudyDate: '2026-07-26',
    });
  });

  await page.route('**/api/study-plans/1/tasks/task-1', async (route) => {
    completed = true;
    await fulfillJson(route, { id: 'task-1', completedAt: '2026-07-25T12:00:00.000Z' });
  });

  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/#/');
  await expect(page.getByRole('heading', { name: 'Study Focus' })).toBeVisible();
  await expect(page.getByText('COMP31020 Final')).toBeVisible();
  await expect(page.getByText('MATH10210 Midterm')).toBeVisible();
  await expect(page.getByText('MST20050 Final')).toBeVisible();
  await expect(page.getByText('1 plan needs attention')).toBeVisible();

  const requestsBeforeCompletion = dashboardRequests;
  await page.getByRole('button', { name: 'Complete Study task 1 for COMP31020' }).click();
  await expect.poll(() => dashboardRequests).toBe(requestsBeforeCompletion + 1);
  await expect(page.getByRole('button', { name: 'Complete Study task 1 for COMP31020' })).toHaveCount(0);

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByText('COMP31020 Final')).toBeVisible();
  await expect(page.getByText('MATH10210 Midterm')).toBeHidden();
  await expect(page.getByRole('link', { name: /View all today/i })).toBeVisible();
  await expect.poll(async () => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});
