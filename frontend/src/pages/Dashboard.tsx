import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, LabelList,
  ResponsiveContainer, PieChart, Pie, Cell, ReferenceLine, Area, AreaChart, ComposedChart, Line,
} from 'recharts';
import {
  AlertTriangle, BarChart3, Clock, Zap, TrendingDown, RefreshCw, Bot,
  ChevronRight, AlertCircle, Activity, ShieldAlert, Info,
  Target, Wrench, Users, TrendingUp, Sparkles, ArrowUpRight, ArrowDownRight,
  CircleAlert, Flame, CheckCircle2, ChevronDown, ChevronUp, X, MapPin, LineChart,
  Upload, ArrowUp, ArrowDown, CheckSquare,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { api, streamAIAnalysis } from '@/lib/api-client';
import { AIInsightCard, AcceptedAction } from '@/components/shared/AIInsightCard';
import { KPICardSkeleton } from '@/components/shared/Skeleton';
import { FullAnalysis, TrendData, AIAnalysis, OEETransparency } from '@/types';
import { formatPercent, formatHours, formatNumber, getOEEColor, getCategoryColor, CHART_COLORS } from '@/lib/utils';
import { Button } from '@/components/ui/button';

const ANALYSIS_TYPES = [
  { value: 'weekly_summary',       label: 'Weekly Summary',       icon: Activity,    color: 'text-primary',    bg: 'bg-primary/10' },
  { value: 'root_cause',           label: 'Root Cause',           icon: AlertCircle, color: 'text-red-600',    bg: 'bg-red-50' },
  { value: 'action_plan',          label: 'Action Plan',          icon: Target,      color: 'text-blue-600',   bg: 'bg-blue-50' },
  { value: 'predictive_risk',      label: 'Predictive Risk',      icon: ShieldAlert, color: 'text-orange-600', bg: 'bg-orange-50' },
  { value: 'benchmark_gap',        label: 'Benchmark Gap',        icon: TrendingUp,  color: 'text-green-600',  bg: 'bg-green-50' },
  { value: 'maintenance_strategy', label: 'Maintenance Strategy', icon: Wrench,      color: 'text-purple-600', bg: 'bg-purple-50' },
  { value: 'team_performance',     label: 'Team Performance',     icon: Users,       color: 'text-indigo-600', bg: 'bg-indigo-50' },
] as const;

type AnalysisTypeValue = typeof ANALYSIS_TYPES[number]['value'];

function IBox({ icon, color, text }: { icon: React.ReactNode; color: string; text: string }) {
  return (
    <div className={`flex items-start gap-1.5 mt-1 px-2 py-1 rounded text-[10.5px] leading-relaxed ${color}`}>
      <span className="flex-shrink-0 mt-px">{icon}</span>
      <span>{text}</span>
    </div>
  );
}

function GaugeBar({ value, goal, color }: { value: number; goal: number; color: string }) {
  const pct = Math.min(100, Math.round(value * 100));
  const goalPct = Math.min(100, Math.round(goal * 100));
  return (
    <div className="relative h-1.5 w-full rounded-full bg-bg-muted overflow-visible">
      <div className={`h-1.5 rounded-full ${color}`} style={{ width: `${pct}%` }} />
      <div className="absolute top-1/2 -translate-y-1/2 w-px h-3.5 bg-text-secondary/60 rounded-full" style={{ left: `${goalPct}%` }} />
    </div>
  );
}

function CT({ active, payload, label, formatter }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-border-col rounded-md shadow-card-hover px-2.5 py-1.5 text-[11px]">
      <p className="font-semibold text-text-primary mb-0.5">{label}</p>
      {payload.map((p: any, i: number) => (
        <div key={i} className="flex items-center gap-1.5">
          <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: p.color }} />
          <span className="text-text-muted">{p.name}:</span>
          <span className="font-medium text-text-primary">{formatter ? formatter(p.value) : p.value}</span>
        </div>
      ))}
    </div>
  );
}

interface WeekOption { week_number: number; year: number; upload_id: number; original_filename: string; }

type DrillContent = { title: string; subtitle?: string; node: React.ReactNode };

function DrillDownModal({ content, onClose }: { content: DrillContent; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div
        className="relative bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[80vh] flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-border-col bg-bg-muted/30">
          <div>
            <p className="text-sm font-bold text-text-primary">{content.title}</p>
            {content.subtitle && <p className="text-[11px] text-text-muted">{content.subtitle}</p>}
          </div>
          <button onClick={onClose} className="p-1 rounded-md hover:bg-bg-muted text-text-muted hover:text-text-primary transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="overflow-y-auto flex-1 px-5 py-4">{content.node}</div>
      </div>
    </div>
  );
}

// ── Inline KPICard component ──────────────────────────────────────────────────
type KPIColor = 'blue' | 'green' | 'amber' | 'red' | 'purple' | 'cyan';

const KPI_COLOR_MAP: Record<KPIColor, { icon: string; fill: string; stroke: string; bar: string }> = {
  blue:   { icon: 'text-blue-500',   fill: 'rgba(59,130,246,0.12)',  stroke: '#3B82F6', bar: 'bg-blue-500'   },
  green:  { icon: 'text-green-500',  fill: 'rgba(34,197,94,0.12)',   stroke: '#22C55E', bar: 'bg-green-500'  },
  amber:  { icon: 'text-amber-500',  fill: 'rgba(245,158,11,0.12)',  stroke: '#F59E0B', bar: 'bg-amber-500'  },
  red:    { icon: 'text-red-500',    fill: 'rgba(239,68,68,0.12)',   stroke: '#EF4444', bar: 'bg-red-500'    },
  purple: { icon: 'text-purple-500', fill: 'rgba(139,92,246,0.12)',  stroke: '#8B5CF6', bar: 'bg-purple-500' },
  cyan:   { icon: 'text-cyan-500',   fill: 'rgba(6,182,212,0.12)',   stroke: '#06B6D4', bar: 'bg-cyan-500'   },
};

interface KPICardProps {
  label: string;
  value: string;
  subtitle?: string;
  goal?: number;
  actual?: number;
  delta?: number;
  deltaLabel?: string;
  icon: React.ElementType;
  color: KPIColor;
  trend?: number[];
  loading?: boolean;
  onClick?: () => void;
}

