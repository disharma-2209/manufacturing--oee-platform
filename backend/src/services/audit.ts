import { getDb } from '../db/init';
import { logger } from '../utils/logger';

export function logAudit(
  userId: number | null,
  username: string,
  action: string,
  resource: string,
  details: string,
  ipAddress?: string
): void {
  try {
    const db = getDb();
    db.prepare(`
      INSERT INTO audit_log (user_id, username, action, resource, details, ip_address)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(userId, username, action, resource, details, ipAddress || null);
  } catch (err) {
    logger.error('Failed to write audit log', { err, action, resource });
  }
}
