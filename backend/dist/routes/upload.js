"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const multer_1 = __importDefault(require("multer"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const init_1 = require("../db/init");
const auth_1 = require("../middleware/auth");
const rbac_1 = require("../middleware/rbac");
const excel_parser_1 = require("../services/excel-parser");
const oee_engine_1 = require("../services/oee-engine");
const audit_1 = require("../services/audit");
const logger_1 = require("../utils/logger");
const usageTracker_1 = require("../middleware/usageTracker");
const router = (0, express_1.Router)();
const uploadDir = process.env.VERCEL ? '/tmp/uploads' : path_1.default.join(process.cwd(), 'uploads');
if (!fs_1.default.existsSync(uploadDir))
    fs_1.default.mkdirSync(uploadDir, { recursive: true });
const storage = multer_1.default.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadDir),
    filename: (_req, file, cb) => {
        const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
        cb(null, `${Date.now()}-${safe}`);
    },
});
const upload = (0, multer_1.default)({
    storage,
    limits: { fileSize: (parseInt(process.env.MAX_UPLOAD_SIZE_MB || '20')) * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
        const allowed = [
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'application/vnd.ms-excel',
            'application/octet-stream',
        ];
        const ext = path_1.default.extname(file.originalname).toLowerCase();
        if (allowed.includes(file.mimetype) || ext === '.xlsx' || ext === '.xls') {
            cb(null, true);
        }
        else {
            cb(new Error('Only Excel files (.xlsx, .xls) are allowed'));
        }
    },
});
router.post('/file', auth_1.authMiddleware, rbac_1.requireAnalystOrAbove, (0, usageTracker_1.trackUsage)('file_upload', (req) => ({ filename: req.file?.originalname })), upload.single('file'), async (req, res) => {
    if (!req.file) {
        res.status(400).json({ error: 'No file uploaded' });
        return;
    }
    try {
        const parsed = (0, excel_parser_1.parseExcelFile)(req.file.path);
        const incidents = (0, oee_engine_1.detectCascadeAndRepeatFailures)(parsed.incidents.map((i) => ({ ...i, id: undefined, upload_id: 0, is_repeat_failure: 0, is_cascade: 0 })));
        const db = (0, init_1.getDb)();
        const insertUpload = db.prepare(`
      INSERT INTO data_uploads (filename, original_filename, uploaded_by, week_number, year, record_count,
        lines_detected, date_range_start, date_range_end, source)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'manual')
    `);
        const uploadResult = insertUpload.run(req.file.filename, req.file.originalname, req.user.userId, parsed.metadata.weekNumber, parsed.metadata.year, parsed.metadata.recordCount, JSON.stringify(parsed.metadata.linesDetected), parsed.metadata.dateRangeStart, parsed.metadata.dateRangeEnd);
        const uploadId = uploadResult.lastInsertRowid;
        const insertIncident = db.prepare(`
      INSERT INTO raw_incidents (upload_id, line, equipment, status, cause_category, cause, product_code,
        team, remarks, repair_description, report_time, report_by, dt_ack_time, dt_ack_by, completed_time,
        complete_by, end_time, duration_hours, response_time_hours, resolution_time_hours,
        week_number, year, shift, station, is_repeat_failure, is_cascade)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
        const uploadWeekNumber = parsed.metadata.weekNumber;
        const uploadYear = parsed.metadata.year;
        const insertMany = db.transaction((incs) => {
            for (const inc of incs) {
                insertIncident.run(uploadId, inc.line, inc.equipment, inc.status, inc.cause_category, inc.cause, inc.product_code, inc.team, inc.remarks, inc.repair_description, inc.report_time, inc.report_by, inc.dt_ack_time, inc.dt_ack_by, inc.completed_time, inc.complete_by, inc.end_time, inc.duration_hours, inc.response_time_hours, inc.resolution_time_hours, uploadWeekNumber, uploadYear, inc.shift, inc.station || inc.equipment, inc.is_repeat_failure, inc.is_cascade);
            }
        });
        insertMany(incidents);
        try {
            fs_1.default.unlinkSync(req.file.path);
        }
        catch { /* ignore cleanup errors */ }
        (0, audit_1.logAudit)(req.user.userId, req.user.username, 'UPLOAD', 'data_uploads', `Uploaded ${req.file.originalname} (${parsed.metadata.recordCount} records)`, req.ip);
        res.json({
            uploadId,
            ...parsed.metadata,
            preview: parsed.incidents.slice(0, 20),
        });
    }
    catch (error) {
        logger_1.logger.error('Upload error', { error });
        try {
            if (req.file)
                fs_1.default.unlinkSync(req.file.path);
        }
        catch { /* ignore */ }
        res.status(500).json({ error: 'Failed to process file' });
    }
});
router.post('/demo', auth_1.authMiddleware, rbac_1.requireAnalystOrAbove, async (req, res) => {
    try {
        const mockData = (0, excel_parser_1.generateMockData)();
        const incidents = (0, oee_engine_1.detectCascadeAndRepeatFailures)(mockData.incidents.map((i) => ({ ...i, id: undefined, upload_id: 0, is_repeat_failure: 0, is_cascade: 0 })));
        const db = (0, init_1.getDb)();
        const insertUpload = db.prepare(`
      INSERT INTO data_uploads (filename, original_filename, uploaded_by, week_number, year, record_count,
        lines_detected, date_range_start, date_range_end, source)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'demo')
    `);
        const uploadResult = insertUpload.run('demo-data.xlsx', 'Demo Data (3 Weeks)', req.user.userId, mockData.metadata.weekNumber, mockData.metadata.year, mockData.metadata.recordCount, JSON.stringify(mockData.metadata.linesDetected), mockData.metadata.dateRangeStart, mockData.metadata.dateRangeEnd);
        const uploadId = uploadResult.lastInsertRowid;
        const insertIncident = db.prepare(`
      INSERT INTO raw_incidents (upload_id, line, equipment, status, cause_category, cause, product_code,
        team, remarks, repair_description, report_time, report_by, dt_ack_time, dt_ack_by, completed_time,
        complete_by, end_time, duration_hours, response_time_hours, resolution_time_hours,
        week_number, year, shift, station, is_repeat_failure, is_cascade)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
        const demoWeekNumber = mockData.metadata.weekNumber;
        const demoYear = mockData.metadata.year;
        const insertMany = db.transaction((incs) => {
            for (const inc of incs) {
                insertIncident.run(uploadId, inc.line, inc.equipment, inc.status, inc.cause_category, inc.cause, inc.product_code, inc.team, inc.remarks, inc.repair_description, inc.report_time, inc.report_by, inc.dt_ack_time, inc.dt_ack_by, inc.completed_time, inc.complete_by, inc.end_time, inc.duration_hours, inc.response_time_hours, inc.resolution_time_hours, demoWeekNumber, demoYear, inc.shift, inc.station || inc.equipment, inc.is_repeat_failure, inc.is_cascade);
            }
        });
        insertMany(incidents);
        (0, audit_1.logAudit)(req.user.userId, req.user.username, 'DEMO_LOAD', 'data_uploads', 'Demo data loaded', req.ip);
        res.json({ uploadId, ...mockData.metadata });
    }
    catch (error) {
        logger_1.logger.error('Demo data error', { error });
        res.status(500).json({ error: 'Failed to load demo data' });
    }
});
router.get('/history', auth_1.authMiddleware, (_req, res) => {
    const db = (0, init_1.getDb)();
    const uploads = db.prepare(`
    SELECT du.*, u.username as uploaded_by_name
    FROM data_uploads du
    LEFT JOIN users u ON du.uploaded_by = u.id
    WHERE du.status = 'active'
    ORDER BY du.upload_time DESC
    LIMIT 50
  `).all();
    res.json(uploads);
});
router.delete('/:id', auth_1.authMiddleware, rbac_1.requireAdmin, (req, res) => {
    const { id } = req.params;
    const db = (0, init_1.getDb)();
    db.prepare(`UPDATE data_uploads SET status = 'archived' WHERE id = ?`).run(id);
    (0, audit_1.logAudit)(req.user.userId, req.user.username, 'ARCHIVE_UPLOAD', 'data_uploads', `Archived upload ${id}`, req.ip);
    res.json({ message: 'Upload archived' });
});
exports.default = router;
//# sourceMappingURL=upload.js.map