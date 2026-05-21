"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.trackUsage = trackUsage;
const init_1 = require("../db/init");
function trackUsage(eventType, getDetail) {
    return (req, res, next) => {
        const start = Date.now();
        res.on('finish', () => {
            try {
                const user = req.user;
                if (!user)
                    return;
                const db = (0, init_1.getDb)();
                const detail = getDetail ? JSON.stringify(getDetail(req)) : null;
                db.prepare(`
          INSERT INTO usage_events
            (user_id, username, event_type, event_detail, ip_address, user_agent, duration_ms, status)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(user.userId, user.username, eventType, detail, req.ip ?? null, req.headers['user-agent'] ?? null, Date.now() - start, res.statusCode < 400 ? 'success' : 'error');
            }
            catch { /* never block the response */ }
        });
        next();
    };
}
//# sourceMappingURL=usageTracker.js.map