import { expect, test, type Route } from '@playwright/test';
import { mockAuthenticatedApp } from './support/appMocks';

async function fulfillJson(route: Route, payload: unknown) {
  await route.fulfill({ contentType: 'application/json', body: JSON.stringify(payload) });
}

test('creates a course study plan and completes a generated daily task', async ({ page }) => {
  await mockAuthenticatedApp(page);
  let taskCompleted = false;
  let bundle = { plans: [], availability: [], topics: [], tasks: [] } as {
    plans: Array<Record<string, unknown>>;
    availability: Array<Record<string, unknown>>;
    topics: Array<Record<string, unknown>>;
    tasks: Array<Record<string, unknown>>;
  };

  await page.route('**/api/study-plans**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());

    if (request.method() === 'POST' && /\/study-plans\/?$/.test(url.pathname)) {
      const body = request.postDataJSON() as {
        courseId: string;
        examType: string;
        examDate: string;
        startDate: string;
        timeZone: string;
        availability: Array<{ weekday: number; minutes: number }>;
        topics: Array<{ title: string; difficulty: string }>;
      };
      bundle = {
        plans: [{
          id: 1,
          course_id: Number(body.courseId),
          course_code: 'COMP30870',
          course_name: 'Software Engineering Project',
          course_color: 'course-green',
          exam_type: body.examType,
          exam_date: body.examDate,
          start_date: body.startDate,
          timezone: body.timeZone,
          archived: false,
          created_at: '2026-07-25T00:00:00.000Z',
          updated_at: '2026-07-25T00:00:00.000Z',
          total_tasks: 1,
          completed_tasks: 0,
          overdue_tasks: 0,
          study_days_left: 1,
          active_topics: body.topics.length,
          next_study_date: body.startDate,
          next_task_title: `Learn & review: ${body.topics[0].title}`,
        }],
        availability: body.availability.filter((entry) => entry.minutes > 0).map((entry) => ({
          plan_id: 1,
          weekday: entry.weekday,
          minutes: entry.minutes,
        })),
        topics: body.topics.map((topic, position) => ({
          id: position + 1,
          plan_id: 1,
          title: topic.title,
          difficulty: topic.difficulty,
          position,
          active: true,
        })),
        tasks: [{
          id: 1,
          plan_id: 1,
          topic_id: 1,
          phase: 'learn',
          title: `Learn & review: ${body.topics[0].title}`,
          scheduled_date: body.startDate,
          estimated_minutes: 60,
          completed_at: null,
          sequence: 0,
        }],
      };
      await fulfillJson(route, { planId: '1' });
      return;
    }

    if (request.method() === 'PATCH' && url.pathname.endsWith('/tasks/1')) {
      taskCompleted = Boolean((request.postDataJSON() as { completed: boolean }).completed);
      bundle.tasks[0].completed_at = taskCompleted ? '2026-07-25T12:00:00.000Z' : null;
      bundle.plans[0].completed_tasks = taskCompleted ? 1 : 0;
      await fulfillJson(route, { id: '1', completedAt: bundle.tasks[0].completed_at });
      return;
    }

    if (request.method() === 'GET' && /\/study-plans\/1\/tasks$/.test(url.pathname)) {
      await fulfillJson(route, {
        from: url.searchParams.get('from'),
        to: url.searchParams.get('to'),
        tasks: bundle.tasks,
      });
      return;
    }

    if (request.method() === 'GET' && /\/study-plans\/1$/.test(url.pathname)) {
      await fulfillJson(route, {
        plan: bundle.plans[0],
        availability: bundle.availability,
        topics: bundle.topics.map((topic) => ({
          ...topic,
          total_tasks: 1,
          completed_tasks: taskCompleted ? 1 : 0,
        })),
      });
      return;
    }

    await fulfillJson(route, { plans: bundle.plans });
  });

  await page.goto('/#/courses/1');
  await page.getByRole('button', { name: 'Create Plan' }).click();
  await expect(page.getByRole('heading', { name: 'Create Study Plan' })).toBeVisible();

  await page.getByLabel(/paste modules or topics/i).fill('Architecture patterns\nTesting strategy');
  await page.getByRole('button', { name: 'Add topics' }).click();
  await expect(page.locator('input[value="Architecture patterns"]')).toBeVisible();
  await page.getByRole('button', { name: 'Create study plan' }).click();

  await expect(page).toHaveURL(/#\/courses\/1\/study-plans\/1$/);
  await expect(page.getByRole('heading', { name: /Final study plan/i })).toBeVisible();
  const task = page.getByRole('button', { name: /Learn & review: Architecture patterns/i });
  await expect(task).toBeVisible();
  await task.click();
  await expect.poll(() => taskCompleted).toBe(true);
});
