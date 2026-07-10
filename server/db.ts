import pg from 'pg';
import { config } from './config';

const { Pool } = pg;

export const pool = new Pool({
  connectionString: config.databaseUrl,
});

export type QueryConfig = {
  text: string;
  values?: unknown[];
};
