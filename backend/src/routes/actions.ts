import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { getDb } from '../db/init';
import { authMiddleware } from '../middleware/auth';
import { requireAnalystOrAbove, requireAdmin } from '../middleware/rbac';
import { logAudit } from '../services/audit';
import { logger } from '../utils/logger';

const router = Router();

const actionSchema = z.object({
  week_number: z.number().optional(),
  year: z.number().optional(),
  line: z.string().max(100).optional(),
  area: z.string().max(200).optional(),
  description: z.string().min(1).max(1000),
  action_required: z.string().min(1).max(1000),
  due_date: z.string().optional(),
  dri: z.string().max(100).optional(),
  status: z.enum(['Open', 'In Progress', 'Completed', 'Overdue', 'Cancelled']).optional(),
  priority: z.number().min(1).max(5).optional(),
  remarks: z.string().max(500).optional(),
  ai_generated: z.number().optional(),
  ai_confidence: z.string().optional(),
  source_upload_id: z.number().optional(),
});

router.get('/', authMiddleware, (req: Request, res: Response) => {
  try {
    const db = getDb();
    const { line, area, status, dri, week, limit = '100', offset = '0' } = req.query;

    let query = `
      SELECT ap.*, u.username as created_by_name
      FROM action_plans ap
      LEFT JOIN users u ON ap.created_by = u.id
      WHERE 1=1
    `;
    const params: unknown[] = [];

    if (line) { query += ' AND ap.line = ?'; params.push(line); }
    if (area) { query += ' AND ap.area = ?'; params.push(area); }
    if (status) { query += ' AND ap.status = ?'; params.push(status); }
    if (dri) { query += ' AND ap.dri = ?'; params.push(dri); }
    if (week) { query += ' AND ap.week_number = ?'; params.push(week); }

    query += ' ORDER BY ap.priority ASC, ap.created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit as string), parseInt(offset as string));

    const actions = db.prepare(query).all(...params);
    const total = db.prepare(`SELECT COUNT(*) as count FROM action_plans WHERE 1=1${line ? ' AND line=?' : ''}${status ? ' AND status=?' : ''}`).get(...([] as unknown[])) as { count: number };

    res.json({ actions, total: total?.count || 0 });
  } catch (error) {
    logger.error('Get actions error', { error });
    res.status(500).json({ error: 'Failed to fetch actions' });
  }
});

router.post('/', authMiddleware, requireAnalystOrAbove, (req: Request, res: Response) => {
  const result = actionSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: 'Invalid input', details: result.error.issues });
    return;
  }
  try {
    const db = getDb();
    const data = result.data;
    const now = new Date().getFullYear();
    const stmt = db.prepare(`
      INSERT INTO action_plans (week_number, year, line, area, description, action_required, due_date,
        dri, status, priority, remarks, ai_generated, ai_confidence, created_by, source_upload_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const r = stmt.run(
      data.week_number || 0, data.year || now,
      data.line || null, data.area || null,
      data.description, data.action_required,
      data.due_date || null, data.dri || null,
      data.status || 'Open', data.priority || 3,
      data.remarks || null, data.ai_generated || 0,
      data.ai_confidence || null, req.user!.userId,
      data.source_upload_id || null
    );
    logAudit(req.user!.userId, req.user!.username, 'CREATE_ACTION', 'action_plans',
      `Created action: ${data.description.slice(0, 50)}`, req.ip);
    const created = db.prepare('SELECT * FROM action_plans WHERE id = ?').get(r.lastInsertRowid);
    res.status(201).json(created);
  } catch (error) {
    logger.error('Create action error', { error });
    res.status(500).json({ error: 'Failed to create action' });
  }
});

router.put('/:id', authMiddleware, requireAnalystOrAbove, (req: Request, res: Response) => {
  const result = actionSchema.partial().safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: 'Invalid input', details: result.error.issues });
    return;
  }
  try {
    const db = getDb();
    const existing = db.prepare('SELECT * FROM action_plans WHERE id = ?').get(req.params.id);
    if (!existing) {
      res.status(404).json({ error: 'Action not found' });
      return;
    }
    const data = result.data;
    const fields = Object.keys(data).filter((k) => data[k as keyof typeof data] !== undefined);
    if (fields.length === 0) {
      res.json(existing);
      return;
    }
    const setClause = fields.map((f) => `${f} = ?`).join(', ');
    const values = fields.map((f) => data[f as keyof typeof data]);
    db.prepare(`UPDATE action_plans SET ${setClause}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
      .run(...values, req.params.id);
    logAudit(req.user!.userId, req.user!.username, 'UPDATE_ACTION', 'action_plans',
      `Updated action ${req.params.id}`, req.ip);
    const updated = db.prepare('SELECT * FROM action_plans WHERE id = ?').get(req.params.id);
    res.json(updated);
  } catch (error) {
    logger.error('Update action error', { error });
    res.status(500).json({ error: 'Failed to update action' });
  }
});

router.delete('/:id', authMiddleware, requireAdmin, (req: Request, res: Response) => {
  try {
    const db = getDb();
    const existing = db.prepare('SELECT * FROM action_plans WHERE id = ?').get(req.params.id);
    if (!existing) {
      res.status(404).json({ error: 'Action not found' });
      return;
    }
    db.prepare('DELETE FROM action_plans WHERE id = ?').run(req.params.id);
    logAudit(req.user!.userId, req.user!.username, 'DELETE_ACTION', 'action_plans',
      `Deleted action ${req.params.id}`, req.ip);
    res.json({ message: 'Action deleted' });
  } catch (error) {
    logger.error('Delete action error', { error });
    res.status(500).json({ error: 'Failed to delete action' });
  }
});

router.get('/export', authMiddleware, (_req: Request, res: Response) => {
  try {
    const db = getDb();
    const actions = db.prepare('SELECT * FROM action_plans ORDER BY priority, created_at DESC').all();
    const csv = [
      'ID,Week,Year,Line,Area,Description,Action Required,Due Date,DRI,Status,Priority,AI Generated,Remarks',
      ...actions.map((a: Record<string, unknown>) =>
        [a.id, a.week_number, a.year, a.line, a.area,
          `"${String(a.description || '').replace(/"/g, '""')}"`,
          `"${String(a.action_required || '').replace(/"/g, '""')}"`,
          a.due_date, a.dri, a.status, a.priority, a.ai_generated ? 'Yes' : 'No',
          `"${String(a.remarks || '').replace(/"/g, '""')}"`
        ].join(',')
      ),
    ].join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=action-plans.csv');
    res.send(csv);
  } catch (error) {
    logger.error('Export actions error', { error });
    res.status(500).json({ error: 'Export failed' });
  }
});

export default router;
