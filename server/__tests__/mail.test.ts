import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

process.env.DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://user:pass@localhost:5432/test';
process.env.SENDGRID_API_KEY = 'SG.test-key';
process.env.SENDGRID_FROM_EMAIL = 'noreply@untitledmanagementsoftware.com';

const sendGridMocks = vi.hoisted(() => ({
  setApiKey: vi.fn(),
  send: vi.fn(),
}));

vi.mock('@sendgrid/mail', () => ({
  default: sendGridMocks,
}));

let mail: typeof import('../mail');

beforeAll(async () => {
  mail = await import('../mail');
});

beforeEach(() => {
  sendGridMocks.send.mockResolvedValue([{
    statusCode: 202,
    headers: { 'x-message-id': 'message-123' },
  }]);
});

describe('application email templates', () => {
  it('renders Firebase verification and reset links in text and escaped HTML', () => {
    const link = 'https://app.example/action?oobCode=secret&mode=verifyEmail';
    const verification = mail.firebaseVerificationTemplate(link);
    const reset = mail.passwordResetTemplate(link);

    expect(verification.subject).toBe('Verify your email address');
    expect(verification.text).toContain(link);
    expect(verification.html).toContain('oobCode=secret&amp;mode=verifyEmail');
    expect(verification.html).toContain('#f8ad9d');
    expect(verification.html).toContain('launchericon-96x96.png');
    expect(verification.html).toContain('Untitled Management Software');
    expect(verification.html).toContain('Open the secure link in your browser');
    expect(reset.subject).toBe('Reset your password');
    expect(reset.text).toContain('time-limited link');
    expect(reset.html).toContain('Reset password');
  });

  it('renders the application-managed expiry and unsubscribe content', () => {
    const secondary = mail.secondaryEmailVerificationTemplate('https://app.example/secondary-token');
    const waitlist = mail.waitlistConfirmationTemplate({
      list: 'ucd_incoming',
      confirmationUrl: 'https://app.example/confirm?token=confirmation-secret',
      unsubscribeUrl: 'https://app.example/unsubscribe?token=unsubscribe-secret',
    });

    expect(secondary.text).toContain('expires in 24 hours');
    expect(waitlist.text).toContain('expires in 48 hours');
    expect(waitlist.html).toContain('Cancel this request');
  });

  it('keeps Palomar waitlist consent distinct in the confirmation copy', () => {
    const waitlist = mail.waitlistConfirmationTemplate({
      list: 'palomar_incoming',
      confirmationUrl: 'https://app.example/confirm?token=confirmation-secret&page=palomar',
      unsubscribeUrl: 'https://app.example/unsubscribe?token=unsubscribe-secret&page=palomar',
    });

    expect(waitlist.subject).toContain('incoming Palomar student waitlist');
    expect(waitlist.text).toContain('page=palomar');
    expect(waitlist.text).not.toContain('incoming UCD student waitlist');
  });

  it('sends with the shared sender, category, and sanitized structured log', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const recipient = 'student@example.com';
    const link = 'https://app.example/action?oobCode=do-not-log';

    await mail.sendFirebaseVerificationEmail(recipient, link);

    expect(sendGridMocks.send).toHaveBeenCalledWith(expect.objectContaining({
      to: recipient,
      from: { email: 'noreply@untitledmanagementsoftware.com', name: 'Untitled Management Software' },
      categories: ['firebase_verification'],
      text: expect.stringContaining(link),
      html: expect.stringContaining('oobCode=do-not-log'),
    }));
    const serializedLog = JSON.stringify(info.mock.calls);
    expect(serializedLog).toContain('message-123');
    expect(serializedLog).not.toContain(recipient);
    expect(serializedLog).not.toContain('do-not-log');
  });

  it('sanitizes failed-send logs before rethrowing the provider error', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    sendGridMocks.send.mockRejectedValueOnce(Object.assign(new Error('provider rejected recipient student@example.com'), {
      response: { statusCode: 400 },
    }));

    await expect(mail.sendPasswordResetEmail(
      'student@example.com',
      'https://app.example/reset?oobCode=do-not-log',
    )).rejects.toThrow('provider rejected');

    const serializedLog = JSON.stringify(error.mock.calls);
    expect(serializedLog).toContain('send_failed');
    expect(serializedLog).toContain('400');
    expect(serializedLog).not.toContain('student@example.com');
    expect(serializedLog).not.toContain('do-not-log');
  });
});
