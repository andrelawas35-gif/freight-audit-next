import { Pool } from '@neondatabase/serverless';
const p = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
const c = await p.connect();
try {
  await c.query('GRANT app_tenant TO neondb_owner');
  console.log('GRANT ok');
} finally {
  c.release();
  await p.end();
}
