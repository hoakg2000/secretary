import { execSync } from 'node:child_process';
import pg from 'pg';
import type { TestProject } from 'vitest/node';

export default async function setup({ config }: TestProject) {
  const url = new URL(config.env.DATABASE_URL as string);
  const database = url.pathname.slice(1);
  // The suite truncates every table: never run it against anything but a *_test database
  if (!database.endsWith('_test')) {
    throw new Error(`Refusing to run integration tests on database "${database}"`);
  }

  const adminUrl = new URL(url);
  adminUrl.pathname = '/postgres';
  const admin = new pg.Client({ connectionString: adminUrl.href });
  await admin.connect();
  try {
    const existing = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [database]);
    if (existing.rowCount === 0) {
      await admin.query(`CREATE DATABASE "${database}"`);
    }
  } finally {
    await admin.end();
  }

  const env = { ...process.env, DATABASE_URL: url.href };
  execSync('npx prisma migrate deploy', { env, stdio: 'pipe' });
}
