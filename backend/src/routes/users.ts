import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { getDb } from '../db/init';
import { authMiddleware } from '../middleware/auth';
import { requireAdmin } from '../middleware/rbac';
import { logAudit } from '../services/audit';
import { logger } from '../utils/logger';

const router = Router();

router.use(authMiddleware);
router.use(requireAdmin);

// ── Schemas ──────────────────────────────────────────────────────────────────
const approveSchema = z.object({
  role:            z.enum(['analyst', 'viewer', 'admin']),
  initialPassword: z.string().min(8).max(200),
});

const rejectSchema = z.object({
  reason: z.string().min(10).max(500),
});

const patchUserSchema = z.object({
  role:      z.enum(['analyst', 'viewer', 'admin']).optional(),
  is_active: z.number().int().min(0).max(1).optional(),
  email:     z.string().email().optional(),
  full_name: z.string().min(2).max(100).optional(),
});

const resetPasswordSchema = z.object({
  newPassword: z.string().min(8).max(200),
});

// ── GET /users ────────────────────────────────────────────────────────────────
router.get('/', (_req: Request, res: Response) => {
  try {
    const db = getDb();
    const users = db.prepare(`
      SELECT id, username, email, full_name, role, is_active,
             created_at, last_login, last_activity
      FROM users
      ORDER BY created_at DESC
    `).all();
    res.json(users);
  } catch (error) {
    logger.error('GET /users error', { error });
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// ── GET /users/requests ───────────────────────────────────────────────────────
router.get('/requests', (req: Request, res: Response) => {
  try {
    const db = getDb();
    const status = req.query.status as string | undefined;
    let sql = 'SELECT * FROM user_requests';
    const params: string[] = [];
    if (status && ['pending', 'approved', 'rejected'].includes(status)) {
      sql += ' WHERE status = ?';
      params.push(status);
    }
    sql += ' ORDER BY requested_at DESC';
    const requests = db.prepare(sql).all(...params);
    res.json(requests);
  } catch (error) {
    logger.error('GET /users/requests error', { error });
    res.status(500).json({ error: 'Failed to fetch requests' });
  }
});

// ── POST /users/requests/:id/approve ─────────────────────────────────────────
router.post('/requests/:id/approve', async (req: Request, res: Response) => {
  const result = approveSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: 'Invalid input', details: result.error.issues });
    return;
  }
  const { role, initialPassword } = result.data;
  const requestId = parseInt(req.params.id, 10);

  try {
    const db = getDb();
    const request = db.prepare('SELECT * FROM user_requests WHERE id = ?').get(requestId) as {
      id: number; username: string; email: string; full_name: string; status: string;
    } | undefined;

    if (!request) {
      res.status(404).json({ error: 'Request not found' });
      return;
    }
    if (request.status !== 'pending') {
      res.status(409).json({ error: 'Request is no longer pending' });
      return;
    }

    const hash = await bcrypt.hash(initialPassword, 12);
    const insertResult = db.prepare(`
      INSERT INTO users (username, password_hash, role, email, full_name, is_active)
      VALUES (?, ?, ?, ?, ?, 1)
    `).run(request.username, hash, role, request.email, request.full_name);

    const newUserId = Number(insertResult.lastInsertRowid);

    db.prepare(`
      UPDATE user_requests
      SET status = 'approved', reviewed_at = CURRENT_TIMESTAMP, reviewed_by = ?
      WHERE id = ?
    `).run(req.user!.userId, requestId);

    logAudit(
      req.user!.userId,
      req.user!.username,
      'USER_APPROVED',
      'users',
      `Approved ${request.username} as ${role}`,
      req.ip
    );

    res.json({ message: 'User approved', userId: newUserId });
  } catch (error) {
    logger.error('Approve error', { error });
    res.status(500).json({ error: 'Failed to approve request' });
  }
});

