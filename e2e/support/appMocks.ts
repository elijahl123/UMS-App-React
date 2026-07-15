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

export async function mockPublicAppApis(page: Page) {
  await page.route('**/api/staging-access/config', async (route) => {
    await fulfillJson(route, { enabled: false });
  });
}

export async function mockAuthenticatedApp(page: Page, options: MockAuthenticatedAppOptions = {}) {
  const assignments = createAssignments();
  const user = options.user ?? testUser;

  await page.addInitScript(
    ({ key, user }) => {
      window.localStorage.setItem(key, JSON.stringify({ idToken: 'e2e-token', user }));
    },
    { key: sessionStorageKey, user }
  );

  await mockPublicAppApis(page);

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

export async function mockSecondaryEmailLogin(page: Page, options: MockSecondaryEmailLoginOptions) {
  const password = options.password ?? 'password123';
  const assignments = createAssignments();

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
      default:
        await fulfillJson(route, []);
        break;
    }
  });
}

export async function mockSecondaryGoogleLogin(page: Page, options: MockSecondaryGoogleLoginOptions) {
  const googleIdToken = options.googleIdToken ?? 'e2e-google-secondary-id-token';
  const assignments = createAssignments();

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
      default:
        await fulfillJson(route, []);
        break;
    }
  });
}
