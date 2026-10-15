import { randomUUID } from 'node:crypto';

export const statuses = ['Open', 'In Progress', 'Waiting on Customer', 'Resolved'];
export const priorities = ['Low', 'Medium', 'High'];
export const users = [
  { id: 'u-agent', name: 'Mira Patel', email: 'agent@caseflow.test', password: 'demo123', role: 'agent' },
  { id: 'u-manager', name: 'Jordan Lee', email: 'manager@caseflow.test', password: 'demo123', role: 'manager' },
];

function seedTickets() {
  return [
    { id: 1001, title: 'Cannot access the dashboard', customer: 'elena@northstar.example', description: 'The dashboard stays blank after sign in. Other pages load normally.', priority: 'High', status: 'Open', assignee: 'Mira Patel', createdAt: '2026-10-01T09:15:00Z', dueDate: '2026-10-18' },
    { id: 1002, title: 'Invoice PDF download fails', customer: 'marcus@atlas.example', description: 'Downloading the September invoice shows an error instead of a PDF.', priority: 'Medium', status: 'In Progress', assignee: 'Mira Patel', createdAt: '2026-10-02T10:30:00Z', dueDate: '2026-10-20' },
    { id: 1003, title: 'Update billing contact', customer: 'naomi@brightleaf.example', description: 'Please change the billing contact on the account before the next invoice.', priority: 'Low', status: 'Waiting on Customer', assignee: 'Jordan Lee', createdAt: '2026-10-03T14:00:00Z', dueDate: '2026-10-22' },
    { id: 1004, title: 'Search results omit recent orders', customer: 'owen@riverbend.example', description: 'Orders placed this week do not appear in the search results.', priority: 'High', status: 'Open', assignee: 'Mira Patel', createdAt: '2026-10-05T08:45:00Z', dueDate: '2026-10-17' },
    { id: 1005, title: 'Request export of account history', customer: 'priya@harbor.example', description: 'We need a CSV export of the past six months of account activity.', priority: 'Medium', status: 'Resolved', assignee: 'Jordan Lee', createdAt: '2026-10-06T11:20:00Z', dueDate: '2026-10-24' },
    { id: 1006, title: 'Notification emails arrive twice', customer: 'sam@meridian.example', description: 'Every ticket update generates two identical notification emails.', priority: 'Medium', status: 'In Progress', assignee: 'Mira Patel', createdAt: '2026-10-07T15:10:00Z', dueDate: '2026-10-21' },
    { id: 1007, title: 'Correct company address on receipt', customer: 'theo@pine.example', description: 'The receipt shows our old office address. Please update it.', priority: 'Low', status: 'Open', assignee: 'Jordan Lee', createdAt: '2026-10-08T09:00:00Z', dueDate: '2026-10-25' },
    { id: 1008, title: 'Mobile menu overlaps ticket list', customer: 'uma@shoreline.example', description: 'On a small phone screen, the navigation menu covers the ticket list.', priority: 'Medium', status: 'Waiting on Customer', assignee: 'Mira Patel', createdAt: '2026-10-09T12:40:00Z', dueDate: '2026-10-23' },
  ].map((ticket) => ({ ...ticket, comments: [], history: [] }));
}

function freshState() {
  return { tickets: seedTickets(), nextId: 1009, sessions: new Map() };
}

export function state() {
  globalThis.__caseflowNextState ??= freshState();
  return globalThis.__caseflowNextState;
}

export function resetState() {
  globalThis.__caseflowNextState = freshState();
  return state();
}

export function publicUser(user) {
  return { id: user.id, name: user.name, email: user.email, role: user.role };
}

export function userForRequest(request) {
  const token = request.headers.get('cookie')?.split(';').map((part) => part.trim()).find((part) => part.startsWith('caseflow_session='))?.slice('caseflow_session='.length);
  return users.find((user) => user.id === state().sessions.get(token)) ?? null;
}

export function newSession(user) {
  const token = randomUUID();
  state().sessions.set(token, user.id);
  return token;
}

export function clearSession(request) {
  const token = request.headers.get('cookie')?.split(';').map((part) => part.trim()).find((part) => part.startsWith('caseflow_session='))?.slice('caseflow_session='.length);
  state().sessions.delete(token);
}

export function createTicket(body, user, variant) {
  const title = String(body.title || '').trim();
  const customer = String(body.customer || '').trim().toLowerCase();
  const description = String(body.description || '').trim();
  const priority = String(body.priority || 'Medium');
  const dueDate = String(body.dueDate || '');
  if (title.length < 5) return { error: 'Title must have at least 5 characters' };
  if (variant !== 'validation' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer)) return { error: 'Enter a valid customer email' };
  if (description.length < 10) return { error: 'Description must have at least 10 characters' };
  if (!priorities.includes(priority)) return { error: 'Invalid priority' };
  if (dueDate && !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) return { error: 'Invalid due date' };
  const store = state();
  const ticket = { id: store.nextId++, title, customer, description, priority, status: 'Open', assignee: user.name, createdAt: new Date().toISOString(), dueDate, comments: [], history: [{ action: 'Created ticket', by: user.name, at: new Date().toISOString() }] };
  store.tickets.push(ticket);
  return { ticket };
}
