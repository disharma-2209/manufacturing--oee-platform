import Anthropic from '@anthropic-ai/sdk';
import { AnalysisContext } from '../types';
import { logger } from '../utils/logger';
import { Response } from 'express';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

// Ensure .env is loaded — try multiple paths to cover different CWDs
const envPaths = [
  path.resolve(process.cwd(), '.env'),
  path.resolve(__dirname, '../.env'),
  path.resolve(__dirname, '../../.env'),
];
for (const p of envPaths) {
  if (fs.existsSync(p)) { dotenv.config({ path: p }); break; }
}

function getClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || apiKey === 'sk-ant-your-key-here' || apiKey.trim() === '') {
    throw new Error('ANTHROPIC_API_KEY is not configured. Please add your API key to backend/.env and restart the server.');
  }
  return new Anthropic({ apiKey });
}

const SYSTEM_PROMPT = `You are a manufacturing OEE analyst. Analyze production downtime data for an electronics manufacturing facility (inverters/batteries, 3 shifts × 5 days = 120h/week). World-class benchmarks: OEE 85%, Availability 90%, Performance 95%, Quality 99.5%, MTTR < 2h, MTBF > 24h.

CRITICAL RULES:
- Output ONLY a raw JSON object. No markdown, no backticks, no text before or after.
- Keep ALL string values SHORT (≤ 15 words). Use bullet-point style phrases, not sentences.
- Every array MUST contain EXACTLY 3 items — never fewer, never more.
- Prefer numbers and percentages over prose.`;

export type AnalysisType =
  | 'weekly_summary'
  | 'root_cause'
  | 'action_plan'
  | 'predictive_risk'
  | 'benchmark_gap'
  | 'maintenance_strategy'
  | 'team_performance'
  | 'correlation_explanation';

function buildPrompt(analysisType: AnalysisType, context: AnalysisContext, extra?: Record<string, unknown>): string {
  // Send only essential fields to keep prompts small and fast
  const facilityOEEpct = context.summary?.avgOEE != null
    ? `${(context.summary.avgOEE * 100).toFixed(1)}%`
    : null;

  const ctx = {
    summary: context.summary,
    facilityOEE: facilityOEEpct,
    byLine: context.byLine?.slice(0, 5).map((l) => ({
      line: l.line, oee: l.oee, availability: l.availability,
      totalDowntimeHours: l.totalDowntimeHours, totalIncidents: l.totalIncidents,
      mttr: l.mttr, mtbf: l.mtbf,
    })),
    byTeam: context.byTeam?.slice(0, 4),
    byEquipment: context.byEquipment?.slice(0, 5).map((e) => ({
      equipment: e.equipment, line: e.line, totalIncidents: e.totalIncidents,
      totalDowntimeHours: e.totalDowntimeHours, avgMttr: e.avgMttr, healthScore: e.healthScore,
    })),
    anomalies: context.anomalies?.slice(0, 3),
  };
  const contextStr = JSON.stringify(ctx);

  switch (analysisType) {
    case 'weekly_summary':
      return `Weekly OEE summary. DATA: ${contextStr}

IMPORTANT: The facility-level OEE is pre-calculated as ${facilityOEEpct ?? 'see summary.avgOEE'}. You MUST use this exact value in keyMetric — do NOT recompute OEE from line-level data.
You MUST provide EXACTLY 3 highlights and EXACTLY 3 concerns — no exceptions.

Output ONLY this JSON (raw, no markdown):
{"summary":"≤12 word executive summary","highlights":["specific win with metric","specific win with metric","specific win with metric"],"concerns":["specific risk with metric","specific risk with metric","specific risk with metric"],"keyMetric":"Facility OEE ${facilityOEEpct ?? ''} (target 85%)","trend":"improving|stable|declining"}`;

    case 'root_cause':
      return `Top 3 root causes for highest-downtime failures. DATA: ${contextStr}

Output ONLY this JSON (raw, no markdown):
{"topThreeRootCauses":[{"rank":1,"failureCategory":"category","downtimeHours":0,"fiveWhys":[{"level":1,"why":"≤8 words","answer":"≤8 words"},{"level":2,"why":"≤8 words","answer":"≤8 words"},{"level":3,"why":"≤8 words","answer":"≤8 words"}],"rootCause":"≤10 words","recommendedCountermeasure":"≤10 words"}]}`;

    case 'action_plan':
      return `Top 3 prioritized actions to improve OEE. DATA: ${contextStr}

Output ONLY this JSON (raw, no markdown):
{"actions":[{"priority":1,"line":"line name","area":"category","problemStatement":"problem in ≤10 words","rootCauseHypothesis":"hypothesis in ≤8 words","recommendedAction":"action in ≤10 words","expectedImpact":"e.g. -2h downtime/week","driRole":"TE|ME|PE|EM|01-PROD","suggestedDueDateDays":7,"successMetric":"metric in ≤8 words"}],"totalExpectedDowntimeReduction":"X hrs/week","totalExpectedOEEImprovement":"+X%"}`;

    case 'predictive_risk':
      return `Identify top 3 equipment at highest failure risk next 2 weeks. DATA: ${contextStr}

Output ONLY this JSON (raw, no markdown):
{"highRiskItems":[{"equipment":"name","line":"line","riskLevel":"critical|high|medium","riskScore":85,"reasons":["reason 1","reason 2"],"predictedFailureWindow":"within X days","recommendedPreventiveAction":"action in ≤10 words","urgency":"immediate|this week|next week"}],"overallRiskAssessment":"summary in ≤12 words","recommendedMonitoring":["item 1","item 2"]}`;

    case 'benchmark_gap':
      return `Gap analysis vs world-class (OEE 85%, Avail 90%, Perf 95%, Quality 99.5%). DATA: ${contextStr}

Output ONLY this JSON (raw, no markdown):
{"gaps":[{"metric":"OEE","currentValue":0.72,"benchmarkValue":0.85,"gap":0.13,"priority":"high","closureStrategy":"strategy in ≤10 words","estimatedTimeToClose":"X months","requiredActions":["action 1","action 2"]}],"overallMaturityLevel":"reactive|proactive|predictive|world-class","topPriorityGap":"metric name","roadmap":[{"phase":"Phase 1 (0-3 mo)","focus":"focus in ≤8 words","expectedGain":"+X%"},{"phase":"Phase 2 (3-6 mo)","focus":"focus in ≤8 words","expectedGain":"+X%"}]}`;

    case 'maintenance_strategy':
      return `Maintenance strategy recommendations based on MTTR/MTBF. DATA: ${contextStr}

Output ONLY this JSON (raw, no markdown):
{"recommendations":[{"equipment":"name","line":"line","currentStrategy":"reactive","recommendedStrategy":"preventive|predictive","justification":"reason in ≤10 words","pmInterval":"every X days","estimatedMTBFImprovement":"+X%","estimatedMTTRReduction":"-X%","implementationCost":"low|medium|high","roi":"X months payback"}],"overallStrategy":"summary in ≤12 words","quickWins":["win 1","win 2","win 3"]}`;

    case 'team_performance':
      return `Team response/resolution performance analysis. DATA: ${contextStr}

Output ONLY this JSON (raw, no markdown):
{"teamAnalysis":[{"team":"team name","strengths":["strength in ≤6 words"],"gaps":["gap in ≤6 words"],"avgResponseVsBenchmark":"X% above|below target","avgResolutionVsBenchmark":"X% above|below target","trainingRecommendation":"training focus in ≤8 words","processImprovement":"process change in ≤8 words"}],"crossTeamInsights":"insight in ≤12 words","bestPractices":["practice 1","practice 2"],"escalationRecommendations":["scenario in ≤8 words"]}`;

    case 'correlation_explanation':
      return `Correlation: ${extra?.metric1} vs ${extra?.metric2} = ${extra?.correlation}. DATA: ${contextStr}

Output ONLY this JSON (raw, no markdown):
{"explanation":"explanation in ≤12 words","manufacturingContext":"context in ≤10 words","implication":"implication in ≤10 words","recommendedActions":["action 1","action 2"],"furtherInvestigation":"what to investigate in ≤10 words"}`;

    default:
      return contextStr;
  }
}

