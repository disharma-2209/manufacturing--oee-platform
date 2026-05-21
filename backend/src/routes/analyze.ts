import { Router, Request, Response } from 'express';
import { getDb } from '../db/init';
import { authMiddleware } from '../middleware/auth';
import { calculateOEE, buildParetoData } from '../services/oee-engine';
import { buildCorrelationMatrix, buildProductFailureCorrelation, buildShiftAnalysis, buildDayHourHeatmap } from '../services/correlation';
import { RawIncident, OEESettings } from '../types';
import { logger } from '../utils/logger';

const router = Router();

function getSettings(db: ReturnType<typeof getDb>): OEESettings {
  return db.prepare('SELECT * FROM oee_settings ORDER BY id DESC LIMIT 1').get() as unknown as OEESettings;
}

// Returns line-level OEE overrides from timestamp files for the given week
function getLineOEEOverrides(
  db: ReturnType<typeof getDb>,
  weekNumber: string | undefined
): Map<string, { oee: number; availability: number; performance: number; quality: number; source: 'line_file' }> {
  const overrides = new Map<string, { oee: number; availability: number; performance: number; quality: number; source: 'line_file' }>();
  try {
    let rows: { line: string; oee: number; availability: number; performance: number; quality: number }[];
    if (weekNumber) {
      rows = db.prepare(`
        SELECT line, oee, availability, performance, quality
        FROM line_oee_uploads
        WHERE week_number = ? AND status = 'active'
      `).all(Number(weekNumber)) as typeof rows;
    } else {
      // Use the most recent week available in line_oee_uploads
      const latest = db.prepare(`
        SELECT week_number, year FROM line_oee_uploads
        WHERE status = 'active'
        ORDER BY year DESC, week_number DESC LIMIT 1
      `).get() as { week_number: number; year: number } | undefined;
      if (!latest) return overrides;
      rows = db.prepare(`
        SELECT line, oee, availability, performance, quality
        FROM line_oee_uploads
        WHERE week_number = ? AND year = ? AND status = 'active'
      `).all(latest.week_number, latest.year) as typeof rows;
    }
    for (const r of rows) {
      overrides.set(r.line, {
        oee: r.oee, availability: r.availability,
        performance: r.performance, quality: r.quality,
        source: 'line_file',
      });
    }
  } catch (_) {
    // Table may not exist yet on first run — safe to return empty
  }
  return overrides;
}

function getIncidents(db: ReturnType<typeof getDb>, uploadId?: string, weekNumber?: string): RawIncident[] {
  // If a specific uploadId is provided, use it directly
  if (uploadId) {
    const rows = db.prepare('SELECT * FROM raw_incidents WHERE upload_id = ?').all(uploadId) as unknown as RawIncident[];
    return weekNumber ? rows.filter(r => String(r.week_number) === weekNumber) : rows;
  }

  // If a week number is requested, find all active uploads that contain that week
  if (weekNumber) {
    const uploads = db.prepare(`SELECT id FROM data_uploads WHERE status = 'active' ORDER BY upload_time DESC`).all() as unknown as { id: number }[];
    for (const upload of uploads) {
      const rows = db.prepare('SELECT * FROM raw_incidents WHERE upload_id = ? AND week_number = ?').all(upload.id, Number(weekNumber)) as unknown as RawIncident[];
      if (rows.length > 0) return rows;
    }
    return [];
  }

  // Default: latest active upload
  const latest = db.prepare(`SELECT id FROM data_uploads WHERE status = 'active' ORDER BY upload_time DESC LIMIT 1`).get() as unknown as { id: number } | undefined;
  if (!latest) return [];
  return db.prepare('SELECT * FROM raw_incidents WHERE upload_id = ?').all(latest.id) as unknown as RawIncident[];
}

