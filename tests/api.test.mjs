import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { GET, POST, PATCH } from '../app/api/[...path]/route.js';
import { resetState } from '../lib/data.mjs';

const fixture = mkdtempSync(join(tmpdir(), 'caseflow-api-'));
process.env.CASEFLOW_DATA_FILE = join(fixture, 'test.sqlite');
test.after(() => { rmSync(fixture, { recursive: true, force: true }); delete process.env.CASEFLOW_DATA_FILE; });

function call(method, route, { body, cookie, key } = {}) {
  const request = new Request(`http://127.0.0.1:3400/api${route}`, {
    method,
    headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...(cookie ? { cookie } : {}), ...(key ? { 'x-benchmark-key': key } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const pathname = new URL(request.url).pathname.slice('/api/'.length);
  const context = { params: Promise.resolve({ path: pathname.split('/') }) };
  return { request, context };
}

async function invoke(handler, method, route, options = {}) {
  const { request, context } = call(method, route, options);
  const response = await handler(request, context);
  return { response, data: await response.json() };
}

async function login(email = 'agent@caseflow.test') {
  const { response, data } = await invoke(POST, 'POST', '/login', { body: { email, password: 'demo123' } });
  assert.equal(response.status, 200);
  return { cookie: response.headers.get('set-cookie').split(';')[0], user: data.user };
}

test.beforeEach(async () => { delete process.env.BENCHMARK_VARIANT; await resetState(); });

test('health and authentication', async () => {
  assert.equal((await invoke(GET, 'GET', '/health')).data.ok, true);
  assert.equal((await invoke(GET, 'GET', '/tickets')).response.status, 401);
  const { cookie } = await login();
  assert.equal((await invoke(GET, 'GET', '/tickets', { cookie })).data.total, 8);
});

test('invalid credentials fail and a valid login sets a persistent HTTP-only cookie', async () => {
  const invalid = await invoke(POST, 'POST', '/login', { body: { email: 'agent@caseflow.test', password: 'wrong' } });
  assert.equal(invalid.response.status, 401);
  assert.equal(invalid.response.headers.get('set-cookie'), null);
  const valid = await invoke(POST, 'POST', '/login', { body: { email: '  AGENT@CASEFLOW.TEST ', password: 'demo123' } });
  assert.equal(valid.response.status, 200);
  assert.match(valid.response.headers.get('set-cookie'), /Max-Age=604800/);
  assert.match(valid.response.headers.get('set-cookie'), /HttpOnly/);
  assert.equal(valid.data.user.password, undefined);
});

test('a separate server process can read the same login and saved ticket', async () => {
  const { cookie } = await login();
  const created = await invoke(POST, 'POST', '/tickets', { cookie, body: { title: 'Ticket survives a restart', customer: 'alex@example.com', description: 'Verify this ticket remains available in a new server process.' } });
  await invoke(PATCH, 'PATCH', `/tickets/${created.data.ticket.id}`, { cookie, body: { status: 'In Progress' } });
  const child = spawnSync(process.execPath, ['--input-type=module', '-e', `
    import { readFileSync } from 'node:fs';
    import { state, userForRequest } from './lib/data.mjs';
    const cookie = readFileSync(0, 'utf8');
    const user = await userForRequest(new Request('http://localhost/api/me', { headers: { cookie } }));
    const ticket = (await state()).tickets.find((ticket) => ticket.title === 'Ticket survives a restart');
    console.log(JSON.stringify({ userId: user?.id, ticket }));
  `], { cwd: new URL('..', import.meta.url), env: process.env, input: cookie, encoding: 'utf8' });
  assert.equal(child.status, 0, child.stderr);
  const result = JSON.parse(child.stdout);
  assert.equal(result.userId, 'u-agent');
  assert.equal(result.ticket.id, created.data.ticket.id);
  assert.equal(result.ticket.status, 'In Progress');
});

test('logout, expiry and reset invalidate sessions', async () => {
  const first = await login();
  const logout = await invoke(POST, 'POST', '/logout', { cookie: first.cookie });
  assert.match(logout.response.headers.get('set-cookie'), /Max-Age=0/);
  assert.equal((await invoke(GET, 'GET', '/me', { cookie: first.cookie })).response.status, 401);
  const second = await login();
  const db = new DatabaseSync(process.env.CASEFLOW_DATA_FILE);
  db.prepare('UPDATE sessions SET expires_at = ?').run(Date.now() - 1);
  db.close();
  assert.equal((await invoke(GET, 'GET', '/me', { cookie: second.cookie })).response.status, 401);
  const third = await login();
  await resetState();
  assert.equal((await invoke(GET, 'GET', '/me', { cookie: third.cookie })).response.status, 401);
});

test('creation validates email and returns a saved ticket', async () => {
  const { cookie } = await login();
  const invalid = await invoke(POST, 'POST', '/tickets', { cookie, body: { title: 'Billing page error', customer: 'not-an-email', description: 'Billing page fails to load.' } });
  assert.equal(invalid.response.status, 422);
  const valid = await invoke(POST, 'POST', '/tickets', { cookie, body: { title: 'Billing page error', customer: 'alex@example.com', description: 'Billing page fails to load.', priority: 'High' } });
  assert.equal(valid.response.status, 201);
  assert.equal(valid.data.ticket.id, 1009);
});

test('filter and separate updates preserve the correct state', async () => {
  const { cookie } = await login();
  const filter = await invoke(GET, 'GET', '/tickets?status=Open', { cookie });
  assert.ok(filter.data.tickets.every((ticket) => ticket.status === 'Open'));
  await invoke(PATCH, 'PATCH', '/tickets/1002', { cookie, body: { priority: 'High' } });
  await invoke(PATCH, 'PATCH', '/tickets/1002', { cookie, body: { status: 'Waiting on Customer' } });
  const detail = (await invoke(GET, 'GET', '/tickets/1002', { cookie })).data.ticket;
  assert.equal(detail.priority, 'High');
  assert.equal(detail.status, 'Waiting on Customer');
  assert.equal(detail.history.length, 2);
});

test('report requires manager role', async () => {
  const agent = await login();
  assert.equal((await invoke(GET, 'GET', '/report', { cookie: agent.cookie })).response.status, 403);
  const manager = await login('manager@caseflow.test');
  assert.equal((await invoke(GET, 'GET', '/report', { cookie: manager.cookie })).data.total, 8);
});

test('benchmark reset requires its key', async () => {
  assert.equal((await invoke(POST, 'POST', '/benchmark/reset')).response.status, 403);
  assert.equal((await invoke(POST, 'POST', '/benchmark/reset', { key: 'local-demo-reset' })).data.ticketCount, 8);
});

test('Vercel refuses local storage and disables an unconfigured reset endpoint', async () => {
  process.env.VERCEL = '1';
  try {
    assert.equal((await invoke(GET, 'GET', '/health')).response.status, 503);
    assert.equal((await invoke(POST, 'POST', '/benchmark/reset', { key: 'local-demo-reset' })).response.status, 403);
  } finally { delete process.env.VERCEL; }
});
