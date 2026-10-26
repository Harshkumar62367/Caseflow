import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import pg from 'pg';
import { seedTickets } from '../lib/data.mjs';
import { GET, POST, PATCH } from '../app/api/[...path]/route.js';

const url = process.env.CASEFLOW_TEST_DATABASE_URL;

test('PostgreSQL keeps sessions and ticket edits consistent across processes', { skip: !url }, async () => {
  const target = new URL(url);
  assert.ok(['localhost', '127.0.0.1'].includes(target.hostname) && target.pathname === '/caseflow_test', 'Use only an isolated local caseflow_test database.');
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    await client.query(await readFile(new URL('../database/schema.sql', import.meta.url), 'utf8'));
    for (const ticket of seedTickets()) await client.query('INSERT INTO caseflow_demo.tickets (id, data) VALUES ($1, $2)', [ticket.id, ticket]);
    await client.query("CREATE ROLE caseflow_demo_app LOGIN PASSWORD 'local-test-only'");
    await client.query(await readFile(new URL('../database/access.sql', import.meta.url), 'utf8'));
    await client.query('CREATE TABLE public.unrelated_data (id INTEGER)');
    const scopedUrl = new URL(url);
    scopedUrl.username = 'caseflow_demo_app';
    scopedUrl.password = 'local-test-only';
    process.env.CASEFLOW_DATABASE_URL = scopedUrl.toString();
    const scoped = new pg.Client({ connectionString: scopedUrl.toString() });
    await scoped.connect();
    try { await assert.rejects(scoped.query('SELECT * FROM public.unrelated_data'), /permission denied/); }
    finally { await scoped.end(); }

    async function invoke(handler, method, path, cookie, body) {
      const request = new Request(`http://localhost/api${path}`, { method, headers: { ...(cookie ? { cookie } : {}), ...(body ? { 'content-type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
      const response = await handler(request, { params: Promise.resolve({ path: path.slice(1).split('/') }) });
      return { response, data: await response.json() };
    }

    const login = await invoke(POST, 'POST', '/login', null, { email: 'agent@caseflow.test', password: 'demo123' });
    assert.equal(login.response.status, 200);
    const cookie = login.response.headers.get('set-cookie').split(';')[0];
    assert.equal((await invoke(GET, 'GET', '/me', cookie)).data.user.id, 'u-agent');
    const created = await Promise.all(Array.from({ length: 4 }, (_, i) => invoke(POST, 'POST', '/tickets', cookie, { title: `Cloud persistence check ${i}`, customer: 'demo@example.com', description: 'Verify the shared database saves this demo ticket.' })));
    assert.ok(created.every((item) => item.response.status === 201));
    assert.equal(new Set(created.map((item) => item.data.ticket.id)).size, 4);
    const id = created[0].data.ticket.id;
    await Promise.all([
      invoke(PATCH, 'PATCH', `/tickets/${id}`, cookie, { priority: 'High' }),
      invoke(PATCH, 'PATCH', `/tickets/${id}`, cookie, { status: 'In Progress' }),
    ]);
    const comment = await invoke(POST, 'POST', `/tickets/${id}/comments`, cookie, { text: 'Shared database verified.' });
    assert.equal(comment.response.status, 201);
    const child = spawnSync(process.execPath, ['--input-type=module', '-e', `
      import { readFileSync } from 'node:fs';
      import { state, userForRequest } from './lib/data.mjs';
      const { cookie, id } = JSON.parse(readFileSync(0, 'utf8'));
      const user = await userForRequest(new Request('http://localhost/api/me', { headers: { cookie } }));
      const ticket = (await state()).tickets.find((ticket) => ticket.id === id);
      console.log(JSON.stringify({ userId: user?.id, ticket }));
    `], { cwd: new URL('..', import.meta.url), env: process.env, input: JSON.stringify({ cookie, id }), encoding: 'utf8' });
    assert.equal(child.status, 0, child.stderr);
    const persisted = JSON.parse(child.stdout);
    assert.equal(persisted.userId, 'u-agent');
    assert.equal(persisted.ticket.priority, 'High');
    assert.equal(persisted.ticket.status, 'In Progress');
    assert.equal(persisted.ticket.comments[0].text, 'Shared database verified.');
    await invoke(POST, 'POST', '/logout', cookie);
    assert.equal((await invoke(GET, 'GET', '/me', cookie)).response.status, 401);
    assert.equal((await invoke(GET, 'GET', '/me', 'caseflow_session=' + 'f'.repeat(64))).response.status, 401);
  } finally {
    delete process.env.CASEFLOW_DATABASE_URL;
    await client.end();
  }
});
