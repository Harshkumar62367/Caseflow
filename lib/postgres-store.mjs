import pg from 'pg';

let cached;

export function postgresStore(connectionString) {
  if (cached?.connectionString === connectionString) return cached.store;
  const pool = new pg.Pool({ connectionString, max: 3, connectionTimeoutMillis: 10000, idleTimeoutMillis: 10000, allowExitOnIdle: true });
  pool.on('error', (error) => console.error('Caseflow database connection error:', error.code || 'unknown'));

  async function transaction(work) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await work(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally { client.release(); }
  }

  const store = {
    async state() {
      const { rows } = await pool.query('SELECT data FROM caseflow_demo.tickets ORDER BY id');
      const tickets = rows.map((row) => row.data);
      return { tickets, nextId: Math.max(1000, ...tickets.map((ticket) => ticket.id)) + 1 };
    },
    async reset(tickets) {
      await transaction(async (client) => {
        await client.query('LOCK TABLE caseflow_demo.tickets IN EXCLUSIVE MODE');
        await client.query('DELETE FROM caseflow_demo.tickets');
        await client.query('DELETE FROM caseflow_demo.sessions');
        for (const ticket of tickets) await client.query('INSERT INTO caseflow_demo.tickets (id, data) VALUES ($1, $2)', [ticket.id, ticket]);
        await client.query("SELECT setval('caseflow_demo.tickets_id_seq', 1008, true)");
      });
      return store.state();
    },
    async updateTicket(id, update) {
      return transaction(async (client) => {
        const { rows } = await client.query('SELECT data FROM caseflow_demo.tickets WHERE id = $1 FOR UPDATE', [id]);
        if (!rows.length) return null;
        const ticket = rows[0].data;
        const result = update(ticket);
        await client.query('UPDATE caseflow_demo.tickets SET data = $1 WHERE id = $2', [ticket, id]);
        return result ?? ticket;
      });
    },
    async createTicket(ticket) {
      // The identity and JSON document are written by a single statement.
      const { rows } = await pool.query(`
        WITH next AS (SELECT nextval('caseflow_demo.tickets_id_seq') AS id)
        INSERT INTO caseflow_demo.tickets (id, data)
        SELECT id, $1::jsonb || jsonb_build_object('id', id)
        FROM next
        RETURNING data
      `, [ticket]);
      return { ticket: rows[0].data };
    },
    async sessionUser(hash) {
      const { rows } = await pool.query('SELECT user_id FROM caseflow_demo.sessions WHERE token_hash = $1 AND expires_at > $2', [hash, Date.now()]);
      return rows[0]?.user_id;
    },
    async createSession(hash, userId, expiresAt) {
      await pool.query('DELETE FROM caseflow_demo.sessions WHERE expires_at <= $1', [Date.now()]);
      await pool.query('INSERT INTO caseflow_demo.sessions (token_hash, user_id, expires_at) VALUES ($1, $2, $3)', [hash, userId, expiresAt]);
    },
    async clearSession(hash) {
      await pool.query('DELETE FROM caseflow_demo.sessions WHERE token_hash = $1', [hash]);
    },
  };
  cached = { connectionString, store };
  return store;
}
