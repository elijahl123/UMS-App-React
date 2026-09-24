import { afterEach, describe, expect, it, vi } from 'vitest';
import type { NotificationInstance } from '@/app/data/types';

function instance(overrides: Partial<NotificationInstance> = {}): NotificationInstance {
  return {
    id: '1',
    sourceType: 'class_session',
    sourceId: '7',
    occurrenceKey: '2026-09-25',
    fireAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    targetAt: new Date(Date.now() + 70 * 60 * 1000).toISOString(),
    title: 'COMP30870 class',
    body: 'Class starts in 10 minutes.',
    reminderOffsetMinutes: 10,
    localNotificationId: 901,
    readAt: null,
    dismissedAt: null,
    ...overrides,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
  localStorage.clear();
});

describe('notification sync', () => {
  it('reports the device time zone so reminders follow the student', async () => {
    vi.resetModules();
    // The shared setup stubs this module for component tests; this one needs the real thing.
    vi.doUnmock('@/app/lib/notifications/client');
    const apiFetch = vi.fn(async () => new Response(JSON.stringify({ instances: [] }), { status: 200 }));
    vi.doMock('@/app/lib/api/client', () => ({ apiFetch, getApiAuthHeaders: () => ({}) }));
    vi.doMock('@/lib/timeZones', async (importOriginal) => ({
      ...(await importOriginal<typeof import('@/lib/timeZones')>()),
      getBrowserTimeZone: () => 'Europe/Dublin',
    }));

    const { syncNotificationInstances } = await import('@/app/lib/notifications/client');
    await syncNotificationInstances();

    expect(apiFetch).toHaveBeenCalledTimes(1);
    const [path, options] = apiFetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(path).toBe('/notifications/sync');
    expect(JSON.parse(String(options.body))).toEqual({ timeZone: 'Europe/Dublin' });
  });
});

describe('native scheduling', () => {
  async function loadSchedulerWithNative(pendingIds: number[], storedIds: number[]) {
    vi.resetModules();
    vi.doUnmock('@/app/lib/notifications/scheduler');
    localStorage.setItem('ums_scheduled_notification_ids', JSON.stringify(storedIds));

    const cancel = vi.fn<(options: { notifications: { id: number }[] }) => Promise<void>>(async () => undefined);
    const schedule = vi.fn<(options: { notifications: unknown[] }) => Promise<void>>(async () => undefined);
    vi.doMock('@capacitor/core', () => ({
      Capacitor: {
        isNativePlatform: () => true,
        isPluginAvailable: () => true,
        getPlatform: () => 'ios',
      },
    }));
    vi.doMock('@capacitor/local-notifications', () => ({
      LocalNotifications: {
        checkPermissions: async () => ({ display: 'granted' }),
        getPending: async () => ({ notifications: pendingIds.map((id) => ({ id })) }),
        cancel,
        schedule,
        addListener: async () => ({ remove: async () => undefined }),
        createChannel: async () => undefined,
      },
    }));
    vi.doMock('@/app/lib/notifications/client', () => ({
      syncNotificationInstances: async () => [instance()],
      markNotificationRead: async () => ({ ok: true }),
    }));

    const scheduler = await import('@/app/lib/notifications/scheduler');
    return { scheduler, cancel, schedule };
  }

  it('cancels notifications the OS still holds but this install has forgotten', async () => {
    // 404 was scheduled before the stored ids were lost — on iOS it would
    // otherwise keep firing on the zone it was scheduled with.
    const { scheduler, cancel, schedule } = await loadSchedulerWithNative([404, 901], [901]);

    await scheduler.syncAndScheduleNotifications();

    expect(cancel).toHaveBeenCalledTimes(1);
    const cancelled = cancel.mock.calls[0][0].notifications.map((n) => n.id);
    expect(cancelled).toEqual(expect.arrayContaining([404, 901]));
    expect(schedule).toHaveBeenCalledTimes(1);
  });

  it('still cancels when nothing was remembered locally', async () => {
    const { scheduler, cancel } = await loadSchedulerWithNative([404], []);

    await scheduler.syncAndScheduleNotifications();

    const cancelled = cancel.mock.calls[0][0].notifications.map((n) => n.id);
    expect(cancelled).toEqual([404]);
  });
});
