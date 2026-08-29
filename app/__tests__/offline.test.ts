import 'fake-indexeddb/auto';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// The shared test setup replaces the study-plan client with fixtures. This suite
// exercises the real caching and queueing code, so it loads the genuine modules
// from a fresh registry: they must all come from the same one, or the offline
// runtime they share would be a different instance.
vi.doUnmock('@/app/lib/studyPlans/client');

type OfflineTestModules = {
  callAction: typeof import('@/app/lib/api/client')['callAction'];
  offlineAdapter: typeof import('@/app/lib/offline/adapter')['offlineAdapter'];
  clearOfflineData: typeof import('@/app/lib/offline/db')['clearOfflineData'];
  countMutations: typeof import('@/app/lib/offline/db')['countMutations'];
  readMutationQueue: typeof import('@/app/lib/offline/db')['readMutationQueue'];
  setOfflineRuntime: typeof import('@/app/lib/offline/runtime')['setOfflineRuntime'];
  isTempId: typeof import('@/app/lib/offline/rows')['isTempId'];
  readSyncIssues: typeof import('@/app/lib/offline/sync')['readSyncIssues'];
  syncOfflineMutations: typeof import('@/app/lib/offline/sync')['syncOfflineMutations'];
  getStudyPlanTasks: typeof import('@/app/lib/studyPlans/client')['getStudyPlanTasks'];
  setStudyTaskCompleted: typeof import('@/app/lib/studyPlans/client')['setStudyTaskCompleted'];
};

let offline: OfflineTestModules;

beforeAll(async () => {
  vi.resetModules();
  const [client, adapter, db, runtime, rows, sync, studyPlans] = await Promise.all([
    import('@/app/lib/api/client'),
    import('@/app/lib/offline/adapter'),
    import('@/app/lib/offline/db'),
    import('@/app/lib/offline/runtime'),
    import('@/app/lib/offline/rows'),
    import('@/app/lib/offline/sync'),
    import('@/app/lib/studyPlans/client'),
  ]);

  offline = {
    callAction: client.callAction,
    offlineAdapter: adapter.offlineAdapter,
    clearOfflineData: db.clearOfflineData,
    countMutations: db.countMutations,
    readMutationQueue: db.readMutationQueue,
    setOfflineRuntime: runtime.setOfflineRuntime,
    isTempId: rows.isTempId,
    readSyncIssues: sync.readSyncIssues,
    syncOfflineMutations: sync.syncOfflineMutations,
    getStudyPlanTasks: studyPlans.getStudyPlanTasks,
    setStudyTaskCompleted: studyPlans.setStudyTaskCompleted,
  };
});

const userId = 'user-offline-1';

type Row = Record<string, unknown>;

function setOnline(online: boolean) {
  Object.defineProperty(window.navigator, 'onLine', { configurable: true, value: online });
}

/** Records every action the client actually put on the wire. */
function stubServer(respond: (name: string, params: Row) => Response | Promise<Response>) {
  const sent: Array<{ name: string; params: Row }> = [];
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const name = String(url).split('/actions/')[1];
    const params = JSON.parse(String(init?.body ?? '{}')) as Row;
    sent.push({ name, params });
    return respond(name, params);
  });
  vi.stubGlobal('fetch', fetchMock);
  return sent;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

beforeEach(async () => {
  await offline.clearOfflineData();
  setOnline(true);
  offline.setOfflineRuntime({ enabled: true, userId, adapter: offline.offlineAdapter });
});

afterEach(() => {
  vi.unstubAllGlobals();
  offline.setOfflineRuntime({ enabled: false, userId: null, adapter: null });
});

describe('offline reads', () => {
  it('serves the last successful response when the request fails', async () => {
    const courses = [{ id: 1, code: 'CS101', name: 'Intro', color: 'course-diamond', homepage_url: null }];
    stubServer(() => jsonResponse(courses));
    await offline.callAction('loadCourses', { userId });

    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    }));

    await expect(offline.callAction('loadCourses', { userId })).resolves.toEqual(courses);
  });

  it('reads from the cache without touching the network while offline', async () => {
    stubServer(() => jsonResponse([{ id: 7, code: 'BIO1', name: 'Biology', color: 'course-emerald', homepage_url: null }]));
    await offline.callAction('loadCourses', { userId });

    setOnline(false);
    const sent = stubServer(() => jsonResponse([]));
    const rows = (await offline.callAction('loadCourses', { userId })) as Row[];

    expect(sent).toHaveLength(0);
    expect(rows).toHaveLength(1);
  });

  it('rethrows when nothing has been cached yet', async () => {
    stubServer(() => {
      throw new TypeError('Failed to fetch');
    });

    await expect(offline.callAction('loadNotes', { userId })).rejects.toBeInstanceOf(TypeError);
  });
});