export async function streamAIAnalysis(
  analysisType: AnalysisType,
  context: AnalysisContext,
  res: Response,
  extra?: Record<string, unknown>
): Promise<string> {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  let fullResponse = '';

  try {
    const prompt = buildPrompt(analysisType, context, extra);

    const stream = await getClient().messages.stream({
      model: 'claude-haiku-4-5',
      max_tokens: 2000,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: prompt }],
    });

    for await (const chunk of stream) {
      if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
        const text = chunk.delta.text;
        fullResponse += text;
        res.write(`data: ${JSON.stringify({ text })}\n\n`);
      }
    }

    // Strip markdown fences in case the model wrapped the JSON
    fullResponse = fullResponse.trim()
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```\s*$/, '')
      .trim();

    res.write(`data: ${JSON.stringify({ done: true, fullResponse })}\n\n`);
    res.end();
  } catch (error) {
    logger.error('AI analysis error', { error });
    let msg = 'AI analysis failed. Please try again.';
    if (error && typeof error === 'object') {
      const e = error as Record<string, unknown>;
      // Anthropic SDK wraps the error: e.error.error.message
      const nested = (e.error as Record<string, unknown>)?.error as Record<string, unknown>;
      if (nested?.message) {
        msg = String(nested.message);
      } else if (e.message) {
        msg = String(e.message);
      }
    } else if (error instanceof Error) {
      msg = error.message;
    }
    res.write(`data: ${JSON.stringify({ error: msg })}\n\n`);
    res.end();
  }

  return fullResponse;
}

export async function runAIAnalysis(
  analysisType: AnalysisType,
  context: AnalysisContext,
  extra?: Record<string, unknown>
): Promise<string> {
  const prompt = buildPrompt(analysisType, context, extra);

  const message = await getClient().messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 2000,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: prompt }],
  });

  const content = message.content[0];
  return content.type === 'text' ? content.text : '';
}

