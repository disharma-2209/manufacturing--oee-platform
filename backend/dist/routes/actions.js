"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const zod_1 = require("zod");
const init_1 = require("../db/init");
const auth_1 = require("../middleware/auth");
const rbac_1 = require("../middleware/rbac");
const audit_1 = require("../services/audit");
const logger_1 = require("../utils/logger");
const router = (0, express_1.Router)();
const actionSchema = zod_1.z.object({
    week_number: zod_1.z.number().optional(),
    year: zod_1.z.number().optional(),
    line: zod_1.z.string().max(100).optional(),
    area: zod_1.z.string().max(200).optional(),
    description: zod_1.z.string().min(1).max(1000),
    action_required: zod_1.z.string().min(1).max(1000),
    due_date: zod_1.z.string().optional(),
    dri: zod_1.z.string().max(100).optional(),
    status: zod_1.z.enum(['Open', 'In Progress', 'Completed', 'Overdue', 'Cancelled']).optional(),
    priority: zod_1.z.number().min(1).max(5).optional(),
    remarks: zod_1.z.string().max(500).optional(),
    ai_generated: zod_1.z.number().optional(),
    ai_confidence: zod_1.z.string().optional(),
    source_upload_id: zod_1.z.number().optional(),
});
router.get('/', auth_1.authMiddleware, (req, res) => {
    try {
        const db = (0, init_1.getDb)();
        const { line, area, status, dri, week, limit = '100', offset = '0' } = req.query;
        let query = `
      SELECT ap.*, u.username as created_by_name
      FROM action_plans ap
      LEFT JOIN users u ON ap.created_by = u.id
      WHERE 1=1
    `;
        const params = [];
        if (line) {
            query += ' AND ap.line = ?';
            params.push(line);
        }
        if (area) {
            query += ' AND ap.area = ?';
            params.push(area);
        }
        if (status) {
            query += ' AND ap.status = ?';
            params.push(status);
        }
        if (dri) {
            query += ' AND ap.dri = ?';
            params.push(dri);
        }
        if (week) {
            query += ' AND ap.week_number = ?';
            params.push(week);
        }
        query += ' ORDER BY ap.priority ASC, ap.created_at DESC LIMIT ? OFFSET ?';
        params.push(parseInt(limit), parseInt(offset));
        const actions = db.prepare(query).all(...params);
        const total = db.prepare(`SELECT COUNT(*) as count FROM action_plans WHERE 1=1${line ? ' AND line=?' : ''}${status ? ' AND status=?' : ''}`).get(...[]);
        res.json({ actions, total: total?.count || 0 });
    }
    catch (error) {
        logger_1.logger.error('Get actions error', { error });
        res.status(500).json({ error: 'Failed to fetch actions' });
    }
});
router.post('/', auth_1.authMiddleware, rbac_1.requireAnalystOrAbove, (req, res) => {
    const result = actionSchema.safeParse(req.body);
    if (!result.success) {
        res.status(400).json({ error: 'Invalid input', details: result.error.issues });
        return;
    }
    try {
        const db = (0, init_1.getDb)();
        const data = result.data;
        const now = new Date().getFullYear();
        const stmt = db.prepare(`
      INSERT INTO action_plans (week_number, year, line, area, description, action_required, due_date,
        dri, status, priority, remarks, ai_generated, ai_confidence, created_by, source_upload_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
        const r = stmt.run(data.week_number || 0, data.year || now, data.line || null, data.area || null, data.description, data.action_required, data.due_date || null, data.dri || null, data.status || 'Open', data.priority || 3, data.remarks || null, data.ai_generated || 0, data.ai_confidence || null, req.user.userId, data.source_upload_id || null);
        (0, audit_1.logAudit)(req.user.userId, req.user.username, 'CREATE_ACTION', 'action_plans', `Created action: ${data.description.slice(0, 50)}`, req.ip);
        const created = db.prepare('SELECT * FROM action_plans WHERE id = ?').get(r.lastInsertRowid);
        res.status(201).json(created);
    }
    catch (error) {
        logger_1.logger.error('Create action error', { error });
        res.status(500).json({ error: 'Failed to create action' });
    }
});
router.put('/:id', auth_1.authMiddleware, rbac_1.requireAnalystOrAbove, (req, res) => {
    const result = actionSchema.partial().safeParse(req.body);
    if (!result.success) {
        res.status(400).json({ error: 'Invalid input', details: result.error.issues });
        return;
    }
    try {
        const db = (0, init_1.getDb)();
        const existing = db.prepare('SELECT * FROM action_plans WHERE id = ?').get(req.params.id);
        if (!existing) {
            res.status(404).json({ error: 'Action not found' });
            return;
        }
        const data = result.data;
        const fields = Object.keys(data).filter((k) => data[k] !== undefined);
        if (fields.length === 0) {
            res.json(existing);
            return;
        }
        const setClause = fields.map((f) => `${f} = ?`).join(', ');
        const values = fields.map((f) => data[f]);
        db.prepare(`UPDATE action_plans SET ${setClause}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
            .run(...values, req.params.id);
        (0, audit_1.logAudit)(req.user.userId, req.user.username, 'UPDATE_ACTION', 'action_plans', `Updated action ${req.params.id}`, req.ip);
        const updated = db.prepare('SELECT * FROM action_plans WHERE id = ?').get(req.params.id);
        res.json(updated);
    }
    catch (error) {
        logger_1.logger.error('Update action error', { error });
        res.status(500).json({ error: 'Failed to update action' });
    }
});
router.delete('/:id', auth_1.authMiddleware, rbac_1.requireAdmin, (req, res) => {
    try {
        const db = (0, init_1.getDb)();
        const existing = db.prepare('SELECT * FROM action_plans WHERE id = ?').get(req.params.id);
        if (!existing) {
            res.status(404).json({ error: 'Action not found' });
            return;
        }
        db.prepare('DELETE FROM action_plans WHERE id = ?').run(req.params.id);
        (0, audit_1.logAudit)(req.user.userId, req.user.username, 'DELETE_ACTION', 'action_plans', `Deleted action ${req.params.id}`, req.ip);
        res.json({ message: 'Action deleted' });
    }
    catch (error) {
        logger_1.logger.error('Delete action error', { error });
        res.status(500).json({ error: 'Failed to delete action' });
    }
});
router.get('/export', auth_1.authMiddleware, (_req, res) => {
    try {
        const db = (0, init_1.getDb)();
        const actions = db.prepare('SELECT * FROM action_plans ORDER BY priority, created_at DESC').all();
        const csv = [
            'ID,Week,Year,Line,Area,Description,Action Required,Due Date,DRI,Status,Priority,AI Generated,Remarks',
            ...actions.map((a) => [a.id, a.week_number, a.year, a.line, a.area,
                `"${String(a.description || '').replace(/"/g, '""')}"`,
                `"${String(a.action_required || '').replace(/"/g, '""')}"`,
                a.due_date, a.dri, a.status, a.priority, a.ai_generated ? 'Yes' : 'No',
                `"${String(a.remarks || '').replace(/"/g, '""')}"`
            ].join(',')),
        ].join('\n');
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename=action-plans.csv');
        res.send(csv);
    }
    catch (error) {
        logger_1.logger.error('Export actions error', { error });
        res.status(500).json({ error: 'Export failed' });
    }
});
exports.default = router;
//# sourceMappingURL=actions.js.map