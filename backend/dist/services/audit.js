"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.logAudit = logAudit;
const init_1 = require("../db/init");
const logger_1 = require("../utils/logger");
function logAudit(userId, username, action, resource, details, ipAddress) {
    try {
        const db = (0, init_1.getDb)();
        db.prepare(`
      INSERT INTO audit_log (user_id, username, action, resource, details, ip_address)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(userId, username, action, resource, details, ipAddress || null);
    }
    catch (err) {
        logger_1.logger.error('Failed to write audit log', { err, action, resource });
    }
}
//# sourceMappingURL=audit.js.map