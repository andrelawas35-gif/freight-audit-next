import { defineConfig } from 'drizzle-kit';
import { assertNotProduction } from './db/guard';

// Every drizzle-kit command loads this file, so this refuses db:push, db:studio
// and db:pull against production unless deliberately overridden (WO 2026-09-20-001).
assertNotProduction(process.env.DATABASE_URL, { command: 'drizzle-kit' });

export default defineConfig({
  schema: './db/schema.ts',
  out: './db/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
