import mysql from 'mysql2/promise';

export const pool = mysql.createPool({
  host: process.env.MYSQL_HOST || '127.0.0.1',
  port: Number(process.env.MYSQL_PORT || 3317),
  user: process.env.MYSQL_USER || 'labrador',
  password: process.env.MYSQL_PASSWORD || 'labrador_pw',
  database: process.env.MYSQL_DATABASE || 'labrador',
  waitForConnections: true,
  connectionLimit: 10,
  dateStrings: false,
  decimalNumbers: true,
  timezone: 'Z',
});

/** Shorthand for a single pooled query. Returns rows. */
export async function query(sql, params = []) {
  const [rows] = await pool.query(sql, params);
  return rows;
}

/**
 * Run `fn(conn)` inside an explicit SQL transaction.
 * COMMIT on success, ROLLBACK on any thrown error (error is re-thrown).
 * `trace` (optional array) collects the steps so the UI can show what happened.
 */
export async function withSqlTransaction(fn, trace = []) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    trace.push({ db: 'mysql', step: 'BEGIN TRANSACTION' });
    const result = await fn(conn, trace);
    await conn.commit();
    trace.push({ db: 'mysql', step: 'COMMIT' });
    return result;
  } catch (err) {
    await conn.rollback();
    trace.push({ db: 'mysql', step: 'ROLLBACK', detail: err.message, ok: false });
    throw err;
  } finally {
    conn.release();
  }
}
