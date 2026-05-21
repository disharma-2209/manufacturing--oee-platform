import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { z } from 'zod';
import { getDb } from '../db/init';
import { authMiddleware } from '../middleware/auth';
import { requireAnalystOrAbove, requireAdmin } from '../middleware/rbac';
import { parseExcelFile, generateMockData } from '../services/excel-parser';
import { detectCascadeAndRepeatFailures } from '../services/oee-engine';
import { logAudit } from '../services/audit';
import { logger } from '../utils/logger';
import { trackUsage } from '../middleware/usageTracker';

const router = Router();

const uploadDir = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, `${Date.now()}-${safe}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: (parseInt(process.env.MAX_UPLOAD_SIZE_MB || '20')) * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
      'application/octet-stream',
    ];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(file.mimetype) || ext === '.xlsx' || ext === '.xls') {
      cb(null, true);
    } else {
      cb(new Error('Only Excel files (.xlsx, .xls) are allowed'));
    }
  },
});

router.post('/file', authMiddleware, requireAnalystOrAbove,
  trackUsage('file_upload', (req) => ({ filename: (req as Request & { file?: Express.Multer.File }).file?.originalname })),
  upload.single('file'), async (req: Request, res: Response) => {
  if (!req.file) {
    res.status(400).json({ error: 'No file uploaded' });
    return;
  }
  try {
    const parsed = parseExcelFile(req.file.path);
    const incidents = detectCascadeAndRepeatFailures(
      parsed.incidents.map((i) => ({ ...i, id: undefined, upload_id: 0, is_repeat_failure: 0, is_cascade: 0 }))
    );

    const db = getDb();
    const insertUpload = db.prepare(`
      INSERT INTO data_uploads (filename, original_filename, uploaded_by, week_number, year, record_count,
        lines_detected, date_range_start, date_range_end, source)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'manual')
    `);

    const uploadResult = insertUpload.run(
      req.file.filename,
      req.file.originalname,
      req.user!.userId,
      parsed.metadata.weekNumber,
      parsed.metadata.year,
      parsed.metadata.recordCount,
      JSON.stringify(parsed.metadata.linesDetected),
      parsed.metadata.dateRangeStart,
      parsed.metadata.dateRangeEnd
    );

    const uploadId = uploadResult.lastInsertRowid as number;

    const insertIncident = db.prepare(`
      INSERT INTO raw_incidents (upload_id, line, equipment, status, cause_category, cause, product_code,
        team, remarks, repair_description, report_time, report_by, dt_ack_time, dt_ack_by, completed_time,
        complete_by, end_time, duration_hours, response_time_hours, resolution_time_hours,
        week_number, year, shift, station, is_repeat_failure, is_cascade)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const uploadWeekNumber = parsed.metadata.weekNumber;
    const uploadYear = parsed.metadata.year;

    const insertMany = db.transaction((incs: typeof incidents) => {
      for (const inc of incs) {
        insertIncident.run(
          uploadId, inc.line, inc.equipment, inc.status, inc.cause_category, inc.cause,
          inc.product_code, inc.team, inc.remarks, inc.repair_description, inc.report_time,
          inc.report_by, inc.dt_ack_time, inc.dt_ack_by, inc.completed_time, inc.complete_by,
          inc.end_time, inc.duration_hours, inc.response_time_hours, inc.resolution_time_hours,
          uploadWeekNumber, uploadYear, inc.shift, inc.station || inc.equipment, inc.is_repeat_failure, inc.is_cascade
        );
      }
    });

    insertMany(incidents);

    try { fs.unlinkSync(req.file.path); } catch { /* ignore cleanup errors */ }

    logAudit(req.user!.userId, req.user!.username, 'UPLOAD', 'data_uploads',
      `Uploaded ${req.file.originalname} (${parsed.metadata.recordCount} records)`, req.ip);

    res.json({
      uploadId,
      ...parsed.metadata,
      preview: parsed.incidents.slice(0, 20),
    });
  } catch (error) {
    logger.error('Upload error', { error });
    try { if (req.file) fs.unlinkSync(req.file.path); } catch { /* ignore */ }
    res.status(500).json({ error: 'Failed to process file' });
  }
});

router.post('/demo', authMiddleware, requireAnalystOrAbove, async (req: Request, res: Response) => {
  try {
    const mockData = generateMockData();
    const incidents = detectCascadeAndRepeatFailures(
      mockData.incidents.map((i) => ({ ...i, id: undefined, upload_id: 0, is_repeat_failure: 0, is_cascade: 0 }))
    );

    const db = getDb();
    const insertUpload = db.prepare(`
      INSERT INTO data_uploads (filename, original_filename, uploaded_by, week_number, year, record_count,
        lines_detected, date_range_start, date_range_end, source)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'demo')
    `);

    const uploadResult = insertUpload.run(
      'demo-data.xlsx', 'Demo Data (3 Weeks)', req.user!.userId,
      mockData.metadata.weekNumber, mockData.metadata.year, mockData.metadata.recordCount,
      JSON.stringify(mockData.metadata.linesDetected),
      mockData.metadata.dateRangeStart, mockData.metadata.dateRangeEnd
    );

    const uploadId = uploadResult.lastInsertRowid as number;

    const insertIncident = db.prepare(`
      INSERT INTO raw_incidents (upload_id, line, equipment, status, cause_category, cause, product_code,
        team, remarks, repair_description, report_time, report_by, dt_ack_time, dt_ack_by, completed_time,
        complete_by, end_time, duration_hours, response_time_hours, resolution_time_hours,
        week_number, year, shift, station, is_repeat_failure, is_cascade)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const demoWeekNumber = mockData.metadata.weekNumber;
    const demoYear = mockData.metadata.year;

    const insertMany = db.transaction((incs: typeof incidents) => {
      for (const inc of incs) {
        insertIncident.run(
          uploadId, inc.line, inc.equipment, inc.status, inc.cause_category, inc.cause,
          inc.product_code, inc.team, inc.remarks, inc.repair_description, inc.report_time,
          inc.report_by, inc.dt_ack_time, inc.dt_ack_by, inc.completed_time, inc.complete_by,
          inc.end_time, inc.duration_hours, inc.response_time_hours, inc.resolution_time_hours,
          demoWeekNumber, demoYear, inc.shift, inc.station || inc.equipment, inc.is_repeat_failure, inc.is_cascade
        );
      }
    });

    insertMany(incidents);
    logAudit(req.user!.userId, req.user!.username, 'DEMO_LOAD', 'data_uploads', 'Demo data loaded', req.ip);

    res.json({ uploadId, ...mockData.metadata });
  } catch (error) {
    logger.error('Demo data error', { error });
    res.status(500).json({ error: 'Failed to load demo data' });
  }
});

router.get('/history', authMiddleware, (_req: Request, res: Response) => {
  const db = getDb();
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

router.delete('/:id', authMiddleware, requireAdmin, (req: Request, res: Response) => {
  const { id } = req.params;
  const db = getDb();
  db.prepare(`UPDATE data_uploads SET status = 'archived' WHERE id = ?`).run(id);
  logAudit(req.user!.userId, req.user!.username, 'ARCHIVE_UPLOAD', 'data_uploads', `Archived upload ${id}`, req.ip);
  res.json({ message: 'Upload archived' });
});

export default router;