router.get('/weeks', authMiddleware, (_req: Request, res: Response) => {
  try {
    const db = getDb();
    // Read week_number directly from data_uploads (the canonical value stamped at
    // upload time) — never from raw_incidents, which may contain stray incidents
    // near week boundaries that would create phantom week entries.
    const rows = db.prepare(`
      SELECT id as upload_id, week_number, year, original_filename
      FROM data_uploads
      WHERE status = 'active' AND week_number > 0
      ORDER BY year DESC, week_number DESC
    `).all() as { upload_id: number; week_number: number; year: number; original_filename: string }[];

    // Deduplicate by week_number+year (multiple uploads may share the same week)
    const weekMap = new Map<string, { week_number: number; year: number; upload_id: number; original_filename: string }>();
    for (const row of rows) {
      const key = `${row.year}-${row.week_number}`;
      if (!weekMap.has(key)) {
        weekMap.set(key, { week_number: row.week_number, year: row.year, upload_id: row.upload_id, original_filename: row.original_filename });
      }
    }

    const result = Array.from(weekMap.values())
      .sort((a, b) => b.year - a.year || b.week_number - a.week_number);

    res.json(result);
  } catch (error) {
    logger.error('Weeks error', { error });
    res.status(500).json({ error: 'Failed to fetch weeks' });
  }
});

router.get('/summary', authMiddleware, (req: Request, res: Response) => {
  try {
    const db = getDb();
    const settings = getSettings(db);
    const incidents = getIncidents(db, req.query.uploadId as string, req.query.week as string);

    if (incidents.length === 0) {
      res.json({ empty: true, message: 'No data available. Please upload an Excel file.' });
      return;
    }

    const { byLine: rawByLine, overall: rawOverall, byEquipment, byTeam, anomalies } = calculateOEE(incidents, settings);
    const pareto = buildParetoData(incidents);
    const correlation = buildCorrelationMatrix(rawByLine);
    const shift = buildShiftAnalysis(incidents);
    const heatmap = buildDayHourHeatmap(incidents);
    const productCorr = buildProductFailureCorrelation(incidents);

    // Apply line-level OEE overrides from timestamp files when available
    const lineOEEOverrides = getLineOEEOverrides(db, req.query.week as string | undefined);
    const byLine = rawByLine.map((l) => {
      const ov = lineOEEOverrides.get(l.line);
      if (!ov) return { ...l, oeeSource: 'incident_file' as const };
      return {
        ...l,
        oee: ov.oee,
        availability: ov.availability,
        performance: ov.performance,
        quality: ov.quality,
        oeeSource: 'line_file' as const,
      };
    });

    // Recompute overall OEE as mean of byLine (using overridden values)
    const overall = { ...rawOverall };
    if (byLine.length > 0) {
      overall.oee          = byLine.reduce((s, l) => s + l.oee, 0) / byLine.length;
      overall.availability = byLine.reduce((s, l) => s + l.availability, 0) / byLine.length;
      overall.performance  = byLine.reduce((s, l) => s + l.performance, 0) / byLine.length;
      overall.quality      = byLine.reduce((s, l) => s + l.quality, 0) / byLine.length;
    }

    const lineFileCount = lineOEEOverrides.size;

    const topCategories = pareto.byCategory.slice(0, 5).map((c) => ({
      category: c.category,
      hours: c.hours,
      count: c.count,
    }));

    res.json({
      summary: {
        totalIncidents: overall.totalIncidents,
        totalDowntimeHours: overall.totalDowntimeHours,
        avgOEE: overall.oee,
        avgMTTR: overall.mttr,
        avgMTBF: overall.mtbf,
        topFailureCategories: topCategories,
        cascadeCount: incidents.filter((i) => i.is_cascade).length,
        repeatFailureCount: incidents.filter((i) => i.is_repeat_failure).length,
        lineFileCount,
      },
      byLine,
      overall,
      byEquipment: byEquipment.slice(0, 30),
      byTeam,
      pareto,
      correlation,
      shiftAnalysis: shift,
      heatmap,
      productCorrelation: productCorr.slice(0, 20),
      anomalies,
      settings,
    });
  } catch (error) {
    logger.error('Analysis error', { error });
    res.status(500).json({ error: 'Analysis failed' });
  }
});

