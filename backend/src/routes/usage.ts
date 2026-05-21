import { Router, Request, Response } from 'express';
import { getDb } from '../db/init';
import { authMiddleware } from '../middleware/auth';
import { requireAdmin } from '../middleware/rbac';
import { logger } from '../utils/logger';

const router = Router();
router.use(authMiddleware);
router.use(requireAdmin);

// ── GET /usage/summary ────────────────────────────────────────────────────────
router.get('/summary', (_req: Request, res: Response) => {
  try {
    const db = getDb();

    const totalEventsRow = db.prepare(
      `SELECT COUNT(*) as c FROM usage_events WHERE created_at >= datetime('now', '-30 days')`
    ).get() as { c: number };

    const totalUsersRow = db.prepare(
      `SELECT COUNT(DISTINCT user_id) as c FROM usage_events WHERE created_at >= datetime('now', '-30 days')`
    ).get() as { c: number };

    const activeTodayRow = db.prepare(
      `SELECT COUNT(DISTINCT user_id) as c FROM usage_events WHERE created_at >= datetime('now', '-1 day')`
    ).get() as { c: number };

    const aiQueriesRow = db.prepare(
      `SELECT COUNT(*) as c FROM usage_events WHERE event_type = 'ai_query' AND created_at >= datetime('now', '-30 days')`
    ).get() as { c: number };

    const uploadsRow = db.prepare(
      `SELECT COUNT(*) as c FROM usage_events WHERE event_type = 'file_upload' AND created_at >= datetime('now', '-30 days')`
    ).get() as { c: number };

    const eventsByType = db.prepare(
      `SELECT event_type, COUNT(*) as count FROM usage_events
       WHERE created_at >= datetime('now', '-30 days')
       GROUP BY event_type ORDER BY count DESC`
    ).all() as { event_type: string; count: number }[];

    const dailyActive = db.prepare(
      `SELECT date(created_at) as date,
              COUNT(DISTINCT user_id) as users,
              COUNT(*) as events
       FROM usage_events
       WHERE created_at >= datetime('now', '-30 days')
       GROUP BY date(created_at)
       ORDER BY date ASC`
    ).all() as { date: string; users: number; events: number }[];

    res.json({
      totalEvents:    totalEventsRow.c,
      totalUsers:     totalUsersRow.c,
      activeToday:    activeTodayRow.c,
      aiQueriesTotal: aiQueriesRow.c,
      uploadsTotal:   uploadsRow.c,
      eventsByType,
      dailyActive,
    });
  } catch (error) {
    logger.error('GET /usage/summary error', { error });
    res.status(500).json({ error: 'Failed to fetch usage summary' });
  }
});

// ── GET /usage/by-user ────────────────────────────────────────────────────────
router.get('/by-user', (_req: Request, res: Response) => {
  try {
    const db = getDb();

    const rows = db.prepare(
      `SELECT u.user_id, u.username,
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
       ORDER BY total_events DESC`
    ).all() as {
      user_id: number; username: string; role: string;
      total_events: number; last_active: string;
      ai_queries: number; uploads: number; page_views: number;
      avg_session_duration_ms: number;
    }[];

    // top_feature per user = event_type with most events
    const users = rows.map(row => {
      const topRow = db.prepare(
        `SELECT event_type, COUNT(*) as cnt FROM usage_events WHERE user_id = ? GROUP BY event_type ORDER BY cnt DESC LIMIT 1`
      ).get(row.user_id) as { event_type: string } | undefined;
      return { ...row, top_feature: topRow?.event_type ?? 'page_view' };
    });

    res.json({ users });
  } catch (error) {
    logger.error('GET /usage/by-user error', { error });
    res.status(500).json({ error: 'Failed to fetch per-user stats' });
  }
});

// ── GET /usage/ai-queries ─────────────────────────────────────────────────────
router.get('/ai-queries', (req: Request, res: Response) => {
  try {
    const db = getDb();
    const page  = Math.max(1, parseInt(req.query.page  as string || '1',  10));
    const limit = Math.min(100, parseInt(req.query.limit as string || '20', 10));
    const offset = (page - 1) * limit;

    const totalRow = db.prepare(
      `SELECT COUNT(*) as c FROM usage_events WHERE event_type = 'ai_query'`
    ).get() as { c: number };

    const rows = db.prepare(
      `SELECT id, username, event_detail, duration_ms, status, created_at
       FROM usage_events
       WHERE event_type = 'ai_query'
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`
    ).all(limit, offset) as {
      id: number; username: string; event_detail: string | null;
      duration_ms: number; status: string; created_at: string;
    }[];

    const queries = rows.map(r => {
      let analysis_type = 'unknown';
      try {
        if (r.event_detail) {
          const d = JSON.parse(r.event_detail) as { analysisType?: string };
          analysis_type = d.analysisType ?? 'unknown';
        }
      } catch { /* ignore */ }
      return {
        id:            r.id,
        username:      r.username,
        analysis_type,
        duration_ms:   r.duration_ms,
        status:        r.status,
        created_at:    r.created_at,
      };
    });

    res.json({ total: totalRow.c, queries });
  } catch (error) {
    logger.error('GET /usage/ai-queries error', { error });
    res.status(500).json({ error: 'Failed to fetch AI queries' });
  }
});

// ── GET /usage/uploads ────────────────────────────────────────────────────────
router.get('/uploads', (_req: Request, res: Response) => {
  try {
    const db = getDb();

    const rows = db.prepare(
      `SELECT ue.id, ue.username, ue.event_detail, ue.duration_ms, ue.status, ue.created_at
       FROM usage_events ue
       WHERE ue.event_type = 'file_upload'
       ORDER BY ue.created_at DESC`
    ).all() as {
      id: number; username: string; event_detail: string | null;
      duration_ms: number; status: string; created_at: string;
    }[];

    const uploads = rows.map(r => {
      let filename = '';
      let type = 'incident';
      try {
        if (r.event_detail) {
          const d = JSON.parse(r.event_detail) as { filename?: string; type?: string };
          filename = d.filename ?? '';
          type = d.type === 'line-file' ? 'line-file' : 'incident';
        }
      } catch { /* ignore */ }
      return {
        id:          r.id,
        username:    r.username,
        filename,
        type,
        duration_ms: r.duration_ms,
        status:      r.status,
        created_at:  r.created_at,
      };
    });

    res.json({ uploads });
  } catch (error) {
    logger.error('GET /usage/uploads error', { error });
    res.status(500).json({ error: 'Failed to fetch uploads' });
  }
});

export default router;
