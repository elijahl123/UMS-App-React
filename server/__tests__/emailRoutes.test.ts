import type { Server } from 'node:http';
import express from 'express';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

process.env.DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://user:pass@localhost:5432/test';
process.env.APP_BASE_URL = 'https://app.untitledmanagementsoftware.com';

const authMocks = vi.hoisted(() => ({
  authenticatedFirebaseUser: vi.fn(),
  generatePasswordResetLink: vi.fn(),
  generateEmailVerificationLink: vi.fn(),
  getUser: vi.fn(),
}));
const mailMocks = vi.hoisted(() => ({
  sendPasswordResetEmail: vi.fn(),
  sendFirebaseVerificationEmail: vi.fn(),
  sendSecondaryEmailVerification: vi.fn(),
  sendFeedbackEmail: vi.fn(),
}));

vi.mock('../auth', () => ({
  authenticatedFirebaseUser: authMocks.authenticatedFirebaseUser,
  firebaseAuth: () => ({
    generatePasswordResetLink: authMocks.generatePasswordResetLink,
    generateEmailVerificationLink: authMocks.generateEmailVerificationLink,
    getUser: authMocks.getUser,
  }),
}));

vi.mock('../mail', () => mailMocks);
vi.mock('../db', () => ({ pool: { query: vi.fn() } }));

let server: Server;
let baseUrl: string;
let resetRateLimitsForTests: () => void;

