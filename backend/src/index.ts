import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import 'dotenv/config';

import authRoutes     from './routes/auth';
import slotsRoutes    from './routes/slots';
import bookingsRoutes from './routes/bookings';
import paymentsRoutes from './routes/payments';
import packagesRoutes from './routes/packages';
import sportsRoutes   from './routes/sports';
import configRoutes   from './routes/config';
import devRoutes      from './routes/dev';
import { isDatabaseConfigured } from './lib/database';

const app  = express();
const PORT = parseInt(process.env.PORT ?? '3001', 10);

// Fallback allow-list used only when FRONTEND_URL/FRONTEND_URLS are not set,
// so a missing env var never silently opens CORS to every origin.
const DEFAULT_ALLOWED_ORIGINS = ['https://app.sportygo.com.sg'];

function parseAllowedOrigins(): string[] {
  const single = process.env.FRONTEND_URL ?? '';
  const multi = process.env.FRONTEND_URLS ?? '';
  const combined = [single, multi].filter(Boolean).join(',');

  const configured = combined
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  return configured.length > 0 ? configured : DEFAULT_ALLOWED_ORIGINS;
}

const allowedOrigins = parseAllowedOrigins();

// ── Security middleware ───────────────────────────────────────
app.use(helmet());

// Explicit origin gate before the `cors` package runs, so a rejected origin
// gets a clean 403 JSON response instead of relying on Express error-handler fallthrough.
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (!origin || allowedOrigins.includes(origin)) {
    next();
    return;
  }
  res.status(403).json({ error: 'CORS blocked for this origin.' });
});

app.use(cors({
  origin: (origin, callback) => {
    callback(null, !origin || allowedOrigins.includes(origin));
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(express.json({ limit: '50kb' }));

// Prevent browsers/proxies/CDNs from caching API responses so clients always get fresh data.
app.use('/api', (_req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  next();
});

// ── Routes ────────────────────────────────────────────────────
app.use('/api/auth',     authRoutes);
app.use('/api/slots',    slotsRoutes);
app.use('/api/bookings', bookingsRoutes);
app.use('/api/payments', paymentsRoutes);
app.use('/api/packages', packagesRoutes);
app.use('/api/sports',   sportsRoutes);
app.use('/api/config',   configRoutes);
app.use('/api/dev',      devRoutes);

// ── Health check ──────────────────────────────────────────────
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    database: {
      configured: isDatabaseConfigured(),
    },
  });
});

// ── 404 handler ───────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ error: 'Not found.' });
});

// ── Start server ──────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`[backend] Listening on http://localhost:${PORT}`);
  console.log(`[backend] Accepting requests from: ${allowedOrigins.length > 0 ? allowedOrigins.join(', ') : 'all origins (no FRONTEND_URL/FRONTEND_URLS configured)'}`);
});
