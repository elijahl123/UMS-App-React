import { Capacitor } from '@capacitor/core';
import type { NotificationInstance } from '@/app/data/types';
import { markNotificationRead, syncNotificationInstances } from '@/app/lib/notifications/client';

const SCHEDULED_IDS_KEY = 'ums_scheduled_notification_ids';
const WEB_DELIVERED_IDS_KEY = 'ums_web_delivered_notification_ids';
const MAX_WEB_TIMEOUT_MS = 2 ** 31 - 1;
const RECENT_WEB_DELIVERY_WINDOW_MS = 10 * 60 * 1000;
const REMINDERS_CHANNEL_ID = 'ums-reminders';
const NATIVE_NOTIFICATION_TIMEOUT_MS = 2500;

const webTimers = new Map<string, number>();
let nativeListenersRegistered = false;
let nativeNotificationsUnavailable = false;

export type NotificationPermissionStatus = 'granted' | 'denied' | 'prompt' | 'unsupported';

type NativeLocalNotifications = {
  plugin: typeof import('@capacitor/local-notifications')['LocalNotifications'];
};

function futureInstances(instances: NotificationInstance[], now = new Date()) {
  return instances.filter((instance) => !instance.dismissedAt && new Date(instance.fireAt) > now);
}

function getStoredScheduledIds(): number[] {
  try {
    return JSON.parse(localStorage.getItem(SCHEDULED_IDS_KEY) ?? '[]');
  } catch {
    return [];
  }
}

function setStoredScheduledIds(ids: number[]) {
  localStorage.setItem(SCHEDULED_IDS_KEY, JSON.stringify(ids));
}

function getWebDeliveredIds(): string[] {
  try {
    return JSON.parse(localStorage.getItem(WEB_DELIVERED_IDS_KEY) ?? '[]');
  } catch {
    return [];
  }
}

function setWebDeliveredIds(ids: string[]) {
  localStorage.setItem(WEB_DELIVERED_IDS_KEY, JSON.stringify(ids.slice(-250)));
}

function rememberWebDelivered(id: string) {
  const ids = getWebDeliveredIds();
  if (ids.includes(id)) return;
  setWebDeliveredIds([...ids, id]);
}

async function nativeLocalNotifications(): Promise<NativeLocalNotifications | null> {
  if (!Capacitor.isNativePlatform() || nativeNotificationsUnavailable) return null;
  if (!Capacitor.isPluginAvailable('LocalNotifications')) {
    nativeNotificationsUnavailable = true;
    console.warn('[Notifications] Native local notifications plugin is not registered in this app build.');
    return null;
  }

  try {
    const module = await import('@capacitor/local-notifications');
    return { plugin: module.LocalNotifications };
  } catch {
    return null;
  }
}

function isNativeUnimplementedError(err: unknown) {
  const code = typeof err === 'object' && err !== null && 'code' in err ? String((err as { code?: unknown }).code) : '';
  const message =
    typeof err === 'object' && err !== null && 'message' in err
      ? String((err as { message?: unknown }).message)
      : String(err);

  return code === 'UNIMPLEMENTED' || /unimplemented|not implemented/i.test(message);
}

async function nativeNotificationCall<T>(label: string, operation: () => Promise<T>, fallback: T): Promise<T> {
  if (nativeNotificationsUnavailable) return fallback;

  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.resolve().then(operation),
      new Promise<T>((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(new Error(`Native local notifications ${label} timed out.`));
        }, NATIVE_NOTIFICATION_TIMEOUT_MS);
      }),
    ]);
  } catch (err) {
    if (isNativeUnimplementedError(err)) {
      nativeNotificationsUnavailable = true;
    }
    console.warn(`[Notifications] Native local notifications ${label} unavailable:`, err);
    return fallback;
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

export async function getNativePendingNotificationCount(): Promise<number | null> {
  const native = await nativeLocalNotifications();
  if (!native) return null;

  return nativeNotificationCall('pending count', async () => {
    const pending = await native.plugin.getPending();
    return pending.notifications.length;
  }, null);
}

async function ensureNativeIntegration(native: Awaited<ReturnType<typeof nativeLocalNotifications>>) {
  if (!native) return;

  if (Capacitor.getPlatform() === 'android') {
    await nativeNotificationCall(
      'channel setup',
      () =>
        native.plugin.createChannel({
          id: REMINDERS_CHANNEL_ID,
          name: 'Reminders',
          description: 'Assignments, classes, and calendar event reminders.',
          importance: 4,
          visibility: 1,
          vibration: true,
          lights: true,
          lightColor: '#2563EB',
        }),
      undefined
    );
  }

  if (nativeListenersRegistered) return;
  nativeListenersRegistered = true;

  const actionListener = await nativeNotificationCall(
    'action listener',
    () =>
      native.plugin.addListener('localNotificationActionPerformed', (action) => {
        const notificationInstanceId = action.notification.extra?.notificationInstanceId;
        if (!notificationInstanceId) return;

        void markNotificationRead(String(notificationInstanceId)).finally(() => {
          window.dispatchEvent(new CustomEvent('ums-notifications-changed'));
        });
      }),
    null
  );

  const receivedListener = await nativeNotificationCall(
    'received listener',
    () =>
      native.plugin.addListener('localNotificationReceived', () => {
        window.dispatchEvent(new CustomEvent('ums-notifications-changed'));
      }),
    null
  );

  if (!actionListener || !receivedListener) {
    nativeListenersRegistered = false;
  }
}

export async function getNotificationPermissionStatus(): Promise<NotificationPermissionStatus> {
  const native = await nativeLocalNotifications();
  if (native) {
    return nativeNotificationCall('permission check', async () => {
      const permissions = await native.plugin.checkPermissions();
      return permissions.display === 'granted' ? 'granted' : permissions.display === 'denied' ? 'denied' : 'prompt';
    }, 'unsupported');
  }

  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }

  return Notification.permission === 'default' ? 'prompt' : Notification.permission;
}

