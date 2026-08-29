// Fills the offline cache up front.
//
// Without this the cache is only warmed by navigation, so enabling offline
// access and then losing connection leaves every page you had not happened to
// visit completely empty. This walks the same read paths the pages use, so
// everything lands under the keys those pages will ask for.

import { callAction } from '@/app/lib/api/client';
import { mapCourse } from '@/app/data/mappers';
import { addIsoDays } from '@/app/data/calendarUtils';
import {
  getStudyPlanDashboard,
  getStudyPlanDefinition,
  getStudyPlanRecoveryStatus,
  getStudyPlanTasks,
  listStudyPlanSummaries,
} from '@/app/lib/studyPlans/client';
import { isBrowserOffline, isOfflineModeActive } from '@/app/lib/offline/runtime';

const CORE_LOAD_ACTIONS = [
  'loadCourses',
  'loadAssignments',
  'loadClassSessions',
  'loadEvents',
  'loadNotes',
  'loadCourseLinks',
];

async function ignoreFailure(work: Promise<unknown>): Promise<void> {
  try {
    await work;
  } catch {
    // A partial cache beats no cache; the next prefetch will pick up the rest.
  }
}

async function prefetchStudyPlans(userId: string, courseIds: string[]): Promise<void> {
  const summaries = await listStudyPlanSummaries(undefined, userId).catch(() => []);

  await Promise.all([
    ignoreFailure(getStudyPlanDashboard(userId)),
    // CoursePage asks per course, which is a different cache key from the full list.
    ...courseIds.map((courseId) => ignoreFailure(listStudyPlanSummaries(courseId, userId))),
  ]);

  const active = summaries.filter((plan) => !plan.archived);
  await Promise.all(
    active.map(async (plan) => {
      const end = plan.targetDate || plan.examDate;
      await Promise.all([
        ignoreFailure(getStudyPlanDefinition(plan.id, userId)),
        ignoreFailure(getStudyPlanRecoveryStatus(plan.id, userId)),
        // The whole plan range in one go, so any visible window is covered.
        ignoreFailure(getStudyPlanTasks(plan.id, plan.startDate, addIsoDays(end, 1), userId)),
      ]);
    })
  );
}

/** Warms every read the app makes. Never throws. */
export async function prefetchOfflineData(userId: string): Promise<void> {
  if (!isOfflineModeActive() || isBrowserOffline()) return;

  const results = await Promise.all(
    CORE_LOAD_ACTIONS.map((name) =>
      callAction<unknown[]>(name, { userId })
        .then((rows) => (name === 'loadCourses' ? rows : []))
        .catch(() => [])
    )
  );

  const courseIds = (results[0] ?? []).map((row) => mapCourse(row as Parameters<typeof mapCourse>[0]).id);
  await ignoreFailure(prefetchStudyPlans(userId, courseIds));
}
