"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const zod_1 = require("zod");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const init_1 = require("../db/init");
const auth_1 = require("../middleware/auth");
const rbac_1 = require("../middleware/rbac");
const audit_1 = require("../services/audit");
const logger_1 = require("../utils/logger");
const router = (0, express_1.Router)();
const settingsSchema = zod_1.z.object({
    plant_name: zod_1.z.string().max(200).optional(),
    shifts_per_day: zod_1.z.number().min(1).max(4).optional(),
    hours_per_shift: zod_1.z.number().min(1).max(12).optional(),
    days_per_week: zod_1.z.number().min(1).max(7).optional(),
    oee_goal: zod_1.z.number().min(0).max(1).optional(),
    oee_minimum: zod_1.z.number().min(0).max(1).optional(),
    availability_goal: zod_1.z.number().min(0).max(1).optional(),
    performance_goal: zod_1.z.number().min(0).max(1).optional(),
    quality_goal: zod_1.z.number().min(0).max(1).optional(),
    downtime_threshold_minutes: zod_1.z.number().min(0).max(60).optional(),
    cost_per_hour_usd: zod_1.z.number().min(0).optional(),
});
const userCreateSchema = zod_1.z.object({
    username: zod_1.z.string().min(3).max(50).regex(/^[a-zA-Z0-9_]+$/),
    password: zod_1.z.string().min(8).max(200),
    role: zod_1.z.enum(['admin', 'analyst', 'viewer']),
});
const userUpdateSchema = zod_1.z.object({
    role: zod_1.z.enum(['admin', 'analyst', 'viewer']).optional(),
    is_active: zod_1.z.number().min(0).max(1).optional(),
    password: zod_1.z.string().min(8).max(200).optional(),
});
router.get('/', auth_1.authMiddleware, (_req, res) => {
    try {
        const db = (0, init_1.getDb)();
        const settings = db.prepare('SELECT * FROM oee_settings ORDER BY id DESC LIMIT 1').get();
        res.json(settings);
    }
    catch (error) {
        logger_1.logger.error('Get settings error', { error });
        res.status(500).json({ error: 'Failed to fetch settings' });
    }
});
router.put('/', auth_1.authMiddleware, rbac_1.requireAdmin, (req, res) => {
    const result = settingsSchema.safeParse(req.body);
    if (!result.success) {
        res.status(400).json({ error: 'Invalid input', details: result.error.issues });
        return;
    }
    try {
        const db = (0, init_1.getDb)();
        const data = result.data;
        const fields = Object.keys(data).filter((k) => data[k] !== undefined);
        if (fields.length === 0) {
            const settings = db.prepare('SELECT * FROM oee_settings ORDER BY id DESC LIMIT 1').get();
            res.json(settings);
            return;
        }
        const setClause = fields.map((f) => `${f} = ?`).join(', ');
        const values = fields.map((f) => data[f]);
        db.prepare(`UPDATE oee_settings SET ${setClause}, updated_at = CURRENT_TIMESTAMP WHERE id = (SELECT id FROM oee_settings ORDER BY id DESC LIMIT 1)`)
            .run(...values);
        (0, audit_1.logAudit)(req.user.userId, req.user.username, 'UPDATE_SETTINGS', 'oee_settings', 'Settings updated', req.ip);
        const updated = db.prepare('SELECT * FROM oee_settings ORDER BY id DESC LIMIT 1').get();
        res.json(updated);
    }
    catch (error) {
        logger_1.logger.error('Update settings error', { error });
        res.status(500).json({ error: 'Failed to update settings' });
    }
});
router.get('/users', auth_1.authMiddleware, rbac_1.requireAdmin, (_req, res) => {
    try {
        const db = (0, init_1.getDb)();
        const users = db.prepare('SELECT id, username, role, created_at, last_login, is_active FROM users ORDER BY created_at DESC').all();
        res.json(users);
    }
    catch (error) {
        logger_1.logger.error('Get users error', { error });
        res.status(500).json({ error: 'Failed to fetch users' });
    }
});
router.post('/users', auth_1.authMiddleware, rbac_1.requireAdmin, async (req, res) => {
    const result = userCreateSchema.safeParse(req.body);
    if (!result.success) {
        res.status(400).json({ error: 'Invalid input', details: result.error.issues });
        return;
    }
    try {
        const db = (0, init_1.getDb)();
        const { username, password, role } = result.data;
        const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
        if (existing) {
            res.status(409).json({ error: 'Username already exists' });
            return;
        }
        const hash = await bcryptjs_1.default.hash(password, 12);
        const r = db.prepare('INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)').run(username, hash, role);
        (0, audit_1.logAudit)(req.user.userId, req.user.username, 'CREATE_USER', 'users', `Created user: ${username}`, req.ip);
        const created = db.prepare('SELECT id, username, role, created_at, is_active FROM users WHERE id = ?').get(r.lastInsertRowid);
        res.status(201).json(created);
    }
    catch (error) {
        logger_1.logger.error('Create user error', { error });
        res.status(500).json({ error: 'Failed to create user' });
    }
});
router.put('/users/:id', auth_1.authMiddleware, rbac_1.requireAdmin, async (req, res) => {
    const result = userUpdateSchema.safeParse(req.body);
    if (!result.success) {
        res.status(400).json({ error: 'Invalid input', details: result.error.issues });
        return;
    }
    try {
        const db = (0, init_1.getDb)();
        const existing = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
        if (!existing) {
            res.status(404).json({ error: 'User not found' });
            return;
        }
        const data = result.data;
        if (data.password) {
            const hash = await bcryptjs_1.default.hash(data.password, 12);
            db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, req.params.id);
        }
        if (data.role !== undefined) {
            db.prepare('UPDATE users SET role = ? WHERE id = ?').run(data.role, req.params.id);
        }
        if (data.is_active !== undefined) {
            db.prepare('UPDATE users SET is_active = ? WHERE id = ?').run(data.is_active, req.params.id);
        }
        (0, audit_1.logAudit)(req.user.userId, req.user.username, 'UPDATE_USER', 'users', `Updated user ${req.params.id}`, req.ip);
        const updated = db.prepare('SELECT id, username, role, created_at, last_login, is_active FROM users WHERE id = ?').get(req.params.id);
        res.json(updated);
    }
    catch (error) {
        logger_1.logger.error('Update user error', { error });
        res.status(500).json({ error: 'Failed to update user' });
    }
});
router.get('/audit-log', auth_1.authMiddleware, rbac_1.requireAdmin, (req, res) => {
    try {
        const db = (0, init_1.getDb)();
        const { limit = '50', offset = '0', action } = req.query;
        let query = 'SELECT * FROM audit_log WHERE 1=1';
        const params = [];
        if (action) {
            query += ' AND action = ?';
            params.push(action);
        }
        query += ' ORDER BY timestamp DESC LIMIT ? OFFSET ?';
        params.push(parseInt(limit), parseInt(offset));
        const logs = db.prepare(query).all(...params);
        const total = db.prepare('SELECT COUNT(*) as count FROM audit_log').get();
        res.json({ logs, total: total.count });
    }
    catch (error) {
        logger_1.logger.error('Audit log error', { error });
        res.status(500).json({ error: 'Failed to fetch audit log' });
    }
});
exports.default = router;
//# sourceMappingURL=settings.js.map