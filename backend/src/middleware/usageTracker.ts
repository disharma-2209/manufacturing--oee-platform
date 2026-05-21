import { Request, Response, NextFunction } from 'express';
import { getDb } from '../db/init';

export function trackUsage(eventType: string, getDetail?: (req: Request) => object) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const start = Date.now();
    res.on('finish', () => {
      try {
        const user = req.user;
        if (!user) return;
        const db = getDb();
        const detail = getDetail ? JSON.stringify(getDetail(req)) : null;
        db.prepare(`
          INSERT INTO usage_events
            (user_id, username, event_type, event_detail, ip_address, user_agent, duration_ms, status)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          user.userId,
          user.username,
          eventType,
          detail,
          req.ip ?? null,
          req.headers['user-agent'] ?? null,
          Date.now() - start,
          res.statusCode < 400 ? 'success' : 'error'
        );
      } catch { /* never block the response */ }
    });
    next();
  };
}