router.get('/by-line', authMiddleware, (req: Request, res: Response) => {
  try {
    const db = getDb();
    const settings = getSettings(db);
    const incidents = getIncidents(db, req.query.uploadId as string, req.query.week as string);
    const { byLine: rawByLine } = calculateOEE(incidents, settings);
    const overrides = getLineOEEOverrides(db, req.query.week as string | undefined);
    const byLine = rawByLine.map((l) => {
      const ov = overrides.get(l.line);
      if (!ov) return { ...l, oeeSource: 'incident_file' as const };
      return { ...l, oee: ov.oee, availability: ov.availability, performance: ov.performance, quality: ov.quality, oeeSource: 'line_file' as const };
    });
    res.json(byLine);
  } catch (error) {
    logger.error('By-line error', { error });
    res.status(500).json({ error: 'Analysis failed' });
  }
});

router.get('/by-equipment', authMiddleware, (req: Request, res: Response) => {
  try {
    const db = getDb();
    const settings = getSettings(db);
    const incidents = getIncidents(db, req.query.uploadId as string, req.query.week as string);
    const { byEquipment } = calculateOEE(incidents, settings);
    res.json(byEquipment);
  } catch (error) {
    logger.error('By-equipment error', { error });
    res.status(500).json({ error: 'Analysis failed' });
  }
});

router.get('/pareto', authMiddleware, (req: Request, res: Response) => {
  try {
    const db = getDb();
    const incidents = getIncidents(db, req.query.uploadId as string, req.query.week as string);
    const pareto = buildParetoData(incidents);
    res.json(pareto);
  } catch (error) {
    logger.error('Pareto error', { error });
    res.status(500).json({ error: 'Analysis failed' });
  }
});

router.get('/timeline', authMiddleware, (req: Request, res: Response) => {
  try {
    const db = getDb();
    const incidents = getIncidents(db, req.query.uploadId as string, req.query.week as string);
    const timeline = incidents
      .filter((i) => i.report_time)
      .sort((a, b) => new Date(a.report_time).getTime() - new Date(b.report_time).getTime())
      .map((i) => ({
        id: i.id,
        line: i.line,
        equipment: i.equipment,
        cause_category: i.cause_category,
        cause: i.cause,
        report_time: i.report_time,
        end_time: i.end_time || i.completed_time,
        duration_hours: i.duration_hours,
        team: i.team,
        remarks: i.remarks,
        shift: i.shift,
        is_cascade: i.is_cascade,
        is_repeat_failure: i.is_repeat_failure,
      }));
    res.json(timeline);
  } catch (error) {
    logger.error('Timeline error', { error });
    res.status(500).json({ error: 'Analysis failed' });
  }
});

router.get('/correlations', authMiddleware, (req: Request, res: Response) => {
  try {
    const db = getDb();
    const settings = getSettings(db);
    const incidents = getIncidents(db, req.query.uploadId as string, req.query.week as string);
    const { byLine } = calculateOEE(incidents, settings);
    const correlation = buildCorrelationMatrix(byLine);
    const product = buildProductFailureCorrelation(incidents);
    const shift = buildShiftAnalysis(incidents);
    const heatmap = buildDayHourHeatmap(incidents);
    res.json({ correlation, product, shift, heatmap });
  } catch (error) {
    logger.error('Correlations error', { error });
    res.status(500).json({ error: 'Analysis failed' });
  }
});