describe('offline writes', () => {
  it('queues a create and shows it immediately with a placeholder id', async () => {
    stubServer(() => jsonResponse([]));
    await offline.callAction('loadCourses', { userId });

    setOnline(false);
    const created = (await offline.callAction('createCourse', {
      userId,
      code: 'PHY2',
      name: 'Physics',
      color: 'course-citrine',
    })) as Row[];

    expect(offline.isTempId(created[0].id)).toBe(true);
    expect(await offline.countMutations(userId)).toBe(1);

    const rows = (await offline.callAction('loadCourses', { userId })) as Row[];
    expect(rows.map((row) => row.code)).toEqual(['PHY2']);
  });

  it('removes a deleted course and its assignments from the cache', async () => {
    stubServer((name) =>
      jsonResponse(
        name === 'loadCourses'
          ? [{ id: 5, code: 'CS101', name: 'Intro', color: 'course-diamond', homepage_url: null }]
          : [{ id: 9, course_id: 5, name: 'Lab 1', due_date: '2026-09-01', due_time: null, due_timezone: 'UTC', status: 'upcoming', description: null }]
      )
    );
    await offline.callAction('loadCourses', { userId });
    await offline.callAction('loadAssignments', { userId });

    setOnline(false);
    await offline.callAction('deleteCourse', { userId, id: '5' });

    expect((await offline.callAction('loadCourses', { userId })) as Row[]).toEqual([]);
    expect((await offline.callAction('loadAssignments', { userId })) as Row[]).toEqual([]);
  });

  it('derives assignment status the way the server does', async () => {
    stubServer(() => jsonResponse([]));
    await offline.callAction('loadAssignments', { userId });

    setOnline(false);
    const created = (await offline.callAction('createAssignment', {
      userId,
      courseId: '5',
      name: 'Past due essay',
      dueDate: '2020-01-01',
      dueTimeZone: 'UTC',
    })) as Row[];

    expect(created[0].status).toBe('late');
  });
});

