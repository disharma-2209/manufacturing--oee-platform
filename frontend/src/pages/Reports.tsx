import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { FileText, Printer, TrendingDown, TrendingUp, Activity, Users, AlertTriangle, CheckCircle2, Bot, AlertCircle, ShieldAlert, Target, Wrench } from 'lucide-react';
import { api } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { AIInsightCard } from '@/components/shared/AIInsightCard';
import { FullAnalysis, ActionPlan, AIAnalysis } from '@/types';
import { formatPercent, formatHours, formatNumber, getPriorityLabel } from '@/lib/utils';

const REPORT_ANALYSIS_TYPES = [
  { value: 'weekly_summary',       label: 'Weekly Summary',       icon: Activity,    color: 'text-primary',    bg: 'bg-primary/10' },
  { value: 'root_cause',           label: 'Root Cause Analysis',  icon: AlertCircle, color: 'text-red-600',    bg: 'bg-red-50' },
  { value: 'action_plan',          label: 'Action Plan',          icon: Target,      color: 'text-blue-600',   bg: 'bg-blue-50' },
  { value: 'predictive_risk',      label: 'Predictive Risk',      icon: ShieldAlert, color: 'text-orange-600', bg: 'bg-orange-50' },
  { value: 'benchmark_gap',        label: 'Benchmark Gap',        icon: TrendingUp,  color: 'text-green-600',  bg: 'bg-green-50' },
  { value: 'maintenance_strategy', label: 'Maintenance Strategy', icon: Wrench,      color: 'text-purple-600', bg: 'bg-purple-50' },
  { value: 'team_performance',     label: 'Team Performance',     icon: Users,       color: 'text-indigo-600', bg: 'bg-indigo-50' },
] as const;

