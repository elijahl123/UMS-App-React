import { useCallback, useEffect, useState } from 'react';
import { BellOff, BellRing, CheckCircle2, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { getBrowserTimeZone } from '@/app/data/assignmentDates';
import type { NotificationPreferences } from '@/app/data/types';
import { getNotificationPreferences, updateNotificationPreferences } from '@/app/lib/notifications/client';
import {
  getNotificationPermissionStatus,
  getNativePendingNotificationCount,
  requestNotificationPermission,
  syncAndScheduleNotifications,
  type NotificationPermissionStatus,
} from '@/app/lib/notifications/scheduler';
import { NotificationInbox } from '@/app/components/NotificationCenter';
import { requestError } from './shared';

function notificationPreferencePayload(preferences: NotificationPreferences): Omit<NotificationPreferences, 'userId'> {
  return {
    enabled: preferences.enabled,
    assignment24hEnabled: preferences.assignment24hEnabled,
    assignment1hEnabled: preferences.assignment1hEnabled,
    event10mEnabled: preferences.event10mEnabled,
    class10mEnabled: preferences.class10mEnabled,
    quietHoursEnabled: preferences.quietHoursEnabled,
    quietHoursStart: preferences.quietHoursStart,
    quietHoursEnd: preferences.quietHoursEnd,
    timeZone: preferences.timeZone,
  };
}

function NotificationsSection() {
  const [notificationPreferences, setNotificationPreferences] = useState<NotificationPreferences | null>(null);
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermissionStatus>('unsupported');
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const [notificationsSubmitting, setNotificationsSubmitting] = useState(false);
  const [notificationsError, setNotificationsError] = useState<string | null>(null);
  const [notificationsSuccess, setNotificationsSuccess] = useState<string | null>(null);
  const [nativePendingNotificationCount, setNativePendingNotificationCount] = useState<number | null>(null);

  const loadNotificationSettings = useCallback(async () => {
    setNotificationsLoading(true);
    setNotificationsError(null);
    try {
      const [preferencesResult, permissionResult] = await Promise.allSettled([
        getNotificationPreferences(),
        getNotificationPermissionStatus(),
      ]);

      if (preferencesResult.status === 'fulfilled') {
        const browserTimeZone = getBrowserTimeZone();
        setNotificationPreferences({
          ...preferencesResult.value,
          timeZone: preferencesResult.value.timeZone === 'UTC' ? browserTimeZone : preferencesResult.value.timeZone,
        });
        setNotificationsError(
          permissionResult.status === 'rejected'
            ? 'Notification settings loaded, but device permission status is unavailable.'
            : null
        );
      } else {
        setNotificationPreferences(null);
        setNotificationsError(requestError(preferencesResult.reason, 'Unable to load notification settings.'));
      }

      if (permissionResult.status === 'fulfilled') {
        setNotificationPermission(permissionResult.value);
      } else {
        setNotificationPermission('unsupported');
      }

      setNativePendingNotificationCount(await getNativePendingNotificationCount().catch(() => null));
    } finally {
      setNotificationsLoading(false);
    }
  }, []);

  useEffect(() => {
    let isMounted = true;
    loadNotificationSettings().catch((err) => {
      if (!isMounted) return;
      setNotificationsError(requestError(err, 'Unable to load notification settings.'));
      setNotificationsLoading(false);
    });

    return () => {
      isMounted = false;
    };
  }, [loadNotificationSettings]);

  const saveNotificationPreferences = async (next: NotificationPreferences, successMessage = 'Notification settings saved.') => {
    setNotificationsSubmitting(true);
    setNotificationsError(null);
    setNotificationsSuccess(null);
    try {
      const saved = await updateNotificationPreferences(notificationPreferencePayload(next));
      setNotificationPreferences(saved);
      setNotificationsSuccess(successMessage);
      await syncAndScheduleNotifications();
      setNativePendingNotificationCount(await getNativePendingNotificationCount().catch(() => null));
      window.dispatchEvent(new CustomEvent('ums-notifications-changed'));
    } catch (err) {
      setNotificationsError(requestError(err, 'Unable to save notification settings.'));
    } finally {
      setNotificationsSubmitting(false);
    }
  };

  const handleNotificationsEnabledChange = async (enabled: boolean) => {
    if (!notificationPreferences) return;

    let permission = notificationPermission;
    if (enabled && permission !== 'granted') {
      permission = await requestNotificationPermission();
      setNotificationPermission(permission);
    }

    await saveNotificationPreferences(
      { ...notificationPreferences, enabled, timeZone: notificationPreferences.timeZone || getBrowserTimeZone() },
      enabled && permission !== 'granted'
        ? 'In-app reminders are enabled. Device notifications need permission.'
        : enabled
          ? 'Notifications enabled.'
          : 'Notifications disabled.'
    );
  };

  const handleNotificationRuleChange = async (
    key: 'assignment24hEnabled' | 'assignment1hEnabled' | 'event10mEnabled' | 'class10mEnabled',
    value: boolean
  ) => {
    if (!notificationPreferences) return;
    await saveNotificationPreferences({ ...notificationPreferences, [key]: value });
  };

  const handleQuietHoursChange = async (changes: Partial<NotificationPreferences>) => {
    if (!notificationPreferences) return;
    await saveNotificationPreferences({ ...notificationPreferences, ...changes });
  };

  const notificationPermissionLabel =
    notificationPermission === 'granted'
      ? 'Device notifications allowed'
      : notificationPermission === 'denied'
        ? 'Device notifications blocked'
        : notificationPermission === 'prompt'
          ? 'Device permission not requested'
          : 'Device notifications unavailable';

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          {notificationPreferences?.enabled ? (
            <BellRing className="h-5 w-5 text-primary" />
          ) : (
            <BellOff className="h-5 w-5 text-primary" />
          )}
          <CardTitle>Notifications</CardTitle>
        </div>
        <CardDescription>Control assignment, event, and class reminders.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {notificationsLoading && !notificationPreferences ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading notification settings...
          </div>
        ) : notificationPreferences ? (
          <>
            <div className="flex flex-col gap-3 rounded-md border p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-medium text-foreground">Reminders</p>
                <p className="text-sm text-muted-foreground">{notificationPermissionLabel}</p>
                {nativePendingNotificationCount !== null && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {nativePendingNotificationCount} reminder{nativePendingNotificationCount === 1 ? '' : 's'} scheduled on this device.
                  </p>
                )}
              </div>
              <Button
                type="button"
                variant={notificationPreferences.enabled ? 'outline' : 'default'}
                className="w-full gap-2 sm:w-auto"
                disabled={notificationsSubmitting}
                onClick={() => handleNotificationsEnabledChange(!notificationPreferences.enabled)}
              >
                {notificationsSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
                {notificationPreferences.enabled ? 'Turn off' : 'Turn on'}
              </Button>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex items-start gap-3 rounded-md border p-3 text-sm">
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4"
                  checked={notificationPreferences.assignment24hEnabled}
                  disabled={notificationsSubmitting}
                  onChange={(event) => handleNotificationRuleChange('assignment24hEnabled', event.target.checked)}
                />
                <span>
                  <span className="block font-medium text-foreground">Assignments: 24 hours</span>
                  <span className="text-muted-foreground">Only for assignments with a due time.</span>
                </span>
              </label>
              <label className="flex items-start gap-3 rounded-md border p-3 text-sm">
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4"
                  checked={notificationPreferences.assignment1hEnabled}
                  disabled={notificationsSubmitting}
                  onChange={(event) => handleNotificationRuleChange('assignment1hEnabled', event.target.checked)}
                />
                <span>
                  <span className="block font-medium text-foreground">Assignments: 1 hour</span>
                  <span className="text-muted-foreground">Only for assignments with a due time.</span>
                </span>
              </label>
              <label className="flex items-start gap-3 rounded-md border p-3 text-sm">
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4"
                  checked={notificationPreferences.event10mEnabled}
                  disabled={notificationsSubmitting}
                  onChange={(event) => handleNotificationRuleChange('event10mEnabled', event.target.checked)}
                />
                <span>
                  <span className="block font-medium text-foreground">Events: 10 minutes</span>
                  <span className="text-muted-foreground">Only for events with a time.</span>
                </span>
              </label>
              <label className="flex items-start gap-3 rounded-md border p-3 text-sm">
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4"
                  checked={notificationPreferences.class10mEnabled}
                  disabled={notificationsSubmitting}
                  onChange={(event) => handleNotificationRuleChange('class10mEnabled', event.target.checked)}
                />
                <span>
                  <span className="block font-medium text-foreground">Classes: 10 minutes</span>
                  <span className="text-muted-foreground">Generated from your weekly class schedule.</span>
                </span>
              </label>
            </div>

            <div className="grid gap-3 rounded-md border p-4 sm:grid-cols-[1fr_auto_auto] sm:items-end">
              <label className="flex items-start gap-3 text-sm sm:pb-2">
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4"
                  checked={notificationPreferences.quietHoursEnabled}
                  disabled={notificationsSubmitting}
                  onChange={(event) => handleQuietHoursChange({ quietHoursEnabled: event.target.checked })}
                />
                <span>
                  <span className="block font-medium text-foreground">Quiet hours</span>
                  <span className="text-muted-foreground">Skip reminders during this window.</span>
                </span>
              </label>
              <label className="text-sm">
                <span className="mb-1 block font-medium text-foreground">Start</span>
                <Input
                  type="time"
                  value={notificationPreferences.quietHoursStart ?? ''}
                  disabled={notificationsSubmitting || !notificationPreferences.quietHoursEnabled}
                  onChange={(event) => handleQuietHoursChange({ quietHoursStart: event.target.value || null })}
                />
              </label>
              <label className="text-sm">
                <span className="mb-1 block font-medium text-foreground">End</span>
                <Input
                  type="time"
                  value={notificationPreferences.quietHoursEnd ?? ''}
                  disabled={notificationsSubmitting || !notificationPreferences.quietHoursEnabled}
                  onChange={(event) => handleQuietHoursChange({ quietHoursEnd: event.target.value || null })}
                />
              </label>
            </div>

            <NotificationInbox className="md:hidden" title="Scheduled reminders" />

            {notificationsError && <p className="text-sm font-medium text-destructive">{notificationsError}</p>}
            {notificationsSuccess && (
              <p className="flex items-center gap-1.5 text-sm font-medium text-[color-mix(in_srgb,var(--course-emerald)_68%,var(--secondary-accent))]">
                <CheckCircle2 className="h-4 w-4" />
                {notificationsSuccess}
              </p>
            )}
          </>
        ) : (
          <div className="flex flex-col gap-3 rounded-md border border-destructive/30 bg-destructive/5 p-4">
            <p className="text-sm font-medium text-destructive">
              {notificationsError ?? 'Notification settings are unavailable.'}
            </p>
            <Button
              type="button"
              variant="outline"
              className="w-full gap-2 sm:w-auto"
              disabled={notificationsLoading}
              onClick={() => loadNotificationSettings()}
            >
              {notificationsLoading && <Loader2 className="h-4 w-4 animate-spin" />}
              Retry
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default NotificationsSection;
