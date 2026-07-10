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
  databaseUrl: requiredEnv('DATABASE_URL'),
  sendgridApiKey: process.env.SENDGRID_API_KEY,
};
