"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const init_1 = require("../db/init");
const auth_1 = require("../middleware/auth");
const rbac_1 = require("../middleware/rbac");
const logger_1 = require("../utils/logger");
const router = (0, express_1.Router)();
router.use(auth_1.authMiddleware);
router.use(rbac_1.requireAdmin);
// ── GET /usage/summary ────────────────────────────────────────────────────────
router.get('/summary', (_req, res) => {
    try {
        const db = (0, init_1.getDb)();
        const totalEventsRow = db.prepare(`SELECT COUNT(*) as c FROM usage_events WHERE created_at >= datetime('now', '-30 days')`).get();
        const totalUsersRow = db.prepare(`SELECT COUNT(DISTINCT user_id) as c FROM usage_events WHERE created_at >= datetime('now', '-30 days')`).get();
        const activeTodayRow = db.prepare(`SELECT COUNT(DISTINCT user_id) as c FROM usage_events WHERE created_at >= datetime('now', '-1 day')`).get();
        const aiQueriesRow = db.prepare(`SELECT COUNT(*) as c FROM usage_events WHERE event_type = 'ai_query' AND created_at >= datetime('now', '-30 days')`).get();
        const uploadsRow = db.prepare(`SELECT COUNT(*) as c FROM usage_events WHERE event_type = 'file_upload' AND created_at >= datetime('now', '-30 days')`).get();
        const eventsByType = db.prepare(`SELECT event_type, COUNT(*) as count FROM usage_events
       WHERE created_at >= datetime('now', '-30 days')
       GROUP BY event_type ORDER BY count DESC`).all();
        const dailyActive = db.prepare(`SELECT date(created_at) as date,
              COUNT(DISTINCT user_id) as users,
              COUNT(*) as events
       FROM usage_events
       WHERE created_at >= datetime('now', '-30 days')
       GROUP BY date(created_at)
       ORDER BY date ASC`).all();
        res.json({
            totalEvents: totalEventsRow.c,
            totalUsers: totalUsersRow.c,
            activeToday: activeTodayRow.c,
            aiQueriesTotal: aiQueriesRow.c,
            uploadsTotal: uploadsRow.c,
            eventsByType,
            dailyActive,
        });
    }
    catch (error) {
        logger_1.logger.error('GET /usage/summary error', { error });
        res.status(500).json({ error: 'Failed to fetch usage summary' });
    }
});
// ── GET /usage/by-user ────────────────────────────────────────────────────────
router.get('/by-user', (_req, res) => {
    try {
        const db = (0, init_1.getDb)();
        const rows = db.prepare(`SELECT u.user_id, u.username,
              us.role,
              COUNT(*) as total_events,
              MAX(u.created_at) as last_active,
              SUM(CASE WHEN u.event_type = 'ai_query'    THEN 1 ELSE 0 END) as ai_queries,
              SUM(CASE WHEN u.event_type = 'file_upload' THEN 1 ELSE 0 END) as uploads,
              SUM(CASE WHEN u.event_type = 'page_view'   THEN 1 ELSE 0 END) as page_views,
              AVG(u.duration_ms) as avg_session_duration_ms
       FROM usage_events u
       LEFT JOIN users us ON us.id = u.user_id
       GROUP BY u.user_id
       ORDER BY total_events DESC`).all();
        // top_feature per user = event_type with most events
        const users = rows.map(row => {
            const topRow = db.prepare(`SELECT event_type, COUNT(*) as cnt FROM usage_events WHERE user_id = ? GROUP BY event_type ORDER BY cnt DESC LIMIT 1`).get(row.user_id);
            return { ...row, top_feature: topRow?.event_type ?? 'page_view' };
        });
        res.json({ users });
    }
    catch (error) {
        logger_1.logger.error('GET /usage/by-user error', { error });
        res.status(500).json({ error: 'Failed to fetch per-user stats' });
    }
});
// ── GET /usage/ai-queries ─────────────────────────────────────────────────────
router.get('/ai-queries', (req, res) => {
    try {
        const db = (0, init_1.getDb)();
        const page = Math.max(1, parseInt(req.query.page || '1', 10));
        const limit = Math.min(100, parseInt(req.query.limit || '20', 10));
        const offset = (page - 1) * limit;
        const totalRow = db.prepare(`SELECT COUNT(*) as c FROM usage_events WHERE event_type = 'ai_query'`).get();
        const rows = db.prepare(`SELECT id, username, event_detail, duration_ms, status, created_at
       FROM usage_events
       WHERE event_type = 'ai_query'
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`).all(limit, offset);
        const queries = rows.map(r => {
            let analysis_type = 'unknown';
            try {
                if (r.event_detail) {
                    const d = JSON.parse(r.event_detail);
                    analysis_type = d.analysisType ?? 'unknown';
                }
            }
            catch { /* ignore */ }
            return {
                id: r.id,
                username: r.username,
                analysis_type,
                duration_ms: r.duration_ms,
                status: r.status,
                created_at: r.created_at,
            };
        });
        res.json({ total: totalRow.c, queries });
    }
    catch (error) {
        logger_1.logger.error('GET /usage/ai-queries error', { error });
        res.status(500).json({ error: 'Failed to fetch AI queries' });
    }
});
// ── GET /usage/uploads ────────────────────────────────────────────────────────
router.get('/uploads', (_req, res) => {
    try {
        const db = (0, init_1.getDb)();
        const rows = db.prepare(`SELECT ue.id, ue.username, ue.event_detail, ue.duration_ms, ue.status, ue.created_at
       FROM usage_events ue
       WHERE ue.event_type = 'file_upload'
       ORDER BY ue.created_at DESC`).all();
        const uploads = rows.map(r => {
            let filename = '';
            let type = 'incident';
            try {
                if (r.event_detail) {
                    const d = JSON.parse(r.event_detail);
                    filename = d.filename ?? '';
                    type = d.type === 'line-file' ? 'line-file' : 'incident';
                }
            }
            catch { /* ignore */ }
            return {
                id: r.id,
                username: r.username,
                filename,
                type,
                duration_ms: r.duration_ms,
                status: r.status,
                created_at: r.created_at,
            };
        });
        res.json({ uploads });
    }
    catch (error) {
        logger_1.logger.error('GET /usage/uploads error', { error });
        res.status(500).json({ error: 'Failed to fetch uploads' });
    }
});
exports.default = router;
//# sourceMappingURL=usage.js.map