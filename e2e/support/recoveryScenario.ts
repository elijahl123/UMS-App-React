import { expect, type Page, type Route } from '@playwright/test';
import { mockAuthenticatedApp } from './appMocks';

async function fulfillJson(route: Route, payload: unknown) {
  await route.fulfill({ contentType: 'application/json', body: JSON.stringify(payload) });
}

export async function runStudyPlanRecoveryScenario(page: Page, visualPrefix?: string) {
  if (process.env.RECOVERY_VISUAL_DARK) {
    await page.addInitScript(() => window.localStorage.setItem('ums.theme', 'dark'));
  }
  await mockAuthenticatedApp(page);
  let recovered = false;
  let undone = false;
  const plan = () => ({
    id: 1,
    course_id: 1,
    course_code: 'MATH101',
    course_name: 'Calculus I',
    course_color: 'course-sapphire',
    course_homepage_url: null,
    exam_type: 'final',
    exam_date: '2099-09-01',
    target_type: 'exam',
    target_title: 'Final exam',
    target_date: '2099-09-01',
    target_time: null,
    target_assignment_id: null,
    estimated_minutes: null,
    daily_cap_minutes: null,
    scheduler_version: 1,
    scheduler_explanation: null,
    unscheduled_minutes: 0,
    partial_plan_acknowledged: false,
    start_date: '2026-08-01',
    timezone: 'America/Los_Angeles',
    archived: false,
    created_at: '2026-08-01T00:00:00.000Z',
    updated_at: '2026-08-01T00:00:00.000Z',
    total_tasks: 1,
    completed_tasks: 0,
    overdue_tasks: recovered && !undone ? 0 : 1,
    over_capacity_minutes: 0,
    over_capacity_days: 0,
    recovery_needed: !recovered || undone,
    study_days_left: 1,
    active_topics: 1,
    next_study_date: recovered && !undone ? '2026-08-24' : null,
    next_task_title: 'Learn & review: Limits',
  });
  const preview = {
    planId: '1',
    stateToken: 'a'.repeat(64),
    needsRecovery: true,
    canConfirm: false,
    reasons: ['overdue'],
    requiredOmissionMinutes: 60,
    shortfallMinutes: 60,
    selectedOmissionMinutes: 0,
    additionalMinutesPerDay: 0,
    effectiveOmittedGroupIds: [],
    recommendedOmittedGroupIds: ['1:practice'],
    omissionGroups: [{
      id: '1:practice', topicId: '1', phase: 'practice',
      title: 'Practice: Limits', minutes: 60, cascadesTo: ['1:recall'],
    }],
    capacityChanges: [],
    unresolvedTasks: [],
    dayChanges: [{ date: '2026-08-24', capacityMinutes: 60, beforeMinutes: 0, afterMinutes: 60 }],
    taskChanges: [{
      groupId: '1:learn', title: 'Learn & review: Limits', minutes: 60,
      fromDates: ['2026-08-01'], toDates: ['2026-08-24'], status: 'moved',
    }],
    totals: {
      before: { scheduledMinutes: 60, overdueMinutes: 60, overCapacityMinutes: 0, unscheduledMinutes: 0 },
      after: { scheduledMinutes: 60, overdueMinutes: 0, overCapacityMinutes: 0, unscheduledMinutes: 60 },
      movedMinutes: 60,
    },
  };

  await page.route('**/api/study-plans**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() === 'POST' && url.pathname.endsWith('/recovery/preview')) {
      const input = request.postDataJSON() as { additionalMinutesPerDay?: number; omittedGroupIds?: string[] };
      if ((input.additionalMinutesPerDay ?? 0) > 0) {
        await fulfillJson(route, {
          ...preview,
          canConfirm: true,
          requiredOmissionMinutes: 0,
          shortfallMinutes: 0,
          additionalMinutesPerDay: input.additionalMinutesPerDay,
          capacityChanges: [
            { date: '2026-08-24', beforeMinutes: 60, afterMinutes: 75, addedMinutes: 15 },
            { date: '2026-08-25', beforeMinutes: 60, afterMinutes: 75, addedMinutes: 15 },
            { date: '2026-08-26', beforeMinutes: 60, afterMinutes: 75, addedMinutes: 15 },
            { date: '2026-08-27', beforeMinutes: 60, afterMinutes: 75, addedMinutes: 15 },
          ],
          totals: { ...preview.totals, after: { ...preview.totals.after, scheduledMinutes: 120, unscheduledMinutes: 0 } },
        });
      } else if ((input.omittedGroupIds?.length ?? 0) > 0) {
        await fulfillJson(route, {
          ...preview,
          canConfirm: true,
          shortfallMinutes: 0,
          selectedOmissionMinutes: 60,
          effectiveOmittedGroupIds: ['1:practice', '1:recall'],
        });
      } else {
        await fulfillJson(route, preview);
      }
      return;
    }
    if (request.method() === 'POST' && url.pathname.endsWith('/recovery/confirm')) {
      recovered = true;
      undone = false;
      await fulfillJson(route, { planId: '1', recovered: true, revisionId: 'revision-1', preview });
      return;
    }
    if (request.method() === 'POST' && url.pathname.endsWith('/recovery/undo')) {
      undone = true;
      await fulfillJson(route, { planId: '1', undone: true, revisionId: 'revision-1' });
      return;
    }
    if (request.method() === 'GET' && url.pathname.endsWith('/recovery')) {
      await fulfillJson(route, {
        planId: '1', needsRecovery: !recovered || undone, reasons: !recovered || undone ? ['overdue'] : [],
        overdueMinutes: !recovered || undone ? 60 : 0, overCapacityMinutes: 0, unscheduledMinutes: 0,
        unresolvedTasks: [],
        latestRevision: recovered && !undone
          ? { id: 'revision-1', appliedAt: '2026-08-23T12:00:00.000Z', undoAvailable: true }
          : null,
      });
      return;
    }
    if (request.method() === 'GET' && /\/study-plans\/1\/tasks$/.test(url.pathname)) {
      await fulfillJson(route, { from: url.searchParams.get('from'), to: url.searchParams.get('to'), tasks: [] });
      return;
    }
    if (request.method() === 'GET' && /\/study-plans\/1$/.test(url.pathname)) {
      await fulfillJson(route, {
        plan: plan(),
        availability: Array.from({ length: 7 }, (_, weekday) => ({ plan_id: 1, weekday, minutes: 60 })),
        topics: [{ id: 1, plan_id: 1, title: 'Limits', difficulty: 'light', position: 0, active: true, total_tasks: 1, completed_tasks: 0 }],
      });
      return;
    }
    await fulfillJson(route, { plans: [plan()] });
  });

  await page.goto('/#/courses/1/study-plans/1');
  await expect(page.getByText('This plan needs replanning')).toBeVisible();
  await page.getByRole('button', { name: 'Start Recovery Mode' }).click();
  await expect(page.getByRole('heading', { name: 'Recovery Mode' })).toBeVisible();
  await expect(page.getByRole('dialog').getByText('1h', { exact: true }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Leave the remaining work unscheduled' })).toBeVisible();
  if (visualPrefix) {
    await page.waitForTimeout(250);
    await page.screenshot({ path: `${visualPrefix}-shortfall.png`, fullPage: true });
  }
  await page.getByRole('button', { name: 'Add time needed' }).click();
  await expect(page.getByText('1h added across 4 study days')).toBeVisible();
  if (visualPrefix) {
    await page.waitForTimeout(250);
    await page.screenshot({ path: `${visualPrefix}-capacity.png`, fullPage: true });
  }
  await page.getByRole('button', { name: 'Confirm recovery' }).click();
  await expect(page.getByText('Recovery applied')).toBeVisible();
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.getByText('This plan needs replanning')).toBeVisible();
}