// ── POST /users/requests/:id/reject ──────────────────────────────────────────
router.post('/requests/:id/reject', (req: Request, res: Response) => {
  const result = rejectSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: 'Invalid input', details: result.error.issues });
    return;
  }
  const { reason } = result.data;
  const requestId = parseInt(req.params.id, 10);

  try {
    const db = getDb();
    const request = db.prepare('SELECT * FROM user_requests WHERE id = ?').get(requestId) as {
      id: number; username: string; status: string;
    } | undefined;

    if (!request) {
      res.status(404).json({ error: 'Request not found' });
      return;
    }
    if (request.status !== 'pending') {
      res.status(409).json({ error: 'Request is no longer pending' });
      return;
    }

    db.prepare(`
      UPDATE user_requests
      SET status = 'rejected', rejection_reason = ?,
          reviewed_at = CURRENT_TIMESTAMP, reviewed_by = ?
      WHERE id = ?
    `).run(reason, req.user!.userId, requestId);

    logAudit(
      req.user!.userId,
      req.user!.username,
      'USER_REJECTED',
      'users',
      `Rejected ${request.username}: ${reason}`,
      req.ip
    );

    res.json({ message: 'Request rejected' });
  } catch (error) {
    logger.error('Reject error', { error });
    res.status(500).json({ error: 'Failed to reject request' });
  }
});

// ── PATCH /users/:id ──────────────────────────────────────────────────────────
router.patch('/:id', (req: Request, res: Response) => {
  const result = patchUserSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: 'Invalid input', details: result.error.issues });
    return;
  }
  const targetId = parseInt(req.params.id, 10);
  const callerId = req.user!.userId;

  if (result.data.role !== undefined && targetId === callerId) {
    res.status(403).json({ error: 'Cannot change your own role' });
    return;
  }
  if (result.data.is_active === 0 && targetId === callerId) {
    res.status(403).json({ error: 'Cannot deactivate your own account' });
    return;
  }

  try {
    const db = getDb();
    const target = db.prepare('SELECT * FROM users WHERE id = ?').get(targetId) as {
      id: number; username: string; role: string; is_active: number;
    } | undefined;
    if (!target) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const updates: string[] = [];
    const params: unknown[] = [];
    const { role, is_active, email, full_name } = result.data;

    if (role !== undefined)      { updates.push('role = ?');      params.push(role); }
    if (is_active !== undefined) { updates.push('is_active = ?'); params.push(is_active); }
    if (email !== undefined)     { updates.push('email = ?');     params.push(email); }
    if (full_name !== undefined) { updates.push('full_name = ?'); params.push(full_name); }

    if (updates.length === 0) {
      res.status(400).json({ error: 'No fields to update' });
      return;
    }

    params.push(targetId);
    db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...params);

    const details: string[] = [];
    if (role !== undefined)      details.push(`role→${role}`);
    if (is_active !== undefined) details.push(`is_active→${is_active}`);
    if (email !== undefined)     details.push(`email updated`);
    if (full_name !== undefined) details.push(`full_name updated`);

    logAudit(callerId, req.user!.username, 'USER_UPDATED', 'users',
      `Updated ${target.username}: ${details.join(', ')}`, req.ip);

    const updated = db.prepare(
      'SELECT id, username, email, full_name, role, is_active, created_at, last_login, last_activity FROM users WHERE id = ?'
    ).get(targetId);
    res.json(updated);
  } catch (error) {
    logger.error('PATCH /users/:id error', { error });
    res.status(500).json({ error: 'Failed to update user' });
  }
});

// ── POST /users/:id/reset-password ───────────────────────────────────────────
router.post('/:id/reset-password', async (req: Request, res: Response) => {
  const result = resetPasswordSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: 'Invalid input', details: result.error.issues });
    return;
  }
  const targetId = parseInt(req.params.id, 10);
  try {
    const db = getDb();
    const target = db.prepare('SELECT id, username FROM users WHERE id = ?').get(targetId) as {
      id: number; username: string;
    } | undefined;
    if (!target) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    const hash = await bcrypt.hash(result.data.newPassword, 12);
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, targetId);
    logAudit(req.user!.userId, req.user!.username, 'PASSWORD_RESET', 'users',
      `Reset password for ${target.username}`, req.ip);
    res.json({ message: 'Password reset successfully' });
  } catch (error) {
    logger.error('Reset password error', { error });
    res.status(500).json({ error: 'Failed to reset password' });
  }
});

export default router;
