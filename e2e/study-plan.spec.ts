import { expect, test, type Route } from '@playwright/test';
import { mockAuthenticatedApp } from './support/appMocks';

async function fulfillJson(route: Route, payload: unknown) {
  await route.fulfill({ contentType: 'application/json', body: JSON.stringify(payload) });
}

test('shares one topic note across study phases and launches the course homepage', async ({ page }) => {
  await mockAuthenticatedApp(page);
  let taskCompleted = false;
  let taskNoteRequests = 0;
  const taskNoteIds: string[] = [];
  const taskNotes: Array<Record<string, unknown>> = [];
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
          course_homepage_url: 'https://courses.example.edu/comp30870',
          exam_type: body.examType,
          exam_date: body.examDate,
          start_date: body.startDate,
          timezone: body.timeZone,
          archived: false,
          created_at: '2026-07-25T00:00:00.000Z',
          updated_at: '2026-07-25T00:00:00.000Z',
          total_tasks: 3,
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
        tasks: ['Learn & review', 'Practice', 'Recall'].map((phase, index) => ({
          id: index + 1,
          plan_id: 1,
          topic_id: 1,
          phase: ['learn', 'practice', 'recall'][index],
          title: `${phase}: ${body.topics[0].title}`,
          scheduled_date: body.startDate,
          estimated_minutes: index === 0 ? 60 : 15,
          completed_at: null,
          sequence: index,
        })),
      };
      await fulfillJson(route, { planId: '1' });
      return;
    }

    const taskNoteMatch = url.pathname.match(/\/tasks\/([123])\/note$/);
    if (request.method() === 'POST' && taskNoteMatch) {
      taskNoteRequests += 1;
      taskNoteIds.push(taskNoteMatch[1]);
      if (taskNotes.length === 0) {
        taskNotes.push({
          id: 99,
          course_id: 1,
          title: bundle.topics[0].title,
          content: '<ul><li><p></p></li></ul>',
          created_at: '2026-07-25T12:30:00.000Z',
          updated_at: '2026-07-25T12:30:00.000Z',
        });
      }
      await fulfillJson(route, { noteId: '99', created: taskNoteRequests === 1 });
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
          total_tasks: 3,
          completed_tasks: taskCompleted ? 1 : 0,
        })),
      });
      return;
    }

    await fulfillJson(route, { plans: bundle.plans });
  });
  await page.route('**/api/actions/loadNotes', async (route) => {
    await fulfillJson(route, taskNotes);
  });
  await page.context().route('https://courses.example.edu/**', async (route) => {
    await route.fulfill({ contentType: 'text/html', body: '<title>Course homepage</title>' });
  });

  await page.goto('/#/courses/1');
  await page.getByRole('button', { name: 'Create Plan' }).click();
  await expect(page.getByRole('heading', { name: 'Create Study Plan' })).toBeVisible();

  await page.getByLabel(/paste modules or topics/i).fill('Architecture patterns\nTesting strategy');
  await page.getByRole('button', { name: 'Add topics' }).click();
  await expect(page.locator('input[value="Architecture patterns"]')).toBeVisible();
  await page.getByRole('button', { name: 'Create study plan' }).click();

  await expect(page).toHaveURL(/#\/courses\/1\/study-plans\/1$/);
  await expect(page.getByRole('heading', { name: /Final exam/i })).toBeVisible();
  const task = page.getByRole('button', { name: 'Complete Learn & review: Architecture patterns' });
  await expect(task).toBeVisible();
  await task.click();
  await expect.poll(() => taskCompleted).toBe(true);

  await page.getByRole('button', { name: /open notes for learn & review: architecture patterns/i }).click();
  await expect(page).toHaveURL(/#\/notes\/99$/);
  await expect(page.getByPlaceholder('Note title')).toHaveValue('Architecture patterns');
  await expect(page.locator('.ProseMirror ul li')).toHaveCount(1);

  await page.goBack();
  await page.getByRole('button', { name: /open notes for practice: architecture patterns/i }).click();
  await expect(page).toHaveURL(/#\/notes\/99$/);

  await page.goBack();
  await page.getByRole('button', { name: /open notes for recall: architecture patterns/i }).click();
  await expect(page).toHaveURL(/#\/notes\/99$/);
  expect(taskNoteRequests).toBe(3);
  expect(taskNoteIds).toEqual(['1', '2', '3']);

  await page.goBack();
  const popupPromise = page.waitForEvent('popup');
  await page.getByRole('button', { name: /open comp30870 homepage/i }).first().click();
  const popup = await popupPromise;
  await expect(popup).toHaveURL('https://courses.example.edu/comp30870');
});
