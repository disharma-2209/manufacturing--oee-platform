import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import { getDb, isFirstRun, createAdminUser } from '../db/init';
import { authMiddleware } from '../middleware/auth';
import { logAudit } from '../services/audit';
import { logger } from '../utils/logger';

const router = Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { error: 'Too many login attempts. Please try again in 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 3,
  message: { error: 'Too many registration requests. Please try again in an hour.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const loginSchema = z.object({
  username: z.string().min(1).max(100),
  password: z.string().min(1).max(200),
});

const setupSchema = z.object({
  username: z.string().min(3).max(50).regex(/^[a-zA-Z0-9_]+$/),
  password: z.string().min(8).max(200),
});

const registerSchema = z.object({
  username:       z.string().min(3).max(50).regex(/^[a-zA-Z0-9_]+$/),
  email:          z.string().email(),
  full_name:      z.string().min(2).max(100),
  requested_role: z.enum(['analyst', 'viewer']),
  reason:         z.string().max(500).optional(),
});

function generateToken(userId: number, username: string, role: string): string {
  const secret = process.env.JWT_SECRET || 'fallback-secret-change-in-prod';
  const expiry = process.env.JWT_EXPIRY || '8h';
  return jwt.sign({ userId, username, role }, secret, { expiresIn: expiry } as jwt.SignOptions);
}

router.get('/status', (_req: Request, res: Response) => {
  res.json({ firstRun: isFirstRun() });
});

router.post('/setup', async (req: Request, res: Response) => {
  if (!isFirstRun()) {
    res.status(400).json({ error: 'Admin account already exists' });
    return;
  }
  const result = setupSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: 'Invalid input', details: result.error.issues });
    return;
  }
  try {
    const { username, password } = result.data;
    await createAdminUser(username, password);
    const db = getDb();
    const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username) as { id: number; username: string; role: string };
    const token = generateToken(user.id, user.username, user.role);
    logAudit(user.id, user.username, 'SETUP', 'users', 'Admin account created', req.ip);
    res.json({ token, user: { id: user.id, username: user.username, role: user.role } });
  } catch (error) {
    logger.error('Setup error', { error });
    res.status(500).json({ error: 'Setup failed' });
  }
});

router.post('/login', loginLimiter, async (req: Request, res: Response) => {
  const result = loginSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: 'Invalid credentials' });
    return;
  }
  const { username, password } = result.data;

  try {
    const db = getDb();
    const user = db.prepare('SELECT * FROM users WHERE username = ? AND is_active = 1').get(username) as {
      id: number; username: string; password_hash: string; role: string;
    } | undefined;

    if (!user) {
      res.status(401).json({ error: 'Invalid username or password' });
      return;
    }

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      logAudit(null, username, 'LOGIN_FAILED', 'auth', 'Invalid password', req.ip);
      res.status(401).json({ error: 'Invalid username or password' });
      return;
    }

    db.prepare('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?').run(user.id);
    const token = generateToken(user.id, user.username, user.role);
    logAudit(user.id, user.username, 'LOGIN', 'auth', 'Successful login', req.ip);
    res.json({ token, user: { id: user.id, username: user.username, role: user.role } });
  } catch (error) {
    logger.error('Login error', { error });
    res.status(500).json({ error: 'Login failed' });
  }
});

router.post('/register', registerLimiter, async (req: Request, res: Response) => {
  const result = registerSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: 'Invalid input', details: result.error.issues });
    return;
  }
  const { username, email, full_name, requested_role, reason } = result.data;
  try {
    const db = getDb();
    const existingUser = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
    if (existingUser) {
      res.status(409).json({ error: 'Username already exists' });
      return;
    }
    const existingRequest = db.prepare(
      "SELECT id FROM user_requests WHERE username = ? AND status = 'pending'"
    ).get(username);
    if (existingRequest) {
      res.status(409).json({ error: 'A pending request for this username already exists' });
      return;
    }
    db.prepare(
      'INSERT INTO user_requests (username, email, full_name, requested_role, reason) VALUES (?, ?, ?, ?, ?)'
    ).run(username, email, full_name, requested_role, reason ?? null);
    res.status(201).json({ message: 'Request submitted. An admin will review your access.' });
  } catch (error) {
    logger.error('Register error', { error });
    res.status(500).json({ error: 'Registration failed' });
  }
});

router.post('/logout', authMiddleware, (req: Request, res: Response) => {
  logAudit(req.user!.userId, req.user!.username, 'LOGOUT', 'auth', 'User logged out', req.ip);
  res.json({ message: 'Logged out successfully' });
});

router.get('/me', authMiddleware, (req: Request, res: Response) => {
  const db = getDb();
  db.prepare('UPDATE users SET last_activity = CURRENT_TIMESTAMP WHERE id = ?').run(req.user!.userId);
  const user = db.prepare(
    'SELECT id, username, email, full_name, role, is_active, created_at, last_login, last_activity FROM users WHERE id = ?'
  ).get(req.user!.userId);
  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }
  res.json(user);
});

export default router;
