import { createHash, randomBytes } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export const SESSION_MAX_AGE = 7 * 24 * 60 * 60;

export const statuses = ['Open', 'In Progress', 'Waiting on Customer', 'Resolved'];
export const priorities = ['Low', 'Medium', 'High'];
export const users = [
  { id: 'u-agent', name: 'Mira Patel', email: 'agent@caseflow.test', password: 'demo123', role: 'agent' },
  { id: 'u-manager', name: 'Jordan Lee', email: 'manager@caseflow.test', password: 'demo123', role: 'manager' },
];

export function seedTickets() {
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

let database;
let databasePath;

async function cloudStore() {
  const connectionString = process.env.CASEFLOW_DATABASE_URL;
  if (!connectionString) {
    if (process.env.VERCEL) throw new Error('CASEFLOW_DATABASE_URL must be configured for a deployed Caseflow app.');
    return null;
  }
  const { postgresStore } = await import('./postgres-store.mjs');
  return postgresStore(connectionString);
}

function store() {
  const filename = process.env.CASEFLOW_DATA_FILE || resolve('.caseflow/caseflow.sqlite');
  if (database && databasePath === filename) return database;
  database?.close();
  if (filename !== ':memory:') mkdirSync(dirname(filename), { recursive: true });
  database = new DatabaseSync(filename);
  databasePath = filename;
  database.exec(`
    PRAGMA busy_timeout = 5000;
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS tickets (id INTEGER PRIMARY KEY AUTOINCREMENT, data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL, expires_at INTEGER NOT NULL);
  `);
  database.exec('BEGIN IMMEDIATE');
  try {
    if (!database.prepare("SELECT value FROM metadata WHERE key = 'seeded'").get()) {
      const insert = database.prepare('INSERT INTO tickets (id, data) VALUES (?, ?)');
      for (const ticket of seedTickets()) insert.run(ticket.id, JSON.stringify(ticket));
      database.prepare("INSERT INTO metadata (key, value) VALUES ('seeded', '1')").run();
    }
    database.exec('COMMIT');
  } catch (error) {
    database.exec('ROLLBACK');
    throw error;
  }
  return database;
}

export async function state() {
  const cloud = await cloudStore();
  if (cloud) return cloud.state();
  const tickets = store().prepare('SELECT data FROM tickets ORDER BY id').all().map((row) => JSON.parse(row.data));
  return { tickets, nextId: Math.max(1000, ...tickets.map((ticket) => ticket.id)) + 1 };
}

export async function resetState() {
  const cloud = await cloudStore();
  if (cloud) return cloud.reset(seedTickets());
  const db = store();
  db.exec('BEGIN IMMEDIATE');
  try {
    db.exec("DELETE FROM tickets; DELETE FROM sessions; DELETE FROM sqlite_sequence WHERE name = 'tickets'");
    const insert = db.prepare('INSERT INTO tickets (id, data) VALUES (?, ?)');
    for (const ticket of seedTickets()) insert.run(ticket.id, JSON.stringify(ticket));
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
  return state();
}

// Keep each read/modify/write together, including requests from other processes.
export async function updateTicket(id, update) {
  const cloud = await cloudStore();
  if (cloud) return cloud.updateTicket(id, update);
  const db = store();
  db.exec('BEGIN IMMEDIATE');
  try {
    const row = db.prepare('SELECT data FROM tickets WHERE id = ?').get(id);
    if (!row) { db.exec('COMMIT'); return null; }
    const ticket = JSON.parse(row.data);
    const result = update(ticket);
    db.prepare('UPDATE tickets SET data = ? WHERE id = ?').run(JSON.stringify(ticket), id);
    db.exec('COMMIT');
    return result ?? ticket;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

export function publicUser(user) {
  return { id: user.id, name: user.name, email: user.email, role: user.role };
}

function sessionHash(request) {
  const token = request.headers.get('cookie')?.split(';').map((part) => part.trim()).find((part) => part.startsWith('caseflow_session='))?.slice('caseflow_session='.length);
  return /^[a-f0-9]{64}$/.test(token || '') ? createHash('sha256').update(token).digest('hex') : null;
}

export async function userForRequest(request) {
  const hash = sessionHash(request);
  if (!hash) return null;
  const cloud = await cloudStore();
  if (cloud) {
    const userId = await cloud.sessionUser(hash);
    return users.find((user) => user.id === userId) ?? null;
  }
  const session = store().prepare('SELECT user_id FROM sessions WHERE token_hash = ? AND expires_at > ?').get(hash, Date.now());
  return users.find((user) => user.id === session?.user_id) ?? null;
}

export async function newSession(user) {
  const token = randomBytes(32).toString('hex');
  const cloud = await cloudStore();
  if (cloud) {
    await cloud.createSession(createHash('sha256').update(token).digest('hex'), user.id, Date.now() + SESSION_MAX_AGE * 1000);
    return token;
  }
  const db = store();
  db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(Date.now());
  db.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)').run(createHash('sha256').update(token).digest('hex'), user.id, Date.now() + SESSION_MAX_AGE * 1000);
  return token;
}

export async function clearSession(request) {
  const hash = sessionHash(request);
  const cloud = await cloudStore();
  if (cloud) { if (hash) await cloud.clearSession(hash); return; }
  if (hash) store().prepare('DELETE FROM sessions WHERE token_hash = ?').run(hash);
}

export async function createTicket(body, user, variant) {
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
  const ticket = { title, customer, description, priority, status: 'Open', assignee: user.name, createdAt: new Date().toISOString(), dueDate, comments: [], history: [{ action: 'Created ticket', by: user.name, at: new Date().toISOString() }] };
  const cloud = await cloudStore();
  if (cloud) return cloud.createTicket(ticket);
  const db = store();
  db.exec('BEGIN IMMEDIATE');
  try {
    ticket.id = Number(db.prepare('INSERT INTO tickets (data) VALUES (?)').run(JSON.stringify(ticket)).lastInsertRowid);
    db.prepare('UPDATE tickets SET data = ? WHERE id = ?').run(JSON.stringify(ticket), ticket.id);
    db.exec('COMMIT');
    return { ticket };
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}
