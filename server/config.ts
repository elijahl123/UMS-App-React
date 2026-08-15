import dotenv from 'dotenv';
import { parseAllowedOrigins } from './cors';

dotenv.config();

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

function numberEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) {
    return fallback;
  }

  const value = Number(raw);
  if (!Number.isFinite(value)) {
    throw new Error(`${name} must be a number`);
  }

  return value;
}

function booleanEnv(name: string, fallback = false): boolean {
  const raw = process.env[name];
  if (!raw) {
    return fallback;
  }

  return raw === 'true' || raw === '1';
}

function listEnv(name: string): string[] {
  return (process.env[name] ?? '')
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
}

function isoDateEnv(name: string, fallback: string): string {
  const raw = process.env[name] ?? fallback;
  const value = new Date(raw);
  if (Number.isNaN(value.getTime())) {
    throw new Error(`${name} must be an ISO-8601 timestamp`);
  }
  return value.toISOString();
}

const appOrigin = process.env.APP_ORIGIN ?? process.env.VITE_DEV_ORIGIN ?? 'http://localhost:5173';

export const config = {
  port: numberEnv('PORT', 3001),
  appEnv: process.env.APP_ENV ?? 'development',
  appOrigin,
  appOrigins: parseAllowedOrigins(appOrigin, process.env.APP_ORIGINS),
  appBaseUrl: process.env.APP_BASE_URL ?? appOrigin ?? process.env.VITE_DEV_ORIGIN ?? 'http://127.0.0.1:5173',
  databaseUrl: requiredEnv('DATABASE_URL'),
  stagingAccessControlEnabled: booleanEnv('STAGING_ACCESS_CONTROL_ENABLED'),
  stagingAdminEmails: listEnv('STAGING_ADMIN_EMAILS'),
  firebaseProjectId: process.env.FIREBASE_PROJECT_ID ?? process.env.GOOGLE_CLOUD_PROJECT,
  firebaseClientEmail: process.env.FIREBASE_CLIENT_EMAIL,
  firebasePrivateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  firebaseWebApiKey: process.env.VITE_FIREBASE_API_KEY,
  sendgridApiKey: process.env.SENDGRID_API_KEY,
  sendgridFromEmail: process.env.SENDGRID_FROM_EMAIL ?? 'noreply@untitledmanagementsoftware.com',
  stripeSecretKey: process.env.STRIPE_SECRET_KEY,
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
  stripePublishableKey: process.env.STRIPE_PUBLISHABLE_KEY ?? process.env.VITE_STRIPE_PUBLISHABLE_KEY,
  stripeMonthlyPriceId: process.env.STRIPE_MONTHLY_PRICE_ID,
  stripeYearlyPriceId: process.env.STRIPE_YEARLY_PRICE_ID,
  googleCalendarClientId: process.env.GOOGLE_CALENDAR_CLIENT_ID ?? process.env.VITE_GOOGLE_CLIENT_ID,
  googleCalendarClientSecret: process.env.GOOGLE_CALENDAR_CLIENT_SECRET,
  googleCalendarRedirectUri: process.env.GOOGLE_CALENDAR_REDIRECT_URI
    ?? `${(process.env.APP_BASE_URL ?? appOrigin).replace(/\/+$/, '')}/api/google-calendar/oauth/callback`,
  googleTokenEncryptionKey: process.env.GOOGLE_TOKEN_ENCRYPTION_KEY,
  spacesBucket: process.env.SPACES_BUCKET ?? 'umstatic',
  spacesRegion: process.env.SPACES_REGION,
  spacesAccessKeyId: process.env.SPACES_ACCESS_KEY_ID,
  spacesSecretAccessKey: process.env.SPACES_SECRET_ACCESS_KEY,
  marketingOrigin: (process.env.MARKETING_ORIGIN ?? 'https://untitledmanagementsoftware.com').replace(/\/+$/, ''),
  ucdAccessEnabled: booleanEnv('UCD_ACCESS_ENABLED'),
  ucdAccessDomain: (process.env.UCD_ACCESS_DOMAIN ?? 'ucdconnect.ie').trim().toLowerCase(),
  ucdAccessEndAt: isoDateEnv('UCD_ACCESS_END_AT', '2027-01-18T00:00:00Z'),
  ucdAccessGraceEndAt: isoDateEnv('UCD_ACCESS_GRACE_END_AT', '2027-02-01T00:00:00Z'),
  sendgridUcdLaunchUnsubscribeGroupId: numberEnv('SENDGRID_UCD_LAUNCH_UNSUBSCRIBE_GROUP_ID', 261009),
  palomarAccessEnabled: booleanEnv('PALOMAR_ACCESS_ENABLED'),
  palomarAccessDomain: (process.env.PALOMAR_ACCESS_DOMAIN ?? 'student.palomar.edu').trim().toLowerCase(),
  palomarAccessEndAt: isoDateEnv('PALOMAR_ACCESS_END_AT', '2027-01-18T00:00:00Z'),
  palomarAccessGraceEndAt: isoDateEnv('PALOMAR_ACCESS_GRACE_END_AT', '2027-02-01T00:00:00Z'),
  sendgridPalomarLaunchUnsubscribeGroupId: numberEnv('SENDGRID_PALOMAR_LAUNCH_UNSUBSCRIBE_GROUP_ID', 0),
};