router.get('/oee', authMiddleware, (req: Request, res: Response) => {
  try {
    const db = getDb();
    const settings = getSettings(db);
    const incidents = getIncidents(db, req.query.uploadId as string, req.query.week as string);
    const { byLine: rawByLine, overall: rawOverall } = calculateOEE(incidents, settings);
    const overrides = getLineOEEOverrides(db, req.query.week as string | undefined);
    const byLine = rawByLine.map((l) => {
      const ov = overrides.get(l.line);
      if (!ov) return { ...l, oeeSource: 'incident_file' as const };
      return { ...l, oee: ov.oee, availability: ov.availability, performance: ov.performance, quality: ov.quality, oeeSource: 'line_file' as const };
    });
    const overall = { ...rawOverall };
    if (byLine.length > 0) {
      overall.oee          = byLine.reduce((s, l) => s + l.oee, 0) / byLine.length;
      overall.availability = byLine.reduce((s, l) => s + l.availability, 0) / byLine.length;
      overall.performance  = byLine.reduce((s, l) => s + l.performance, 0) / byLine.length;
      overall.quality      = byLine.reduce((s, l) => s + l.quality, 0) / byLine.length;
    }
    res.json({ byLine, overall, settings });
  } catch (error) {
    logger.error('OEE error', { error });
    res.status(500).json({ error: 'Analysis failed' });
  }
});

router.get('/trends', authMiddleware, (_req: Request, res: Response) => {
  try {
    const db = getDb();
    const settings = getSettings(db);
    const uploads = db.prepare(`
      SELECT id, week_number, year FROM data_uploads
      WHERE status = 'active' ORDER BY year DESC, week_number DESC LIMIT 8
    `).all() as unknown as { id: number; week_number: number; year: number }[];

    const trends = [];
    for (const upload of uploads) {
      const incidents = db.prepare('SELECT * FROM raw_incidents WHERE upload_id = ?').all(upload.id) as unknown as RawIncident[];
      if (incidents.length === 0) continue;
      const { byLine: rawByLine, overall: rawOverall } = calculateOEE(incidents, settings);

      // Apply line-file overrides for this specific week
      const overrides = getLineOEEOverrides(db, String(upload.week_number));
      const byLine = rawByLine.map((l) => {
        const ov = overrides.get(l.line);
        if (!ov) return { ...l, oeeSource: 'incident_file' as const };
        return { ...l, oee: ov.oee, availability: ov.availability, performance: ov.performance, quality: ov.quality, oeeSource: 'line_file' as const };
      });
      const overall = { ...rawOverall };
      if (byLine.length > 0) {
        overall.oee          = byLine.reduce((s, l) => s + l.oee, 0) / byLine.length;
        overall.availability = byLine.reduce((s, l) => s + l.availability, 0) / byLine.length;
        overall.performance  = byLine.reduce((s, l) => s + l.performance, 0) / byLine.length;
        overall.quality      = byLine.reduce((s, l) => s + l.quality, 0) / byLine.length;
      }

      trends.push({
        weekNumber: upload.week_number,
        year: upload.year,
        uploadId: upload.id,
        avgOEE: overall.oee,
        availability: overall.availability,
        performance: overall.performance,
        quality: overall.quality,
        totalDowntimeHours: overall.totalDowntimeHours,
        totalIncidents: overall.totalIncidents,
        avgMTTR: overall.mttr,
        avgMTBF: overall.mtbf,
        lineFileCount: overrides.size,
        byLine: byLine.map((l) => ({ line: l.line, oee: l.oee, availability: l.availability, oeeSource: l.oeeSource })),
      });
    }

    res.json(trends.reverse());
  } catch (error) {
    logger.error('Trends error', { error });
    res.status(500).json({ error: 'Analysis failed' });
  }
});

