import { randomUUID } from 'node:crypto';
import { clearSession, createTicket, newSession, priorities, publicUser, resetState, SESSION_MAX_AGE, state, statuses, updateTicket, userForRequest, users } from '../../../lib/data.mjs';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const variant = () => process.env.BENCHMARK_VARIANT || 'baseline';
const reply = (body, status = 200, headers = {}) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store', ...headers } });
const sessionCookie = (request, value, maxAge) => `caseflow_session=${value}; Max-Age=${maxAge}; HttpOnly; SameSite=Lax; Path=/${process.env.VERCEL || new URL(request.url).protocol === 'https:' ? '; Secure' : ''}`;

async function bodyOf(request) {
  try { return await request.json(); }
  catch { return null; }
}

async function handle(request, context) {
  const { path } = await context.params;
  const route = `/${path.join('/')}`;
  const method = request.method;
  const url = new URL(request.url);

  if (route === '/health' && method === 'GET') {
    await state();
    return reply({ ok: true, storage: process.env.CASEFLOW_DATABASE_URL ? 'postgres' : 'sqlite' });
  }
  if (route === '/config' && method === 'GET') return reply({ accessibleSearch: variant() !== 'a11y', clientEmailValidation: variant() !== 'validation', copyVariant: process.env.UI_COPY_VARIANT || 'original' });
  if (route === '/benchmark/reset' && method === 'POST') {
    if (process.env.VERCEL && !process.env.BENCHMARK_RESET_KEY) return reply({ error: 'Benchmark reset is disabled' }, 403);
    if (request.headers.get('x-benchmark-key') !== (process.env.BENCHMARK_RESET_KEY || 'local-demo-reset')) return reply({ error: 'Invalid reset key' }, 403);
    return reply({ reset: true, ticketCount: (await resetState()).tickets.length });
  }
  if (route === '/login' && method === 'POST') {
    const body = await bodyOf(request);
    if (!body) return reply({ error: 'Invalid JSON' }, 400);
    const user = users.find((candidate) => candidate.email === String(body.email || '').trim().toLowerCase() && candidate.password === body.password);
    if (!user) return reply({ error: 'Email or password is incorrect' }, 401);
    return reply({ user: publicUser(user) }, 200, { 'Set-Cookie': sessionCookie(request, await newSession(user), SESSION_MAX_AGE) });
  }
  if (route === '/logout' && method === 'POST') {
    await clearSession(request);
    return reply({ loggedOut: true }, 200, { 'Set-Cookie': sessionCookie(request, '', 0) });
  }

  const user = await userForRequest(request);
  if (!user) return reply({ error: 'Sign in required' }, 401);
  if (route === '/me' && method === 'GET') return reply({ user: publicUser(user) });

  if (route === '/tickets' && method === 'GET') {
    const q = (url.searchParams.get('q') || '').trim().toLowerCase();
    const status = url.searchParams.get('status') || '';
    const priority = url.searchParams.get('priority') || '';
    const tickets = (await state()).tickets.filter((ticket) => {
      const matchesQuery = !q || [String(ticket.id), ticket.title, ticket.customer, ticket.description].some((value) => value.toLowerCase().includes(q));
      const matchesStatus = !status || ticket.status === status || (variant() === 'filter' && status === 'Open' && ticket.status === 'In Progress');
      return matchesQuery && matchesStatus && (!priority || ticket.priority === priority);
    }).toSorted((a, b) => b.id - a.id);
    return reply({ tickets, total: tickets.length });
  }
  if (route === '/tickets' && method === 'POST') {
    const body = await bodyOf(request);
    if (!body) return reply({ error: 'Invalid JSON' }, 400);
    const result = await createTicket(body, user, variant());
    return result.error ? reply(result, 422) : reply(result, 201);
  }

  const match = route.match(/^\/tickets\/(\d+)(?:\/(comments))?$/);
  if (match) {
    const ticket = (await state()).tickets.find((record) => record.id === Number(match[1]));
    if (!ticket) return reply({ error: 'Ticket not found' }, 404);
    if (!match[2] && method === 'GET') return reply({ ticket });
    if (!match[2] && method === 'PATCH') {
      const body = await bodyOf(request);
      if (!body) return reply({ error: 'Invalid JSON' }, 400);
      for (const field of ['status', 'priority']) {
        if (body[field] === undefined) continue;
        if (!(field === 'status' ? statuses : priorities).includes(body[field])) return reply({ error: `Invalid ${field}` }, 422);
      }
      const response = await updateTicket(ticket.id, (current) => {
        const result = structuredClone(current);
        for (const field of ['status', 'priority']) {
          const value = body[field];
          if (value === undefined || value === current[field]) continue;
          result[field] = value;
          if (variant() === 'workflow' && field === 'status' && value === 'Resolved') continue;
          const previous = current[field];
          current[field] = value;
          current.history.unshift({ action: `Changed ${field} from ${previous} to ${value}`, by: user.name, at: new Date().toISOString() });
        }
        result.history = current.history;
        return result;
      });
      return response ? reply({ ticket: response }) : reply({ error: 'Ticket not found' }, 404);
    }
    if (match[2] && method === 'POST') {
      const body = await bodyOf(request);
      if (!body) return reply({ error: 'Invalid JSON' }, 400);
      const text = String(body.text || '').trim();
      if (text.length < 3) return reply({ error: 'Comment must have at least 3 characters' }, 422);
      const comment = { id: randomUUID(), text, by: user.name, at: new Date().toISOString() };
      const saved = await updateTicket(ticket.id, (current) => {
        current.comments.unshift(comment);
        current.history.unshift({ action: 'Added a comment', by: user.name, at: comment.at });
      });
      return saved ? reply({ comment }, 201) : reply({ error: 'Ticket not found' }, 404);
    }
  }
  if (route === '/report' && method === 'GET') {
    if (user.role !== 'manager' && variant() !== 'authorization') return reply({ error: 'Manager access required' }, 403);
    const tickets = (await state()).tickets;
    return reply({ total: tickets.length, byStatus: Object.fromEntries(statuses.map((name) => [name, tickets.filter((ticket) => ticket.status === name).length])), byPriority: Object.fromEntries(priorities.map((name) => [name, tickets.filter((ticket) => ticket.priority === name).length])) });
  }
  return reply({ error: 'Endpoint not found' }, 404);
}

async function serve(request, context) {
  try { return await handle(request, context); }
  catch (error) {
    console.error('Caseflow storage request failed:', error.code || error.name);
    return reply({ error: 'Caseflow storage is unavailable. Please try again shortly.' }, 503);
  }
}

export { serve as GET, serve as POST, serve as PATCH, serve as DELETE };
