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

type FirebaseLookupUser = {
  localId: string;
  email: string;
  displayName?: string;
  emailVerified?: boolean;
  createdAt?: string;
  providerUserInfo?: Array<{ providerId?: string; email?: string }>;
};

type AccountEmailAddress = {
  id: string;
  email: string;
  source: 'email' | 'google';
  verified: boolean;
  verifiedAt: string | null;
  verificationExpiresAt: string | null;
  createdAt: string;
};

type MockAuthenticatedAppOptions = {
  user?: typeof testUser;
  firebaseLookupUser?: FirebaseLookupUser;
  authSession?: {
    userId: string;
    loginUid: string;
    email: string;
    linkedToPrimary: boolean;
    user?: typeof testUser;
  };
  accountEmails?: {
    primaryEmail?: string;
    loginEmail?: string;
    emails: AccountEmailAddress[];
  };
  onboarding?: MockOnboardingState | null;
};

export type MockOnboardingState = {
  version: number;
  status: 'active' | 'skipped' | 'completed';
  currentStep: string;
  completedSteps: string[];
  deferredSteps: string[];
  inferredCompletedSteps: string[];
  checklistDismissedAt: string | null;
  startedAt: string;
  skippedAt: string | null;
  completedAt: string | null;
  updatedAt: string;
};

type MockSecondaryEmailLoginOptions = {
  primaryUser: typeof testUser;
  secondaryEmail: string;
  password?: string;
  firebaseLookupUser?: FirebaseLookupUser;
  accountEmails: {
    primaryEmail: string;
    loginEmail: string;
    emails: AccountEmailAddress[];
  };
};

type MockSecondaryGoogleLoginOptions = {
  primaryUser: typeof testUser;
  googleEmail: string;
  googleIdToken?: string;
  onGoogleOAuthRequest?: (url: URL) => void;
  firebaseLookupUser?: FirebaseLookupUser;
  onFirebaseGoogleSignIn?: (result: { email: string; idToken: string }) => void;
  accountEmails: {
    primaryEmail: string;
    loginEmail: string;
    emails: AccountEmailAddress[];
  };
};

const courses = [
  {
    id: 1,
    code: 'COMP30870',
    name: 'Software Engineering Project',
    color: 'bg-emerald-100 text-emerald-900',
    homepage_url: 'https://courses.example.edu/comp30870',
  },
  {
    id: 2,
    code: 'COMP30770',
    name: 'Enterprise Software Systems',
    color: 'bg-slate-100 text-slate-900',
    homepage_url: null,
  },
];

const classSessions = [
  { id: 1, course_id: 1, day: 'Mon', start_time: '10:00', end_time: '10:50', location: 'Engineering Building E201' },
  { id: 2, course_id: 2, day: 'Wed', start_time: '13:00', end_time: '14:50', location: 'Science Center S204' },
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
    end_date: '2026-07-23',
    event_time: '15:00',
    end_time: '16:00',
    event_timezone: 'America/Los_Angeles',
    description: 'Final walkthrough.',
    source_provider: 'google_calendar',
  },
];

type MockAssignmentRow = {
  id: number;
  course_id: number;
  name: string;
  due_date: string;
  due_time: string | null;
  due_timezone: string;
  status: string;
  description: string | null;
};

function createAssignments(): MockAssignmentRow[] {
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

/** Post bodies are absent on some routes, so reading one must never throw. */
function readPostJson(route: Route): unknown {
  try {
    return route.request().postDataJSON();
  } catch {
    return null;
  }
}

async function fulfillJson(route: Route, payload: unknown) {
  await route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify(payload),
  });
}

const activeBillingStatus = {
  status: 'active',
  subscribed: true,
  currentPeriodEnd: '2026-08-01T00:00:00.000Z',
  cancelAtPeriodEnd: false,
  stripeSubscriptionId: 'sub_e2e',
  stripePriceId: 'price_monthly_e2e',
  trialStartedAt: null,
  trialEndsAt: null,
  trialActive: false,
  trialDaysRemaining: 0,
  hasAccess: true,
};

const fullAccessStatus = {
  ...activeBillingStatus,
  accessMode: 'full',
  canRead: true,
  canWrite: true,
  canExport: true,
  billingWarning: null,
  entitlement: null,
};

