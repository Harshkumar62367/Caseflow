'use client';

import { useEffect, useState } from 'react';

const statuses = ['Open', 'In Progress', 'Waiting on Customer', 'Resolved'];
const priorities = ['Low', 'Medium', 'High'];
const defaults = { accessibleSearch: true, clientEmailValidation: true, copyVariant: 'original' };

async function api(path, options = {}) {
  const response = await fetch(path, { credentials: 'same-origin', headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(options.headers || {}) }, ...options });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || `Request failed (${response.status})`);
  return result;
}

function shortDate(value) {
  return value ? new Date(`${String(value).slice(0, 10)}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }) : '—';
}
function dateTime(value) { return value ? new Date(value).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }) : '—'; }
function Pill({ value }) { return <span className={`pill ${String(value).toLowerCase().replaceAll(' ', '-')}`}>{value}</span>; }
function Field({ id, label, children }) { return <div className="field"><label htmlFor={id}>{label}</label>{children}</div>; }
function ErrorMessage({ message }) { return message ? <div className="error" role="alert">{message}</div> : null; }

function Shell({ user, config, active, crumb, children }) {
  const newLabel = config.copyVariant === 'refreshed' ? 'Add request' : 'New ticket';
  async function logout() { await api('/api/logout', { method: 'POST' }); window.location.assign('/login'); }
  return <div className="app-shell">
    <aside className="sidebar" aria-label="Main navigation">
      <a className="brand" href="/tickets"><span className="brand-mark" aria-hidden="true">✦</span>Caseflow</a>
      <div className="nav-caption">Workspace</div>
      <a className={`nav-link ${active === 'tickets' ? 'active' : ''}`} href="/tickets"><span className="nav-icon" aria-hidden="true">▣</span>Tickets</a>
      <a className={`nav-link ${active === 'new' ? 'active' : ''}`} href="/tickets/new"><span className="nav-icon" aria-hidden="true">＋</span>{newLabel}</a>
      {user.role === 'manager' && <a className={`nav-link ${active === 'reports' ? 'active' : ''}`} href="/reports"><span className="nav-icon" aria-hidden="true">◫</span>Reports</a>}
      <div className="sidebar-bottom"><div className="user-chip"><span className="avatar">{user.name.split(' ').map((part) => part[0]).join('')}</span><span><strong>{user.name}</strong><small>{user.role}</small></span></div><button className="button ghost wide" type="button" onClick={logout}>Sign out</button></div>
    </aside>
    <div className="main-area">
      <div className="mobile-top"><a className="brand" href="/tickets"><span className="brand-mark" aria-hidden="true">✦</span>Caseflow</a><nav aria-label="Mobile navigation"><a href="/tickets">Tickets</a><a href="/tickets/new">{newLabel}</a>{user.role === 'manager' && <a href="/reports">Reports</a>}</nav></div>
      <header className="topbar"><span className="breadcrumb">Workspace <span aria-hidden="true">/</span> <strong>{crumb}</strong></span><span className="topbar-right"><span className="top-dot" aria-hidden="true"/>Demo workspace</span></header>
      <main className="page">{children}</main>
    </div>
  </div>;
}

function Login() {
  const [error, setError] = useState('');
  async function submit(event) {
    event.preventDefault(); setError('');
    const values = new FormData(event.currentTarget);
    try { await api('/api/login', { method: 'POST', body: JSON.stringify({ email: values.get('email'), password: values.get('password') }) }); window.location.assign('/tickets'); }
    catch (caught) { setError(caught.message); }
  }
  return <div className="login-page"><section className="login-side"><div className="brand"><span className="brand-mark" aria-hidden="true">✦</span>Caseflow</div><h1>Every customer issue, in clear view.</h1><p>A focused support workspace for your team to track, resolve, and learn from every request.</p><small>Caseflow demo workspace</small></section><main className="login-main"><div className="login-card"><div className="eyebrow">Welcome back</div><h2>Sign in to your workspace</h2><p className="muted">Use your demo account to continue.</p><form onSubmit={submit}><ErrorMessage message={error}/><Field id="email" label="Email address"><input id="email" name="email" type="email" autoComplete="username" required defaultValue="agent@caseflow.test"/></Field><Field id="password" label="Password"><input id="password" name="password" type="password" autoComplete="current-password" required/></Field><button className="button primary wide" type="submit">Sign in</button></form><div className="notice">Demo accounts are listed in the project README. This app contains only sample data.</div></div></main></div>;
}

function Tickets({ user, config }) {
  const [all, setAll] = useState(null);
  const [filtered, setFiltered] = useState(null);
  const [error, setError] = useState('');
  const params = new URLSearchParams(typeof window === 'undefined' ? '' : window.location.search);
  const query = new URLSearchParams();
  for (const key of ['q', 'status', 'priority']) if (params.get(key)) query.set(key, params.get(key));
  useEffect(() => { Promise.all([api('/api/tickets'), api(`/api/tickets?${query}`)]).then(([a, f]) => { setAll(a); setFiltered(f); }).catch((caught) => setError(caught.message)); }, []);
  const count = (status) => all?.tickets.filter((ticket) => ticket.status === status).length ?? 0;
  const newLabel = config.copyVariant === 'refreshed' ? 'Add request' : 'New ticket';
  return <Shell user={user} config={config} active="tickets" crumb="Tickets"><div className="page-head"><div><div className="eyebrow">Support desk</div><h1 className="page-title">Tickets</h1><p className="muted">Track customer requests from first report to resolution.</p></div><a className="button primary" href="/tickets/new"><span aria-hidden="true">＋</span>{newLabel}</a></div><ErrorMessage message={error}/>
    <div className="stats">{[['All tickets', all?.total ?? '—', 'Across the workspace'], ['Open', count('Open'), 'Awaiting action'], ['In progress', count('In Progress'), 'Being worked on'], ['Resolved', count('Resolved'), 'Completed requests']].map(([label, value, hint]) => <div className="stat" key={label}><span className="label">{label}</span><strong>{value}</strong><span className="mini">{hint}</span></div>)}</div>
    <section className="panel" aria-label="Ticket list"><div className="panel-head"><h2>All requests</h2><span className="muted">{filtered?.total ?? '—'} results</span></div><form className="toolbar" action="/tickets" method="get">{config.accessibleSearch && <label className="sr-only" htmlFor="ticket-search">Search tickets</label>}<input id="ticket-search" name="q" type="search" placeholder={config.accessibleSearch ? 'Search tickets or customers' : ''} defaultValue={params.get('q') || ''}/><label className="sr-only" htmlFor="status-filter">Filter by status</label><select id="status-filter" name="status" defaultValue={params.get('status') || ''}><option value="">All statuses</option>{statuses.map((value) => <option key={value}>{value}</option>)}</select><label className="sr-only" htmlFor="priority-filter">Filter by priority</label><select id="priority-filter" name="priority" defaultValue={params.get('priority') || ''}><option value="">All priorities</option>{priorities.map((value) => <option key={value}>{value}</option>)}</select><button className="button" type="submit">Apply filters</button></form>
      <div className="table-wrap"><table><thead><tr><th scope="col">ID</th><th scope="col">Title</th><th scope="col">Customer</th><th scope="col">Priority</th><th scope="col">Status</th><th scope="col">Due</th></tr></thead><tbody>{filtered?.tickets.map((ticket) => <tr key={ticket.id}><td className="id">T-{ticket.id}</td><td><a className="ticket-link" href={`/tickets/${ticket.id}`}>{ticket.title}</a></td><td>{ticket.customer}</td><td><Pill value={ticket.priority}/></td><td><Pill value={ticket.status}/></td><td>{shortDate(ticket.dueDate)}</td></tr>)}{filtered?.total === 0 && <tr><td colSpan="6" className="empty"><strong>No matching tickets</strong>Try another search or filter.</td></tr>}</tbody></table></div>
    </section></Shell>;
}

function NewTicket({ user, config }) {
  const [error, setError] = useState('');
  async function submit(event) {
    event.preventDefault(); setError('');
    try { const result = await api('/api/tickets', { method: 'POST', body: JSON.stringify(Object.fromEntries(new FormData(event.currentTarget))) }); window.location.assign(`/tickets/${result.ticket.id}`); }
    catch (caught) { setError(caught.message); }
  }
  return <Shell user={user} config={config} active="new" crumb="New ticket"><div className="page-head"><div><div className="eyebrow">Support desk</div><h1 className="page-title">New ticket</h1><p className="muted">Capture a request with enough detail for the team to act.</p></div><a className="button" href="/tickets">Back to tickets</a></div><section className="panel"><div className="section"><form onSubmit={submit}><ErrorMessage message={error}/><Field id="title" label="Title"><input id="title" name="title" maxLength="120" minLength="5" required placeholder="Briefly describe the issue"/></Field><div className="field-grid"><Field id="customer" label="Customer email"><input id="customer" name="customer" type={config.clientEmailValidation ? 'email' : 'text'} required placeholder="name@company.com"/></Field><Field id="priority" label="Priority"><select id="priority" name="priority" defaultValue="Medium">{priorities.map((value) => <option key={value}>{value}</option>)}</select></Field></div><Field id="description" label="Description"><textarea id="description" name="description" minLength="10" required placeholder="What happened? What should have happened?"/></Field><Field id="dueDate" label="Due date"><input id="dueDate" name="dueDate" type="date"/></Field><div className="action-row"><a className="button" href="/tickets">Cancel</a><button className="button primary" type="submit">Create ticket</button></div></form></div></section></Shell>;
}

function Detail({ user, config, id }) {
  const [ticket, setTicket] = useState(null);
  const [error, setError] = useState('');
  const [version, setVersion] = useState(0);
  useEffect(() => { api(`/api/tickets/${id}`).then((data) => setTicket(data.ticket)).catch((caught) => setError(caught.message)); }, [id, version]);
  async function update(event, field) { event.preventDefault(); setError(''); try { await api(`/api/tickets/${id}`, { method: 'PATCH', body: JSON.stringify({ [field]: new FormData(event.currentTarget).get(field) }) }); setVersion((v) => v + 1); } catch (caught) { setError(caught.message); } }
  async function comment(event) { event.preventDefault(); setError(''); try { await api(`/api/tickets/${id}/comments`, { method: 'POST', body: JSON.stringify({ text: new FormData(event.currentTarget).get('text') }) }); setVersion((v) => v + 1); } catch (caught) { setError(caught.message); } }
  return <Shell user={user} config={config} active="tickets" crumb={`Ticket T-${id}`}><ErrorMessage message={error}/>{ticket && <><div className="page-head"><div><div className="eyebrow">Ticket T-{ticket.id}</div><h1 className="page-title">{ticket.title}</h1><p className="muted">Created {dateTime(ticket.createdAt)}</p></div><a className="button" href="/tickets">Back to tickets</a></div><div className="detail-grid"><div className="stack"><section className="panel"><div className="section"><h2>Issue details</h2><p>{ticket.description}</p><div className="metadata"><div><small>Customer</small><strong>{ticket.customer}</strong></div><div><small>Assignee</small><strong>{ticket.assignee}</strong></div><div><small>Due date</small><strong>{shortDate(ticket.dueDate)}</strong></div><div><small>Ticket ID</small><strong>T-{ticket.id}</strong></div></div></div></section><section className="panel"><div className="section"><h2>Conversation</h2><form onSubmit={comment}><Field id="comment-text" label="Add a comment"><textarea id="comment-text" name="text" minLength="3" required placeholder="Write an update for the team..."/></Field><div className="action-row"><button className="button primary" type="submit">Post comment</button></div></form><div className="comments">{ticket.comments.length ? ticket.comments.map((entry) => <div className="comment" key={entry.id}><strong>{entry.by}</strong> <small>{dateTime(entry.at)}</small><p>{entry.text}</p></div>) : <p className="muted">No comments yet.</p>}</div></div></section></div><div className="stack"><section className="panel"><div className="section"><h2>Ticket settings</h2><form key={`status-${ticket.status}`} onSubmit={(event) => update(event, 'status')}><Field id="ticket-status" label="Status"><select id="ticket-status" name="status" defaultValue={ticket.status}>{statuses.map((value) => <option key={value}>{value}</option>)}</select></Field><button className="button wide" type="submit">Save status</button></form><div className="divider" style={{ margin: '1.2rem 0' }}/><form key={`priority-${ticket.priority}`} onSubmit={(event) => update(event, 'priority')}><Field id="ticket-priority" label="Priority"><select id="ticket-priority" name="priority" defaultValue={ticket.priority}>{priorities.map((value) => <option key={value}>{value}</option>)}</select></Field><button className="button wide" type="submit">Save priority</button></form></div></section><section className="panel"><div className="section"><h2>Activity</h2><ul className="history">{ticket.history.length ? ticket.history.map((entry, index) => <li key={`${entry.at}-${index}`}><strong>{entry.action}</strong><small>{entry.by} · {dateTime(entry.at)}</small></li>) : <li className="muted">No changes yet.</li>}</ul></div></section></div></div></>}</Shell>;
}

function Reports({ user, config }) {
  const [report, setReport] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => { api('/api/report').then(setReport).catch((caught) => setError(caught.message)); }, []);
  const block = (title, values) => <section className="panel"><div className="panel-head"><h2>{title}</h2></div><div className="report-list">{Object.entries(values).map(([name, count]) => <div className="report-line" key={name}><span>{name}</span><strong>{count}</strong></div>)}</div></section>;
  return <Shell user={user} config={config} active="reports" crumb="Reports"><div className="page-head"><div><div className="eyebrow">Team overview</div><h1 className="page-title">Reports</h1><p className="muted">A snapshot of the current support queue.</p></div></div><ErrorMessage message={error}/>{report && <><div className="stats"><div className="stat"><span className="label">Total tickets</span><strong>{report.total}</strong><span className="mini">Current workspace</span></div></div><div className="report-grid">{block('By status', report.byStatus)}{block('By priority', report.byPriority)}</div></>}</Shell>;
}

export default function CaseflowApp() {
  const [session, setSession] = useState(null);
  useEffect(() => { Promise.all([api('/api/config').catch(() => defaults), api('/api/me').catch(() => null)]).then(([config, result]) => setSession({ config, user: result?.user ?? null })); }, []);
  useEffect(() => {
    if (!session) return;
    const path = window.location.pathname;
    if (!session.user && path !== '/login') window.location.replace('/login');
    else if (session.user && (path === '/' || path === '/login')) window.location.replace('/tickets');
  }, [session]);
  if (!session) return <p className="boot-message">Loading Caseflow…</p>;
  const { user, config } = session;
  const path = typeof window === 'undefined' ? '' : window.location.pathname;
  if (!user) return path === '/login' ? <Login/> : <p className="boot-message">Redirecting to sign in…</p>;
  if (path === '/tickets') return <Tickets user={user} config={config}/>;
  if (path === '/tickets/new') return <NewTicket user={user} config={config}/>;
  if (/^\/tickets\/\d+$/.test(path)) return <Detail user={user} config={config} id={Number(path.split('/').at(-1))}/>;
  if (path === '/reports') return <Reports user={user} config={config}/>;
  return <Shell user={user} config={config} active="tickets" crumb="Not found"><h1 className="page-title">Page not found</h1><a href="/tickets">Go to tickets</a></Shell>;
}
