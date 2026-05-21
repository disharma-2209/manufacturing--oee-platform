import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { getDb } from '../db/init';
import { authMiddleware } from '../middleware/auth';
import { requireAnalystOrAbove } from '../middleware/rbac';
import { parseLineOEEFile } from '../services/line-oee-parser';
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
    cb(null, `line-${Date.now()}-${safe}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: (parseInt(process.env.MAX_UPLOAD_SIZE_MB || '50')) * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext === '.xlsx' || ext === '.xls') cb(null, true);
    else cb(new Error('Only Excel files (.xlsx, .xls) are allowed'));
  },
});

// ── POST /api/line-upload/file ─────────────────────────────────────────────
// Body (multipart): file + optional fields: line, week, year
// ── Runtime migration: add new columns to line_oee_stations if not present ──
function ensureStationColumns(db: ReturnType<typeof getDb>): void {
  const existing = (db.prepare(`PRAGMA table_info(line_oee_stations)`).all() as { name: string }[])
    .map((r) => r.name);
  const toAdd: [string, string][] = [
    ['produced_qty',    'INTEGER'],
    ['tested_boards',   'INTEGER'],
    ['span_hours',      'REAL'],
    ['available_hours', 'REAL'],
    ['mttr',            'REAL'],
    ['mtbf',            'REAL'],
    ['el_variant',      'TEXT'],
    ['micro_stop_count', 'INTEGER'],
    ['micro_stop_hours', 'REAL'],
    ['tack_time_sec',    'REAL'],
  ];
  for (const [col, type] of toAdd) {
    if (!existing.includes(col)) {
      db.prepare(`ALTER TABLE line_oee_stations ADD COLUMN ${col} ${type}`).run();
    }
  }
  // Also ensure station_quality_settings table exists (runtime fallback)
  db.prepare(`
    CREATE TABLE IF NOT EXISTS station_quality_settings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      line TEXT NOT NULL,
      week_number INTEGER NOT NULL,
      year INTEGER NOT NULL,
      station_name TEXT NOT NULL,
      manual_qc_rate REAL NOT NULL CHECK(manual_qc_rate >= 0 AND manual_qc_rate <= 1),
      updated_at TEXT DEFAULT (datetime('now')),
      UNIQUE(line, week_number, year, station_name)
    )
  `).run();
}

router.post('/detect', authMiddleware, requireAnalystOrAbove,
  upload.single('file'), async (req: Request, res: Response) => {
  if (!req.file) { 
    res.status(400).json({ error: 'No file' }); 
    return; 
  }
  try {
    const overrideLine = req.body.line ? String(req.body.line).trim() : undefined;
    // Parse just enough to get week/year — pass dummy overrides so it runs fast
    const result = parseLineOEEFile(
      req.file.path, req.file.originalname, overrideLine
    );
    try { fs.unlinkSync(req.file.path); } catch { /* ignore */ }
    res.json({
      detectedWeek: result.weekNumber,
      detectedYear: result.year,
      detectedLine: result.line,
    });
  } catch (error) {
    try { if (req.file) fs.unlinkSync(req.file.path); } catch { /* ignore */ }
    res.status(500).json({ error: `Detection failed: ${String(error)}` });
  }
});

router.post('/file', authMiddleware, requireAnalystOrAbove,
  trackUsage('file_upload', (req) => ({ filename: (req as Request & { file?: Express.Multer.File }).file?.originalname, type: 'line-file' })),
  upload.single('file'), async (req: Request, res: Response) => {
  if (!req.file) {
    res.status(400).json({ error: 'No file uploaded' });
    return;
  }
  try {
    const overrideLine = req.body.line ? String(req.body.line).trim() : undefined;
    const overrideWeek = req.body.week ? parseInt(req.body.week, 10) : undefined;
    const overrideYear = req.body.year ? parseInt(req.body.year, 10) : undefined;

    const db = getDb();
    ensureStationColumns(db);

    // Load manualQcRates from station_quality_settings for this line/week/year
    // (We must parse the file first with overrides to know line/week/year,
    //  but we need a two-pass approach: first parse without rates, then check DB.)
    // Fast path: do a quick parse to detect line/week, then reload with rates.
    const quickResult = parseLineOEEFile(
      req.file.path,
      req.file.originalname,
      overrideLine,
      overrideWeek,
      overrideYear
    );

    const qcRows = db.prepare(`
      SELECT station_name, manual_qc_rate
      FROM station_quality_settings
      WHERE line = ? AND week_number = ? AND year = ?
    `).all(quickResult.line, quickResult.weekNumber, quickResult.year) as
      { station_name: string; manual_qc_rate: number }[];

    let result = quickResult;
    if (qcRows.length > 0) {
      const manualQcRates: Record<string, number> = {};
      for (const r of qcRows) manualQcRates[r.station_name] = r.manual_qc_rate;
      result = parseLineOEEFile(
        req.file.path,
        req.file.originalname,
        overrideLine,
        overrideWeek,
        overrideYear,
        manualQcRates
      );
    }

    // Archive any existing active upload for same line + week + year
    db.prepare(`
      UPDATE line_oee_uploads SET status = 'archived'
      WHERE line = ? AND week_number = ? AND year = ? AND status = 'active'
    `).run(result.line, result.weekNumber, result.year);

    // Insert new upload record
    const insertUpload = db.prepare(`
      INSERT INTO line_oee_uploads
        (filename, original_filename, uploaded_by, line, week_number, year,
         total_boards, first_timestamp, last_timestamp, planned_hours,
         availability, performance, quality, oee, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')
    `);

    const uploadResult = insertUpload.run(
      req.file.filename,
      req.file.originalname,
      req.user!.userId,
      result.line,
      result.weekNumber,
      result.year,
      result.totalBoardsProduced,
      result.firstTimestamp,
      result.lastTimestamp,
      result.plannedHours,
      result.availability,
      result.performance,
      result.quality,
      result.oee
    );

    const uploadId = uploadResult.lastInsertRowid as number;

    // Insert per-station records with all new fields
    const insertStation = db.prepare(`
      INSERT INTO line_oee_stations
        (upload_id, station, total_boards, produced_qty, pass_boards, fail_boards,
         tested_boards, first_timestamp, last_timestamp, span_hours, actual_run_hours,
         planned_hours, available_hours, stoppage_count, stoppage_hours,
         availability, performance, quality, oee,
         mttr, mtbf, ideal_cycle_time_sec, actual_cycle_time_sec, el_variant,
         micro_stop_count, micro_stop_hours, tack_time_sec)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertStations = db.transaction((stations: typeof result.stations) => {
      for (const s of stations) {
        insertStation.run(
          uploadId, s.station, s.totalBoards, s.producedQty, s.passBoards, s.failBoards,
          s.testedBoards, s.firstTimestamp, s.lastTimestamp, s.spanHours, s.actualRunHours,
          s.plannedHours, s.availableHours, s.stoppageCount, s.stoppageHours,
          s.availability, s.performance, s.quality, s.oee,
          s.mttr, s.mtbf, s.idealCycleTimeSec, s.actualCycleTimeSec, s.elVariant,
          s.microStopCount, s.microStopHours, s.tackTimeSec
        );
      }
    });

    insertStations(result.stations);

    try { fs.unlinkSync(req.file.path); } catch { /* ignore */ }

    logAudit(
      req.user!.userId, req.user!.username, 'LINE_OEE_UPLOAD', 'line_oee_uploads',
      `Uploaded line OEE file: ${req.file.originalname} → ${result.line} WK-${result.weekNumber}/${result.year}`,
      req.ip
    );

    res.json({
      uploadId,
      line: result.line,
      weekNumber: result.weekNumber,
      year: result.year,
      oee: result.oee,
      availability: result.availability,
      performance: result.performance,
      quality: result.quality,
      totalBoardsProduced: result.totalBoardsProduced,
      stations: result.stations,
    });
  } catch (error) {
    logger.error('Line OEE upload error', { error });
    try { if (req.file) fs.unlinkSync(req.file.path); } catch { /* ignore */ }
    res.status(500).json({ error: `Failed to process file: ${String(error)}` });
  }
});

// ── GET /api/line-upload/history ──────────────────────────────────────────
router.get('/history', authMiddleware, (_req: Request, res: Response) => {
  try {
    const db = getDb();
    const rows = db.prepare(`
      SELECT lou.*, u.username as uploaded_by_name
      FROM line_oee_uploads lou
      LEFT JOIN users u ON lou.uploaded_by = u.id
      WHERE lou.status = 'active'
      ORDER BY lou.year DESC, lou.week_number DESC, lou.line ASC
    `).all();
    res.json(rows);
  } catch (error) {
    logger.error('Line OEE history error', { error });
    res.status(500).json({ error: 'Failed to fetch history' });
  }
});

// ── DELETE /api/line-upload/:id ───────────────────────────────────────────
router.delete('/:id', authMiddleware, requireAnalystOrAbove, (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const db = getDb();
    db.prepare(`UPDATE line_oee_uploads SET status = 'archived' WHERE id = ?`).run(id);
    logAudit(req.user!.userId, req.user!.username, 'ARCHIVE_LINE_OEE', 'line_oee_uploads', `Archived upload ${id}`, req.ip);
    res.json({ message: 'Upload archived' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to archive' });
  }
});

export default router;