function KPICard({ label, value, subtitle, goal, actual, delta, deltaLabel, icon: Icon, color, trend, loading, onClick }: KPICardProps) {
  if (loading) return <KPICardSkeleton />;
  const c = KPI_COLOR_MAP[color];
  const gradId = `kpi-grad-${label.replace(/\s+/g, '')}`;
  const hasDelta = delta !== undefined && delta !== null;
  const deltaPositive = (delta ?? 0) >= 0;
  const sparkData = trend?.map((v, i) => ({ v, i })) ?? [];
  return (
    <div
      className="card px-3 py-2.5 cursor-pointer hover:shadow-card-hover transition-all group"
      onClick={onClick}
      title={onClick ? 'Click to drill down' : undefined}
    >
      <div className="flex items-center justify-between">
        <div className={`w-7 h-7 rounded-md bg-${color}-50 border border-${color}-100 flex items-center justify-center flex-shrink-0`}>
          <Icon className={`w-3.5 h-3.5 ${c.icon}`} />
        </div>
        {hasDelta && (
          <span className={`flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
            deltaPositive ? 'bg-success-light text-success-text' : 'bg-danger-light text-danger-text'
          }`}>
            {deltaPositive
              ? <ArrowUp className="w-2.5 h-2.5" />
              : <ArrowDown className="w-2.5 h-2.5" />}
            {deltaPositive ? '+' : ''}{(delta! * 100).toFixed(1)}pp
            {deltaLabel && <span className="ml-0.5 font-normal text-[9px]">{deltaLabel}</span>}
          </span>
        )}
      </div>

      <div className="mt-1.5">
        <p className="text-xl font-bold text-text-primary font-mono leading-tight">{value}</p>
        <p className="text-[10.5px] text-text-muted">{label}</p>
        {subtitle && <p className="text-[9.5px] text-text-secondary leading-tight mt-0.5 border-t border-border-col/40 pt-0.5">{subtitle}</p>}
      </div>

      {goal !== undefined && actual !== undefined && (
        <div className="mt-1.5 space-y-0.5">
          <div className="flex justify-between text-[9px] text-text-muted">
            <span>Goal: {(goal * 100).toFixed(0)}%</span>
            <span>{(actual * 100).toFixed(1)}%</span>
          </div>
          <div className="h-1 w-full bg-bg-muted rounded-full overflow-hidden">
            <div className={`h-1 rounded-full ${c.bar}`} style={{ width: `${Math.min(100, actual * 100)}%` }} />
          </div>
        </div>
      )}

      {sparkData.length > 0 && (
        <div className="mt-1 -mx-1">
          <ResponsiveContainer width="100%" height={28}>
            <AreaChart data={sparkData} margin={{ top: 2, bottom: 0, left: 0, right: 0 }}>
              <defs>
                <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={c.stroke} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={c.stroke} stopOpacity={0} />
                </linearGradient>
              </defs>
              <Area type="monotone" dataKey="v" stroke={c.stroke} strokeWidth={1.5} fill={`url(#${gradId})`} dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

// ── AIHorizontalStrip: full-width horizontal AI panel with tab bar + inline content ──
interface AIHorizontalStripProps {
  selectedWeek: string;
  storedCount: number;
  insightMap: Record<string, string>;
  aiLoading: boolean;
  aiDigest: string;
  onDismiss: () => void;
  onNavigate: (path: string) => void;
  overrideOEE?: string;
  onAcceptAction: (action: AcceptedAction) => void;
}

function AIHorizontalStrip({
  selectedWeek, storedCount, insightMap, aiLoading, aiDigest,
  onDismiss, onNavigate, overrideOEE, onAcceptAction,
}: AIHorizontalStripProps) {
  const [activeTab, setActiveTab] = React.useState<string>('weekly_summary');

  const activeResponse = insightMap[activeTab] ?? (activeTab === 'weekly_summary' ? aiDigest : '');

  return (
    <div className="relative rounded-xl overflow-hidden border border-primary/30 bg-gradient-to-r from-slate-700 via-slate-600 to-slate-700 shadow-card-lg">
      <div className="absolute inset-0 opacity-5" style={{ backgroundImage: 'radial-gradient(circle, #fff 1px, transparent 1px)', backgroundSize: '24px 24px' }} />
      <div className="relative">

        {/* ── Header + tab bar (single row) ── */}
        <div className="flex items-center gap-3 px-4 py-2.5 border-b border-white/10 overflow-x-auto scrollbar-none">
          {/* Brand */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <div className="w-7 h-7 rounded-lg bg-primary/20 border border-primary/30 flex items-center justify-center">
              <Sparkles className="w-3.5 h-3.5 text-blue-400" />
            </div>
            <div className="leading-tight">
              <p className="text-[11px] font-semibold text-white whitespace-nowrap">AI Intelligence Panel</p>
              <p className="text-[9px] text-slate-400 whitespace-nowrap">{storedCount} analysis type{storedCount !== 1 ? 's' : ''} · Week {selectedWeek}</p>
            </div>
          </div>

          {/* Divider */}
          <div className="w-px h-7 bg-white/15 flex-shrink-0" />

          {/* Tabs */}
          <div className="flex items-center gap-1 flex-1 min-w-0 overflow-x-auto scrollbar-none">
            {ANALYSIS_TYPES.map(t => {
              const Icon = t.icon;
              const hasData = !!insightMap[t.value] || (t.value === 'weekly_summary' && (aiLoading || !!aiDigest));
              const isActive = activeTab === t.value;
              return (
                <button
                  key={t.value}
                  onClick={() => setActiveTab(t.value)}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10.5px] font-medium transition-all whitespace-nowrap flex-shrink-0 ${
                    isActive
                      ? 'bg-white/15 text-white border border-white/20'
                      : hasData
                        ? 'text-slate-300 hover:bg-white/8 hover:text-white border border-transparent'
                        : 'text-slate-600 border border-transparent cursor-default'
                  }`}
                >
                  <Icon className={`w-3 h-3 flex-shrink-0 ${isActive ? t.color : hasData ? 'text-slate-400' : 'text-slate-600'}`} />
                  {t.label}
                  {hasData && <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${isActive ? 'bg-green-400' : 'bg-green-500/60'}`} />}
                </button>
              );
            })}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={() => onNavigate(`/ai-insights?type=${activeTab}`)}
              className="text-[10.5px] text-blue-400 hover:text-blue-300 transition-colors flex items-center gap-1 whitespace-nowrap"
            >
              Deep Dive <ArrowUpRight className="w-3 h-3" />
            </button>
            <button onClick={onDismiss} className="text-slate-500 hover:text-slate-300 transition-colors p-0.5">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* ── Content pane ── */}
        <div className="px-4 py-2.5">
          {/* Weekly summary tab: streaming digest */}
          {activeTab === 'weekly_summary' && (
            <>
              {aiLoading && (
                <div className="flex items-center gap-2">
                  <div className="flex gap-1">{[0,1,2].map(i => <div key={i} className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-bounce" style={{ animationDelay: `${i*0.15}s` }} />)}</div>
                  <span className="text-xs text-slate-400">Generating weekly digest…</span>
                </div>
              )}
              {!aiLoading && activeResponse && (
                <AIInsightCard analysisType="weekly_summary" response={activeResponse} dashboard overrideOEE={overrideOEE} />
              )}
              {!aiLoading && !activeResponse && (
                <p className="text-xs text-slate-500 italic py-1">Weekly Summary not yet generated. Run Execute Analysis to generate.</p>
              )}
            </>
          )}

          {/* All other tabs */}
          {activeTab !== 'weekly_summary' && (
            <>
              {activeResponse ? (
                <div>
                  <AIInsightCard analysisType={activeTab} response={activeResponse} compact dashboard onAcceptAction={onAcceptAction} />
                </div>
              ) : (
                <div className="flex items-center gap-2 py-1">
                  <span className="text-xs text-slate-500 italic">
                    {storedCount === 0
                      ? 'No insights generated yet — upload data and run Execute Analysis.'
                      : `${ANALYSIS_TYPES.find(t => t.value === activeTab)?.label ?? activeTab} not yet generated for this week.`}
                  </span>
                  {storedCount === 0 && (
                    <button
                      onClick={() => onNavigate('/upload')}
                      className="text-[10px] bg-white/10 hover:bg-white/20 text-white px-2 py-1 rounded border border-white/10 transition-colors flex-shrink-0"
                    >
                      Upload Data
                    </button>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── AIInsightSummaryLine: one-line actionable summary for each insight tile ──
function AIInsightSummaryLine({ analysisType, response }: { analysisType: string; response: string }) {
  const parsed = (() => {
    try {
      let t = response.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
      if (t.startsWith('"') && t.endsWith('"')) { try { t = JSON.parse(t) as string; } catch { /* */ } }
      const s = t.indexOf('{'), e = t.lastIndexOf('}');
      if (s === -1 || e === -1) return null;
      return JSON.parse(t.slice(s, e + 1)) as Record<string, unknown>;
    } catch { return null; }
  })();
  if (!parsed) return <p className="text-[9px] text-slate-400 italic leading-snug">Ready — click to view</p>;

  let line = '';
  if (analysisType === 'weekly_summary') {
    const concerns = Array.isArray(parsed.concerns) ? parsed.concerns as string[] : [];
    const highlights = Array.isArray(parsed.highlights) ? parsed.highlights as string[] : [];
    line = concerns[0] ?? highlights[0] ?? String(parsed.keyMetric ?? '');
  } else if (analysisType === 'root_cause') {
    const causes: Record<string,unknown>[] = Array.isArray(parsed.rootCauses) ? parsed.rootCauses as Record<string,unknown>[] :
      Array.isArray(parsed.topThreeRootCauses) ? parsed.topThreeRootCauses as Record<string,unknown>[] : [];
    const first = causes[0];
    line = first ? String(first.category ?? first.problemStatement ?? '') : String(parsed.problemStatement ?? '');
  } else if (analysisType === 'action_plan') {
    const actions = Array.isArray(parsed.actions) ? parsed.actions as Record<string,unknown>[] : [];
    line = actions[0] ? String(actions[0].problemStatement ?? actions[0].recommendedAction ?? '') : '';
  } else if (analysisType === 'predictive_risk') {
    const items = Array.isArray(parsed.highRiskItems) ? parsed.highRiskItems as Record<string,unknown>[] : [];
    line = items[0] ? `${String(items[0].equipment ?? '')} — ${String(items[0].riskLevel ?? '')}` : String(parsed.overallRiskAssessment ?? '');
  } else if (analysisType === 'benchmark_gap') {
    line = String(parsed.topPriorityGap ?? parsed.overallMaturityLevel ?? '');
  } else if (analysisType === 'maintenance_strategy') {
    const recs = Array.isArray(parsed.recommendations) ? parsed.recommendations as Record<string,unknown>[] : [];
    line = recs[0] ? `${String(recs[0].equipment ?? '')} → ${String(recs[0].recommendedStrategy ?? '')}` : String(parsed.overallStrategy ?? '');
  } else if (analysisType === 'team_performance') {
    const teams = Array.isArray(parsed.teamAnalysis) ? parsed.teamAnalysis as Record<string,unknown>[] : [];
    line = teams[0] ? String(teams[0].team ?? '') : String(parsed.crossTeamInsights ?? '');
  }
  return (
    <p className="text-[9px] text-slate-300 leading-snug line-clamp-2">
      {line || 'Ready — click to view'}
    </p>
  );
}

export function Dashboard() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [showAllEquip, setShowAllEquip] = useState(false);
  const [selectedWeek, setSelectedWeek] = useState<string>('');
  const [drill, setDrill] = useState<DrillContent | null>(null);
  const [showTransparency, setShowTransparency] = useState(false);
  const [expandedTransLine, setExpandedTransLine] = useState<string | null>(null);
  const [aiDigest, setAiDigest] = useState<string>('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiDismissed, setAiDismissed] = useState(false);
  const aiStopRef = useRef<(() => void) | null>(null);
  const aiPreloadFiredRef = useRef(false);

  const { data: availableWeeks } = useQuery<WeekOption[]>({
    queryKey: ['available-weeks'],
    queryFn: () => api.get('/analyze/weeks'),
    staleTime: 0,
  });

  // Auto-select latest week once the list loads (first entry is newest due to DESC order).
  // Also correct selectedWeek if it no longer exists in the fresh list (e.g. phantom week removed).
  useEffect(() => {
    if (!availableWeeks || availableWeeks.length === 0) return;
    
    const validWeeks = availableWeeks.map((w) => String(w.week_number));
    const newestWeek = String(Math.max(...availableWeeks.map(w => w.week_number)));
    console.log('Dashboard: Available weeks:', availableWeeks.map(w => w.week_number), 'Newest:', newestWeek, 'Current:', selectedWeek);
    
    // Only auto-select if no week is selected OR if current week no longer exists
    if (selectedWeek === '' || !validWeeks.includes(selectedWeek)) {
      setSelectedWeek(newestWeek);
    }
  }, [availableWeeks]);

  const weekParam = selectedWeek ? `?week=${selectedWeek}` : '';

  const { data, isLoading, error, refetch } = useQuery<FullAnalysis>({
    queryKey: ['analysis-summary', selectedWeek],
    queryFn: () => api.get(`/analyze/summary${weekParam}`),
    staleTime: 60000,
  });
  const { data: aiHistory } = useQuery<AIAnalysis[]>({
    queryKey: ['ai-history', 'v2'],
    queryFn: () => api.get(`/ai/history?t=${Date.now()}`),
    staleTime: 0,
    gcTime: 0,
  });
  const { data: trends } = useQuery<TrendData[]>({
    queryKey: ['trends'],
    queryFn: () => api.get('/analyze/trends'),
    staleTime: 60000,
  });
  const { data: transparency } = useQuery<OEETransparency>({
    queryKey: ['oee-transparency', selectedWeek],
    queryFn: () => api.get(`/analyze/oee-transparency${weekParam}`),
    staleTime: 60000,
    enabled: showTransparency,
  });

  const latestUploadId = useMemo(() => availableWeeks?.[0]?.upload_id, [availableWeeks]);

  useEffect(() => {
    if (data && !data.empty && !aiDigest && !aiLoading && !aiDismissed) {
      setAiLoading(true);
      let buffer = '';
      const stop = streamAIAnalysis(
        'weekly_summary',
        latestUploadId,
        undefined,
        (chunk) => { buffer += chunk; },
        () => { setAiDigest(buffer); setAiLoading(false); },
        (err) => { console.error('[AI digest]', err); setAiLoading(false); }
      );
      aiStopRef.current = stop;
    }
    return () => { aiStopRef.current?.(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.empty, data?.overall?.oee]);

  const insightMap = useMemo(() => {
    const map: Partial<Record<AnalysisTypeValue, string>> = {};
    if (!aiHistory) return map;
    for (const t of ANALYSIS_TYPES) {
      const found = aiHistory.find(h => h.analysis_type === t.value && h.response);
      if (found?.response) map[t.value] = found.response;
    }
    return map;
  }, [aiHistory]);

  // ── Auto-preload all 6 remaining insight types in the background ──
  useEffect(() => {
    if (!data || data.empty || aiPreloadFiredRef.current) return;
    // Wait until history has loaded so we can skip already-stored types
    if (!aiHistory) return;
    aiPreloadFiredRef.current = true;
    const bgTypes: AnalysisTypeValue[] = [
      'root_cause', 'action_plan', 'predictive_risk',
      'benchmark_gap', 'maintenance_strategy', 'team_performance',
    ];
    let delay = 1500;
    for (const type of bgTypes) {
      if (insightMap[type]) continue; // already have a stored result
      setTimeout(() => {
        streamAIAnalysis(
          type,
          latestUploadId,
          undefined,
          () => { /* discard streaming chunks — only care about completion */ },
          () => { queryClient.invalidateQueries({ queryKey: ['ai-history'] }); },
          (err) => { console.warn(`[AI preload ${type}]`, err); }
        );
      }, delay);
      delay += 3500;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.empty, data?.overall?.oee, !!aiHistory]);

  const a = useMemo(() => {
    if (!data) return null;
    const oee = data.overall?.oee || 0;
    const goal = data.settings?.oee_goal || 0.82;
    const cost = data.settings?.cost_per_hour_usd || 500;
    const lostRev = (data.summary?.totalDowntimeHours || 0) * cost;
    const worstLine = [...(data.byLine || [])].sort((x, y) => x.oee - y.oee)[0];
    const chronic = (data.byEquipment || []).filter(e => e.isChronicFailure);
    const top3 = (data.pareto?.byCategory || []).slice(0, 3);
    const shiftMap = (data.shiftAnalysis || []).reduce((acc: Record<string, number>, s) => {
      acc[s.shift] = (acc[s.shift] || 0) + s.count; return acc;
    }, {});
    const worstShift = Object.entries(shiftMap).sort((x, y) => y[1] - x[1])[0];
    return { oee, goal, gap: goal - oee, lostRev, worstLine, chronic, top3, shiftMap, worstShift, benchGap: 0.85 - oee };
  }, [data]);

  // ── Drill-down content builders ─────────────────────────────────────────────
  function thTd(label: string, right = false) {
    return <th className={`pb-1.5 text-[9px] font-semibold text-text-muted uppercase tracking-wide ${right ? 'text-right pr-2' : 'text-left pr-2'}`}>{label}</th>;
  }
  const tRow = 'border-b border-border-col/30 hover:bg-bg-muted/30 text-[11px]';
  const tD = 'py-1.5 pr-2';
  const tDr = 'py-1.5 pr-2 text-right font-mono';

  function drillOEE() {
    setDrill({
      title: 'Overall OEE — Line Breakdown',
      subtitle: `Facility average: ${formatPercent(data?.overall?.oee || 0)} · Goal: ${formatPercent(data?.settings?.oee_goal || 0.82)}`,
      node: (
        <table className="w-full text-[11px]">
          <thead><tr>{[['Line'], ['OEE','r'], ['Avail','r'], ['Perf','r'], ['Quality','r'], ['Downtime','r'], ['Incidents','r'], ['MTTR','r']].map(([h, r]) => <th key={h} className={`pb-1.5 text-[9px] font-semibold text-text-muted uppercase tracking-wide ${r ? 'text-right pr-2' : 'text-left pr-2'}`}>{h}</th>)}</tr></thead>
          <tbody>
            {[...(data?.byLine || [])].sort((a2, b2) => a2.oee - b2.oee).map((l, i) => {
              const ok = l.oee >= (data?.settings?.oee_goal || 0.82);
              return (
                <tr key={i} className={tRow}>
                  <td className={`${tD} font-semibold text-text-primary`}>{l.line}</td>
                  <td className={`${tDr} font-bold ${ok ? 'text-success' : 'text-danger'}`}>{formatPercent(l.oee)}</td>
                  <td className={`${tDr} ${l.availability >= 0.90 ? 'text-success' : 'text-danger'}`}>{formatPercent(l.availability)}</td>
                  <td className={`${tDr} ${l.performance >= 0.95 ? 'text-success' : 'text-warning'}`}>{formatPercent(l.performance)}</td>
                  <td className={`${tDr} ${l.quality >= 0.995 ? 'text-success' : 'text-warning'}`}>{formatPercent(l.quality)}</td>
                  <td className={`${tDr} text-danger font-semibold`}>{formatHours(l.totalDowntimeHours)}</td>
                  <td className={tDr}>{l.totalIncidents}</td>
                  <td className={tDr}>{formatHours(l.mttr)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ),
    });
  }

  function drillAvailability() {
    setDrill({
      title: 'Availability — Line Breakdown',
      subtitle: 'World-class benchmark: 90%',
      node: (
        <table className="w-full text-[11px]">
          <thead><tr>{[['Line'], ['Availability','r'], ['Downtime hrs','r'], ['Planned hrs','r'], ['Gap to 90%','r'], ['Incidents','r']].map(([h, r]) => <th key={h} className={`pb-1.5 text-[9px] font-semibold text-text-muted uppercase tracking-wide ${r ? 'text-right pr-2' : 'text-left pr-2'}`}>{h}</th>)}</tr></thead>
          <tbody>
            {[...(data?.byLine || [])].sort((a2, b2) => a2.availability - b2.availability).map((l, i) => {
              const gap = 0.90 - l.availability;
              return (
                <tr key={i} className={tRow}>
                  <td className={`${tD} font-semibold text-text-primary`}>{l.line}</td>
                  <td className={`${tDr} font-bold ${l.availability >= 0.90 ? 'text-success' : 'text-danger'}`}>{formatPercent(l.availability)}</td>
                  <td className={`${tDr} text-danger`}>{formatHours(l.totalDowntimeHours)}</td>
                  <td className={tDr}>{formatHours(l.plannedTime || 0)}</td>
                  <td className={`${tDr} ${gap > 0 ? 'text-danger font-semibold' : 'text-success'}`}>{gap > 0 ? `-${(gap * 100).toFixed(1)}pp` : '✓'}</td>
                  <td className={tDr}>{l.totalIncidents}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ),
    });
  }

  function drillDowntime() {
    setDrill({
      title: 'Total Downtime — Equipment Breakdown',
      subtitle: `${formatHours(data?.summary?.totalDowntimeHours || 0)} total · ${data?.summary?.totalIncidents || 0} incidents`,
      node: (
        <table className="w-full text-[11px]">
          <thead><tr>{[['Equipment'], ['Line'], ['Downtime','r'], ['Incidents','r'], ['MTTR','r'], ['Status']].map(([h, r]) => <th key={h} className={`pb-1.5 text-[9px] font-semibold text-text-muted uppercase tracking-wide ${r ? 'text-right pr-2' : 'text-left pr-2'}`}>{h}</th>)}</tr></thead>
          <tbody>
            {[...(data?.byEquipment || [])].sort((a2, b2) => b2.totalDowntimeHours - a2.totalDowntimeHours).map((e, i) => (
              <tr key={i} className={`${tRow} ${e.isChronicFailure ? 'bg-red-50/40' : ''}`}>
                <td className={`${tD} font-semibold text-text-primary`}>
                  <div className="flex items-center gap-1">{e.isChronicFailure && <Flame className="w-2.5 h-2.5 text-danger" />}{e.equipment}</div>
                </td>
                <td className={`${tD} text-text-secondary`}>{e.line}</td>
                <td className={`${tDr} text-danger font-semibold`}>{formatHours(e.totalDowntimeHours)}</td>
                <td className={tDr}>{e.totalIncidents}</td>
                <td className={`${tDr} ${e.avgMttr > 2 ? 'text-danger' : 'text-success'}`}>{formatHours(e.avgMttr)}</td>
                <td className={tD}><span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${e.isChronicFailure ? 'bg-red-100 text-danger' : e.healthScore >= 75 ? 'bg-green-50 text-success' : e.healthScore >= 50 ? 'bg-amber-50 text-warning' : 'bg-red-50 text-danger'}`}>{e.isChronicFailure ? 'Chronic' : e.healthScore >= 75 ? 'Good' : e.healthScore >= 50 ? 'Fair' : 'Poor'}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      ),
    });
  }

  function drillMTTR() {
    setDrill({
      title: 'Avg MTTR — Equipment Breakdown',
      subtitle: 'Benchmark: 2.0 hrs · sorted by worst MTTR first',
      node: (
        <table className="w-full text-[11px]">
          <thead><tr>{[['Equipment'], ['Line'], ['MTTR','r'], ['MTBF','r'], ['Incidents','r'], ['Downtime','r'], ['vs Bench','r']].map(([h, r]) => <th key={h} className={`pb-1.5 text-[9px] font-semibold text-text-muted uppercase tracking-wide ${r ? 'text-right pr-2' : 'text-left pr-2'}`}>{h}</th>)}</tr></thead>
          <tbody>
            {[...(data?.byEquipment || [])].sort((a2, b2) => b2.avgMttr - a2.avgMttr).map((e, i) => {
              const over = e.avgMttr - 2.0;
              return (
                <tr key={i} className={tRow}>
                  <td className={`${tD} font-semibold text-text-primary`}>{e.equipment}</td>
                  <td className={`${tD} text-text-secondary`}>{e.line}</td>
                  <td className={`${tDr} font-bold ${e.avgMttr > 2 ? 'text-danger' : 'text-success'}`}>{formatHours(e.avgMttr)}</td>
                  <td className={tDr}>{formatHours(e.avgMtbf)}</td>
                  <td className={tDr}>{e.totalIncidents}</td>
                  <td className={`${tDr} text-danger`}>{formatHours(e.totalDowntimeHours)}</td>
                  <td className={`${tDr} ${over > 0 ? 'text-danger font-semibold' : 'text-success'}`}>{over > 0 ? `+${formatHours(over)}` : '✓ OK'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ),
    });
  }

  function drillRepeat() {
    const repeatEquip = [...(data?.byEquipment || [])]
      .filter(e => e.totalIncidents > 1)
      .sort((a2, b2) => b2.totalIncidents - a2.totalIncidents);
    setDrill({
      title: 'Repeat & Chronic Failures — Equipment Detail',
      subtitle: `${data?.summary?.repeatFailureCount || 0} repeat failures · ${data?.summary?.cascadeCount || 0} cascades`,
      node: (
        <table className="w-full text-[11px]">
          <thead><tr>{[['Equipment'], ['Line'], ['Incidents','r'], ['Downtime','r'], ['MTTR','r'], ['MTBF','r'], ['Status']].map(([h, r]) => <th key={h} className={`pb-1.5 text-[9px] font-semibold text-text-muted uppercase tracking-wide ${r ? 'text-right pr-2' : 'text-left pr-2'}`}>{h}</th>)}</tr></thead>
          <tbody>
            {repeatEquip.map((e, i) => (
              <tr key={i} className={`${tRow} ${e.isChronicFailure ? 'bg-red-50/40' : ''}`}>
                <td className={`${tD} font-semibold text-text-primary`}>
                  <div className="flex items-center gap-1">{e.isChronicFailure && <Flame className="w-2.5 h-2.5 text-danger" />}{e.equipment}</div>
                </td>
                <td className={`${tD} text-text-secondary`}>{e.line}</td>
                <td className={`${tDr} font-bold text-danger`}>{e.totalIncidents}</td>
                <td className={`${tDr} text-danger`}>{formatHours(e.totalDowntimeHours)}</td>
                <td className={`${tDr} ${e.avgMttr > 2 ? 'text-danger' : 'text-success'}`}>{formatHours(e.avgMttr)}</td>
                <td className={tDr}>{formatHours(e.avgMtbf)}</td>
                <td className={tD}><span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${e.isChronicFailure ? 'bg-red-100 text-danger' : 'bg-amber-50 text-warning'}`}>{e.isChronicFailure ? 'Chronic' : 'Repeat'}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      ),
    });
  }

  function drillQuality() {
    setDrill({
      title: 'Quality Rate — Line Breakdown',
      subtitle: 'World-class benchmark: 99.5%',
      node: (
        <table className="w-full text-[11px]">
          <thead><tr>{[['Line'], ['Quality','r'], ['OEE','r'], ['Quality Incidents','r'], ['Total Incidents','r'], ['Gap to 99.5%','r']].map(([h, r]) => <th key={h} className={`pb-1.5 text-[9px] font-semibold text-text-muted uppercase tracking-wide ${r ? 'text-right pr-2' : 'text-left pr-2'}`}>{h}</th>)}</tr></thead>
          <tbody>
            {[...(data?.byLine || [])].sort((a2, b2) => a2.quality - b2.quality).map((l, i) => {
              const gap = 0.995 - l.quality;
              const qInc = Math.round(l.totalIncidents * (1 - l.quality));
              return (
                <tr key={i} className={tRow}>
                  <td className={`${tD} font-semibold text-text-primary`}>{l.line}</td>
                  <td className={`${tDr} font-bold ${l.quality >= 0.995 ? 'text-success' : 'text-danger'}`}>{formatPercent(l.quality)}</td>
                  <td className={tDr}>{formatPercent(l.oee)}</td>
                  <td className={`${tDr} ${qInc > 0 ? 'text-danger' : 'text-success'}`}>{qInc}</td>
                  <td className={tDr}>{l.totalIncidents}</td>
                  <td className={`${tDr} ${gap > 0 ? 'text-danger font-semibold' : 'text-success'}`}>{gap > 0 ? `-${(gap * 100).toFixed(2)}pp` : '✓'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ),
    });
  }

  function drillLine(lineName: string) {
    const lineData = (data?.byEquipment || []).filter(e => e.line === lineName);
    const lineMetrics = (data?.byLine || []).find(l => l.line === lineName);
    setDrill({
      title: `${lineName} — Equipment Breakdown`,
      subtitle: lineMetrics ? `OEE: ${formatPercent(lineMetrics.oee)} · Downtime: ${formatHours(lineMetrics.totalDowntimeHours)} · ${lineMetrics.totalIncidents} incidents` : undefined,
      node: (
        <table className="w-full text-[11px]">
          <thead><tr>{[['Equipment'], ['Incidents','r'], ['Downtime','r'], ['MTTR','r'], ['MTBF','r'], ['Health','r'], ['Status']].map(([h, r]) => <th key={h} className={`pb-1.5 text-[9px] font-semibold text-text-muted uppercase tracking-wide ${r ? 'text-right pr-2' : 'text-left pr-2'}`}>{h}</th>)}</tr></thead>
          <tbody>
            {lineData.length === 0
              ? <tr><td colSpan={7} className="py-4 text-center text-text-muted text-[11px]">No equipment data for this line</td></tr>
              : [...lineData].sort((a2, b2) => b2.totalDowntimeHours - a2.totalDowntimeHours).map((e, i) => (
                <tr key={i} className={`${tRow} ${e.isChronicFailure ? 'bg-red-50/40' : ''}`}>
                  <td className={`${tD} font-semibold text-text-primary`}>
                    <div className="flex items-center gap-1">{e.isChronicFailure && <Flame className="w-2.5 h-2.5 text-danger" />}{e.equipment}</div>
                  </td>
                  <td className={tDr}>{e.totalIncidents}</td>
                  <td className={`${tDr} text-danger font-semibold`}>{formatHours(e.totalDowntimeHours)}</td>
                  <td className={`${tDr} ${e.avgMttr > 2 ? 'text-danger' : 'text-success'}`}>{formatHours(e.avgMttr)}</td>
                  <td className={tDr}>{formatHours(e.avgMtbf)}</td>
                  <td className={`${tDr} font-bold ${e.healthScore >= 75 ? 'text-success' : e.healthScore >= 50 ? 'text-warning' : 'text-danger'}`}>{e.healthScore.toFixed(0)}</td>
                  <td className={tD}><span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${e.isChronicFailure ? 'bg-red-100 text-danger' : e.healthScore >= 75 ? 'bg-green-50 text-success' : e.healthScore >= 50 ? 'bg-amber-50 text-warning' : 'bg-red-50 text-danger'}`}>{e.isChronicFailure ? 'Chronic' : e.healthScore >= 75 ? 'Good' : e.healthScore >= 50 ? 'Fair' : 'Poor'}</span></td>
                </tr>
              ))
            }
          </tbody>
        </table>
      ),
    });
  }

  function drillCategory(category: string) {
    const catStations = (data?.pareto?.byStation || []).filter(s => s.topCategory === category);
    const catCauses = (data?.pareto?.byCause || []).filter(c => c.category === category);
    const catHours = catCauses.reduce((s, c) => s + c.hours, 0);
    const catCount = catCauses.reduce((s, c) => s + c.count, 0);
    setDrill({
      title: `Failure Category: ${category}`,
      subtitle: `${formatHours(catHours)} downtime · ${catCount} incidents`,
      node: (
        <div className="space-y-4">
          {/* Specific causes */}
          <div>
            <p className="text-[10.5px] font-bold text-text-primary mb-1.5">Root Causes</p>
            <table className="w-full text-[11px]">
              <thead><tr>{[['Cause'], ['Downtime','r'], ['Incidents','r'], ['Share','r']].map(([h, r]) => <th key={h} className={`pb-1.5 text-[9px] font-semibold text-text-muted uppercase tracking-wide ${r ? 'text-right pr-2' : 'text-left pr-2'}`}>{h}</th>)}</tr></thead>
              <tbody>
                {catCauses.slice(0, 10).map((c, i) => (
                  <tr key={i} className={tRow}>
                    <td className={`${tD} text-text-primary`}>{c.cause}</td>
                    <td className={`${tDr} text-danger font-semibold`}>{formatHours(c.hours)}</td>
                    <td className={tDr}>{c.count}</td>
                    <td className={`${tDr} text-text-muted`}>{catHours > 0 ? `${((c.hours / catHours) * 100).toFixed(0)}%` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* Stations with this category */}
          {catStations.length > 0 && (
            <div>
              <p className="text-[10.5px] font-bold text-text-primary mb-1.5">Stations Contributing to <span className="text-primary">{category}</span></p>
              <table className="w-full text-[11px]">
                <thead><tr>{[['Station'], ['Line'], ['Downtime','r'], ['Incidents','r']].map(([h, r]) => <th key={h} className={`pb-1.5 text-[9px] font-semibold text-text-muted uppercase tracking-wide ${r ? 'text-right pr-2' : 'text-left pr-2'}`}>{h}</th>)}</tr></thead>
                <tbody>
                  {catStations.slice(0, 10).map((s, i) => (
                    <tr key={i} className={tRow}>
                      <td className={`${tD} font-semibold text-text-primary`}>{s.station}</td>
                      <td className={`${tD} text-text-secondary`}>{s.line}</td>
                      <td className={`${tDr} text-danger font-semibold`}>{formatHours(s.hours)}</td>
                      <td className={tDr}>{s.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ),
    });
  }

  function drillStation() {
    const stations = (data?.pareto?.byStation || []);
    const totalHrs = stations.reduce((s, st) => s + st.hours, 0);
    setDrill({
      title: 'Station-Level Downtime',
      subtitle: `All stations ranked by downtime · ${formatHours(totalHrs)} total`,
      node: (
        <table className="w-full text-[11px]">
          <thead><tr>{[['Station'], ['Line'], ['Downtime','r'], ['Incidents','r'], ['Top Failure Category'], ['Share','r']].map(([h, r]) => <th key={h} className={`pb-1.5 text-[9px] font-semibold text-text-muted uppercase tracking-wide ${r ? 'text-right pr-2' : 'text-left pr-2'}`}>{h}</th>)}</tr></thead>
          <tbody>
            {stations.map((s, i) => (
              <tr key={i} className={tRow}>
                <td className={`${tD} font-semibold text-text-primary`}>{s.station}</td>
                <td className={`${tD} text-text-secondary`}>{s.line}</td>
                <td className={`${tDr} text-danger font-semibold`}>{formatHours(s.hours)}</td>
                <td className={tDr}>{s.count}</td>
                <td className={tD}><span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-primary/10 text-primary">{s.topCategory}</span></td>
                <td className={`${tDr} text-text-muted`}>{totalHrs > 0 ? `${((s.hours / totalHrs) * 100).toFixed(1)}%` : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ),
    });
  }

  function drillShift(shiftName: string) {
    const shiftData = (data?.shiftAnalysis || []).find(s => s.shift === shiftName);
    const lines = (data?.byLine || []);
    setDrill({
      title: `${shiftName} Shift — Detailed Breakdown`,
      subtitle: shiftData ? `${shiftData.count} incidents · ${formatHours(shiftData.totalHours)} total downtime` : undefined,
      node: (
        <div className="space-y-4">
          {shiftData && (
            <div className="grid grid-cols-3 gap-3 mb-2">
              {[
                { label: 'Incidents', value: String(shiftData.count) },
                { label: 'Avg Resolution', value: formatHours(shiftData.avgResolution) },
                { label: 'Share of Total', value: `${Math.round((shiftData.count / Math.max(1, (data?.summary?.totalIncidents || 1))) * 100)}%` },
              ].map(kpi => (
                <div key={kpi.label} className="bg-bg-muted/40 rounded-lg p-3 text-center">
                  <p className="text-[9px] font-semibold text-text-muted uppercase tracking-wider">{kpi.label}</p>
                  <p className="text-lg font-bold font-mono text-text-primary mt-0.5">{kpi.value}</p>
                </div>
              ))}
            </div>
          )}
          <table className="w-full text-[11px]">
            <thead><tr>{[['Line'], ['OEE','r'], ['Downtime','r'], ['Incidents','r'], ['MTTR','r']].map(([h, r]) => <th key={h} className={`pb-1.5 text-[9px] font-semibold text-text-muted uppercase tracking-wide ${r ? 'text-right pr-2' : 'text-left pr-2'}`}>{h}</th>)}</tr></thead>
            <tbody>
              {lines.sort((a2, b2) => b2.totalDowntimeHours - a2.totalDowntimeHours).map((l, i) => (
                <tr key={i} className={tRow}>
                  <td className={`${tD} font-semibold text-text-primary`}>{l.line}</td>
                  <td className={`${tDr} ${l.oee >= (data?.settings?.oee_goal || 0.82) ? 'text-success' : 'text-danger'}`}>{formatPercent(l.oee)}</td>
                  <td className={`${tDr} text-danger`}>{formatHours(l.totalDowntimeHours)}</td>
                  <td className={tDr}>{l.totalIncidents}</td>
                  <td className={tDr}>{formatHours(l.mttr)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ),
    });
  }

  if (error) return (
    <div className="flex flex-col items-center justify-center h-64 gap-3">
      <AlertTriangle className="w-8 h-8 text-warning" />
      <p className="text-sm text-text-secondary">Failed to load. Is the backend running?</p>
      <Button variant="outline" size="sm" onClick={() => refetch()}>Retry</Button>
    </div>
  );
  if (data?.empty) return (
    <div className="flex flex-col items-center justify-center h-64 gap-3">
      <BarChart3 className="w-10 h-10 text-text-muted" />
      <p className="font-medium text-text-primary">No Data Available</p>
      <p className="text-sm text-text-muted">Upload an Excel file to get started.</p>
      <Button size="sm" onClick={() => navigate('/upload')}>Go to Upload</Button>
    </div>
  );

  const oee = data?.overall?.oee || 0;
  const goal = data?.settings?.oee_goal || 0.82;
  const oeeOk = oee >= goal;
  const oeWarn = oee >= 0.75;
  const oeColor = oeeOk ? 'text-success' : oeWarn ? 'text-warning' : 'text-danger';
  const oeBg = oeeOk ? 'bg-success' : oeWarn ? 'bg-warning' : 'bg-danger';
  const mttrBench = 2.0;
  const mttr = data?.overall?.mttr || 0;
  const shiftPie = Object.entries(a?.shiftMap || {}).map(([name, value]) => ({ name, value }));
  const storedCount = Object.keys(insightMap).length;
  const sortedEquip = [...(data?.byEquipment || [])].sort((a, b) => b.totalDowntimeHours - a.totalDowntimeHours);
  const equipRows = showAllEquip ? sortedEquip : sortedEquip.slice(0, 6);

  const oeeSparkline = trends?.map(t => t.avgOEE) ?? [];
  const availSparkline = trends?.map(t => t.availability) ?? [];
  const perfSparkline = trends?.map(t => t.performance) ?? [];
  const qualSparkline = trends?.map(t => t.quality) ?? [];

  return (
    <div className="space-y-3">

      {/* ── SECTION 1: Page header bar ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">Production Intelligence</h1>
          <p className="page-subtitle" title={availableWeeks?.find(w => String(w.week_number) === selectedWeek)?.original_filename}>
            Week {selectedWeek} · {availableWeeks?.length ?? 0} weeks of data loaded{availableWeeks?.find(w => String(w.week_number) === selectedWeek)?.original_filename ? ` · ${availableWeeks.find(w => String(w.week_number) === selectedWeek)!.original_filename}` : ''}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {availableWeeks && availableWeeks.length > 0 && (
            <div className="flex items-center gap-1.5">
              <label className="text-xs text-text-muted font-medium">Week:</label>
              <select
                value={selectedWeek}
                onChange={(e) => setSelectedWeek(e.target.value)}
                title={availableWeeks.find(w => String(w.week_number) === selectedWeek)?.original_filename ?? ''}
                className="text-xs font-medium border border-border-col rounded-lg px-2.5 py-1.5 bg-white text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/30 cursor-pointer shadow-card"
              >
                {availableWeeks.map((w) => (
                  <option key={`${w.year}-${w.week_number}`} value={String(w.week_number)} title={w.original_filename}>
                    Week {w.week_number} · {w.year}
                  </option>
                ))}
              </select>
            </div>
          )}
          <button
            onClick={() => queryClient.invalidateQueries()}
            className="p-2 rounded-lg border border-border-col bg-bg-surface text-text-muted hover:text-text-primary hover:bg-bg-muted transition-colors shadow-card"
            title="Refresh data"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          <button
            onClick={() => navigate('/upload')}
            className="flex items-center gap-2 px-3 py-2 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary-700 transition-colors shadow-sm"
          >
            <Upload className="w-4 h-4" />
            Upload Data
          </button>
        </div>
      </div>

      {/* ── SECTION 2: Line Status Ribbon ── */}
      {(data?.byLine?.length ?? 0) > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {[...data!.byLine]
            .sort((a2, b2) => {
              const numA = parseInt(a2.line.replace(/\D/g, ''), 10);
              const numB = parseInt(b2.line.replace(/\D/g, ''), 10);
              if (!isNaN(numA) && !isNaN(numB) && numA !== numB) return numA - numB;
              return a2.line.localeCompare(b2.line, undefined, { numeric: true, sensitivity: 'base' });
            })
            .map(line => {
            const hasLineFile = line.oeeSource === 'line_file';
            const lineOee = line.oee * 100;
            const status = lineOee >= 82 ? 'good' : lineOee >= 65 ? 'warn' : 'crit';
            const sc = hasLineFile ? {
              good: { bar: 'bg-success', text: 'text-success-text', dot: 'bg-success' },
              warn: { bar: 'bg-warning', text: 'text-warning-text', dot: 'bg-warning' },
              crit: { bar: 'bg-danger',  text: 'text-danger-text',  dot: 'bg-danger'  },
            }[status] : { bar: 'bg-slate-300', text: 'text-text-muted', dot: 'bg-slate-300' };
            return (
              <div
                key={line.line}
                onClick={() => navigate(`/oee-explorer?line=${encodeURIComponent(line.line)}`)}
                className={`flex-shrink-0 cursor-pointer rounded-xl border transition-all px-2.5 py-2 min-w-[130px] ${
                  hasLineFile
                    ? 'border-border-col bg-bg-surface hover:shadow-card-md'
                    : 'border-border-col/50 bg-bg-muted/40 opacity-60'
                }`}
              >
                <div className="flex items-center gap-1.5 mb-1">
                  <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${sc.dot}`} />
                  <span className={`text-[11px] font-semibold truncate ${hasLineFile ? 'text-text-primary' : 'text-text-muted'}`}>{line.line}</span>
                  {!hasLineFile && (
                    <span className="ml-auto text-[9px] text-text-muted font-normal italic leading-none">no file</span>
                  )}
                </div>
                <div className={`text-xl font-bold leading-tight ${sc.text}`}>{lineOee.toFixed(1)}%</div>
                <div className="text-[9.5px] text-text-muted mb-1">OEE</div>
                <div className="h-1 w-full bg-bg-muted rounded-full overflow-hidden">
                  <div className={`h-full rounded-full ${sc.bar}`} style={{ width: `${Math.min(100, lineOee)}%` }} />
                </div>
                <div className="flex justify-between mt-1 text-[9.5px] text-text-muted">
                  <span>A: {formatPercent(line.availability)}</span>
                  <span>P: {formatPercent(line.performance ?? 0)}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── SECTION 3: AI Intelligence Horizontal Strip ── */}
      {!aiDismissed && (
        <AIHorizontalStrip
          selectedWeek={selectedWeek}
          storedCount={storedCount}
          insightMap={insightMap}
          aiLoading={aiLoading}
          aiDigest={aiDigest}
          onDismiss={() => { aiStopRef.current?.(); setAiDismissed(true); }}
          onNavigate={navigate}
          overrideOEE={data?.overall?.oee != null ? `${(data.overall.oee * 100).toFixed(1)}%` : undefined}
          onAcceptAction={(action) => {
            api.post('/actions', action)
              .then(() => queryClient.invalidateQueries({ queryKey: ['action-plans'] }))
              .catch((err) => console.warn('[Accept action]', err));
          }}
        />
      )}

      {/* ── SECTION 4: KPI Cards (6-col) ── */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-2.5">
        <KPICard
          label="Overall OEE"
          icon={Zap}
          color="blue"
          value={isLoading ? '—' : formatPercent(oee)}
          subtitle={!isLoading && a ? (
            oeeOk
              ? `On target · worst: ${a.worstLine?.line ?? '—'}`
              : `${(a.gap * 100).toFixed(1)}pp below goal · focus ${a.worstLine?.line ?? '—'}`
          ) : undefined}
          goal={goal}
          actual={oee}
          delta={trends && trends.length >= 2 ? trends[trends.length-1].avgOEE - trends[trends.length-2].avgOEE : undefined}
          deltaLabel={trends && trends.length >= 2 ? `vs W${trends[trends.length-2].weekNumber}` : undefined}
          trend={oeeSparkline}
          loading={isLoading}
          onClick={drillOEE}
        />
        <KPICard
          label="Availability"
          icon={Activity}
          color="green"
          value={isLoading ? '—' : formatPercent(data?.overall?.availability || 0)}
          subtitle={!isLoading && data ? (
            (data.overall?.availability || 0) >= 0.90
              ? 'Above 90% world-class target'
              : `${((0.90 - (data.overall?.availability || 0)) * 100).toFixed(1)}pp below 90% benchmark`
          ) : undefined}
          goal={0.90}
          actual={data?.overall?.availability || 0}
          delta={trends && trends.length >= 2 ? trends[trends.length-1].availability - trends[trends.length-2].availability : undefined}
          trend={availSparkline}
          loading={isLoading}
          onClick={drillAvailability}
        />
        <KPICard
          label="Performance"
          icon={TrendingUp}
          color="amber"
          value={isLoading ? '—' : formatPercent(data?.overall?.performance || 0)}
          subtitle={!isLoading && data ? (
            (data.overall?.performance || 0) >= 0.95
              ? 'Meets 95% performance target'
              : `${((0.95 - (data.overall?.performance || 0)) * 100).toFixed(1)}pp gap — review cycle times`
          ) : undefined}
          goal={0.95}
          actual={data?.overall?.performance || 0}
          delta={trends && trends.length >= 2 ? trends[trends.length-1].performance - trends[trends.length-2].performance : undefined}
          trend={perfSparkline}
          loading={isLoading}
        />
        <KPICard
          label="Quality Rate"
          icon={CheckCircle2}
          color="purple"
          value={isLoading ? '—' : formatPercent(data?.overall?.quality || 0)}
          subtitle={!isLoading && data ? (
            (data.overall?.quality || 0) >= 0.995
              ? 'Meets 99.5% quality target'
              : `${((0.995 - (data.overall?.quality || 0)) * 100).toFixed(2)}pp gap — check repeat failures`
          ) : undefined}
          goal={0.995}
          actual={data?.overall?.quality || 0}
          delta={trends && trends.length >= 2 ? trends[trends.length-1].quality - trends[trends.length-2].quality : undefined}
          trend={qualSparkline}
          loading={isLoading}
          onClick={drillQuality}
        />
        <KPICard
          label="Avg MTTR"
          icon={RefreshCw}
          color={mttr <= mttrBench ? 'green' : 'red'}
          value={isLoading ? '—' : formatHours(mttr)}
          subtitle={!isLoading ? (
            mttr <= mttrBench
              ? `Under ${mttrBench}h benchmark`
              : `${formatHours(mttr - mttrBench)} over benchmark — escalate chronic`
          ) : undefined}
          loading={isLoading}
          onClick={drillMTTR}
        />
        <KPICard
          label="Repeat Failures"
          icon={AlertTriangle}
          color="red"
          value={isLoading ? '—' : String(data?.summary?.repeatFailureCount ?? 0)}
          subtitle={!isLoading && data ? (
            (data.summary?.repeatFailureCount ?? 0) === 0
              ? 'No repeat failures this week'
              : `${data.summary?.cascadeCount ?? 0} cascade events · root-cause needed`
          ) : undefined}
          loading={isLoading}
          onClick={drillRepeat}
        />
      </div>

      {/* ── SECTION 5: charts — Row 1: OEE by Line | Pareto | Shift ── */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-3">

        {/* OEE by Line — 2 cols */}
        <div className="card p-3 lg:col-span-2">
          {(() => {
            const lineFileLines = (data?.byLine || []).filter(l => l.oeeSource === 'line_file');
            return (
              <div className="flex items-center justify-between mb-1">
                <p className="text-[11px] font-bold text-text-primary">OEE by Line <span className="text-[9px] text-text-muted font-normal ml-1">(click bar to drill)</span></p>
                <div className="flex items-center gap-1.5">
                  {lineFileLines.length > 0 && (
                    <span className="text-[8.5px] font-semibold px-1.5 py-0.5 rounded bg-primary/10 text-primary border border-primary/20 flex items-center gap-0.5">
                      <LineChart className="w-2.5 h-2.5" /> {lineFileLines.length} line file{lineFileLines.length > 1 ? 's' : ''}
                    </span>
                  )}
                  {a?.worstLine && <span className="text-[10px] bg-red-50 text-danger border border-red-100 px-1.5 py-0.5 rounded font-medium">↓ {a.worstLine.line}</span>}
                </div>
              </div>
            );
          })()}
          {isLoading ? <div className="skeleton h-28 w-full" /> : (
            <>
              <ResponsiveContainer width="100%" height={130}>
                <BarChart
                  data={data?.byLine || []}
                  barSize={12}
                  margin={{ top: 4, right: 4, left: -18, bottom: 0 }}
                  onClick={(d) => { if (d?.activePayload?.[0]?.payload?.line) drillLine(d.activePayload[0].payload.line); }}
                  style={{ cursor: 'pointer' }}
                >
                  <CartesianGrid strokeDasharray="2 2" stroke="#E2E6EE" vertical={false} />
                  <XAxis dataKey="line" tick={{ fontSize: 9, fill: '#4B5675' }} axisLine={false} tickLine={false} />
                  <YAxis tickFormatter={v => `${(v*100).toFixed(0)}%`} domain={[0,1]} tick={{ fontSize: 9, fill: '#8C95A8' }} axisLine={false} tickLine={false} />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const d = payload[0].payload;
                      return (
                        <div className="bg-white border border-border-col rounded-lg shadow-lg p-2 text-[10.5px]">
                          <div className="flex items-center gap-1.5 mb-0.5">
                            <p className="font-bold text-text-primary">{d.line}</p>
                            {d.oeeSource === 'line_file' && (
                              <span className="text-[8px] font-semibold px-1 py-0.5 rounded bg-primary/10 text-primary">📊 Line File</span>
                            )}
                          </div>
                          <p className="text-danger font-semibold">OEE: {formatPercent(d.oee)}</p>
                          <p className="text-text-secondary">Avail: {formatPercent(d.availability)}</p>
                          <p className="text-text-secondary">Perf: {formatPercent(d.performance)}</p>
                          <p className="text-text-secondary">Quality: {formatPercent(d.quality)}</p>
                        </div>
                      );
                    }}
                  />
                  <ReferenceLine y={goal} stroke="#2563EB" strokeDasharray="3 3" strokeWidth={1} />
                  <Bar dataKey="oee" name="OEE" radius={[2,2,0,0]}>
                    {(data?.byLine || []).map((e, i) => (
                      <Cell key={i} fill={getOEEColor(e.oee)} opacity={e.oeeSource === 'line_file' ? 1 : 0.75} />
                    ))}
                  </Bar>
                  <Bar dataKey="availability" name="Avail" fill="#93C5FD" radius={[2,2,0,0]} opacity={0.55} />
                </BarChart>
              </ResponsiveContainer>
              {a?.worstLine && <IBox icon={<AlertCircle className="w-3 h-3 text-danger" />} color="bg-red-50 text-red-700" text={`${a.worstLine.line}: ${formatPercent(a.worstLine.oee)} OEE — ${formatHours(a.worstLine.totalDowntimeHours)} downtime. Prioritize here.`} />}
            </>
          )}
        </div>

        {/* Failure Pareto — 1 col */}
        <div className="card p-3">
          <div className="flex items-center justify-between mb-1">
            <p className="text-[11px] font-bold text-text-primary">Failure Pareto <span className="text-text-muted font-normal">(80/20)</span></p>
            {(data?.pareto?.byStation?.length ?? 0) > 0 && (
              <button onClick={drillStation} className="text-[9px] font-semibold text-primary border border-primary/20 hover:bg-primary/5 px-1.5 py-0.5 rounded flex items-center gap-0.5">
                <MapPin className="w-2.5 h-2.5" /> Stations
              </button>
            )}
          </div>
          {isLoading ? <div className="skeleton h-28 w-full" /> : (
            <>
              <ResponsiveContainer width="100%" height={130}>
                <ComposedChart
                  data={data?.pareto?.byCategory?.slice(0,7) || []}
                  margin={{ top: 4, right: 16, left: -20, bottom: 0 }}
                  onClick={(d) => { if (d?.activePayload?.[0]?.payload?.category) drillCategory(d.activePayload[0].payload.category); }}
                  style={{ cursor: 'pointer' }}
                >
                  <CartesianGrid strokeDasharray="2 2" stroke="#E2E6EE" vertical={false} />
                  <XAxis dataKey="category" tick={{ fontSize: 7, fill: '#4B5675' }} axisLine={false} tickLine={false} />
                  <YAxis yAxisId="l" tick={{ fontSize: 8, fill: '#8C95A8' }} axisLine={false} tickLine={false} />
                  <YAxis yAxisId="r" orientation="right" tickFormatter={v=>`${v}%`} domain={[0,100]} tick={{ fontSize: 8, fill: '#8C95A8' }} axisLine={false} tickLine={false} />
                  <Tooltip content={<CT />} />
                  <Bar yAxisId="l" dataKey="hours" name="Hours" radius={[2,2,0,0]}>
                    {(data?.pareto?.byCategory?.slice(0,7)||[]).map((e,i)=><Cell key={i} fill={getCategoryColor(e.category)} />)}
                  </Bar>
                  <Line yAxisId="r" type="monotone" dataKey="cumulative" stroke="#DC2626" strokeWidth={1.5} dot={{ r:2, fill:'#DC2626' }} name="Cum%" />
                  <ReferenceLine yAxisId="r" y={80} stroke="#DC2626" strokeDasharray="3 3" strokeWidth={1} />
                </ComposedChart>
              </ResponsiveContainer>
              {(a?.top3?.length ?? 0) > 0 && <IBox icon={<Flame className="w-3 h-3 text-orange-500" />} color="bg-orange-50 text-orange-800" text={`${a!.top3.map((p: {category:string;hours:number})=>p.category).join(', ')} = ${formatHours(a!.top3.reduce((s: number,p: {category:string;hours:number})=>s+p.hours,0))} downtime.`} />}
            </>
          )}
        </div>

        {/* Shift Pie — 1 col */}
        <div className="card p-3">
          <p className="section-title mb-2">Incidents by Shift</p>
          {isLoading ? <div className="skeleton h-28 w-full" /> : (
            <>
              <div className="flex items-center gap-2">
                <ResponsiveContainer width={90} height={90}>
                  <PieChart>
                    <Pie
                      data={shiftPie}
                      dataKey="value"
                      cx="50%" cy="50%"
                      innerRadius={26} outerRadius={43}
                      paddingAngle={2}
                      onClick={(d) => { if (d?.name) drillShift(d.name); }}
                      style={{ cursor: 'pointer' }}
                    >
                      {shiftPie.map((_,i) => <Cell key={i} fill={CHART_COLORS[i%CHART_COLORS.length]} />)}
                    </Pie>
                    <Tooltip content={<CT />} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex-1 space-y-1">
                  {shiftPie.map((s, i) => {
                    const tot = shiftPie.reduce((x,y)=>x+y.value,0);
                    const pct = tot > 0 ? Math.round((s.value/tot)*100) : 0;
                    return (
                      <div key={s.name}
                        className="flex items-center justify-between cursor-pointer hover:bg-bg-muted/50 rounded px-1 py-0.5 transition-colors"
                        onClick={() => drillShift(s.name)}
                        title={`Drill into ${s.name} shift`}
                      >
                        <div className="flex items-center gap-1">
                          <div className="w-1.5 h-1.5 rounded-full" style={{ background: CHART_COLORS[i%CHART_COLORS.length] }} />
                          <span className="text-[10px] font-medium text-text-primary">{s.name}</span>
                        </div>
                        <span className="text-[10px] font-bold text-text-primary">{pct}%<span className="text-text-muted font-normal ml-0.5">({s.value})</span></span>
                      </div>
                    );
                  })}
                </div>
              </div>
              {a?.worstShift && <IBox icon={<Info className="w-3 h-3 text-blue-500" />} color="bg-blue-50 text-blue-800" text={`${a.worstShift[0]} shift: highest load (${a.worstShift[1]}). Review handover & PM.`} />}
            </>
          )}
        </div>

      </div>

      {/* ── SECTION 5b: charts — Row 2: OEE Trend | Station Pareto | Anomalies ── */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-3">

        {/* OEE Trend — 2 cols */}
        <div className="card p-3 lg:col-span-2">
          <div className="flex items-center justify-between mb-1">
            <p className="text-[11px] font-bold text-text-primary">OEE Trend</p>
            {(trends ?? []).some(t => (t.lineFileCount ?? 0) > 0) && (
              <span className="text-[8.5px] font-semibold px-1.5 py-0.5 rounded bg-primary/10 text-primary border border-primary/20 flex items-center gap-0.5">
                <LineChart className="w-2.5 h-2.5" /> Line-file data used
              </span>
            )}
          </div>
          {!trends || trends.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-28 text-text-muted gap-1">
              <BarChart3 className="w-6 h-6" /><p className="text-[11px]">Upload multiple weeks</p>
            </div>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={130}>
                <AreaChart data={trends} margin={{ top: 4, right: 4, left: -18, bottom: 0 }}>
                  <defs>
                    <linearGradient id="og" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#2563EB" stopOpacity={0.12} />
                      <stop offset="95%" stopColor="#2563EB" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="2 2" stroke="#E2E6EE" vertical={false} />
                  <XAxis dataKey="weekNumber" tickFormatter={v=>`W${v}`} tick={{ fontSize: 9, fill: '#4B5675' }} axisLine={false} tickLine={false} />
                  <YAxis tickFormatter={v=>`${(v*100).toFixed(0)}%`} domain={[0, 1]} tick={{ fontSize: 9, fill: '#8C95A8' }} axisLine={false} tickLine={false} />
                  <Tooltip
                    content={({ active, payload, label }) => {
                      if (!active || !payload?.length) return null;
                      const d = payload[0]?.payload;
                      return (
                        <div className="bg-white border border-border-col rounded-lg shadow-lg p-2 text-[10.5px] min-w-[130px]">
                          <p className="font-bold text-text-primary mb-1">Week {label}{d?.lineFileCount > 0 ? <span className="ml-1 text-[8px] text-primary">({d.lineFileCount} line file{d.lineFileCount>1?'s':''})</span> : null}</p>
                          <p className="text-primary font-semibold">OEE: {formatPercent(d?.avgOEE)}</p>
                          <p className="text-text-secondary">Avail: {formatPercent(d?.availability)}</p>
                          <p className="text-text-secondary">Perf: {formatPercent(d?.performance)}</p>
                          <p className="text-text-secondary">Quality: {formatPercent(d?.quality)}</p>
                        </div>
                      );
                    }}
                  />
                  <ReferenceLine y={goal} stroke="#2563EB" strokeDasharray="3 3" strokeWidth={1} />
                  <Area type="monotone" dataKey="avgOEE" stroke="#2563EB" strokeWidth={2} fill="url(#og)" dot={{ r:2, fill:'#2563EB', strokeWidth:1.5, stroke:'#fff' }} name="OEE" />
                  <Line type="monotone" dataKey="availability" stroke="#16A34A" strokeWidth={1.5} dot={false} strokeDasharray="4 2" name="Availability" />
                  <Line type="monotone" dataKey="performance" stroke="#F59E0B" strokeWidth={1.5} dot={false} strokeDasharray="4 2" name="Performance" />
                  <Line type="monotone" dataKey="quality" stroke="#8B5CF6" strokeWidth={1.5} dot={false} strokeDasharray="4 2" name="Quality" />
                </AreaChart>
              </ResponsiveContainer>
              <div className="flex items-center gap-3 justify-center mt-0.5">
                {[['#2563EB','OEE'],['#16A34A','Avail'],['#F59E0B','Perf'],['#8B5CF6','Quality']].map(([c,n])=>(
                  <span key={n} className="flex items-center gap-0.5 text-[8.5px] text-text-muted">
                    <span className="w-4 h-0.5 rounded inline-block" style={{background:c}} />{n}
                  </span>
                ))}
              </div>
              {trends.length >= 2 && (() => {
                const last = trends[trends.length-1], prev = trends[trends.length-2];
                const delta = last.avgOEE - prev.avgOEE, up = delta > 0;
                return <IBox icon={up ? <TrendingUp className="w-3 h-3 text-success" /> : <TrendingDown className="w-3 h-3 text-danger" />} color={up ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'} text={`${up?'↑':'↓'}${(Math.abs(delta)*100).toFixed(1)}pp WoW (${formatPercent(prev.avgOEE)}→${formatPercent(last.avgOEE)})`} />;
              })()}
            </>
          )}
        </div>

        {/* Station Downtime Pareto — 1 col (conditional) */}
        {(data?.pareto?.byStation?.length ?? 0) > 0 ? (() => {
          const totalHrs = (data!.pareto.byStation).reduce((s, st) => s + st.hours, 0);
          const stationData = data!.pareto.byStation.slice(0, 10).map(st => ({
            ...st,
            pct: totalHrs > 0 ? parseFloat(((st.hours / totalHrs) * 100).toFixed(1)) : 0,
          }));
          return (
            <div className="card p-3">
              <div className="flex items-center justify-between mb-1">
                <p className="text-[11px] font-bold text-text-primary">Station Pareto <span className="text-text-muted font-normal ml-1">— downtime share</span></p>
                <button onClick={drillStation} className="text-[9px] font-semibold text-primary border border-primary/20 hover:bg-primary/5 px-1.5 py-0.5 rounded flex items-center gap-0.5">
                  <MapPin className="w-2.5 h-2.5" /> Full table
                </button>
              </div>
              {isLoading ? <div className="skeleton h-28 w-full" /> : (
                <ResponsiveContainer width="100%" height={130}>
                  <BarChart
                    data={stationData}
                    barSize={16}
                    margin={{ top: 14, right: 6, left: -12, bottom: 36 }}
                    onClick={(d) => { if (d?.activePayload?.[0]?.payload?.line) drillLine(d.activePayload[0].payload.line); }}
                    style={{ cursor: 'pointer' }}
                  >
                    <CartesianGrid strokeDasharray="2 2" stroke="#E2E6EE" vertical={false} />
                    <XAxis
                      dataKey="station"
                      tick={{ fontSize: 7, fill: '#4B5675' }}
                      axisLine={false}
                      tickLine={false}
                      interval={0}
                      angle={-35}
                      textAnchor="end"
                      height={44}
                    />
                    <YAxis tickFormatter={v => `${v}%`} tick={{ fontSize: 8, fill: '#8C95A8' }} axisLine={false} tickLine={false} domain={[0, 'auto']} />
                    <Tooltip
                      content={({ active, payload }) => {
                        if (!active || !payload?.length) return null;
                        const d = payload[0].payload;
                        return (
                          <div className="bg-white border border-border-col rounded-lg shadow-lg p-2 text-[10.5px]">
                            <p className="font-bold text-text-primary mb-0.5">{d.station}</p>
                            <p className="text-text-secondary">{d.line}</p>
                            <p className="text-danger font-semibold mt-1">{formatHours(d.hours)} downtime</p>
                            <p className="text-text-muted">{d.count} incidents · {d.pct}% share</p>
                            <p className="text-[9px] text-primary mt-0.5">Top: {d.topCategory}</p>
                          </div>
                        );
                      }}
                    />
                    <Bar dataKey="pct" name="Downtime %" radius={[3,3,0,0]}>
                      {stationData.map((_, i) => (
                        <Cell key={i} fill={i === 0 ? '#1D4ED8' : i < 3 ? '#2563EB' : i < 6 ? '#3B82F6' : '#93C5FD'} />
                      ))}
                      <LabelList dataKey="pct" position="top" formatter={(v: number) => `${v}%`} style={{ fontSize: 7, fill: '#374151', fontWeight: 600 }} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          );
        })() : <div className="lg:col-span-1" />}

        {/* Anomaly Alerts — 1 col */}
        <div className="card p-3">
          <div className="flex items-center gap-1.5 mb-2">
            <p className="section-title">Anomaly Alerts</p>
            {data?.anomalies && data.anomalies.length > 0 && <span className="text-[10px] bg-amber-50 text-warning border border-amber-200 px-1.5 py-px rounded-full font-semibold">{data.anomalies.length}</span>}
          </div>
          {isLoading ? <div className="skeleton h-28 w-full" /> : !data?.anomalies?.length ? (
            <div className="flex flex-col items-center justify-center h-20 gap-1">
              <CheckCircle2 className="w-5 h-5 text-success" />
              <p className="text-[10.5px] text-success font-medium">All metrics normal</p>
            </div>
          ) : (
            <div className="space-y-1">
              {data.anomalies.slice(0,6).map((a2,i) => (
                <div key={i} className={`flex items-center justify-between px-2 py-1 rounded text-[10px] ${a2.direction==='above'?'bg-red-50':'bg-amber-50'}`}>
                  <div className="flex items-center gap-1.5 min-w-0">
                    <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${a2.direction==='above'?'bg-danger':'bg-warning'}`} />
                    <span className="font-semibold text-text-primary truncate">{a2.metric}</span>
                    {a2.line && <span className="text-text-muted truncate">· {a2.line}</span>}
                  </div>
                  <span className={`font-mono font-bold flex-shrink-0 ml-1 text-[10px] ${a2.direction==='above'?'text-danger':'text-warning'}`}>
                    {a2.direction==='above'?'+':'-'}{a2.deviations.toFixed(1)}σ
                  </span>
                </div>
              ))}
              {data.anomalies.length > 6 && <p className="text-[9.5px] text-text-muted text-center">+{data.anomalies.length-6} more</p>}
            </div>
          )}
        </div>

      </div> {/* end charts grid */}

      {/* ── Equipment Health (full table) ── */}
      <div className="card p-3">
        <div className="flex items-center justify-between mb-2">
          <p className="text-sm font-semibold text-text-primary">Equipment Health Register <span className="text-text-muted font-normal text-xs">— ranked by downtime</span></p>
          <button onClick={() => navigate('/reports')} className="text-xs text-primary hover:underline flex items-center gap-0.5">Full report <ChevronRight className="w-3 h-3" /></button>
        </div>
        {isLoading ? <div className="skeleton h-24 w-full" /> : (
          <>
            <table className="w-full text-[10.5px]">
              <thead>
                <tr className="border-b border-border-col">
                  {['#','Equipment','Line','Incidents','Downtime','MTTR','MTBF','Health','Status'].map(h => (
                    <th key={h} className={`pb-1.5 font-semibold text-text-muted uppercase tracking-wide text-[9px] ${['#','Health','Status'].includes(h)?'text-center':['Equipment','Line'].includes(h)?'text-left pr-2':'text-right pr-2'}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {equipRows.map((eq, i) => {
                  const h = eq.healthScore;
                  const hc = h>=75?'text-success':h>=50?'text-warning':'text-danger';
                  const hb = h>=75?'bg-green-50':h>=50?'bg-amber-50':'bg-red-50';
                  return (
                    <tr key={i}
                      className={`border-b border-border-col/30 hover:bg-bg-muted/40 cursor-pointer ${eq.isChronicFailure?'bg-red-50/20':''}`}
                      onClick={() => drillLine(eq.line)}
                      title={`Drill into ${eq.line}`}
                    >
                      <td className="py-1.5 text-center text-text-muted">{i+1}</td>
                      <td className="py-1.5 pr-2 font-semibold text-text-primary">
                        <div className="flex items-center gap-1">{eq.isChronicFailure && <Flame className="w-2.5 h-2.5 text-danger flex-shrink-0" />}{eq.equipment}</div>
                      </td>
                      <td className="py-1.5 pr-2 text-text-secondary">{eq.line}</td>
                      <td className="py-1.5 pr-2 text-right font-mono">{eq.totalIncidents}</td>
                      <td className="py-1.5 pr-2 text-right font-mono font-semibold text-danger">{formatHours(eq.totalDowntimeHours)}</td>
                      <td className={`py-1.5 pr-2 text-right font-mono ${eq.avgMttr>mttrBench?'text-danger':'text-success'}`}>{formatHours(eq.avgMttr)}</td>
                      <td className="py-1.5 pr-2 text-right font-mono text-text-muted">{formatHours(eq.avgMtbf)}</td>
                      <td className="py-1.5 text-center">
                        <div className="flex items-center gap-1 justify-center">
                          <div className="w-10 h-1 bg-bg-muted rounded-full overflow-hidden"><div className={`h-1 rounded-full ${h>=75?'bg-success':h>=50?'bg-warning':'bg-danger'}`} style={{ width:`${h}%` }} /></div>
                          <span className={`font-mono font-bold ${hc}`}>{h.toFixed(0)}</span>
                        </div>
                      </td>
                      <td className="py-1.5 text-center"><span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${hb} ${hc}`}>{eq.isChronicFailure?'Critical':h>=75?'Good':h>=50?'Fair':'Poor'}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {(data?.byEquipment?.length||0) > 6 && (
              <button onClick={()=>setShowAllEquip(!showAllEquip)} className="mt-1.5 w-full text-[10.5px] text-primary flex items-center justify-center gap-1 py-1 hover:bg-primary/5 rounded">
                {showAllEquip ? <><ChevronUp className="w-3 h-3" />Show less</> : <><ChevronDown className="w-3 h-3" />Show all {data?.byEquipment?.length}</>}
              </button>
            )}
            {a && a.chronic.length > 0 && <IBox icon={<Flame className="w-3 h-3 text-danger" />} color="bg-red-50 text-red-800" text={`${a.chronic.length} chronic failures: ${a.chronic.slice(0,3).map(e=>e.equipment).join(', ')}. Escalate for root-cause elimination.`} />}
          </>
        )}
      </div>

      {/* ── Drill-down modal ── */}
      {drill && <DrillDownModal content={drill} onClose={() => setDrill(null)} />}

    </div>
  );
}
