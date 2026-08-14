import { createHmac } from 'node:crypto';
import sgMail from '@sendgrid/mail';
import { config } from './config';

export type AppEmailKind =
  | 'firebase_verification'
  | 'password_reset'
  | 'secondary_email_verification'
  | 'waitlist_confirmation';

type RenderedEmail = {
  subject: string;
  text: string;
  html: string;
};

type SendAppEmailParams = RenderedEmail & {
  kind: AppEmailKind;
  to: string;
  replyTo?: string;
};

if (config.sendgridApiKey) {
  sgMail.setApiKey(config.sendgridApiKey);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function recipientId(email: string): string {
  return createHmac('sha256', config.sendgridApiKey ?? 'email-log-redaction')
    .update(email.trim().toLowerCase())
    .digest('hex')
    .slice(0, 16);
}

function emailShell(title: string, preheader: string, body: string): string {
  const logoUrl = escapeHtml(`${config.appBaseUrl.replace(/\/+$/, '')}/app-icons/android/launchericon-96x96.png`);
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${escapeHtml(title)}</title>
</head>
<body style="margin:0;padding:0;background:#f7f7f7;color:#56494c;font-family:Poppins,Arial,sans-serif;line-height:1.6">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${escapeHtml(preheader)}</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;background:#f7f7f7">
    <tr>
      <td align="center" style="padding:32px 16px">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:600px;background:#ffffff;border:1px solid #e8e8e8;border-radius:16px;overflow:hidden;box-shadow:0 8px 24px rgba(86,73,76,.08)">
          <tr>
            <td style="background:#f8ad9d;padding:24px 32px">
              <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                <tr>
                  <td style="padding-right:14px;vertical-align:middle">
                    <img src="${logoUrl}" width="48" height="48" alt="UMS" style="display:block;width:48px;height:48px;border:0;border-radius:50%">
                  </td>
                  <td style="vertical-align:middle;color:#473d40;font-size:16px;font-weight:700;letter-spacing:-.1px">
                    Untitled Management Software
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:40px 32px 32px">
              <p style="margin:0 0 12px;color:#f08080;font-size:12px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase">Account security</p>
              <h1 style="margin:0 0 16px;color:#2f2f2f;font-size:28px;line-height:1.25;letter-spacing:-.4px">${escapeHtml(title)}</h1>
              ${body}
            </td>
          </tr>
          <tr>
            <td style="padding:24px 32px;background:#f0ecec;border-top:1px solid #e8e8e8;color:#5a5a5a;font-size:12px;line-height:1.6">
              <p style="margin:0 0 6px">If you did not request this email, you can safely ignore it.</p>
              <p style="margin:0">Sent by Untitled Management Software.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function actionButton(label: string, url: string): string {
  const safeUrl = escapeHtml(url);
  return `<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:24px 0">
  <tr>
    <td align="center" bgcolor="#f4978e" style="border-radius:10px">
      <a href="${safeUrl}" style="display:inline-block;padding:13px 22px;color:#473d40;font-size:14px;font-weight:700;text-decoration:none;border:1px solid #f08080;border-radius:10px">${escapeHtml(label)}</a>
    </td>
  </tr>
</table>
<div style="margin-top:24px;padding:16px;background:#f7f7f7;border:1px solid #e8e8e8;border-radius:10px">
  <p style="margin:0 0 4px;color:#5a5a5a;font-size:12px">Button not working?</p>
  <p style="margin:0;font-size:13px"><a href="${safeUrl}" style="color:#56494c;font-weight:600;text-decoration:underline">Open the secure link in your browser</a></p>
</div>`;
}

export function firebaseVerificationTemplate(link: string): RenderedEmail {
  return {
    subject: 'Verify your email address',
    text: `Verify your email address for Untitled Management Software: ${link}\n\nIf you did not create this account, you can ignore this email.`,
    html: emailShell(
      'Verify your email address',
      'Confirm your email address to finish securing your UMS account.',
      `<p style="margin:0;color:#5a5a5a;font-size:15px">Confirm this email address to finish securing your account.</p>${actionButton('Verify email address', link)}`,
    ),
  };
}

export function passwordResetTemplate(link: string): RenderedEmail {
  return {
    subject: 'Reset your password',
    text: `Use this time-limited link to reset your Untitled Management Software password: ${link}\n\nIf you did not request a password reset, you can ignore this email.`,
    html: emailShell(
      'Reset your password',
      'Use this time-limited link to choose a new UMS password.',
      `<p style="margin:0;color:#5a5a5a;font-size:15px">Use this time-limited link to choose a new password.</p>${actionButton('Reset password', link)}`,
    ),
  };
}

export function secondaryEmailVerificationTemplate(link: string): RenderedEmail {
  return {
    subject: 'Verify this email address',
    text: `Verify this email address for Untitled Management Software: ${link}\n\nThis link expires in 24 hours.`,
    html: emailShell(
      'Verify this email address',
      'Confirm this email address to connect it to your UMS account.',
      `<p style="margin:0;color:#5a5a5a;font-size:15px">Confirm this address to connect it to your account. This link expires in 24 hours.</p>${actionButton('Verify email address', link)}`,
    ),
  };
}

export function waitlistConfirmationTemplate(params: {
  list: 'ucd_incoming' | 'palomar_incoming' | 'ios';
  confirmationUrl: string;
  unsubscribeUrl: string;
}): RenderedEmail {
  const listLabel = params.list === 'ios'
    ? 'iPhone app updates'
    : params.list === 'palomar_incoming'
      ? 'incoming Palomar student waitlist'
      : 'incoming UCD student waitlist';
  const safeUnsubscribeUrl = escapeHtml(params.unsubscribeUrl);
  return {
    subject: `Confirm your ${listLabel} signup`,
    text: `Confirm your place on the ${listLabel}: ${params.confirmationUrl}\n\nThis link expires in 48 hours. If you did not request this, ignore this email or cancel the request: ${params.unsubscribeUrl}`,
    html: emailShell(
      `Confirm your ${listLabel} signup`,
      `Confirm your place on the ${listLabel}.`,
      `<p style="margin:0;color:#5a5a5a;font-size:15px">Confirm your place on the ${escapeHtml(listLabel)}. This link expires in 48 hours.</p>${actionButton('Confirm my email', params.confirmationUrl)}<p style="margin:20px 0 0;font-size:13px"><a href="${safeUnsubscribeUrl}" style="color:#56494c">Cancel this request</a></p>`,
    ),
  };
}

async function sendAppEmail(params: SendAppEmailParams): Promise<void> {
  if (!config.sendgridApiKey) {
    throw new Error('SENDGRID_API_KEY is required');
  }

  const recipient = recipientId(params.to);
  try {
    const [response] = await sgMail.send({
      to: params.to,
      from: { email: config.sendgridFromEmail, name: 'Untitled Management Software' },
      ...(params.replyTo ? { replyTo: params.replyTo } : {}),
      subject: params.subject,
      text: params.text,
      html: params.html,
      categories: [params.kind],
    });
    const messageId = response.headers?.['x-message-id'];
    console.info('[email]', {
      event: 'send_accepted',
      kind: params.kind,
      recipient,
      statusCode: response.statusCode,
      messageId: Array.isArray(messageId) ? messageId[0] : messageId,
    });
  } catch (err) {
    const response = (err as { response?: { statusCode?: number } })?.response;
    console.error('[email]', {
      event: 'send_failed',
      kind: params.kind,
      recipient,
      statusCode: response?.statusCode,
      errorCode: err instanceof Error ? err.name : 'UNKNOWN_ERROR',
    });
    throw err;
  }
}

export function sendFirebaseVerificationEmail(email: string, link: string) {
  return sendAppEmail({ kind: 'firebase_verification', to: email, ...firebaseVerificationTemplate(link) });
}

export function sendPasswordResetEmail(email: string, link: string) {
  return sendAppEmail({ kind: 'password_reset', to: email, ...passwordResetTemplate(link) });
}

export function sendSecondaryEmailVerification(email: string, link: string) {
  return sendAppEmail({ kind: 'secondary_email_verification', to: email, ...secondaryEmailVerificationTemplate(link) });
}

export function sendWaitlistConfirmationEmail(params: {
  email: string;
  list: 'ucd_incoming' | 'palomar_incoming' | 'ios';
  confirmationUrl: string;
  unsubscribeUrl: string;
}) {
  return sendAppEmail({
    kind: 'waitlist_confirmation',
    to: params.email,
    replyTo: 'untitledmanagementsoftware@gmail.com',
    ...waitlistConfirmationTemplate(params),
  });
}