export async function requestNotificationPermission(): Promise<NotificationPermissionStatus> {
  const native = await nativeLocalNotifications();
  if (native) {
    return nativeNotificationCall('permission request', async () => {
      const permissions = await native.plugin.requestPermissions();
      return permissions.display === 'granted' ? 'granted' : permissions.display === 'denied' ? 'denied' : 'prompt';
    }, 'unsupported');
  }

  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }

  const permission = await Notification.requestPermission();
  return permission === 'default' ? 'prompt' : permission;
}

async function scheduleNative(instances: NotificationInstance[]) {
  const native = await nativeLocalNotifications();
  if (!native) return false;
  await ensureNativeIntegration(native);

  const permissions = await nativeNotificationCall('permission check', () => native.plugin.checkPermissions(), null);
  if (!permissions) {
    return true;
  }
  if (permissions.display !== 'granted') {
    return true;
  }

  const previousIds = getStoredScheduledIds();
  if (previousIds.length > 0) {
    await nativeNotificationCall(
      'cancel',
      () => native.plugin.cancel({ notifications: previousIds.map((id) => ({ id })) }),
      undefined
    );
  }

  const future = futureInstances(instances);
  if (future.length === 0) {
    setStoredScheduledIds([]);
    return true;
  }

  const scheduled = await nativeNotificationCall(
    'schedule',
    () =>
      native.plugin.schedule({
        notifications: future.map((instance) => ({
          id: instance.localNotificationId,
          title: instance.title,
          body: instance.body,
          largeBody: instance.body,
          schedule: { at: new Date(instance.fireAt), allowWhileIdle: true },
          channelId: REMINDERS_CHANNEL_ID,
          group: 'ums-reminders',
          autoCancel: true,
          threadIdentifier: 'ums-reminders',
          extra: { notificationInstanceId: instance.id },
        })),
      }).then(() => true),
    false
  );
  if (!scheduled) return true;

  setStoredScheduledIds(future.map((instance) => instance.localNotificationId));
  return true;
}

async function showWebNotification(instance: NotificationInstance) {
  if (typeof window === 'undefined' || !('Notification' in window) || Notification.permission !== 'granted') {
    return;
  }

  rememberWebDelivered(instance.id);

  if ('serviceWorker' in navigator) {
    const registration = await Promise.race([
      navigator.serviceWorker.ready,
      new Promise<null>((resolve) => window.setTimeout(() => resolve(null), 1000)),
    ]).catch(() => null);

    if (registration) {
      await registration.showNotification(instance.title, {
        body: instance.body,
        tag: `ums-${instance.id}`,
        data: { notificationInstanceId: instance.id },
      });
      return;
    }
  }

  new Notification(instance.title, {
    body: instance.body,
    tag: `ums-${instance.id}`,
    data: { notificationInstanceId: instance.id },
  });
}

export async function showDueWebNotifications(instances: NotificationInstance[], now = new Date()) {
  if (Capacitor.isNativePlatform()) return;
  if (typeof window === 'undefined' || !('Notification' in window) || Notification.permission !== 'granted') return;

  const deliveredIds = new Set(getWebDeliveredIds());
  const earliestFireAt = now.getTime() - RECENT_WEB_DELIVERY_WINDOW_MS;
  for (const instance of instances) {
    const fireAt = new Date(instance.fireAt).getTime();
    if (instance.readAt || instance.dismissedAt || deliveredIds.has(instance.id)) continue;
    if (fireAt > now.getTime() || fireAt < earliestFireAt) continue;
    await showWebNotification(instance);
    deliveredIds.add(instance.id);
  }
}

function scheduleWeb(instances: NotificationInstance[]) {
  webTimers.forEach((timerId) => window.clearTimeout(timerId));
  webTimers.clear();

  if (typeof window === 'undefined' || !('Notification' in window) || Notification.permission !== 'granted') {
    return;
  }

  for (const instance of futureInstances(instances)) {
    const delay = new Date(instance.fireAt).getTime() - Date.now();
    if (delay <= 0 || delay > MAX_WEB_TIMEOUT_MS) continue;

    const timerId = window.setTimeout(() => {
      void showWebNotification(instance);
      webTimers.delete(instance.id);
    }, delay);
    webTimers.set(instance.id, timerId);
  }
}

export async function syncAndScheduleNotifications(): Promise<NotificationInstance[]> {
  const instances = await syncNotificationInstances();
  const scheduledNatively = await scheduleNative(instances);
  if (!scheduledNatively) {
    scheduleWeb(instances);
    await showDueWebNotifications(instances);
  }
  return instances;
}
