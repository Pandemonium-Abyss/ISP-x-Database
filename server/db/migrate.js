// Applies db/migrations/*.sql to MySQL (drops + recreates all tables).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'migrations');
const conn = await mysql.createConnection({
  host: process.env.MYSQL_HOST || '127.0.0.1',
  port: Number(process.env.MYSQL_PORT || 3317),
  user: process.env.MYSQL_USER || 'labrador',
  password: process.env.MYSQL_PASSWORD || 'labrador_pw',
  multipleStatements: true,
});
for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
  await conn.query(fs.readFileSync(path.join(dir, file), 'utf8'));
  console.log(`✔ applied ${file}`);
}
await conn.end();
