import { Router, Request, Response } from 'express';
import { getDb } from '../db/init';
import { authMiddleware } from '../middleware/auth';
import { requireAnalystOrAbove } from '../middleware/rbac';
import { streamAIAnalysis, AnalysisType } from '../services/ai-service';
import { calculateOEE, buildParetoData } from '../services/oee-engine';
import { buildCorrelationMatrix } from '../services/correlation';
import { RawIncident, OEESettings, AnalysisContext } from '../types';
import { logAudit } from '../services/audit';
import { logger } from '../utils/logger';
import { trackUsage } from '../middleware/usageTracker';

const router = Router();

function getSettings(db: ReturnType<typeof getDb>): OEESettings {
  return db.prepare('SELECT * FROM oee_settings ORDER BY id DESC LIMIT 1').get() as unknown as OEESettings;
}

function buildContext(db: ReturnType<typeof getDb>, uploadId?: string): AnalysisContext {
  let incidents: RawIncident[];
  let weekNumber = 0;

  if (uploadId) {
    incidents = db.prepare('SELECT * FROM raw_incidents WHERE upload_id = ?').all(uploadId) as unknown as RawIncident[];
    const up = db.prepare('SELECT * FROM data_uploads WHERE id = ?').get(uploadId) as unknown as { week_number: number } | undefined;
    weekNumber = up?.week_number || 0;
  } else {
    const latest = db.prepare(`SELECT id, week_number FROM data_uploads WHERE status = 'active' ORDER BY upload_time DESC LIMIT 1`).get() as unknown as { id: number; week_number: number } | undefined;
    if (!latest) {
      return {
        weekNumber: 0, plant: 'Manufacturing Plant',
        summary: { totalIncidents: 0, totalDowntimeHours: 0, avgOEE: 0, avgMTTR: 0, avgMTBF: 0, topFailureCategories: [] },
        byLine: [], byEquipment: [], byTeam: [], trends: [], correlations: [], anomalies: [],
        historicalContext: 'No data available',
      };
    }
    incidents = db.prepare('SELECT * FROM raw_incidents WHERE upload_id = ?').all(latest.id) as unknown as RawIncident[];
    weekNumber = latest.week_number;
  }

  const settings = getSettings(db);
  const { byLine, overall, byEquipment, byTeam, anomalies } = calculateOEE(incidents, settings);
  const pareto = buildParetoData(incidents);
  const correlation = buildCorrelationMatrix(byLine);

  const plant = settings.plant_name || 'Manufacturing Plant';
  const topCategories = pareto.byCategory.slice(0, 5).map((c) => ({
    category: c.category, hours: c.hours, count: c.count,
  }));

  const historicalUploads = db.prepare(`
    SELECT id, week_number FROM data_uploads WHERE status = 'active' ORDER BY upload_time DESC LIMIT 5
  `).all() as unknown as { id: number; week_number: number }[];
  const historicalLines: string[] = [];
  for (const u of historicalUploads.slice(1)) {
    const incs = db.prepare('SELECT * FROM raw_incidents WHERE upload_id = ?').all(u.id) as unknown as RawIncident[];
    if (incs.length > 0) {
      const { overall: ov } = calculateOEE(incs, settings);
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

router.post('/analyze', authMiddleware, requireAnalystOrAbove,
  trackUsage('ai_query', (req) => ({ analysisType: req.body.analysisType })),
  async (req: Request, res: Response) => {
  const { analysisType, uploadId, extra } = req.body;
  const typeAliases: Record<string, AnalysisType> = {
    predictive: 'predictive_risk',
    oee_improvement: 'benchmark_gap',
    equipment_health: 'maintenance_strategy',
  };
  const resolvedType: AnalysisType = typeAliases[analysisType] || analysisType;

  const validTypes: AnalysisType[] = [
    'weekly_summary', 'root_cause', 'action_plan', 'predictive_risk',
    'benchmark_gap', 'maintenance_strategy', 'team_performance', 'correlation_explanation',
  ];

  if (!validTypes.includes(resolvedType)) {
    res.status(400).json({ error: `Invalid analysis type: ${analysisType}` });
    return;
  }

  try {
    const db = getDb();
    const context = buildContext(db, uploadId);

    if (context.summary.totalIncidents === 0 && !extra) {
      res.status(400).json({ error: 'No data available for analysis' });
      return;
    }

    const latestUpload = uploadId
      ? db.prepare('SELECT id FROM data_uploads WHERE id = ?').get(uploadId) as { id: number } | undefined
      : db.prepare(`SELECT id FROM data_uploads WHERE status = 'active' ORDER BY upload_time DESC LIMIT 1`).get() as { id: number } | undefined;

    logAudit(req.user!.userId, req.user!.username, 'AI_ANALYZE', 'ai_analyses',
      `Analysis type: ${analysisType}`, req.ip);

    const savedAnalysis = db.prepare(`
      INSERT INTO ai_analyses (upload_id, analysis_type, week_number, line, area, prompt_context, created_by, model_version)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      latestUpload?.id || null,
      resolvedType,
      context.weekNumber,
      extra?.line || null,
      extra?.category || null,
      JSON.stringify(context),
      req.user!.userId,
      'claude-sonnet-4-5'
    );

    const analysisId = savedAnalysis.lastInsertRowid as number;

    const fullResponse = await streamAIAnalysis(resolvedType, context, res, extra as Record<string, unknown>);

    if (fullResponse) {
      db.prepare('UPDATE ai_analyses SET response = ? WHERE id = ?').run(fullResponse, analysisId);
    }
  } catch (error) {
    logger.error('AI route error', { error });
    if (!res.headersSent) {
      res.status(500).json({ error: 'AI analysis failed' });
    }
  }
});

router.get('/history', authMiddleware, (_req: Request, res: Response) => {
  try {
    const db = getDb();
    const analyses = db.prepare(`
      SELECT aa.id, aa.analysis_type, aa.week_number, aa.line, aa.area, aa.created_at, aa.model_version,
             aa.response, u.username as created_by_name
      FROM ai_analyses aa
      LEFT JOIN users u ON aa.created_by = u.id
      ORDER BY aa.created_at DESC
      LIMIT 50
    `).all();
    res.json(analyses);
  } catch (error) {
    logger.error('AI history error', { error });
    res.status(500).json({ error: 'Failed to fetch AI history' });
  }
});

router.get('/analysis/:id', authMiddleware, (req: Request, res: Response) => {
  try {
    const db = getDb();
    const analysis = db.prepare('SELECT * FROM ai_analyses WHERE id = ?').get(req.params.id);
    if (!analysis) {
      res.status(404).json({ error: 'Analysis not found' });
      return;
    }
    res.json(analysis);
  } catch (error) {
    logger.error('AI get analysis error', { error });
    res.status(500).json({ error: 'Failed to fetch analysis' });
  }
});

export default router;