async function mockAccessAndTelemetryApis(page: Page, initialOnboarding: MockOnboardingState | null = null) {
  let onboarding = initialOnboarding;
  await page.route('**/api/telemetry/events', async (route) => {
    await route.fulfill({ status: 204, body: '' });
  });

  await page.route('**/api/access/**', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/onboarding/milestones')) {
      await fulfillJson(route, { ok: true, onboarding: null, completedNow: false });
      return;
    }
    if (url.pathname.endsWith('/onboarding')) {
      await fulfillJson(route, null);
      return;
    }
    await fulfillJson(route, fullAccessStatus);
  });

  await page.route('**/api/onboarding**', async (route) => {
    const url = new URL(route.request().url());
    const method = route.request().method();
    if (url.pathname.endsWith('/restart')) {
      onboarding = onboarding ? { ...onboarding, status: 'active', currentStep: 'welcome', completedSteps: [], deferredSteps: [], checklistDismissedAt: null } : null;
    } else if (url.pathname.endsWith('/initialize')) {
      onboarding ??= createMockOnboarding();
    } else if (method === 'PUT' && onboarding) {
      const body = route.request().postDataJSON() as { action: string; step?: string; nextStep?: string };
      if (body.action === 'complete_step') {
        onboarding = { ...onboarding, status: 'active', currentStep: body.nextStep ?? onboarding.currentStep, completedSteps: [...new Set([...onboarding.completedSteps, body.step ?? ''])] };
      } else if (body.action === 'defer_step') {
        onboarding = { ...onboarding, status: 'active', currentStep: body.nextStep ?? onboarding.currentStep, deferredSteps: [...new Set([...onboarding.deferredSteps, body.step ?? ''])] };
      } else if (body.action === 'skip') {
        onboarding = { ...onboarding, status: 'skipped' };
      } else if (body.action === 'resume') {
        onboarding = { ...onboarding, status: 'active' };
      } else if (body.action === 'complete') {
        onboarding = { ...onboarding, status: 'completed', completedAt: new Date().toISOString() };
      } else if (body.action === 'dismiss_checklist') {
        onboarding = { ...onboarding, checklistDismissedAt: new Date().toISOString() };
      }
    }
    await fulfillJson(route, onboarding);
  });
}

export function createMockOnboarding(overrides: Partial<MockOnboardingState> = {}): MockOnboardingState {
  return {
    version: 1,
    status: 'active',
    currentStep: 'welcome',
    completedSteps: [],
    deferredSteps: [],
    inferredCompletedSteps: [],
    checklistDismissedAt: null,
    startedAt: '2026-08-13T12:00:00.000Z',
    skippedAt: null,
    completedAt: null,
    updatedAt: '2026-08-13T12:00:00.000Z',
    ...overrides,
  };
}

async function mockNotificationApis(page: Page) {
  const preferences = {
    userId: testUser.id,
    enabled: true,
    assignment24hEnabled: true,
    assignment1hEnabled: true,
    event10mEnabled: true,
    class10mEnabled: true,
    quietHoursEnabled: false,
    quietHoursStart: '22:00',
    quietHoursEnd: '07:00',
    timeZone: 'America/Los_Angeles',
  };

  await page.route('**/api/notifications/preferences', async (route) => {
    await fulfillJson(route, preferences);
  });

  await page.route('**/api/notifications/sync', async (route) => {
    await fulfillJson(route, { instances: [] });
  });

  await page.route('**/api/notifications/instances**', async (route) => {
    await fulfillJson(route, []);
  });

  await page.route('**/api/notifications/read-all', async (route) => {
    await fulfillJson(route, { ok: true });
  });
}

async function mockGoogleCalendarApis(page: Page) {
  const status = {
    configured: true,
    connected: false,
    googleEmail: null,
    calendarId: null,
    lastSyncedAt: null,
    lastError: null,
    syncInProgress: false,
  };

  await page.route('**/api/google-calendar/status', async (route) => {
    await fulfillJson(route, status);
  });

  await page.route('**/api/google-calendar/sync', async (route) => {
    await fulfillJson(route, {
      importedCount: 0,
      updatedCount: 0,
      deletedCount: 0,
      pushedCount: 0,
      fullSync: false,
    });
  });
}

async function mockStudyPlanApis(page: Page) {
  await page.route('**/api/study-plans**', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/dashboard')) {
      await fulfillJson(route, {
        plans: [],
        tasks: [],
        activePlanCount: 0,
        overduePlanCount: 0,
        recoveryPlanCount: 0,
        urgentPlan: null,
        nextStudyDate: null,
      });
      return;
    }
    if (url.pathname.endsWith('/calendar')) {
      await fulfillJson(route, {
        from: url.searchParams.get('from'),
        to: url.searchParams.get('to'),
        plans: [],
        tasks: [],
      });
      return;
    }
    await fulfillJson(route, { plans: [] });
  });
}

