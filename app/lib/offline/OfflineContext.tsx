import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useAuth } from '@/app/lib/auth/AuthContext';
import { offlineAdapter } from '@/app/lib/offline/adapter';
import { clearOfflineData, countMutations } from '@/app/lib/offline/db';
import {
  OFFLINE_QUEUE_EVENT,
  isBrowserOffline,
  setOfflineRuntime,
} from '@/app/lib/offline/runtime';
import {
  dismissSyncIssue,
  readLastSyncedAt,
  readSyncIssues,
  syncOfflineMutations,
  type SyncIssue,
} from '@/app/lib/offline/sync';

export const OFFLINE_STORAGE_KEY = 'ums.offlineSync';

export type OfflineSyncState = 'idle' | 'syncing';

interface OfflineContextValue {
  enabled: boolean;
  setEnabled: (next: boolean) => void;
  isOnline: boolean;
  pendingCount: number;
  syncState: OfflineSyncState;
  lastSyncedAt: string | null;
  syncIssues: SyncIssue[];
  syncNow: () => Promise<void>;
  dismissIssue: (id: string) => void;
}

const OfflineContext = createContext<OfflineContextValue | null>(null);

function readStoredPreference(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(OFFLINE_STORAGE_KEY) === 'on';
  } catch {
    return false;
  }
}

export function OfflineProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const userId = user?.id ?? null;

  const [enabled, setEnabledState] = useState(readStoredPreference);
  const [isOnline, setIsOnline] = useState(() => !isBrowserOffline());
  const [pendingCount, setPendingCount] = useState(0);
  const [syncState, setSyncState] = useState<OfflineSyncState>('idle');
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [syncIssues, setSyncIssues] = useState<SyncIssue[]>([]);
  const previousUserIdRef = useRef<string | null>(null);

  // Published during render, not in an effect: child effects run before the
  // provider's, and the first `useLoadAction` fetch has to see the cache.
  setOfflineRuntime({ enabled, userId, adapter: offlineAdapter });

  const refreshStatus = useCallback(async () => {
    if (!userId || !enabled) {
      setPendingCount(0);
      setSyncIssues([]);
      setLastSyncedAt(null);
      return;
    }
    const [pending, issues, syncedAt] = await Promise.all([
      countMutations(userId),
      readSyncIssues(userId),
      readLastSyncedAt(userId),
    ]);
    setPendingCount(pending);
    setSyncIssues(issues);
    setLastSyncedAt(syncedAt);
  }, [enabled, userId]);

  const syncNow = useCallback(async () => {
    if (!userId || !enabled || isBrowserOffline()) {
      await refreshStatus();
      return;
    }
    setSyncState('syncing');
    try {
      await syncOfflineMutations();
    } finally {
      setSyncState('idle');
      await refreshStatus();
    }
  }, [enabled, refreshStatus, userId]);

  const setEnabled = useCallback(
    (next: boolean) => {
      setEnabledState(next);
      try {
        window.localStorage.setItem(OFFLINE_STORAGE_KEY, next ? 'on' : 'off');
      } catch {
        // The preference still applies for this session when storage is unavailable.
      }
      if (!next) {
        void clearOfflineData(userId ?? undefined).then(() => {
          setPendingCount(0);
          setSyncIssues([]);
          setLastSyncedAt(null);
        });
      }
    },
    [userId]
  );

  useEffect(() => {
    const previousUserId = previousUserIdRef.current;
    previousUserIdRef.current = userId;
    if (previousUserId && previousUserId !== userId) {
      void clearOfflineData(previousUserId);
    }
  }, [userId]);

  useEffect(() => {
    void refreshStatus();
  }, [refreshStatus]);

  useEffect(() => {
    if (!enabled || !userId) return;
    void syncNow();
  }, [enabled, userId, syncNow]);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      void syncNow();
    };
    const handleOffline = () => setIsOnline(false);
    const handleQueueChanged = () => void refreshStatus();
    const handleVisibility = () => {
      if (document.visibilityState === 'visible' && !isBrowserOffline()) void syncNow();
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener(OFFLINE_QUEUE_EVENT, handleQueueChanged);
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener(OFFLINE_QUEUE_EVENT, handleQueueChanged);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [refreshStatus, syncNow]);

  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.key !== OFFLINE_STORAGE_KEY) return;
      setEnabledState(event.newValue === 'on');
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  const dismissIssue = useCallback(
    (id: string) => {
      if (!userId) return;
      void dismissSyncIssue(userId, id).then(setSyncIssues);
    },
    [userId]
  );

  const value = useMemo(
    () => ({
      enabled,
      setEnabled,
      isOnline,
      pendingCount,
      syncState,
      lastSyncedAt,
      syncIssues,
      syncNow,
      dismissIssue,
    }),
    [dismissIssue, enabled, isOnline, lastSyncedAt, pendingCount, setEnabled, syncIssues, syncNow, syncState]
  );

  return <OfflineContext.Provider value={value}>{children}</OfflineContext.Provider>;
}

// State and hook share one module so consumers get the same context instance.
// eslint-disable-next-line react-refresh/only-export-components
export function useOffline(): OfflineContextValue {
  const context = useContext(OfflineContext);
  if (!context) throw new Error('useOffline must be used within an OfflineProvider.');
  return context;
}
