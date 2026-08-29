import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { callAction } from '@/app/lib/api/client';
import { offlineAdapter } from '@/app/lib/offline/adapter';
import { clearOfflineData, countMutations, readMutationQueue } from '@/app/lib/offline/db';
import { setOfflineRuntime } from '@/app/lib/offline/runtime';
import { isTempId } from '@/app/lib/offline/rows';
import { readSyncIssues, syncOfflineMutations } from '@/app/lib/offline/sync';

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
  await clearOfflineData();
  setOnline(true);
  setOfflineRuntime({ enabled: true, userId, adapter: offlineAdapter });
});

afterEach(() => {
  vi.unstubAllGlobals();
  setOfflineRuntime({ enabled: false, userId: null, adapter: null });
});

describe('offline reads', () => {
  it('serves the last successful response when the request fails', async () => {
    const courses = [{ id: 1, code: 'CS101', name: 'Intro', color: 'course-diamond', homepage_url: null }];
    stubServer(() => jsonResponse(courses));
    await callAction('loadCourses', { userId });

    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    }));

    await expect(callAction('loadCourses', { userId })).resolves.toEqual(courses);
  });

  it('reads from the cache without touching the network while offline', async () => {
    stubServer(() => jsonResponse([{ id: 7, code: 'BIO1', name: 'Biology', color: 'course-emerald', homepage_url: null }]));
    await callAction('loadCourses', { userId });

    setOnline(false);
    const sent = stubServer(() => jsonResponse([]));
    const rows = (await callAction('loadCourses', { userId })) as Row[];

    expect(sent).toHaveLength(0);
    expect(rows).toHaveLength(1);
  });

  it('rethrows when nothing has been cached yet', async () => {
    stubServer(() => {
      throw new TypeError('Failed to fetch');
    });

    await expect(callAction('loadNotes', { userId })).rejects.toBeInstanceOf(TypeError);
  });
});

describe('offline writes', () => {
  it('queues a create and shows it immediately with a placeholder id', async () => {
    stubServer(() => jsonResponse([]));
    await callAction('loadCourses', { userId });

    setOnline(false);
    const created = (await callAction('createCourse', {
      userId,
      code: 'PHY2',
      name: 'Physics',
      color: 'course-citrine',
    })) as Row[];

    expect(isTempId(created[0].id)).toBe(true);
    expect(await countMutations(userId)).toBe(1);

    const rows = (await callAction('loadCourses', { userId })) as Row[];
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
    await callAction('loadCourses', { userId });
    await callAction('loadAssignments', { userId });

    setOnline(false);
    await callAction('deleteCourse', { userId, id: '5' });

    expect((await callAction('loadCourses', { userId })) as Row[]).toEqual([]);
    expect((await callAction('loadAssignments', { userId })) as Row[]).toEqual([]);
  });

  it('derives assignment status the way the server does', async () => {
    stubServer(() => jsonResponse([]));
    await callAction('loadAssignments', { userId });

    setOnline(false);
    const created = (await callAction('createAssignment', {
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
    await callAction('loadCourses', { userId });
    await callAction('loadAssignments', { userId });

    setOnline(false);
    const [course] = (await callAction('createCourse', {
      userId,
      code: 'CHM1',
      name: 'Chemistry',
      color: 'course-diamond',
    })) as Row[];
    await callAction('createAssignment', {
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

    const outcome = await syncOfflineMutations();

    expect(outcome.synced).toBe(2);
    expect(sent.map((request) => request.name)).toEqual(['createCourse', 'createAssignment']);
    expect(sent[1].params.courseId).toBe('42');
    expect(await countMutations(userId)).toBe(0);
  });

  it('discards a change the server rejects and reports it', async () => {
    stubServer(() => jsonResponse([{ id: 3, course_id: null, title: 'Notes', content: '', created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z' }]));
    await callAction('loadNotes', { userId });

    setOnline(false);
    await callAction('updateNote', { userId, id: '3', title: 'Renamed', content: '' });

    setOnline(true);
    stubServer(() => jsonResponse({ error: { message: 'NOT_FOUND' } }, 404));
    const outcome = await syncOfflineMutations();

    expect(outcome.synced).toBe(0);
    expect(await countMutations(userId)).toBe(0);
    expect((await readSyncIssues(userId))[0].message).toContain('note');
  });

  it('keeps the queue intact when the connection drops mid-replay', async () => {
    stubServer(() => jsonResponse([]));
    await callAction('loadCourses', { userId });

    setOnline(false);
    await callAction('createCourse', { userId, code: 'GEO1', name: 'Geology', color: 'course-diamond' });

    setOnline(true);
    stubServer(() => {
      throw new TypeError('Failed to fetch');
    });
    await syncOfflineMutations();

    const queue = await readMutationQueue(userId);
    expect(queue).toHaveLength(1);
    expect(queue[0].attempts).toBe(1);
  });

  it('reports an unsaved child change instead of sending a placeholder id', async () => {
    stubServer(() => jsonResponse([]));
    await callAction('loadCourses', { userId });
    await callAction('loadClassSessions', { userId });

    setOnline(false);
    const [course] = (await callAction('createCourse', {
      userId,
      code: 'ART1',
      name: 'Art',
      color: 'course-diamond',
    })) as Row[];
    await callAction('createClassSession', {
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
    await syncOfflineMutations();

    expect(sent.map((request) => request.name)).toEqual(['createCourse']);
    expect(await countMutations(userId)).toBe(0);
    expect(await readSyncIssues(userId)).toHaveLength(2);
  });
});

describe('placeholder ids', () => {
  it('announces the real id so an open page can follow the record', async () => {
    stubServer(() => jsonResponse([]));
    await callAction('loadNotes', { userId });

    setOnline(false);
    const [note] = (await callAction('createNote', { userId, title: 'Lecture 4', content: '' })) as Row[];

    setOnline(true);
    stubServer(() => jsonResponse([{ id: 512 }]));
    const remapped: Array<{ tempId?: string; realId?: string }> = [];
    const listener = (event: Event) => {
      remapped.push((event as CustomEvent<{ tempId?: string; realId?: string }>).detail);
    };
    window.addEventListener('ums-offline-id-remapped', listener);
    await syncOfflineMutations();
    window.removeEventListener('ums-offline-id-remapped', listener);

    expect(remapped).toEqual([{ tempId: note.id, realId: '512' }]);
  });
});

describe('turning offline access off', () => {
  it('erases the cache and any queued changes for the signed-in user', async () => {
    stubServer(() => jsonResponse([]));
    await callAction('loadCourses', { userId });
    setOnline(false);
    await callAction('createCourse', { userId, code: 'MUS1', name: 'Music', color: 'course-diamond' });

    await clearOfflineData(userId);

    expect(await countMutations(userId)).toBe(0);
    expect(await offlineAdapter.readActionRows('loadCourses', { userId })).toBeNull();
  });
});