async function mockActiveBillingApis(page: Page) {
  await page.route('**/api/billing/config', async (route) => {
    await fulfillJson(route, {
      publishableKey: null,
      prices: {
        monthly: 'price_monthly_e2e',
        yearly: 'price_yearly_e2e',
      },
    });
  });

  await page.route('**/api/billing/status**', async (route) => {
    await fulfillJson(route, activeBillingStatus);
  });

  await page.route('**/api/billing/trial/start', async (route) => {
    await fulfillJson(route, {
      ...activeBillingStatus,
      trialStartedNow: false,
    });
  });

  await page.route('**/api/billing/payment-method?**', async (route) => {
    await fulfillJson(route, {
      paymentMethod: {
        id: 'pm_e2e',
        type: 'card',
        brand: 'visa',
        last4: '4242',
        expMonth: 12,
        expYear: 2030,
        wallet: null,
        billingName: 'E2E Student',
      },
    });
  });
}

export async function mockPublicAppApis(page: Page, onboarding: MockOnboardingState | null = null) {
  await page.route('**/api/staging-access/config', async (route) => {
    await fulfillJson(route, { enabled: false });
  });
  await mockAccessAndTelemetryApis(page, onboarding);
}

export async function mockAuthenticatedApp(page: Page, options: MockAuthenticatedAppOptions = {}) {
  const assignments = createAssignments();
  const courseRows = courses.map((course) => ({ ...course }));
  const user = options.user ?? testUser;

  await page.addInitScript(
    ({ key, user }) => {
      window.localStorage.setItem(key, JSON.stringify({ idToken: 'e2e-token', user }));
    },
    { key: sessionStorageKey, user }
  );

  await mockPublicAppApis(page, options.onboarding);

  await page.route('**/api/auth/session', async (route) => {
    await fulfillJson(
      route,
      options.authSession ?? {
        userId: user.id,
        loginUid: user.id,
        email: user.email,
        linkedToPrimary: false,
      }
    );
  });

  await page.route('https://identitytoolkit.googleapis.com/v1/accounts:lookup?**', async (route) => {
    const firebaseLookupUser =
      options.firebaseLookupUser ?? {
        localId: user.id,
        email: user.email,
        displayName: `${user.firstName} ${user.lastName}`,
        emailVerified: user.emailVerified,
        createdAt: '1767225600000',
        providerUserInfo: user.connectedProviders.map((providerId) => ({ providerId })),
      };

    await fulfillJson(route, {
      users: [firebaseLookupUser],
    });
  });

  await page.route('**/api/email/account-addresses', async (route) => {
    if (route.request().method() !== 'GET') {
      await route.fallback();
      return;
    }

    await fulfillJson(
      route,
      options.accountEmails ?? {
        primaryEmail: user.email,
        loginEmail: user.email,
        emails: [],
      }
    );
  });

  await mockActiveBillingApis(page);
  await mockNotificationApis(page);
  await mockGoogleCalendarApis(page);
  await mockStudyPlanApis(page);

  // Mirrors the server's mutation receipts: a write the server has already
  // completed replays its stored result rather than being applied twice.
  const receipts = new Map<string, unknown>();

  await page.route('**/api/actions/*', async (route) => {
    const action = new URL(route.request().url()).pathname.split('/').pop();
    const body = readPostJson(route) as { clientMutationId?: unknown } | null;
    const mutationId = typeof body?.clientMutationId === 'string' ? body.clientMutationId : null;

    if (mutationId && receipts.has(mutationId)) {
      await fulfillJson(route, receipts.get(mutationId));
      return;
    }

    const fulfillMutation = async (payload: unknown) => {
      if (mutationId) receipts.set(mutationId, payload);
      await fulfillJson(route, payload);
    };

    switch (action) {
      case 'loadCourses':
        await fulfillJson(route, courseRows);
        break;
      case 'createCourse': {
        const create = body as { code: string; name: string; color?: string; homepageUrl?: string | null };
        const created = {
          id: courseRows.length + 1,
          code: create.code,
          name: create.name,
          color: create.color ?? 'course-diamond',
          homepage_url: create.homepageUrl ?? null,
        };
        courseRows.push(created);
        await fulfillMutation([created]);
        break;
      }
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
        const create = body as {
          courseId: string;
          name: string;
          dueDate: string;
          dueTime?: string | null;
          dueTimeZone?: string;
          description?: string | null;
        };
        const created = {
          id: assignments.length + 1,
          course_id: Number(create.courseId),
          name: create.name,
          due_date: create.dueDate,
          due_time: create.dueTime ?? null,
          due_timezone: create.dueTimeZone ?? 'America/Los_Angeles',
          status: 'upcoming',
          description: create.description ?? null,
        };
        assignments.push(created);
        await fulfillMutation([created]);
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

export async function mockSecondaryEmailLogin(page: Page, options: MockSecondaryEmailLoginOptions) {
  const password = options.password ?? 'password123';
  const assignments = createAssignments();
  const courseRows = courses.map((course) => ({ ...course }));

  await mockPublicAppApis(page);

  await page.route('https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?**', async (route) => {
    const body = route.request().postDataJSON() as { email?: string; password?: string };
    if (body.email !== options.secondaryEmail || body.password !== password) {
      await route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({ error: { message: 'INVALID_LOGIN_CREDENTIALS' } }),
      });
      return;
    }

    await fulfillJson(route, {
      localId: options.primaryUser.id,
      email: options.secondaryEmail,
      idToken: 'e2e-secondary-login-token',
      refreshToken: 'e2e-secondary-refresh-token',
      expiresIn: '3600',
      displayName: `${options.primaryUser.firstName} ${options.primaryUser.lastName}`,
    });
  });

  await page.route('https://identitytoolkit.googleapis.com/v1/accounts:lookup?**', async (route) => {
    await fulfillJson(route, {
      users: [
        options.firebaseLookupUser ?? {
          localId: options.primaryUser.id,
          email: options.secondaryEmail,
          displayName: `${options.primaryUser.firstName} ${options.primaryUser.lastName}`,
          emailVerified: true,
          createdAt: '1767225600000',
          providerUserInfo: [
            { providerId: 'password', email: options.accountEmails.primaryEmail },
            { providerId: 'google.com', email: options.secondaryEmail },
          ],
        },
      ],
    });
  });

  await page.route('**/api/auth/session', async (route) => {
    await fulfillJson(route, {
      userId: options.primaryUser.id,
      loginUid: options.primaryUser.id,
      email: options.secondaryEmail,
      linkedToPrimary: false,
      user: {
        ...options.primaryUser,
        email: options.accountEmails.primaryEmail,
      },
    });
  });

  await page.route('**/api/email/account-addresses', async (route) => {
    if (route.request().method() !== 'GET') {
      await route.fallback();
      return;
    }

    await fulfillJson(route, options.accountEmails);
  });

  await mockActiveBillingApis(page);
  await mockNotificationApis(page);
  await mockGoogleCalendarApis(page);
  await mockStudyPlanApis(page);

  await page.route('**/api/actions/*', async (route) => {
    const action = new URL(route.request().url()).pathname.split('/').pop();

    switch (action) {
      case 'loadCourses':
        await fulfillJson(route, courseRows);
        break;
      case 'createCourse': {
        const body = route.request().postDataJSON() as {
          code: string;
          name: string;
          color?: string;
          homepageUrl?: string | null;
        };
        const created = {
          id: courseRows.length + 1,
          code: body.code,
          name: body.name,
          color: body.color ?? 'course-diamond',
          homepage_url: body.homepageUrl ?? null,
        };
        courseRows.push(created);
        await fulfillJson(route, [created]);
        break;
      }
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
      default:
        await fulfillJson(route, []);
        break;
    }
  });
}

export async function mockSecondaryGoogleLogin(page: Page, options: MockSecondaryGoogleLoginOptions) {
  const googleIdToken = options.googleIdToken ?? 'e2e-google-secondary-id-token';
  const assignments = createAssignments();
  const courseRows = courses.map((course) => ({ ...course }));

  await mockPublicAppApis(page);

  await page.route('https://accounts.google.com/o/oauth2/v2/auth?**', async (route) => {
    const url = new URL(route.request().url());
    options.onGoogleOAuthRequest?.(url);

    const redirectUri = url.searchParams.get('redirect_uri') ?? 'http://127.0.0.1:5173';
    const redirectUrl = `${redirectUri}/#id_token=${encodeURIComponent(googleIdToken)}`;
    await route.fulfill({
      status: 302,
      headers: { location: redirectUrl },
      body: '',
    });
  });

  await page.route('https://identitytoolkit.googleapis.com/v1/accounts:signInWithIdp?**', async (route) => {
    const body = route.request().postDataJSON() as { postBody?: string; requestUri?: string };
    const postBody = new URLSearchParams(body.postBody ?? '');
    if (postBody.get('id_token') !== googleIdToken || postBody.get('providerId') !== 'google.com') {
      await route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({ error: { message: 'INVALID_IDP_RESPONSE' } }),
      });
      return;
    }

    const result = {
      localId: options.primaryUser.id,
      email: options.googleEmail,
      idToken: 'e2e-google-secondary-login-token',
      refreshToken: 'e2e-google-secondary-refresh-token',
      expiresIn: '3600',
      displayName: `${options.primaryUser.firstName} ${options.primaryUser.lastName}`,
      emailVerified: true,
      providerId: 'google.com',
    };
    options.onFirebaseGoogleSignIn?.({ email: result.email, idToken: result.idToken });
    await fulfillJson(route, result);
  });

  await page.route('https://identitytoolkit.googleapis.com/v1/accounts:lookup?**', async (route) => {
    await fulfillJson(route, {
      users: [
        options.firebaseLookupUser ?? {
          localId: options.primaryUser.id,
          email: options.googleEmail,
          displayName: `${options.primaryUser.firstName} ${options.primaryUser.lastName}`,
          emailVerified: true,
          createdAt: '1767225600000',
          providerUserInfo: [
            { providerId: 'password', email: options.accountEmails.primaryEmail },
            { providerId: 'google.com', email: options.googleEmail },
          ],
        },
      ],
    });
  });

  await page.route('**/api/auth/session', async (route) => {
    await fulfillJson(route, {
      userId: options.primaryUser.id,
      loginUid: options.primaryUser.id,
      email: options.googleEmail,
      linkedToPrimary: false,
      user: {
        ...options.primaryUser,
        email: options.accountEmails.primaryEmail,
      },
    });
  });

  await page.route('**/api/email/account-addresses', async (route) => {
    if (route.request().method() !== 'GET') {
      await route.fallback();
      return;
    }

    await fulfillJson(route, options.accountEmails);
  });

  await mockActiveBillingApis(page);
  await mockNotificationApis(page);
  await mockGoogleCalendarApis(page);
  await mockStudyPlanApis(page);

  await page.route('**/api/actions/*', async (route) => {
    const action = new URL(route.request().url()).pathname.split('/').pop();

    switch (action) {
      case 'loadCourses':
        await fulfillJson(route, courseRows);
        break;
      case 'createCourse': {
        const body = route.request().postDataJSON() as {
          code: string;
          name: string;
          color?: string;
          homepageUrl?: string | null;
        };
        const created = {
          id: courseRows.length + 1,
          code: body.code,
          name: body.name,
          color: body.color ?? 'course-diamond',
          homepage_url: body.homepageUrl ?? null,
        };
        courseRows.push(created);
        await fulfillJson(route, [created]);
        break;
      }
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
      default:
        await fulfillJson(route, []);
        break;
    }
  });
}

/**
 * Lets a spec simulate losing the connection. `navigator.onLine` is redefined
 * before any page script runs so the state survives a reload, and every API
 * request is aborted the way the browser would abort it with no network.
 */
export async function installOfflineControl(page: Page) {
  await page.addInitScript(() => {
    Object.defineProperty(window.navigator, 'onLine', {
      configurable: true,
      get: () => {
        try {
          return window.localStorage.getItem('e2e.offline') !== '1';
        } catch {
          return true;
        }
      },
    });
  });
}

const isApiRequest = (url: URL) => url.pathname.startsWith('/api/');

const abortApiRequest = async (route: Route) => {
  await route.abort('internetdisconnected');
};

export async function goOffline(page: Page) {
  await page.evaluate(() => {
    window.localStorage.setItem('e2e.offline', '1');
    window.dispatchEvent(new Event('offline'));
  });
  await page.route(isApiRequest, abortApiRequest);
}

export async function goOnline(page: Page) {
  await page.unroute(isApiRequest, abortApiRequest);
  await page.evaluate(() => {
    window.localStorage.removeItem('e2e.offline');
    window.dispatchEvent(new Event('online'));
  });
}
