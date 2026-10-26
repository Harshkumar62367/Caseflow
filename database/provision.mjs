import { readFile } from 'node:fs/promises';
import pg from 'pg';
import { seedTickets } from '../lib/data.mjs';

if (!process.env.CASEFLOW_DATABASE_URL) {
  throw new Error('CASEFLOW_DATABASE_URL is required for a Vercel deployment.');
}

const client = new pg.Client({ connectionString: process.env.CASEFLOW_DATABASE_URL, connectionTimeoutMillis: 15000 });
try {
  await client.connect();
  await client.query('BEGIN');
  await client.query("SELECT pg_advisory_xact_lock(hashtext('caseflow_demo_provision'))");
  await client.query(await readFile(new URL('./schema.sql', import.meta.url), 'utf8'));
  for (const ticket of seedTickets()) {
    await client.query('INSERT INTO caseflow_demo.tickets (id, data) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING', [ticket.id, ticket]);
  }
  await client.query(`SELECT setval('caseflow_demo.tickets_id_seq', GREATEST(
    (SELECT CASE WHEN is_called THEN last_value ELSE last_value - 1 END FROM caseflow_demo.tickets_id_seq),
    (SELECT COALESCE(MAX(id), 1008) FROM caseflow_demo.tickets)
  ), true)`);
  await client.query('COMMIT');
  console.log('Caseflow database is ready; existing tickets and sessions were preserved.');
} catch (error) {
  await client.query('ROLLBACK').catch(() => {});
  console.error('Caseflow database setup failed:', error.code || 'connection unavailable');
  process.exitCode = 1;
} finally {
  await client.end();
}