describe('sync', () => {
  it('replays queued changes in order and swaps placeholder ids for real ones', async () => {
    stubServer(() => jsonResponse([]));
    await offline.callAction('loadCourses', { userId });
    await offline.callAction('loadAssignments', { userId });

    setOnline(false);
    const [course] = (await offline.callAction('createCourse', {
      userId,
      code: 'CHM1',
      name: 'Chemistry',
      color: 'course-diamond',
    })) as Row[];
    await offline.callAction('createAssignment', {
      userId,
      courseId: course.id,
      name: 'Titration lab',
      dueDate: '2026-12-01',
      dueTimeZone: 'UTC',
    });

    setOnline(true);
    const sent = stubServer((name) =>
      jsonResponse(name === 'createCourse' ? [{ id: 42 }] : [{ id: 77, course_id: 42 }])
    );

    const outcome = await offline.syncOfflineMutations();

    expect(outcome.synced).toBe(2);
    expect(sent.map((request) => request.name)).toEqual(['createCourse', 'createAssignment']);
    expect(sent[1].params.courseId).toBe('42');
    expect(await offline.countMutations(userId)).toBe(0);
  });

  it('discards a change the server rejects and reports it', async () => {
    stubServer(() => jsonResponse([{ id: 3, course_id: null, title: 'Notes', content: '', created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z' }]));
    await offline.callAction('loadNotes', { userId });

    setOnline(false);
    await offline.callAction('updateNote', { userId, id: '3', title: 'Renamed', content: '' });

    setOnline(true);
    stubServer(() => jsonResponse({ error: { message: 'NOT_FOUND' } }, 404));
    const outcome = await offline.syncOfflineMutations();

    expect(outcome.synced).toBe(0);
    expect(await offline.countMutations(userId)).toBe(0);
    expect((await offline.readSyncIssues(userId))[0].message).toContain('note');
  });

  it('keeps the queue intact when the connection drops mid-replay', async () => {
    stubServer(() => jsonResponse([]));
    await offline.callAction('loadCourses', { userId });

    setOnline(false);
    await offline.callAction('createCourse', { userId, code: 'GEO1', name: 'Geology', color: 'course-diamond' });

    setOnline(true);
    stubServer(() => {
      throw new TypeError('Failed to fetch');
    });
    await offline.syncOfflineMutations();

    const queue = await offline.readMutationQueue(userId);
    expect(queue).toHaveLength(1);
    expect(queue[0].attempts).toBe(1);
  });

  it('reports an unsaved child change instead of sending a placeholder id', async () => {
    stubServer(() => jsonResponse([]));
    await offline.callAction('loadCourses', { userId });
    await offline.callAction('loadClassSessions', { userId });

    setOnline(false);
    const [course] = (await offline.callAction('createCourse', {
      userId,
      code: 'ART1',
      name: 'Art',
      color: 'course-diamond',
    })) as Row[];
    await offline.callAction('createClassSession', {
      userId,
      courseId: course.id,
      day: 'Monday',
      startTime: '09:00',
      endTime: '10:00',
    });

    setOnline(true);
    const sent = stubServer((name) =>
      name === 'createCourse'
        ? jsonResponse({ error: { message: 'INVALID_COURSE' } }, 400)
        : jsonResponse([{ id: 1 }])
    );
    await offline.syncOfflineMutations();

    expect(sent.map((request) => request.name)).toEqual(['createCourse']);
    expect(await offline.countMutations(userId)).toBe(0);
    expect(await offline.readSyncIssues(userId)).toHaveLength(2);
  });
});

describe('study plans offline', () => {
  const planTasks = [
    { id: '1', plan_id: 'p1', topic_id: 't1', phase: 'learn', title: 'Read chapter 1', scheduled_date: '2026-09-01', estimated_minutes: 30, completed_at: null, sequence: 1 },
    { id: '2', plan_id: 'p1', topic_id: 't1', phase: 'recall', title: 'Recall chapter 1', scheduled_date: '2026-09-08', estimated_minutes: 30, completed_at: null, sequence: 2 },
  ];

  function stubStudyServer(respond: (url: string, init?: RequestInit) => Response) {
    const sent: Array<{ url: string; body: unknown }> = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      sent.push({ url: String(url), body: init?.body ? JSON.parse(String(init.body)) : null });
      return respond(String(url), init);
    }));
    return sent;
  }

  it('serves a cached window even after the visible range moves on', async () => {
    stubStudyServer(() => jsonResponse({ from: '2026-09-01', to: '2026-09-15', tasks: planTasks }));
    await offline.getStudyPlanTasks('p1', '2026-09-01', '2026-09-15');

    setOnline(false);
    // A different window than the one that was fetched, as happens the next day.
    const result = await offline.getStudyPlanTasks('p1', '2026-09-05', '2026-09-12');

    expect(result.tasks.map((task) => task.id)).toEqual(['2']);
  });

  it('queues a task checked off offline and replays it on reconnect', async () => {
    stubStudyServer(() => jsonResponse({ from: '2026-09-01', to: '2026-09-15', tasks: planTasks }));
    await offline.getStudyPlanTasks('p1', '2026-09-01', '2026-09-15');

    setOnline(false);
    const toggled = await offline.setStudyTaskCompleted('p1', '1', true);
    expect(toggled.completedAt).not.toBeNull();
    expect(await offline.countMutations(userId)).toBe(1);

    // The checkbox stays ticked while still offline.
    const offlineTasks = await offline.getStudyPlanTasks('p1', '2026-09-01', '2026-09-15');
    expect(offlineTasks.tasks.find((task) => task.id === '1')?.completedAt).not.toBeNull();

    setOnline(true);
    const sent = stubStudyServer(() => jsonResponse({ id: '1', completedAt: '2026-09-02T00:00:00.000Z' }));
    const outcome = await offline.syncOfflineMutations();

    expect(outcome.synced).toBe(1);
    const toggles = sent.filter((request) => request.url.includes('/study-plans/p1/tasks/1'));
    expect(toggles).toHaveLength(1);
    expect(toggles[0].body).toMatchObject({ completed: true });
  });

  it('collapses repeated toggles of the same task into one replay', async () => {
    stubStudyServer(() => jsonResponse({ from: '2026-09-01', to: '2026-09-15', tasks: planTasks }));
    await offline.getStudyPlanTasks('p1', '2026-09-01', '2026-09-15');

    setOnline(false);
    await offline.setStudyTaskCompleted('p1', '1', true);
    await offline.setStudyTaskCompleted('p1', '1', false);
    await offline.setStudyTaskCompleted('p1', '1', true);

    expect(await offline.countMutations(userId)).toBe(1);
    expect((await offline.readMutationQueue(userId))[0].params).toMatchObject({ taskId: '1', completed: true });
  });
});

describe('placeholder ids', () => {
  it('announces the real id so an open page can follow the record', async () => {
    stubServer(() => jsonResponse([]));
    await offline.callAction('loadNotes', { userId });

    setOnline(false);
    const [note] = (await offline.callAction('createNote', { userId, title: 'Lecture 4', content: '' })) as Row[];

    setOnline(true);
    stubServer(() => jsonResponse([{ id: 512 }]));
    const remapped: Array<{ tempId?: string; realId?: string }> = [];
    const listener = (event: Event) => {
      remapped.push((event as CustomEvent<{ tempId?: string; realId?: string }>).detail);
    };
    window.addEventListener('ums-offline-id-remapped', listener);
    await offline.syncOfflineMutations();
    window.removeEventListener('ums-offline-id-remapped', listener);

    expect(remapped).toEqual([{ tempId: note.id, realId: '512' }]);
  });
});

describe('turning offline access off', () => {
  it('erases the cache and any queued changes for the signed-in user', async () => {
    stubServer(() => jsonResponse([]));
    await offline.callAction('loadCourses', { userId });
    setOnline(false);
    await offline.callAction('createCourse', { userId, code: 'MUS1', name: 'Music', color: 'course-diamond' });

    await offline.clearOfflineData(userId);

    expect(await offline.countMutations(userId)).toBe(0);
    expect(await offline.offlineAdapter.readActionRows('loadCourses', { userId })).toBeNull();
  });
});