export function Reports() {
  const { data: analysis, isLoading: loadingAnalysis } = useQuery<FullAnalysis>({
    queryKey: ['analysis-summary'],
    queryFn: () => api.get('/analyze/summary'),
  });

  const { data: actionsResp } = useQuery<{ actions: ActionPlan[]; total: number }>({
    queryKey: ['action-plans'],
    queryFn: () => api.get('/actions?limit=200'),
  });

  const { data: trends } = useQuery<unknown[]>({
    queryKey: ['trends'],
    queryFn: () => api.get('/analyze/trends'),
  });

  const { data: aiHistory } = useQuery<AIAnalysis[]>({
    queryKey: ['ai-history', 'v2'],
    queryFn: () => api.get(`/ai/history?t=${Date.now()}`),
    staleTime: 0,
    gcTime: 0,
  });

  const handlePrint = () => window.print();

  const actions = actionsResp?.actions || [];
  const s = analysis?.summary;
  const byLine = analysis?.byLine || [];
  const pareto = analysis?.pareto?.byCategory?.slice(0, 8) || [];
  const byTeam = analysis?.byTeam || [];
  const openActions = actions.filter((a) => a.status === 'Open' || a.status === 'In Progress');

  if (loadingAnalysis) {
    return (
      <div className="space-y-4">
        <div className="skeleton h-8 w-48" />
        {[...Array(4)].map((_, i) => <div key={i} className="skeleton h-32 w-full" />)}
      </div>
    );
  }

  if (analysis?.empty || !s) {
    return (
      <div className="card p-12 text-center">
        <FileText className="w-12 h-12 text-text-muted mx-auto mb-4" />
        <p className="text-lg font-semibold text-text-primary mb-2">No data to report</p>
        <p className="text-sm text-text-muted">Upload production data or load the demo dataset first.</p>
      </div>
    );
  }

  const insightMap: Partial<Record<string, AIAnalysis>> = {};
  if (aiHistory) {
    for (const t of REPORT_ANALYSIS_TYPES) {
      const found = aiHistory.find(h => h.analysis_type === t.value && h.response);
      if (found) insightMap[t.value] = found;
    }
  }
  const availableInsights = REPORT_ANALYSIS_TYPES.filter(t => insightMap[t.value]);
  const oeeGoal = analysis.settings?.oee_goal || 0.82;

  return (
    <div className="space-y-2.5">

      {/* ── Row 1: Header + KPI strip + alerts ── */}
      <div className="flex items-center justify-between py-0.5">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 bg-primary rounded flex items-center justify-center flex-shrink-0">
            <FileText className="w-3 h-3 text-white" />
          </div>
          <div>
            <h1 className="text-sm font-bold text-text-primary tracking-tight leading-tight">OEE Intelligence Report</h1>
            <p className="text-[10px] text-text-muted leading-tight">Generated {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          {s.cascadeCount > 0 && (
            <div className="flex items-center gap-1 text-[10px] font-semibold text-warning bg-amber-50 border border-amber-200 px-2 py-1 rounded-full">
              <AlertTriangle className="w-2.5 h-2.5" />{s.cascadeCount} cascade
            </div>
          )}
          {s.repeatFailureCount > 0 && (
            <div className="flex items-center gap-1 text-[10px] font-semibold text-danger bg-red-50 border border-red-200 px-2 py-1 rounded-full">
              <AlertTriangle className="w-2.5 h-2.5" />{s.repeatFailureCount} repeat
            </div>
          )}
          <Button onClick={handlePrint} variant="outline" size="sm" className="gap-1 text-[10px] h-6 px-2">
            <Printer className="w-2.5 h-2.5" /> Print
          </Button>
        </div>
      </div>

      {/* ── Row 2: KPI strip (compact) ── */}
      <div className="grid grid-cols-4 gap-2">
        {[
          { label: 'Overall OEE', value: formatPercent(analysis.overall?.oee || 0), sub: `Goal: ${formatPercent(oeeGoal)}`, ok: (analysis.overall?.oee || 0) >= oeeGoal },
          { label: 'Total Downtime', value: formatHours(s.totalDowntimeHours), sub: `${formatNumber(s.totalIncidents)} incidents`, ok: null },
          { label: 'Avg MTTR', value: formatHours(s.avgMTTR), sub: 'Mean time to repair', ok: null },
          { label: 'Avg MTBF', value: formatHours(s.avgMTBF), sub: 'Mean time between failures', ok: null },
        ].map(kpi => (
          <div key={kpi.label} className="card px-3 py-2 flex items-center gap-3">
            <div className="min-w-0">
              <span className="text-[9px] font-semibold text-text-muted uppercase tracking-wider block">{kpi.label}</span>
              <p className={`font-mono text-lg font-bold leading-tight ${kpi.ok === true ? 'text-success' : kpi.ok === false ? 'text-danger' : 'text-text-primary'}`}>{kpi.value}</p>
              <p className="text-[9px] text-text-muted leading-tight">{kpi.sub}</p>
            </div>
          </div>
        ))}
      </div>

      {/* ── Row 3: 4-col data grid (OEE by Line | Pareto | Team | Actions) ── */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-2.5">

        {/* OEE by Line — 1 col */}
        {byLine.length > 0 && (
          <div className="card p-2.5">
            <div className="flex items-center gap-1 mb-1.5">
              <TrendingUp className="w-3 h-3 text-primary flex-shrink-0" />
              <p className="text-[10.5px] font-bold text-text-primary">OEE by Line</p>
            </div>
            <table className="w-full text-[9.5px]">
              <thead>
                <tr className="border-b border-border-col">
                  {['Line', 'OEE', 'Avail', 'Inc', 'DT'].map(h => (
                    <th key={h} className={`pb-1 font-semibold text-text-muted text-[8px] uppercase ${h === 'Line' ? 'text-left pr-1' : 'text-right pr-1'}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {byLine.map(l => (
                  <tr key={l.line} className="border-b border-border-col/20 hover:bg-bg-muted/30">
                    <td className="py-0.5 pr-1 font-semibold text-text-primary">{l.line}</td>
                    <td className={`py-0.5 pr-1 text-right font-mono font-bold ${l.oee >= oeeGoal ? 'text-success' : l.oee >= oeeGoal * 0.9 ? 'text-warning' : 'text-danger'}`}>{formatPercent(l.oee)}</td>
                    <td className="py-0.5 pr-1 text-right font-mono text-text-secondary">{formatPercent(l.availability)}</td>
                    <td className="py-0.5 pr-1 text-right font-mono text-text-secondary">{formatNumber(l.totalIncidents)}</td>
                    <td className={`py-0.5 text-right font-mono font-semibold text-danger`}>{formatHours(l.totalDowntimeHours)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Failure Pareto — 1 col */}
        {pareto.length > 0 && (
          <div className="card p-2.5">
            <div className="flex items-center gap-1 mb-1.5">
              <TrendingDown className="w-3 h-3 text-danger flex-shrink-0" />
              <p className="text-[10.5px] font-bold text-text-primary">Top Failures</p>
            </div>
            <div className="space-y-1">
              {pareto.slice(0, 7).map((item, i) => (
                <div key={item.category} className="flex items-center gap-1.5">
                  <span className="text-[8px] font-bold text-text-muted w-3 text-right flex-shrink-0">{i + 1}</span>
                  <span className="text-[9px] text-text-primary w-20 truncate flex-shrink-0">{item.category}</span>
                  <div className="flex-1 bg-bg-muted rounded-full h-1">
                    <div className="bg-primary rounded-full h-1" style={{ width: `${Math.min(100, (item.hours / pareto[0].hours) * 100)}%` }} />
                  </div>
                  <span className="text-[9px] font-mono text-text-secondary w-9 text-right flex-shrink-0">{formatHours(item.hours)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Team Performance — 1 col */}
        {byTeam.length > 0 && (
          <div className="card p-2.5">
            <div className="flex items-center gap-1 mb-1.5">
              <Users className="w-3 h-3 text-primary flex-shrink-0" />
              <p className="text-[10.5px] font-bold text-text-primary">Team Performance</p>
            </div>
            <table className="w-full text-[9.5px]">
              <thead>
                <tr className="border-b border-border-col">
                  {['Team', 'Inc', 'MTTR', 'SLA'].map(h => (
                    <th key={h} className={`pb-1 font-semibold text-text-muted text-[8px] uppercase ${h === 'Team' ? 'text-left pr-1' : 'text-right pr-1'}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {byTeam.map(t => (
                  <tr key={t.team} className="border-b border-border-col/20 hover:bg-bg-muted/30">
                    <td className="py-0.5 pr-1 font-semibold text-text-primary truncate max-w-[70px]">{t.team}</td>
                    <td className="py-0.5 pr-1 text-right font-mono text-text-secondary">{formatNumber(t.totalIncidents)}</td>
                    <td className="py-0.5 pr-1 text-right font-mono text-text-secondary">{formatHours(t.avgResolutionTime)}</td>
                    <td className={`py-0.5 text-right font-mono font-bold ${t.slaCompliance >= 0.9 ? 'text-success' : t.slaCompliance >= 0.75 ? 'text-warning' : 'text-danger'}`}>{formatPercent(t.slaCompliance)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {/* Trends inline */}
            {Array.isArray(trends) && trends.length > 1 && (
              <div className="mt-2 pt-2 border-t border-border-col/30">
                <p className="text-[9px] font-semibold text-text-muted uppercase tracking-wide mb-1">OEE Trend</p>
                {(trends as Array<{ weekNumber: number; year: number; avgOEE: number; totalDowntimeHours: number; totalIncidents: number; avgMTTR: number }>).slice(-5).map(t => (
                  <div key={`${t.year}-${t.weekNumber}`} className="flex items-center justify-between py-0.5 border-b border-border-col/15">
                    <span className="text-[9px] text-text-muted">W{t.weekNumber}/{t.year}</span>
                    <span className={`text-[9px] font-mono font-bold ${t.avgOEE >= 0.82 ? 'text-success' : t.avgOEE >= 0.75 ? 'text-warning' : 'text-danger'}`}>{formatPercent(t.avgOEE)}</span>
                    <span className="text-[9px] font-mono text-text-muted">{formatHours(t.totalDowntimeHours)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Open Actions — 1 col */}
        <div className="card p-2.5">
          <div className="flex items-center gap-1 mb-1.5">
            <CheckCircle2 className="w-3 h-3 text-primary flex-shrink-0" />
            <p className="text-[10.5px] font-bold text-text-primary">Open Actions <span className="text-text-muted font-normal">({openActions.length})</span></p>
          </div>
          {openActions.length === 0 ? (
            <p className="text-[10px] text-text-muted py-2 text-center">No open action plans.</p>
          ) : (
            <div className="space-y-0.5">
              {openActions.slice(0, 7).map(a => (
                <div key={a.id} className="flex items-start gap-1.5 py-0.5 border-b border-border-col/20">
                  <span className={`text-[8px] px-1 py-px rounded font-bold flex-shrink-0 mt-px ${a.priority <= 2 ? 'bg-red-50 text-red-700' : a.priority === 3 ? 'bg-blue-50 text-blue-700' : 'bg-gray-100 text-gray-600'}`}>P{a.priority}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-[9.5px] text-text-primary line-clamp-1 leading-snug">{a.description}</p>
                    {a.dri && <p className="text-[8.5px] text-text-muted">{a.dri}{a.due_date ? ` · ${new Date(a.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : ''}</p>}
                  </div>
                </div>
              ))}
              {openActions.length > 7 && <p className="text-[9px] text-text-muted pt-0.5">+{openActions.length - 7} more in Action Plans tab</p>}
            </div>
          )}
        </div>
      </div>

      {/* ── Row 4: AI Insights — 3-col compact with scroll cap ── */}
      {availableInsights.length > 0 && (
        <div className="card p-2.5">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-4 h-4 bg-primary/10 rounded flex items-center justify-center flex-shrink-0">
              <Bot className="w-2.5 h-2.5 text-primary" />
            </div>
            <p className="text-[10.5px] font-bold text-text-primary">AI Analysis Findings</p>
            <span className="text-[9px] bg-primary/10 text-primary px-1.5 py-px rounded-full font-semibold">{availableInsights.length}/{REPORT_ANALYSIS_TYPES.length}</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
            {availableInsights.map(t => {
              const Icon = t.icon;
              const item = insightMap[t.value]!;
              return (
                <div key={t.value} className="border border-border-col rounded-lg overflow-hidden flex flex-col">
                  <div className={`flex items-center gap-1.5 px-2.5 py-1.5 ${t.bg} border-b border-border-col/40 flex-shrink-0`}>
                    <Icon className={`w-3 h-3 ${t.color} flex-shrink-0`} />
                    <span className={`text-[10px] font-semibold flex-1 ${t.color}`}>{t.label}</span>
                    <span className="text-[8.5px] text-text-muted">{new Date(item.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                  </div>
                  <div className="px-2.5 py-2 bg-bg-base overflow-y-auto" style={{ maxHeight: '260px' }}>
                    <AIInsightCard analysisType={t.value} response={item.response!} compact={true} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

    </div>
  );
}
