import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import morgan from 'morgan';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadUser } from './middleware/auth.js';
import { UPLOAD_ROOT } from './middleware/upload.js';
import auth from './routes/auth.js';
import users from './routes/users.js';
import equipment from './routes/equipment.js';
import consumables from './routes/consumables.js';
import requests from './routes/requests.js';
import comments from './routes/comments.js';
import bookings from './routes/bookings.js';
import cart from './routes/cart.js';
import notifications from './routes/notifications.js';
import maintenance from './routes/maintenance.js';
import announcements from './routes/announcements.js';
import activity from './routes/activity.js';
import insights from './routes/insights.js';

const app = express();
app.set('trust proxy', true);
app.use(cors({ origin: process.env.CLIENT_ORIGIN || 'http://localhost:5173', credentials: true }));
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());
app.use(morgan('dev'));
app.use(loadUser);

// Locally stored uploads (avatars, equipment photos, attachments)
app.use('/uploads', express.static(UPLOAD_ROOT, { maxAge: '1d' }));

app.get('/api/health', (_req, res) => res.json({ ok: true }));
app.use('/api/auth', auth);
app.use('/api/users', users);
app.use('/api/equipment', equipment);
app.use('/api/consumables', consumables);
app.use('/api/requests', requests);
app.use('/api/comments', comments);
app.use('/api/bookings', bookings);
app.use('/api/cart', cart);
app.use('/api/notifications', notifications);
app.use('/api/maintenance', maintenance);
app.use('/api/announcements', announcements);
app.use('/api/activity', activity);
app.use('/api', insights);
app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found' }));

// Serve the built React app in production (`npm run build` in /client)
const clientDist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../client/dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get(/^\/(?!api|uploads).*/, (_req, res) => res.sendFile(path.join(clientDist, 'index.html')));
}

// Central error handler: maps DB errors to friendly HTTP responses and returns transaction traces.
const SQL_ERRORS = {
  ER_DUP_ENTRY: [409, 'That value already exists (must be unique)'],
  ER_ROW_IS_REFERENCED_2: [409, 'This record is still referenced by other records (e.g. past orders) and cannot be deleted'],
  ER_NO_REFERENCED_ROW_2: [400, 'A referenced record does not exist'],
  ER_CHECK_CONSTRAINT_VIOLATED: [400, 'Value violates a database constraint'],
  ER_TRUNCATED_WRONG_VALUE_FOR_FIELD: [400, 'Invalid value for a field'],
  WARN_DATA_TRUNCATED: [400, 'Invalid value for a field'],
  LIMIT_FILE_SIZE: [400, 'File is too large'],
};
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  let status = err.status || 500;
  let message = err.message || 'Server error';
  if (SQL_ERRORS[err.code]) [status, message] = [SQL_ERRORS[err.code][0], `${SQL_ERRORS[err.code][1]}`];
  if (err.name === 'ValidationError' || err.name === 'CastError') status = 400;
  if (status >= 500 && !err.trace) console.error(err);
  res.status(status).json({
    error: message,
    ...(err.trace && { trace: err.trace }),
    ...(err.rolledBack && { rolledBack: true }),
    ...(err.stockBefore && { stockBefore: err.stockBefore, stockAfter: err.stockAfter }),
  });
});

export default app;
