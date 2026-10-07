import pg from 'pg';
import { config } from './config.js';

const { Pool } = pg;

export const databaseEnabled = config.databaseEnabled;

export const pool = new Pool({
  connectionString: config.databaseUrl,
  connectionTimeoutMillis: 1000,
  idleTimeoutMillis: 5000,
  max: 3,
  query_timeout: 1500,
  statement_timeout: 1500
});

pool.on('error', (error) => {
  console.warn('[database] pool error:', error.message);
});

export async function dbReady(): Promise<boolean> {
  if (!databaseEnabled) return false;

  try {
    await Promise.race([
      pool.query('SELECT 1'),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('database readiness timeout')), 1200)
      )
    ]);
    return true;
  } catch {
    return false;
  }
}
