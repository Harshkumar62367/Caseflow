import assert from 'node:assert/strict';
import test from 'node:test';
import { GET, POST, PATCH } from '../app/api/[...path]/route.js';
import { resetState } from '../lib/data.mjs';

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

test.beforeEach(() => { delete process.env.BENCHMARK_VARIANT; resetState(); });

test('health and authentication', async () => {
  assert.equal((await invoke(GET, 'GET', '/health')).data.ok, true);
  assert.equal((await invoke(GET, 'GET', '/tickets')).response.status, 401);
  const { cookie } = await login();
  assert.equal((await invoke(GET, 'GET', '/tickets', { cookie })).data.total, 8);
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
