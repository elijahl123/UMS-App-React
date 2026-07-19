import { Capacitor } from '@capacitor/core';
import type { NotificationInstance } from '@/app/data/types';
import { markNotificationRead, syncNotificationInstances } from '@/app/lib/notifications/client';

const SCHEDULED_IDS_KEY = 'ums_scheduled_notification_ids';
const MAX_WEB_TIMEOUT_MS = 2 ** 31 - 1;
const REMINDERS_CHANNEL_ID = 'ums-reminders';

const webTimers = new Map<string, number>();
let nativeListenersRegistered = false;

export type NotificationPermissionStatus = 'granted' | 'denied' | 'prompt' | 'unsupported';

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

async function nativeLocalNotifications() {
  if (!Capacitor.isNativePlatform()) return null;
  try {
    const module = await import('@capacitor/local-notifications');
    return module.LocalNotifications;
  } catch {
    return null;
  }
}

async function ensureNativeIntegration(native: Awaited<ReturnType<typeof nativeLocalNotifications>>) {
  if (!native) return;

  if (Capacitor.getPlatform() === 'android') {
    await native
      .createChannel({
        id: REMINDERS_CHANNEL_ID,
        name: 'Reminders',
        description: 'Assignments, classes, and calendar event reminders.',
        importance: 4,
        visibility: 1,
        vibration: true,
        lights: true,
        lightColor: '#2563EB',
      })
      .catch(() => undefined);
  }

  if (nativeListenersRegistered) return;
  nativeListenersRegistered = true;

  await native.addListener('localNotificationActionPerformed', (action) => {
    const notificationInstanceId = action.notification.extra?.notificationInstanceId;
    if (!notificationInstanceId) return;

    void markNotificationRead(String(notificationInstanceId)).finally(() => {
      window.dispatchEvent(new CustomEvent('ums-notifications-changed'));
    });
  });
}

export async function getNotificationPermissionStatus(): Promise<NotificationPermissionStatus> {
  const native = await nativeLocalNotifications();
  if (native) {
    const permissions = await native.checkPermissions();
    return permissions.display === 'granted' ? 'granted' : permissions.display === 'denied' ? 'denied' : 'prompt';
  }

  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }

  return Notification.permission === 'default' ? 'prompt' : Notification.permission;
}

export async function requestNotificationPermission(): Promise<NotificationPermissionStatus> {
  const native = await nativeLocalNotifications();
  if (native) {
    const permissions = await native.requestPermissions();
    return permissions.display === 'granted' ? 'granted' : permissions.display === 'denied' ? 'denied' : 'prompt';
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

  const previousIds = getStoredScheduledIds();
  if (previousIds.length > 0) {
    await native.cancel({ notifications: previousIds.map((id) => ({ id })) }).catch(() => undefined);
  }

  const future = futureInstances(instances);
  if (future.length === 0) {
    setStoredScheduledIds([]);
    return true;
  }

  await native.schedule({
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
  });
  setStoredScheduledIds(future.map((instance) => instance.localNotificationId));
  return true;
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
      new Notification(instance.title, {
        body: instance.body,
        tag: `ums-${instance.id}`,
      });
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
  }
  return instances;
}
