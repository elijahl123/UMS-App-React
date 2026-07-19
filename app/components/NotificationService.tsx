import { useEffect, useRef } from 'react';
import { App as CapacitorApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { useAuth } from '@/app/lib/auth/AuthContext';
import { syncAndScheduleNotifications } from '@/app/lib/notifications/scheduler';

const RESYNC_INTERVAL_MS = 5 * 60 * 1000;

function NotificationService() {
  const { user, isLoading } = useAuth();
  const syncingRef = useRef(false);

  useEffect(() => {
    if (isLoading || !user) return;

    let cancelled = false;

    const sync = async () => {
      if (cancelled || syncingRef.current) return;
      syncingRef.current = true;
      try {
        await syncAndScheduleNotifications();
      } catch (err) {
        console.warn('[Notifications] Unable to sync schedules:', err);
      } finally {
        syncingRef.current = false;
      }
    };

    void sync();
    const intervalId = window.setInterval(() => void sync(), RESYNC_INTERVAL_MS);
    const handleChanged = () => void sync();
    const handleFocus = () => void sync();
    const handleOnline = () => void sync();

    window.addEventListener('ums-notifications-changed', handleChanged);
    window.addEventListener('focus', handleFocus);
    window.addEventListener('online', handleOnline);

    let removeAppStateListener: (() => void) | undefined;
    if (Capacitor.isNativePlatform()) {
      void CapacitorApp.addListener('appStateChange', ({ isActive }) => {
        if (isActive) {
          void sync();
        }
      })
        .then((listener) => {
          removeAppStateListener = () => {
            void listener.remove();
          };
        })
        .catch((err) => {
          console.warn('[Notifications] Unable to register app state listener:', err);
        });
    }

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      window.removeEventListener('ums-notifications-changed', handleChanged);
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('online', handleOnline);
      removeAppStateListener?.();
    };
  }, [isLoading, user]);

  return null;
}

export default NotificationService;
