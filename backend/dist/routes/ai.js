"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const init_1 = require("../db/init");
const auth_1 = require("../middleware/auth");
const rbac_1 = require("../middleware/rbac");
const ai_service_1 = require("../services/ai-service");
const oee_engine_1 = require("../services/oee-engine");
const correlation_1 = require("../services/correlation");
const audit_1 = require("../services/audit");
const logger_1 = require("../utils/logger");
const usageTracker_1 = require("../middleware/usageTracker");
const router = (0, express_1.Router)();
function getSettings(db) {
    return db.prepare('SELECT * FROM oee_settings ORDER BY id DESC LIMIT 1').get();
}
function buildContext(db, uploadId) {
    let incidents;
    let weekNumber = 0;
    if (uploadId) {
        incidents = db.prepare('SELECT * FROM raw_incidents WHERE upload_id = ?').all(uploadId);
        const up = db.prepare('SELECT * FROM data_uploads WHERE id = ?').get(uploadId);
        weekNumber = up?.week_number || 0;
    }
    else {
        const latest = db.prepare(`SELECT id, week_number FROM data_uploads WHERE status = 'active' ORDER BY upload_time DESC LIMIT 1`).get();
        if (!latest) {
            return {
                weekNumber: 0, plant: 'Manufacturing Plant',
                summary: { totalIncidents: 0, totalDowntimeHours: 0, avgOEE: 0, avgMTTR: 0, avgMTBF: 0, topFailureCategories: [] },
                byLine: [], byEquipment: [], byTeam: [], trends: [], correlations: [], anomalies: [],
                historicalContext: 'No data available',
            };
        }
        incidents = db.prepare('SELECT * FROM raw_incidents WHERE upload_id = ?').all(latest.id);
        weekNumber = latest.week_number;
    }
    const settings = getSettings(db);
    const { byLine, overall, byEquipment, byTeam, anomalies } = (0, oee_engine_1.calculateOEE)(incidents, settings);
    const pareto = (0, oee_engine_1.buildParetoData)(incidents);
    const correlation = (0, correlation_1.buildCorrelationMatrix)(byLine);
    const plant = settings.plant_name || 'Manufacturing Plant';
    const topCategories = pareto.byCategory.slice(0, 5).map((c) => ({
        category: c.category, hours: c.hours, count: c.count,
    }));
    const historicalUploads = db.prepare(`
    SELECT id, week_number FROM data_uploads WHERE status = 'active' ORDER BY upload_time DESC LIMIT 5
  `).all();
    const historicalLines = [];
    for (const u of historicalUploads.slice(1)) {
        const incs = db.prepare('SELECT * FROM raw_incidents WHERE upload_id = ?').all(u.id);
        if (incs.length > 0) {
            const { overall: ov } = (0, oee_engine_1.calculateOEE)(incs, settings);
            historicalLines.push(`Week ${u.week_number}: OEE=${(ov.oee * 100).toFixed(1)}%, Incidents=${ov.totalIncidents}, Downtime=${ov.totalDowntimeHours.toFixed(1)}h`);
        }
    }
    return {
        weekNumber,
        plant,
        summary: {
            totalIncidents: overall.totalIncidents,
            totalDowntimeHours: overall.totalDowntimeHours,
            avgOEE: overall.oee,
            avgMTTR: overall.mttr,
            avgMTBF: overall.mtbf,
            topFailureCategories: topCategories,
        },
        byLine,
        byEquipment: byEquipment.slice(0, 20),
        byTeam,
        trends: [],
        correlations: correlation.insights,
        anomalies,
        historicalContext: historicalLines.join('\n') || 'No historical data',
    };
}
router.post('/analyze', auth_1.authMiddleware, rbac_1.requireAnalystOrAbove, (0, usageTracker_1.trackUsage)('ai_query', (req) => ({ analysisType: req.body.analysisType })), async (req, res) => {
    const { analysisType, uploadId, extra } = req.body;
    const typeAliases = {
        predictive: 'predictive_risk',
        oee_improvement: 'benchmark_gap',
        equipment_health: 'maintenance_strategy',
    };
    const resolvedType = typeAliases[analysisType] || analysisType;
    const validTypes = [
        'weekly_summary', 'root_cause', 'action_plan', 'predictive_risk',
        'benchmark_gap', 'maintenance_strategy', 'team_performance', 'correlation_explanation',
    ];
    if (!validTypes.includes(resolvedType)) {
        res.status(400).json({ error: `Invalid analysis type: ${analysisType}` });
        return;
    }
    try {
        const db = (0, init_1.getDb)();
        const context = buildContext(db, uploadId);
        if (context.summary.totalIncidents === 0 && !extra) {
            res.status(400).json({ error: 'No data available for analysis' });
            return;
        }
        const latestUpload = uploadId
            ? db.prepare('SELECT id FROM data_uploads WHERE id = ?').get(uploadId)
            : db.prepare(`SELECT id FROM data_uploads WHERE status = 'active' ORDER BY upload_time DESC LIMIT 1`).get();
        (0, audit_1.logAudit)(req.user.userId, req.user.username, 'AI_ANALYZE', 'ai_analyses', `Analysis type: ${analysisType}`, req.ip);
        const savedAnalysis = db.prepare(`
      INSERT INTO ai_analyses (upload_id, analysis_type, week_number, line, area, prompt_context, created_by, model_version)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(latestUpload?.id || null, resolvedType, context.weekNumber, extra?.line || null, extra?.category || null, JSON.stringify(context), req.user.userId, 'claude-sonnet-4-5');
        const analysisId = savedAnalysis.lastInsertRowid;
        const fullResponse = await (0, ai_service_1.streamAIAnalysis)(resolvedType, context, res, extra);
        if (fullResponse) {
            db.prepare('UPDATE ai_analyses SET response = ? WHERE id = ?').run(fullResponse, analysisId);
        }
    }
    catch (error) {
        logger_1.logger.error('AI route error', { error });
        if (!res.headersSent) {
            res.status(500).json({ error: 'AI analysis failed' });
        }
    }
});
router.get('/history', auth_1.authMiddleware, (_req, res) => {
    try {
        const db = (0, init_1.getDb)();
        const analyses = db.prepare(`
      SELECT aa.id, aa.analysis_type, aa.week_number, aa.line, aa.area, aa.created_at, aa.model_version,
             aa.response, u.username as created_by_name
      FROM ai_analyses aa
      LEFT JOIN users u ON aa.created_by = u.id
      ORDER BY aa.created_at DESC
      LIMIT 50
    `).all();
        res.json(analyses);
    }
    catch (error) {
        logger_1.logger.error('AI history error', { error });
        res.status(500).json({ error: 'Failed to fetch AI history' });
    }
});
router.get('/analysis/:id', auth_1.authMiddleware, (req, res) => {
    try {
        const db = (0, init_1.getDb)();
        const analysis = db.prepare('SELECT * FROM ai_analyses WHERE id = ?').get(req.params.id);
        if (!analysis) {
            res.status(404).json({ error: 'Analysis not found' });
            return;
        }
        res.json(analysis);
    }
    catch (error) {
        logger_1.logger.error('AI get analysis error', { error });
        res.status(500).json({ error: 'Failed to fetch analysis' });
    }
});
exports.default = router;
//# sourceMappingURL=ai.js.map