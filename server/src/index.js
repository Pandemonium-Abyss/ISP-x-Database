import app from './app.js';
import { pool } from './config/mysql.js';
import { connectMongo } from './config/mongo.js';

const PORT = Number(process.env.PORT || 4000);

async function main() {
  await pool.query('SELECT 1');
  console.log('✔ MySQL connected');
  await connectMongo();
  console.log('✔ MongoDB connected (replica set)');
  app.listen(PORT, () => console.log(`🐾 Labrador API listening on http://localhost:${PORT}`));
}

main().catch((err) => {
  console.error('Failed to start:', err.message);
  process.exit(1);
});
