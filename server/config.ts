import dotenv from 'dotenv';

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

export const config = {
  port: numberEnv('PORT', 3001),
  viteOrigin: process.env.VITE_DEV_ORIGIN ?? 'http://localhost:5173',
  appBaseUrl: process.env.APP_BASE_URL ?? process.env.VITE_DEV_ORIGIN ?? 'http://127.0.0.1:5173',
  databaseUrl: requiredEnv('DATABASE_URL'),
  sendgridApiKey: process.env.SENDGRID_API_KEY,
  stripeSecretKey: process.env.STRIPE_SECRET_KEY,
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
  stripePublishableKey: process.env.STRIPE_PUBLISHABLE_KEY ?? process.env.VITE_STRIPE_PUBLISHABLE_KEY,
  stripeMonthlyPriceId: process.env.STRIPE_MONTHLY_PRICE_ID,
  stripeYearlyPriceId: process.env.STRIPE_YEARLY_PRICE_ID,
};
