import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { initDb } from './db/init';
import { logger } from './utils/logger';
import authRouter from './routes/auth';
import uploadRouter from './routes/upload';
import analyzeRouter from './routes/analyze';
import aiRouter from './routes/ai';
import actionsRouter from './routes/actions';
import settingsRouter from './routes/settings';
import lineUploadRouter from './routes/line-upload';
import usersRouter from './routes/users';
import usageRouter from './routes/usage';
import path from 'path';
import fs from 'fs';

const app = express();
const PORT = parseInt(process.env.PORT || '3001', 10);

app.set('trust proxy', 1);

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      connectSrc: ["'self'", 'https://api.anthropic.com', '*'],
      imgSrc: ["'self'", 'data:', 'blob:'],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
    },
  },
  crossOriginEmbedderPolicy: false,
}));

const allowedOrigins = [
  process.env.ALLOWED_ORIGIN || 'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:5178',
  'http://localhost:3000',
  // Additional origins from env (comma-separated)
  ...(process.env.EXTRA_CORS_ORIGINS ? process.env.EXTRA_CORS_ORIGINS.split(',').map(s => s.trim()) : []),
];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (process.env.NODE_ENV === 'development') return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    const isLocal = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
    if (isLocal) return callback(null, true);
    // Allow Vercel preview URLs
    if (origin && /\.vercel\.app$/.test(origin)) return callback(null, true);
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

const globalLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000'),
  max: parseInt(process.env.RATE_LIMIT_MAX || '200'),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
});

const aiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: { error: 'AI rate limit exceeded. Please wait before making more AI requests.' },
});

app.use(globalLimiter);
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

app.use('/api/auth', authRouter);
app.use('/api/upload', uploadRouter);
app.use('/api/analyze', analyzeRouter);
app.use('/api/ai', aiLimiter, aiRouter);
app.use('/api/actions', actionsRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/line-upload', lineUploadRouter);
app.use('/api/users', usersRouter);
app.use('/api/usage', usageRouter);

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ── Serve frontend static build (for production / Railway deployment) ────
const frontendDist = process.env.FRONTEND_DIST || path.resolve(__dirname, '../../frontend/dist');
if (fs.existsSync(frontendDist)) {
  app.use(express.static(frontendDist));
  // SPA fallback: any non-API route serves index.html
  app.get('*', (_req, res) => {
    if (!_req.path.startsWith('/api')) {
      res.sendFile(path.join(frontendDist, 'index.html'));
    }
  });
  logger.info(`Serving frontend from ${frontendDist}`);
}

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error('Unhandled error', { message: err.message, stack: err.stack });
  res.status(500).json({ error: 'Internal server error' });
});

// Export for Vercel serverless
export { app, initDb };

// Only start the server when running directly (not imported by Vercel)
if (!process.env.VERCEL) {
  (async () => {
    try {
      await initDb();
      app.listen(PORT, () => {
        logger.info(`Server running on port ${PORT}`);
        logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
      });
    } catch (err) {
      logger.error('Failed to start server', { err });
      process.exit(1);
    }
  })();
}


