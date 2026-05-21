"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const init_1 = require("../db/init");
const auth_1 = require("../middleware/auth");
const oee_engine_1 = require("../services/oee-engine");
const correlation_1 = require("../services/correlation");
const logger_1 = require("../utils/logger");
const router = (0, express_1.Router)();
function getSettings(db) {
    return db.prepare('SELECT * FROM oee_settings ORDER BY id DESC LIMIT 1').get();
}
// Returns line-level OEE overrides from timestamp files for the given week
function getLineOEEOverrides(db, weekNumber) {
    const overrides = new Map();
    try {
        let rows;
        if (weekNumber) {
            rows = db.prepare(`
        SELECT line, oee, availability, performance, quality
        FROM line_oee_uploads
        WHERE week_number = ? AND status = 'active'
      `).all(Number(weekNumber));
        }
        else {
            // Use the most recent week available in line_oee_uploads
            const latest = db.prepare(`
        SELECT week_number, year FROM line_oee_uploads
        WHERE status = 'active'
        ORDER BY year DESC, week_number DESC LIMIT 1
      `).get();
            if (!latest)
                return overrides;
            rows = db.prepare(`
        SELECT line, oee, availability, performance, quality
        FROM line_oee_uploads
        WHERE week_number = ? AND year = ? AND status = 'active'
      `).all(latest.week_number, latest.year);
        }
        for (const r of rows) {
            overrides.set(r.line, {
                oee: r.oee, availability: r.availability,
                performance: r.performance, quality: r.quality,
                source: 'line_file',
            });
        }
    }
    catch (_) {
        // Table may not exist yet on first run — safe to return empty
    }
    return overrides;
}
function getIncidents(db, uploadId, weekNumber) {
    // If a specific uploadId is provided, use it directly
    if (uploadId) {
        const rows = db.prepare('SELECT * FROM raw_incidents WHERE upload_id = ?').all(uploadId);
        return weekNumber ? rows.filter(r => String(r.week_number) === weekNumber) : rows;
    }
    // If a week number is requested, find all active uploads that contain that week
    if (weekNumber) {
        const uploads = db.prepare(`SELECT id FROM data_uploads WHERE status = 'active' ORDER BY upload_time DESC`).all();
        for (const upload of uploads) {
            const rows = db.prepare('SELECT * FROM raw_incidents WHERE upload_id = ? AND week_number = ?').all(upload.id, Number(weekNumber));
            if (rows.length > 0)
                return rows;
        }
        return [];
    }
    // Default: latest active upload
    const latest = db.prepare(`SELECT id FROM data_uploads WHERE status = 'active' ORDER BY upload_time DESC LIMIT 1`).get();
    if (!latest)
        return [];
    return db.prepare('SELECT * FROM raw_incidents WHERE upload_id = ?').all(latest.id);
}
router.get('/weeks', auth_1.authMiddleware, (_req, res) => {
    try {
        const db = (0, init_1.getDb)();
        // Read week_number directly from data_uploads (the canonical value stamped at
        // upload time) — never from raw_incidents, which may contain stray incidents
        // near week boundaries that would create phantom week entries.
        const rows = db.prepare(`
      SELECT id as upload_id, week_number, year, original_filename
      FROM data_uploads
      WHERE status = 'active' AND week_number > 0
      ORDER BY year DESC, week_number DESC
    `).all();
        // Deduplicate by week_number+year (multiple uploads may share the same week)
        const weekMap = new Map();
        for (const row of rows) {
            const key = `${row.year}-${row.week_number}`;
            if (!weekMap.has(key)) {
                weekMap.set(key, { week_number: row.week_number, year: row.year, upload_id: row.upload_id, original_filename: row.original_filename });
            }
        }
        const result = Array.from(weekMap.values())
            .sort((a, b) => b.year - a.year || b.week_number - a.week_number);
        res.json(result);
    }
    catch (error) {
        logger_1.logger.error('Weeks error', { error });
        res.status(500).json({ error: 'Failed to fetch weeks' });
    }
});
router.get('/summary', auth_1.authMiddleware, (req, res) => {
    try {
        const db = (0, init_1.getDb)();
        const settings = getSettings(db);
        const incidents = getIncidents(db, req.query.uploadId, req.query.week);
        if (incidents.length === 0) {
            res.json({ empty: true, message: 'No data available. Please upload an Excel file.' });
            return;
        }
        const { byLine: rawByLine, overall: rawOverall, byEquipment, byTeam, anomalies } = (0, oee_engine_1.calculateOEE)(incidents, settings);
        const pareto = (0, oee_engine_1.buildParetoData)(incidents);
        const correlation = (0, correlation_1.buildCorrelationMatrix)(rawByLine);
        const shift = (0, correlation_1.buildShiftAnalysis)(incidents);
        const heatmap = (0, correlation_1.buildDayHourHeatmap)(incidents);
        const productCorr = (0, correlation_1.buildProductFailureCorrelation)(incidents);
        // Apply line-level OEE overrides from timestamp files when available
        const lineOEEOverrides = getLineOEEOverrides(db, req.query.week);
        const byLine = rawByLine.map((l) => {
            const ov = lineOEEOverrides.get(l.line);
            if (!ov)
                return { ...l, oeeSource: 'incident_file' };
            return {
                ...l,
                oee: ov.oee,
                availability: ov.availability,
                performance: ov.performance,
                quality: ov.quality,
                oeeSource: 'line_file',
            };
        });
        // Recompute overall OEE as mean of byLine (using overridden values)
        const overall = { ...rawOverall };
        if (byLine.length > 0) {
            overall.oee = byLine.reduce((s, l) => s + l.oee, 0) / byLine.length;
            overall.availability = byLine.reduce((s, l) => s + l.availability, 0) / byLine.length;
            overall.performance = byLine.reduce((s, l) => s + l.performance, 0) / byLine.length;
            overall.quality = byLine.reduce((s, l) => s + l.quality, 0) / byLine.length;
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
    }
    catch (error) {
        logger_1.logger.error('Analysis error', { error });
        res.status(500).json({ error: 'Analysis failed' });
    }
});
router.get('/by-line', auth_1.authMiddleware, (req, res) => {
    try {
        const db = (0, init_1.getDb)();
        const settings = getSettings(db);
        const incidents = getIncidents(db, req.query.uploadId, req.query.week);
        const { byLine: rawByLine } = (0, oee_engine_1.calculateOEE)(incidents, settings);
        const overrides = getLineOEEOverrides(db, req.query.week);
        const byLine = rawByLine.map((l) => {
            const ov = overrides.get(l.line);
            if (!ov)
                return { ...l, oeeSource: 'incident_file' };
            return { ...l, oee: ov.oee, availability: ov.availability, performance: ov.performance, quality: ov.quality, oeeSource: 'line_file' };
        });
        res.json(byLine);
    }
    catch (error) {
        logger_1.logger.error('By-line error', { error });
        res.status(500).json({ error: 'Analysis failed' });
    }
});
router.get('/by-equipment', auth_1.authMiddleware, (req, res) => {
    try {
        const db = (0, init_1.getDb)();
        const settings = getSettings(db);
        const incidents = getIncidents(db, req.query.uploadId, req.query.week);
        const { byEquipment } = (0, oee_engine_1.calculateOEE)(incidents, settings);
        res.json(byEquipment);
    }
    catch (error) {
        logger_1.logger.error('By-equipment error', { error });
        res.status(500).json({ error: 'Analysis failed' });
    }
});
router.get('/pareto', auth_1.authMiddleware, (req, res) => {
    try {
        const db = (0, init_1.getDb)();
        const incidents = getIncidents(db, req.query.uploadId, req.query.week);
        const pareto = (0, oee_engine_1.buildParetoData)(incidents);
        res.json(pareto);
    }
    catch (error) {
        logger_1.logger.error('Pareto error', { error });
        res.status(500).json({ error: 'Analysis failed' });
    }
});
router.get('/timeline', auth_1.authMiddleware, (req, res) => {
    try {
        const db = (0, init_1.getDb)();
        const incidents = getIncidents(db, req.query.uploadId, req.query.week);
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
    }
    catch (error) {
        logger_1.logger.error('Timeline error', { error });
        res.status(500).json({ error: 'Analysis failed' });
    }
});
router.get('/correlations', auth_1.authMiddleware, (req, res) => {
    try {
        const db = (0, init_1.getDb)();
        const settings = getSettings(db);
        const incidents = getIncidents(db, req.query.uploadId, req.query.week);
        const { byLine } = (0, oee_engine_1.calculateOEE)(incidents, settings);
        const correlation = (0, correlation_1.buildCorrelationMatrix)(byLine);
        const product = (0, correlation_1.buildProductFailureCorrelation)(incidents);
        const shift = (0, correlation_1.buildShiftAnalysis)(incidents);
        const heatmap = (0, correlation_1.buildDayHourHeatmap)(incidents);
        res.json({ correlation, product, shift, heatmap });
    }
    catch (error) {
        logger_1.logger.error('Correlations error', { error });
        res.status(500).json({ error: 'Analysis failed' });
    }
});
router.get('/oee', auth_1.authMiddleware, (req, res) => {
    try {
        const db = (0, init_1.getDb)();
        const settings = getSettings(db);
        const incidents = getIncidents(db, req.query.uploadId, req.query.week);
        const { byLine: rawByLine, overall: rawOverall } = (0, oee_engine_1.calculateOEE)(incidents, settings);
        const overrides = getLineOEEOverrides(db, req.query.week);
        const byLine = rawByLine.map((l) => {
            const ov = overrides.get(l.line);
            if (!ov)
                return { ...l, oeeSource: 'incident_file' };
            return { ...l, oee: ov.oee, availability: ov.availability, performance: ov.performance, quality: ov.quality, oeeSource: 'line_file' };
        });
        const overall = { ...rawOverall };
        if (byLine.length > 0) {
            overall.oee = byLine.reduce((s, l) => s + l.oee, 0) / byLine.length;
            overall.availability = byLine.reduce((s, l) => s + l.availability, 0) / byLine.length;
            overall.performance = byLine.reduce((s, l) => s + l.performance, 0) / byLine.length;
            overall.quality = byLine.reduce((s, l) => s + l.quality, 0) / byLine.length;
        }
        res.json({ byLine, overall, settings });
    }
    catch (error) {
        logger_1.logger.error('OEE error', { error });
        res.status(500).json({ error: 'Analysis failed' });
    }
});
router.get('/trends', auth_1.authMiddleware, (_req, res) => {
    try {
        const db = (0, init_1.getDb)();
        const settings = getSettings(db);
        const uploads = db.prepare(`
      SELECT id, week_number, year FROM data_uploads
      WHERE status = 'active' ORDER BY year DESC, week_number DESC LIMIT 8
    `).all();
        const trends = [];
        for (const upload of uploads) {
            const incidents = db.prepare('SELECT * FROM raw_incidents WHERE upload_id = ?').all(upload.id);
            if (incidents.length === 0)
                continue;
            const { byLine: rawByLine, overall: rawOverall } = (0, oee_engine_1.calculateOEE)(incidents, settings);
            // Apply line-file overrides for this specific week
            const overrides = getLineOEEOverrides(db, String(upload.week_number));
            const byLine = rawByLine.map((l) => {
                const ov = overrides.get(l.line);
                if (!ov)
                    return { ...l, oeeSource: 'incident_file' };
                return { ...l, oee: ov.oee, availability: ov.availability, performance: ov.performance, quality: ov.quality, oeeSource: 'line_file' };
            });
            const overall = { ...rawOverall };
            if (byLine.length > 0) {
                overall.oee = byLine.reduce((s, l) => s + l.oee, 0) / byLine.length;
                overall.availability = byLine.reduce((s, l) => s + l.availability, 0) / byLine.length;
                overall.performance = byLine.reduce((s, l) => s + l.performance, 0) / byLine.length;
                overall.quality = byLine.reduce((s, l) => s + l.quality, 0) / byLine.length;
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
    }
    catch (error) {
        logger_1.logger.error('Trends error', { error });
        res.status(500).json({ error: 'Analysis failed' });
    }
});
// ── GET /analyze/oee-transparency ───────────────────────────────────────────
// Returns per-line OEE source, formula breakdown, and per-station details
router.get('/oee-transparency', auth_1.authMiddleware, (req, res) => {
    try {
        const db = (0, init_1.getDb)();
        const settings = getSettings(db);
        const incidents = getIncidents(db, req.query.uploadId, req.query.week);
        const { byLine: rawByLine } = (0, oee_engine_1.calculateOEE)(incidents, settings);
        const overrides = getLineOEEOverrides(db, req.query.week);
        const lines = rawByLine.map((l) => {
            const ov = overrides.get(l.line);
            const isLineFile = !!ov;
            // Per-station detail for line-file lines
            let stations = [];
            let totalBoardsProduced = 0;
            if (isLineFile) {
                const upload = db.prepare(`
          SELECT id, total_boards FROM line_oee_uploads
          WHERE line = ? AND status = 'active'
          ORDER BY year DESC, week_number DESC LIMIT 1
        `).get(l.line);
                if (upload) {
                    totalBoardsProduced = upload.total_boards ?? 0;
                    const stRows = db.prepare(`
            SELECT station, availability, performance, quality, oee,
                   total_boards, produced_qty, stoppage_hours, stoppage_count, planned_hours,
                   mttr, mtbf, el_variant,
                   micro_stop_count, micro_stop_hours, tack_time_sec
            FROM line_oee_stations WHERE upload_id = ?
          `).all(upload.id);
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
                oee: isLineFile ? ov.oee : l.oee,
                availability: isLineFile ? ov.availability : l.availability,
                performance: isLineFile ? ov.performance : l.performance,
                quality: isLineFile ? ov.quality : l.quality,
                // incident-based raw values always included for comparison
                incidentOEE: l.oee,
                incidentAvailability: l.availability,
                incidentPerformance: l.performance,
                incidentQuality: l.quality,
                incidentDowntimeHours: l.totalDowntimeHours,
                incidentCount: l.totalIncidents,
                stations,
                totalBoardsProduced,
                // Formula constants
                formula: isLineFile ? {
                    method: 'Throughput-based (Siemens CMES timestamps)',
                    targetUPH: 500,
                    plannedHours: 112.5,
                    stationAverage: 'OEE = avg(station OEEs); station OEE = Availability × Performance × Quality',
                    availability: 'Availability = (112.5h − StoppageHours) / 112.5h; Stoppage = (gap − tackTime) > 10 min between consecutive timestamps',
                    performance: 'Performance = BoardsProduced / (AvailableHours × 500 UPH)',
                    quality: 'Quality = (Tested − Fails) / Tested  [Lead Height always = 100%]',
                } : {
                    method: 'Downtime-based (MES incident log)',
                    plannedHours: settings.shifts_per_day * settings.hours_per_shift * settings.days_per_week,
                    availability: 'Availability = (PlannedHours − TotalDowntimeHours) / PlannedHours',
                    performance: 'Performance = estimated from downtime ratio (no cycle-time data)',
                    quality: 'Quality = 1 − (cascade/repeat failure ratio)',
                },
            };
        });
        res.json({ lines, settings });
    }
    catch (error) {
        logger_1.logger.error('OEE transparency error', { error });
        res.status(500).json({ error: 'Transparency fetch failed' });
    }
});
exports.default = router;
//# sourceMappingURL=analyze.js.map