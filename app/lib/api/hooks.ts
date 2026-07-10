import { useCallback, useEffect, useState } from 'react';
import { callAction } from '@/app/lib/api/client';

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
        return await callAction<TResult>(name, params);
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