// ── GET /analyze/oee-transparency ───────────────────────────────────────────
// Returns per-line OEE source, formula breakdown, and per-station details
router.get('/oee-transparency', authMiddleware, (req: Request, res: Response) => {
  try {
    const db = getDb();
    const settings = getSettings(db);
    const incidents = getIncidents(db, req.query.uploadId as string, req.query.week as string);
    const { byLine: rawByLine } = calculateOEE(incidents, settings);
    const overrides = getLineOEEOverrides(db, req.query.week as string | undefined);

    const lines = rawByLine.map((l) => {
      const ov = overrides.get(l.line);
      const isLineFile = !!ov;

      // Per-station detail for line-file lines
      let stations: { station: string; availability: number; performance: number; quality: number; oee: number; totalBoards: number; producedQty: number; stoppageHours: number; stoppageCount: number; plannedHours: number }[] = [];
      let totalBoardsProduced = 0;
      if (isLineFile) {
        const upload = db.prepare(`
          SELECT id, total_boards FROM line_oee_uploads
          WHERE line = ? AND status = 'active'
          ORDER BY year DESC, week_number DESC LIMIT 1
        `).get(l.line) as { id: number; total_boards: number } | undefined;
        if (upload) {
          totalBoardsProduced = upload.total_boards ?? 0;
          const stRows = db.prepare(`
            SELECT station, availability, performance, quality, oee,
                   total_boards, produced_qty, stoppage_hours, stoppage_count, planned_hours,
                   mttr, mtbf, el_variant,
                   micro_stop_count, micro_stop_hours, tack_time_sec
            FROM line_oee_stations WHERE upload_id = ?
          `).all(upload.id) as { station: string; availability: number; performance: number; quality: number; oee: number; total_boards: number; produced_qty: number; stoppage_hours: number; stoppage_count: number; planned_hours: number; mttr: number; mtbf: number; el_variant: string; micro_stop_count: number; micro_stop_hours: number; tack_time_sec: number }[];
          stations = stRows.map(s => ({
            station: s.station,
            availability: s.availability,
            performance: s.performance,
            quality: s.quality,
            oee: s.oee,
            totalBoards: s.total_boards ?? 0,
            producedQty: s.produced_qty ?? s.total_boards ?? 0,
            stoppageHours: s.stoppage_hours,
            stoppageCount: s.stoppage_count,
            plannedHours: s.planned_hours,
            mttr: s.mttr ?? 0,
            mtbf: s.mtbf ?? 0,
            elVariant: s.el_variant ?? 'EL01',
            microStopCount: s.micro_stop_count ?? 0,
            microStopHours: s.micro_stop_hours ?? 0,
            tackTimeSec: s.tack_time_sec ?? 0,
          }));
        }
      }

      return {
        line: l.line,
        oeeSource: isLineFile ? 'line_file' : 'incident_file',
        oee:          isLineFile ? ov!.oee          : l.oee,
        availability: isLineFile ? ov!.availability : l.availability,
        performance:  isLineFile ? ov!.performance  : l.performance,
        quality:      isLineFile ? ov!.quality      : l.quality,
        // incident-based raw values always included for comparison
        incidentOEE:          l.oee,
        incidentAvailability: l.availability,
        incidentPerformance:  l.performance,
        incidentQuality:      l.quality,
        incidentDowntimeHours: l.totalDowntimeHours,
        incidentCount:         l.totalIncidents,
        stations,
        totalBoardsProduced,
        // Formula constants
        formula: isLineFile ? {
          method: 'Throughput-based (Siemens CMES timestamps)',
          targetUPH: 500,
          plannedHours: 112.5,
          stationAverage: 'OEE = avg(station OEEs); station OEE = Availability × Performance × Quality',
          availability: 'Availability = (112.5h − StoppageHours) / 112.5h; Stoppage = (gap − tackTime) > 10 min between consecutive timestamps',
          performance:  'Performance = BoardsProduced / (AvailableHours × 500 UPH)',
          quality:      'Quality = (Tested − Fails) / Tested  [Lead Height always = 100%]',
        } : {
          method: 'Downtime-based (MES incident log)',
          plannedHours: settings.shifts_per_day * settings.hours_per_shift * settings.days_per_week,
          availability: 'Availability = (PlannedHours − TotalDowntimeHours) / PlannedHours',
          performance:  'Performance = estimated from downtime ratio (no cycle-time data)',
          quality:      'Quality = 1 − (cascade/repeat failure ratio)',
        },
      };
    });

    res.json({ lines, settings });
  } catch (error) {
    logger.error('OEE transparency error', { error });
    res.status(500).json({ error: 'Transparency fetch failed' });
  }
});

export default router;
