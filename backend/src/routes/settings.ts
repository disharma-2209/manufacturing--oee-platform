import { Router, Request, Response } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { getDb } from '../db/init';
import { authMiddleware } from '../middleware/auth';
import { requireAdmin } from '../middleware/rbac';
import { logAudit } from '../services/audit';
import { logger } from '../utils/logger';

const router = Router();

const settingsSchema = z.object({
  plant_name: z.string().max(200).optional(),
  shifts_per_day: z.number().min(1).max(4).optional(),
  hours_per_shift: z.number().min(1).max(12).optional(),
  days_per_week: z.number().min(1).max(7).optional(),
  oee_goal: z.number().min(0).max(1).optional(),
  oee_minimum: z.number().min(0).max(1).optional(),
  availability_goal: z.number().min(0).max(1).optional(),
  performance_goal: z.number().min(0).max(1).optional(),
  quality_goal: z.number().min(0).max(1).optional(),
  downtime_threshold_minutes: z.number().min(0).max(60).optional(),
  cost_per_hour_usd: z.number().min(0).optional(),
});

const userCreateSchema = z.object({
  username: z.string().min(3).max(50).regex(/^[a-zA-Z0-9_]+$/),
  password: z.string().min(8).max(200),
  role: z.enum(['admin', 'analyst', 'viewer']),
});

const userUpdateSchema = z.object({
  role: z.enum(['admin', 'analyst', 'viewer']).optional(),
  is_active: z.number().min(0).max(1).optional(),
  password: z.string().min(8).max(200).optional(),
});

router.get('/', authMiddleware, (_req: Request, res: Response) => {
  try {
    const db = getDb();
    const settings = db.prepare('SELECT * FROM oee_settings ORDER BY id DESC LIMIT 1').get();
    res.json(settings);
  } catch (error) {
    logger.error('Get settings error', { error });
    res.status(500).json({ error: 'Failed to fetch settings' });
  }
});

router.put('/', authMiddleware, requireAdmin, (req: Request, res: Response) => {
  const result = settingsSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: 'Invalid input', details: result.error.issues });
    return;
  }
  try {
    const db = getDb();
    const data = result.data;
    const fields = Object.keys(data).filter((k) => data[k as keyof typeof data] !== undefined);
    if (fields.length === 0) {
      const settings = db.prepare('SELECT * FROM oee_settings ORDER BY id DESC LIMIT 1').get();
      res.json(settings);
      return;
    }
    const setClause = fields.map((f) => `${f} = ?`).join(', ');
    const values = fields.map((f) => data[f as keyof typeof data]);
    db.prepare(`UPDATE oee_settings SET ${setClause}, updated_at = CURRENT_TIMESTAMP WHERE id = (SELECT id FROM oee_settings ORDER BY id DESC LIMIT 1)`)
      .run(...values);
    logAudit(req.user!.userId, req.user!.username, 'UPDATE_SETTINGS', 'oee_settings', 'Settings updated', req.ip);
    const updated = db.prepare('SELECT * FROM oee_settings ORDER BY id DESC LIMIT 1').get();
    res.json(updated);
  } catch (error) {
    logger.error('Update settings error', { error });
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

router.get('/users', authMiddleware, requireAdmin, (_req: Request, res: Response) => {
  try {
    const db = getDb();
    const users = db.prepare('SELECT id, username, role, created_at, last_login, is_active FROM users ORDER BY created_at DESC').all();
    res.json(users);
  } catch (error) {
    logger.error('Get users error', { error });
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

router.post('/users', authMiddleware, requireAdmin, async (req: Request, res: Response) => {
  const result = userCreateSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: 'Invalid input', details: result.error.issues });
    return;
  }
  try {
    const db = getDb();
    const { username, password, role } = result.data;
    const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
    if (existing) {
      res.status(409).json({ error: 'Username already exists' });
      return;
    }
    const hash = await bcrypt.hash(password, 12);
    const r = db.prepare('INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)').run(username, hash, role);
    logAudit(req.user!.userId, req.user!.username, 'CREATE_USER', 'users', `Created user: ${username}`, req.ip);
    const created = db.prepare('SELECT id, username, role, created_at, is_active FROM users WHERE id = ?').get(r.lastInsertRowid);
    res.status(201).json(created);
  } catch (error) {
    logger.error('Create user error', { error });
    res.status(500).json({ error: 'Failed to create user' });
  }
});

router.put('/users/:id', authMiddleware, requireAdmin, async (req: Request, res: Response) => {
  const result = userUpdateSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: 'Invalid input', details: result.error.issues });
    return;
  }
  try {
    const db = getDb();
    const existing = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
    if (!existing) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    const data = result.data;
    if (data.password) {
      const hash = await bcrypt.hash(data.password, 12);
      db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, req.params.id);
    }
    if (data.role !== undefined) {
      db.prepare('UPDATE users SET role = ? WHERE id = ?').run(data.role, req.params.id);
    }
    if (data.is_active !== undefined) {
      db.prepare('UPDATE users SET is_active = ? WHERE id = ?').run(data.is_active, req.params.id);
    }
    logAudit(req.user!.userId, req.user!.username, 'UPDATE_USER', 'users', `Updated user ${req.params.id}`, req.ip);
    const updated = db.prepare('SELECT id, username, role, created_at, last_login, is_active FROM users WHERE id = ?').get(req.params.id);
    res.json(updated);
  } catch (error) {
    logger.error('Update user error', { error });
    res.status(500).json({ error: 'Failed to update user' });
  }
});

router.get('/audit-log', authMiddleware, requireAdmin, (req: Request, res: Response) => {
  try {
    const db = getDb();
    const { limit = '50', offset = '0', action } = req.query;
    let query = 'SELECT * FROM audit_log WHERE 1=1';
    const params: unknown[] = [];
    if (action) { query += ' AND action = ?'; params.push(action); }
    query += ' ORDER BY timestamp DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit as string), parseInt(offset as string));
    const logs = db.prepare(query).all(...params);
    const total = db.prepare('SELECT COUNT(*) as count FROM audit_log').get() as { count: number };
    res.json({ logs, total: total.count });
  } catch (error) {
    logger.error('Audit log error', { error });
    res.status(500).json({ error: 'Failed to fetch audit log' });
  }
});

export default router;
