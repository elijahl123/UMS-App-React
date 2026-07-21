import { useCallback, useEffect, useState } from 'react';
import { callAction } from '@/app/lib/api/client';

const MUTATION_EVENT = 'ums-api-action-mutated';
const invalidatesByMutation: Record<string, string[]> = {
  createCourse: ['loadCourses'],
  updateCourse: ['loadCourses'],
  deleteCourse: ['loadCourses'],
  createAssignment: ['loadAssignments'],
  updateAssignment: ['loadAssignments'],
  deleteAssignment: ['loadAssignments'],
  createClassSession: ['loadClassSessions'],
  updateClassSession: ['loadClassSessions'],
  deleteClassSession: ['loadClassSessions'],
  createEvent: ['loadEvents'],
  updateEvent: ['loadEvents'],
  deleteEvent: ['loadEvents'],
  createNote: ['loadNotes'],
  updateNote: ['loadNotes'],
  deleteNote: ['loadNotes'],
};

const notificationMutationActions = new Set([
  'createAssignment',
  'updateAssignment',
  'deleteAssignment',
  'createClassSession',
  'updateClassSession',
  'deleteClassSession',
  'createEvent',
  'updateEvent',
  'deleteEvent',
]);

export function useLoadAction<T = unknown[]>(
  name: string,
  initialValue: T,
  params?: Record<string, unknown>,
  options?: { enabled?: boolean }
): [T, boolean, unknown, () => Promise<void>] {
  const [data, setData] = useState<T>(initialValue);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const paramsKey = JSON.stringify(params ?? {});

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await callAction<T>(name, params);
      setData(result);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, paramsKey]);

  useEffect(() => {
    const hasMissingUser = Object.prototype.hasOwnProperty.call(params ?? {}, 'userId') && !params?.userId;
    if (options?.enabled === false || hasMissingUser) {
      setData(initialValue);
      setLoading(false);
      return;
    }
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reload, options?.enabled]);

  useEffect(() => {
    const handleMutation = (event: Event) => {
      const mutationName = (event as CustomEvent<{ name?: string }>).detail?.name;
      if (mutationName && invalidatesByMutation[mutationName]?.includes(name)) {
        void reload();
      }
    };

    window.addEventListener(MUTATION_EVENT, handleMutation);
    return () => window.removeEventListener(MUTATION_EVENT, handleMutation);
  }, [name, reload]);

  return [data, loading, error, reload];
}

export function useMutateAction<TParams extends Record<string, unknown> = Record<string, unknown>, TResult = unknown>(
  name: string
): [(params?: TParams) => Promise<TResult>, boolean, unknown] {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const mutate = useCallback(
    async (params?: TParams) => {
      setLoading(true);
      setError(null);
      try {
        const result = await callAction<TResult>(name, params);
        window.dispatchEvent(new CustomEvent(MUTATION_EVENT, { detail: { name } }));
        if (notificationMutationActions.has(name)) {
          window.dispatchEvent(new CustomEvent('ums-notifications-changed'));
        }
        return result;
      } catch (err) {
        setError(err);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [name]
  );

  return [mutate, loading, error];
}