beforeAll(async () => {
  const [{ publicEmailRouter, emailRouter }, rateLimit] = await Promise.all([
    import('../routes/email'),
    import('../rateLimit'),
  ]);
  resetRateLimitsForTests = rateLimit.resetRateLimitsForTests;
  const app = express();
  app.use(express.json());
  app.use('/api/email', publicEmailRouter);
  app.use('/api/email', emailRouter);
  await new Promise<void>((resolve) => {
    server = app.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Test server did not bind');
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => server.close((err) => err ? reject(err) : resolve()));
});

beforeEach(() => {
  resetRateLimitsForTests?.();
  authMocks.authenticatedFirebaseUser.mockResolvedValue({ uid: 'firebase-user-1', email: 'student@example.com' });
  authMocks.getUser.mockResolvedValue({ uid: 'firebase-user-1', email: 'student@example.com', emailVerified: false });
  authMocks.generatePasswordResetLink.mockResolvedValue(
    'https://ums-app-prod.firebaseapp.com/__/auth/action?mode=resetPassword&oobCode=reset-code&apiKey=api-key&continueUrl=https%3A%2F%2Fapp.untitledmanagementsoftware.com%2F%23%2Freset-password&lang=en',
  );
  authMocks.generateEmailVerificationLink.mockResolvedValue(
    'https://ums-app-prod.firebaseapp.com/__/auth/action?mode=verifyEmail&oobCode=verify-code&apiKey=api-key&continueUrl=https%3A%2F%2Fapp.untitledmanagementsoftware.com%2F%23%2Fverify-email&lang=en',
  );
  mailMocks.sendPasswordResetEmail.mockResolvedValue(undefined);
  mailMocks.sendFirebaseVerificationEmail.mockResolvedValue(undefined);
  mailMocks.sendFeedbackEmail.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

async function post(path: string, body: Record<string, unknown> = {}, authorization?: string) {
  const response = await fetch(`${baseUrl}/api/email/${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(authorization ? { Authorization: authorization } : {}),
    },
    body: JSON.stringify(body),
  });
  return { response, payload: await response.json() as { status?: string; error?: { message?: string } } };
}

describe('Firebase email action routes', () => {
  it('generates and sends a password-reset link for a registered address', async () => {
    const { response, payload } = await post('password-reset', { email: ' Student@Example.com ' });

    expect(response.status).toBe(202);
    expect(payload).toEqual({ status: 'accepted' });
    expect(authMocks.generatePasswordResetLink).toHaveBeenCalledWith(
      'student@example.com',
      expect.objectContaining({ handleCodeInApp: false, url: expect.stringContaining('/#/reset-password') }),
    );
    const sentLink = mailMocks.sendPasswordResetEmail.mock.calls[0]?.[1] as string;
    expect(sentLink).toBe(
      'https://app.untitledmanagementsoftware.com/auth/action?mode=resetPassword&oobCode=reset-code&apiKey=api-key&continueUrl=https%3A%2F%2Fapp.untitledmanagementsoftware.com%2F%23%2Freset-password&lang=en',
    );
    expect(sentLink).not.toContain('firebaseapp.com');
  });

  it('returns the same accepted response for unknown users and hidden delivery failures', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    authMocks.generatePasswordResetLink.mockRejectedValueOnce({ code: 'auth/user-not-found' });
    const unknown = await post('password-reset', { email: 'unknown@example.com' });
    mailMocks.sendPasswordResetEmail.mockRejectedValueOnce(new Error('SendGrid unavailable'));
    const failedDelivery = await post('password-reset', { email: 'known@example.com' });

    expect(unknown.response.status).toBe(202);
    expect(failedDelivery.response.status).toBe(202);
    expect(unknown.payload).toEqual(failedDelivery.payload);
  });

  it('rejects malformed input and limits repeated reset requests per address', async () => {
    expect((await post('password-reset', { email: 'not-an-email' })).response.status).toBe(400);
    await post('password-reset', { email: 'limited@example.com' });
    await post('password-reset', { email: 'limited@example.com' });
    await post('password-reset', { email: 'limited@example.com' });
    const limited = await post('password-reset', { email: 'limited@example.com' });

    expect(limited.response.status).toBe(429);
    expect(limited.payload.error?.message).toBe('TOO_MANY_REQUESTS');
  });

  it('uses only the authenticated Firebase user as the verification recipient', async () => {
    const { response, payload } = await post('verification', { email: 'attacker@example.com' }, 'Bearer token');

    expect(response.status).toBe(202);
    expect(payload.status).toBe('accepted');
    expect(authMocks.generateEmailVerificationLink).toHaveBeenCalledWith(
      'student@example.com',
      expect.objectContaining({ handleCodeInApp: false, url: expect.stringContaining('/#/verify-email') }),
    );
    const sentLink = mailMocks.sendFirebaseVerificationEmail.mock.calls[0]?.[1] as string;
    expect(sentLink).toBe(
      'https://app.untitledmanagementsoftware.com/auth/action?mode=verifyEmail&oobCode=verify-code&apiKey=api-key&continueUrl=https%3A%2F%2Fapp.untitledmanagementsoftware.com%2F%23%2Fverify-email&lang=en',
    );
    expect(sentLink).not.toContain('firebaseapp.com');
  });

  it('does not send for verified users and surfaces authenticated delivery failures', async () => {
    authMocks.getUser.mockResolvedValueOnce({ uid: 'firebase-user-1', email: 'student@example.com', emailVerified: true });
    const verified = await post('verification', {}, 'Bearer token');
    expect(verified.payload.status).toBe('already_verified');
    expect(mailMocks.sendFirebaseVerificationEmail).not.toHaveBeenCalled();

    mailMocks.sendFirebaseVerificationEmail.mockRejectedValueOnce(new Error('SendGrid unavailable'));
    const failed = await post('verification', {}, 'Bearer token');
    expect(failed.response.status).toBe(502);
    expect(failed.payload.error?.message).toBe('EMAIL_DELIVERY_FAILED');

    authMocks.generateEmailVerificationLink.mockRejectedValueOnce(new Error('Firebase unavailable'));
    const generationFailed = await post('verification', {}, 'Bearer token');
    expect(generationFailed.response.status).toBe(502);
    expect(generationFailed.payload.error?.message).toBe('EMAIL_DELIVERY_FAILED');
  });

  it('requires Firebase authentication for verification', async () => {
    authMocks.authenticatedFirebaseUser.mockRejectedValueOnce(new Error('AUTH_TOKEN_REQUIRED'));
    const result = await post('verification');
    expect(result.response.status).toBe(401);
  });
});

describe('feedback route', () => {
  it('sends feedback from the authenticated user and requires a message', async () => {
    const { response, payload } = await post('feedback', { message: 'Loving the app, one idea...', name: 'Student Name' }, 'Bearer token');

    expect(response.status).toBe(202);
    expect(payload).toEqual({ status: 'accepted' });
    expect(mailMocks.sendFeedbackEmail).toHaveBeenCalledWith({
      senderEmail: 'student@example.com',
      senderName: 'Student Name',
      message: 'Loving the app, one idea...',
    });

    const empty = await post('feedback', { message: '   ' }, 'Bearer token');
    expect(empty.response.status).toBe(400);
  });

  it('requires authentication and surfaces delivery failures', async () => {
    authMocks.authenticatedFirebaseUser.mockRejectedValueOnce(new Error('AUTH_TOKEN_REQUIRED'));
    const unauthenticated = await post('feedback', { message: 'hello' });
    expect(unauthenticated.response.status).toBe(401);

    mailMocks.sendFeedbackEmail.mockRejectedValueOnce(new Error('SendGrid unavailable'));
    const failed = await post('feedback', { message: 'hello' }, 'Bearer token');
    expect(failed.response.status).toBe(502);
    expect(failed.payload.error?.message).toBe('EMAIL_DELIVERY_FAILED');
  });

  it('rate limits repeated feedback submissions per user', async () => {
    for (let i = 0; i < 5; i += 1) {
      await post('feedback', { message: `message ${i}` }, 'Bearer token');
    }
    const limited = await post('feedback', { message: 'one more' }, 'Bearer token');
    expect(limited.response.status).toBe(429);
    expect(limited.payload.error?.message).toBe('TOO_MANY_REQUESTS');
  });
});
