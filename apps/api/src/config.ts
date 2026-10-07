import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const rootEnv = path.resolve(here, '../../../.env');

dotenv.config({ path: rootEnv, quiet: true });

function bool(name: string, fallback = false): boolean {
  const value = process.env[name];
  if (value === undefined) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
}

function int(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) ? Math.trunc(value) : fallback;
}

export const config = {
  port: int('PORT', 8081),
  host: process.env.HOST ?? '0.0.0.0',
  databaseUrl: process.env.DATABASE_URL ?? 'postgres://stdg:stdg@localhost:5432/stdg',
  databaseEnabled: bool('ENABLE_DB_PERSISTENCE', false),
  piiBlockMode: process.env.PII_BLOCK_MODE ?? 'strict',
  openAiApiKey: process.env.OPENAI_API_KEY ?? '',
  openAiModel: process.env.OPENAI_MODEL ?? 'gpt-6-astra'
} as const;
