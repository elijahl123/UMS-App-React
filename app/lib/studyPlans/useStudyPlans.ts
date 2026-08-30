import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import type {
  StudyCalendarData,
  StudyDashboardData,
  StudyPlanDefinition,
  StudyPlanSummary,
  StudyRecoveryStatus,
  StudyTask,
} from '@/app/data/types';
import {
  STUDY_PLANS_REVALIDATED_EVENT,
  getStudyPlanCalendar,
  getStudyPlanDashboard,
  getStudyPlanDefinition,
  getStudyPlanTasks,
  getStudyPlanRecoveryStatus,
  listStudyPlanSummaries,
} from './client';

type ResourceResult<T> = [T, boolean, unknown, () => Promise<void>, Dispatch<SetStateAction<T>>];

function useStudyResource<T>(
  initialValue: T,
  enabled: boolean,
  load: () => Promise<T>
): ResourceResult<T> {
  const [data, setData] = useState<T>(initialValue);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<unknown>(null);
  const initialRef = useRef(initialValue);
  const requestRef = useRef(0);
  initialRef.current = initialValue;

  const reload = useCallback(async () => {
    const requestId = requestRef.current + 1;
    requestRef.current = requestId;
    if (!enabled) {
      setData(initialRef.current);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await load();
      if (requestRef.current === requestId) setData(result);
    } catch (err) {
      if (requestRef.current === requestId) setError(err);
    } finally {
      if (requestRef.current === requestId) setLoading(false);
    }
  }, [enabled, load]);

  useEffect(() => {
    void reload();
  }, [reload]);

  // Reads are served from the saved copy first, so pick up the fresher answer
  // when a background refresh finds one.
  useEffect(() => {
    if (!enabled) return;
    const handleRevalidated = () => void reload();
    window.addEventListener(STUDY_PLANS_REVALIDATED_EVENT, handleRevalidated);
    return () => window.removeEventListener(STUDY_PLANS_REVALIDATED_EVENT, handleRevalidated);
  }, [enabled, reload]);

  return [data, loading, error, reload, setData];
}

const EMPTY_DASHBOARD: StudyDashboardData = {
  plans: [],
  tasks: [],
  activePlanCount: 0,
  overduePlanCount: 0,
  recoveryPlanCount: 0,
  urgentPlan: null,
  nextStudyDate: null,
};

export function useStudyPlanRecoveryStatus(
  planId?: string,
  userId?: string
): ResourceResult<StudyRecoveryStatus | null> {
  const load = useCallback(
    () => planId ? getStudyPlanRecoveryStatus(planId, userId) : Promise.resolve(null),
    [planId, userId]
  );
  return useStudyResource(null, Boolean(planId && userId), load);
}

export function useStudyPlanSummaries(courseId?: string, userId?: string): ResourceResult<StudyPlanSummary[]> {
  const load = useCallback(() => listStudyPlanSummaries(courseId, userId), [courseId, userId]);
  return useStudyResource([], Boolean(userId), load);
}

export function useStudyPlanDefinition(
  planId?: string,
  userId?: string
): ResourceResult<StudyPlanDefinition | null> {
  const load = useCallback(
    () => planId ? getStudyPlanDefinition(planId, userId) : Promise.resolve(null),
    [planId, userId]
  );
  return useStudyResource(null, Boolean(planId && userId), load);
}

export function useStudyPlanTasks(
  planId: string | undefined,
  from: string,
  to: string,
  userId?: string
): ResourceResult<StudyTask[]> {
  const load = useCallback(
    async () => planId ? (await getStudyPlanTasks(planId, from, to, userId)).tasks : [],
    [from, planId, to, userId]
  );
  return useStudyResource([], Boolean(planId && from && to && userId), load);
}

export function useStudyPlanDashboard(userId?: string): ResourceResult<StudyDashboardData> {
  const load = useCallback(() => getStudyPlanDashboard(userId), [userId]);
  return useStudyResource(EMPTY_DASHBOARD, Boolean(userId), load);
}

export function useStudyPlanCalendar(
  from: string,
  to: string,
  userId?: string
): ResourceResult<StudyCalendarData> {
  const empty = useCallback(
    (): StudyCalendarData => ({ from, to, plans: [], tasks: [] }),
    [from, to]
  );
  const load = useCallback(() => getStudyPlanCalendar(from, to, userId), [from, to, userId]);
  return useStudyResource(empty(), Boolean(from && to && userId), load);
}
