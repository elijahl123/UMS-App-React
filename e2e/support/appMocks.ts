import type { Page, Route } from '@playwright/test';

const sessionStorageKey = 'schoolwork_auth_session';

export const testUser = {
  id: 'e2e-user-1',
  email: 'e2e@example.com',
  firstName: 'E2E',
  lastName: 'Student',
  createdAt: '2026-01-01T00:00:00.000Z',
  emailVerified: true,
  connectedProviders: ['password'],
};

const courses = [
  { id: 1, code: 'COMP30870', name: 'Software Engineering Project', color: 'bg-emerald-100 text-emerald-900' },
  { id: 2, code: 'COMP30770', name: 'Enterprise Software Systems', color: 'bg-slate-100 text-slate-900' },
];

const classSessions = [
  { id: 1, course_id: 1, day: 'Mon', start_time: '10:00', end_time: '10:50' },
  { id: 2, course_id: 2, day: 'Wed', start_time: '13:00', end_time: '14:50' },
];

const notes = [
  {
    id: 1,
    course_id: 1,
    title: 'Sprint Planning',
    content: 'Notes from sprint planning.',
    created_at: '2026-01-02T00:00:00.000Z',
    updated_at: '2026-01-02T00:00:00.000Z',
  },
];

const events = [
  {
    id: 1,
    title: 'Project demo',
    event_date: '2026-07-20',
    event_time: '15:00',
    description: 'Final walkthrough.',
  },
];

function createAssignments() {
  return [
    {
      id: 1,
      course_id: 1,
      name: 'Architecture Review',
      due_date: '2026-07-20',
      due_time: '17:00',
      due_timezone: 'America/Los_Angeles',
      status: 'upcoming',
      description: 'Review the project architecture.',
    },
    {
      id: 2,
      course_id: 2,
      name: 'Legacy Migration Brief',
      due_date: '2026-07-01',
      due_time: null,
      due_timezone: 'America/Los_Angeles',
      status: 'late',
      description: null,
    },
  ];
}

async function fulfillJson(route: Route, payload: unknown) {
  await route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify(payload),
  });
}

export async function mockPublicAppApis(page: Page) {
  await page.route('**/api/staging-access/config', async (route) => {
    await fulfillJson(route, { enabled: false });
  });
}

export async function mockAuthenticatedApp(page: Page) {
  const assignments = createAssignments();

  await page.addInitScript(
    ({ key, user }) => {
      window.localStorage.setItem(key, JSON.stringify({ idToken: 'e2e-token', user }));
    },
    { key: sessionStorageKey, user: testUser }
  );

  await mockPublicAppApis(page);

  await page.route('https://identitytoolkit.googleapis.com/v1/accounts:lookup?**', async (route) => {
    await fulfillJson(route, {
      users: [
        {
          localId: testUser.id,
          email: testUser.email,
          displayName: `${testUser.firstName} ${testUser.lastName}`,
          emailVerified: testUser.emailVerified,
          createdAt: '1767225600000',
          providerUserInfo: [{ providerId: 'password' }],
        },
      ],
    });
  });

  await page.route('**/api/billing/status?**', async (route) => {
    await fulfillJson(route, {
      status: 'active',
      subscribed: true,
      currentPeriodEnd: '2026-08-01T00:00:00.000Z',
      cancelAtPeriodEnd: false,
      stripeSubscriptionId: 'sub_e2e',
      stripePriceId: 'price_monthly_e2e',
    });
  });

  await page.route('**/api/actions/*', async (route) => {
    const action = new URL(route.request().url()).pathname.split('/').pop();

    switch (action) {
      case 'loadCourses':
        await fulfillJson(route, courses);
        break;
      case 'loadAssignments':
        await fulfillJson(route, assignments);
        break;
      case 'loadClassSessions':
        await fulfillJson(route, classSessions);
        break;
      case 'loadEvents':
        await fulfillJson(route, events);
        break;
      case 'loadNotes':
        await fulfillJson(route, notes);
        break;
      case 'createAssignment': {
        const body = route.request().postDataJSON() as {
          courseId: string;
          name: string;
          dueDate: string;
          dueTime?: string | null;
          dueTimeZone?: string;
          description?: string | null;
        };
        const created = {
          id: assignments.length + 1,
          course_id: Number(body.courseId),
          name: body.name,
          due_date: body.dueDate,
          due_time: body.dueTime ?? null,
          due_timezone: body.dueTimeZone ?? 'America/Los_Angeles',
          status: 'upcoming',
          description: body.description ?? null,
        };
        assignments.push(created);
        await fulfillJson(route, [created]);
        break;
      }
      case 'updateAssignment':
      case 'deleteAssignment':
      case 'createNote':
        await fulfillJson(route, []);
        break;
      default:
        await fulfillJson(route, []);
        break;
    }
  });
}
