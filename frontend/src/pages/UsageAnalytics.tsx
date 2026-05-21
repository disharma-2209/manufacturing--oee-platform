import React, { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ComposedChart, AreaChart, Area, Bar, BarChart,
  XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer, Line,
} from 'recharts';
import {
  Activity, Users, Sparkles, Upload, ChevronLeft, ChevronRight,
  CheckCircle2, XCircle, RefreshCw,
} from 'lucide-react';
import { api } from '@/lib/api-client';
import { useAuthStore } from '@/store/authStore';
import { useQueryClient } from '@tanstack/react-query';

// ── Types ─────────────────────────────────────────────────────────────────────
interface UsageSummary {
  totalEvents: number;
  totalUsers: number;
  activeToday: number;
  aiQueriesTotal: number;
  uploadsTotal: number;
  eventsByType: { event_type: string; count: number }[];
  dailyActive: { date: string; users: number; events: number }[];
}

interface UserStat {
  user_id: number;
  username: string;
  role: string;
  total_events: number;
  last_active: string;
  ai_queries: number;
  uploads: number;
  page_views: number;
  avg_session_duration_ms: number;
  top_feature: string;
}

interface AIQuery {
  id: number;
  username: string;
  analysis_type: string;
  duration_ms: number;
  status: string;
  created_at: string;
}

interface UploadEvent {
  id: number;
  username: string;
  filename: string;
  type: string;
  duration_ms: number;
  status: string;
  created_at: string;
}

// ── Constants ─────────────────────────────────────────────────────────────────
const EVENT_LABELS: Record<string, string> = {
  ai_query:    'AI Analysis',
  file_upload: 'File Upload',
  page_view:   'Page View',
  api_call:    'API Call',
  export:      'Report Export',
};

const EVENT_COLORS: Record<string, string> = {
  ai_query:    '#8B5CF6',
  file_upload: '#F59E0B',
  page_view:   '#3B82F6',
  api_call:    '#06B6D4',
  export:      '#22C55E',
};

const ANALYSIS_LABELS: Record<string, string> = {
  weekly_summary:      'Weekly Summary',
  root_cause:          'Root Cause',
  action_plan:         'Action Plan',
  predictive_risk:     'Predictive Risk',
  benchmark_gap:       'Benchmark Gap',
  maintenance_strategy:'Maintenance',
  team_performance:    'Team Perf',
  correlation_explanation: 'Correlation',
  unknown:             'Unknown',
};

const ANALYSIS_COLORS: Record<string, string> = {
  weekly_summary:       '#3B82F6',
  root_cause:           '#EF4444',
  action_plan:          '#22C55E',
  predictive_risk:      '#F59E0B',
  benchmark_gap:        '#8B5CF6',
  maintenance_strategy: '#06B6D4',
  team_performance:     '#EC4899',
  correlation_explanation: '#64748B',
};

const ROLE_STYLE: Record<string, string> = {
  admin:   'bg-purple-100 text-purple-700',
  analyst: 'bg-blue-100 text-blue-700',
  viewer:  'bg-slate-100 text-slate-500',
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtDuration(ms: number | null | undefined): string {
  if (!ms) return '—';
  if (ms < 1000) return `${ms}ms`;
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}

function fmtDateTime(d: string): string {
  return new Date(d).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function relativeTime(d: string): string {
  const diff = Date.now() - new Date(d).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return 'Yesterday';
  return `${days}d ago`;
}

function fmtAxisDate(d: string): string {
  const dt = new Date(d);
  return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ── KPI Card ──────────────────────────────────────────────────────────────────
function KPICard({
  label, value, icon: Icon, color,
}: {
  label: string; value: string | number;
  icon: React.ElementType; color: string;
}) {
  const colorMap: Record<string, { icon: string; bg: string }> = {
    blue:   { icon: 'bg-blue-50 text-blue-600',     bg: 'bg-blue-500' },
    green:  { icon: 'bg-success-light text-success', bg: 'bg-success' },
    purple: { icon: 'bg-purple-100 text-purple-600', bg: 'bg-purple-500' },
    amber:  { icon: 'bg-warning-light text-warning', bg: 'bg-warning' },
  };
  const c = colorMap[color] ?? colorMap.blue;
  return (
    <div className="card p-5">
      <div className="flex items-start justify-between">
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${c.icon}`}>
          <Icon style={{ width: 18, height: 18 }} />
        </div>
      </div>
      <div className="mt-3 text-2xl font-bold text-text-primary leading-none">
        {typeof value === 'number' ? value.toLocaleString() : value}
      </div>
      <div className="text-xs text-text-muted mt-1">{label}</div>
    </div>
  );
}

// ── Custom Tooltip ────────────────────────────────────────────────────────────
function DailyTooltip({ active, payload, label }: { active?: boolean; payload?: {value:number;name:string}[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-bg-surface border border-border-col rounded-lg shadow-card px-3 py-2 text-xs">
      <p className="font-semibold text-text-primary mb-1">{label}</p>
      {payload.map(p => (
        <div key={p.name} className="flex gap-2 text-text-muted">
          <span className="capitalize">{p.name}:</span>
          <span className="font-medium text-text-primary">{p.value}</span>
        </div>
      ))}
    </div>
  );
}

// ── AI Type filter pills ──────────────────────────────────────────────────────
const AI_FILTERS = [
  'all', 'weekly_summary', 'root_cause', 'action_plan',
  'predictive_risk', 'benchmark_gap', 'maintenance_strategy', 'team_performance',
];

// ── Main Page ─────────────────────────────────────────────────────────────────
export function UsageAnalytics() {
  const { user } = useAuthStore();
  const qc = useQueryClient();

  if (user?.role !== 'admin') return <Navigate to="/" replace />;

  const [aiPage, setAiPage]       = useState(1);
  const [aiFilter, setAiFilter]   = useState('all');
  const AI_PER_PAGE = 10;

  const { data: summary, isLoading: sumLoading } = useQuery<UsageSummary>({
    queryKey: ['usage-summary'],
    queryFn: () => api.get('/usage/summary'),
    staleTime: 60_000,
  });

  const { data: byUserData } = useQuery<{ users: UserStat[] }>({
    queryKey: ['usage-by-user'],
    queryFn: () => api.get('/usage/by-user'),
    staleTime: 60_000,
  });

  const { data: aiData } = useQuery<{ total: number; queries: AIQuery[] }>({
    queryKey: ['usage-ai-queries', aiPage],
    queryFn: () => api.get(`/usage/ai-queries?page=${aiPage}&limit=20`),
    staleTime: 60_000,
  });

  const { data: uploadsData } = useQuery<{ uploads: UploadEvent[] }>({
    queryKey: ['usage-uploads'],
    queryFn: () => api.get('/usage/uploads'),
    staleTime: 60_000,
  });

  const topUsers  = (byUserData?.users ?? []).slice(0, 10);
  const allQueries = aiData?.queries ?? [];
  const filteredQueries = aiFilter === 'all'
    ? allQueries
    : allQueries.filter(q => q.analysis_type === aiFilter);
  const pagedQueries = filteredQueries.slice((aiPage - 1) * AI_PER_PAGE, aiPage * AI_PER_PAGE);
  const totalAiPages = Math.ceil((aiData?.total ?? 0) / 20);

  const totalEventsForPct = (summary?.eventsByType ?? []).reduce((s, e) => s + e.count, 0) || 1;

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">Usage Analytics</h1>
          <p className="page-subtitle">Platform activity, AI usage, and user engagement — last 30 days</p>
        </div>
        <button
          onClick={() => {
            qc.invalidateQueries({ queryKey: ['usage-summary'] });
            qc.invalidateQueries({ queryKey: ['usage-by-user'] });
            qc.invalidateQueries({ queryKey: ['usage-ai-queries'] });
            qc.invalidateQueries({ queryKey: ['usage-uploads'] });
          }}
          className="p-2 rounded-lg border border-border-col bg-white hover:bg-bg-muted text-text-muted hover:text-text-primary transition-colors shadow-card"
          title="Refresh"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* ── Section 1: KPI cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard label="Total Events (30d)"    value={sumLoading ? '…' : (summary?.totalEvents ?? 0)}    icon={Activity}  color="blue"   />
        <KPICard label="Active Users Today"    value={sumLoading ? '…' : (summary?.activeToday ?? 0)}    icon={Users}     color="green"  />
        <KPICard label="AI Queries (30d)"      value={sumLoading ? '…' : (summary?.aiQueriesTotal ?? 0)} icon={Sparkles}  color="purple" />
        <KPICard label="Files Uploaded (30d)"  value={sumLoading ? '…' : (summary?.uploadsTotal ?? 0)}   icon={Upload}    color="amber"  />
      </div>

      {/* ── Section 2: Daily Active Users chart ── */}
      <div className="card p-5">
        <h2 className="section-title mb-4">Daily Active Users — Last 30 Days</h2>
        {(summary?.dailyActive?.length ?? 0) === 0 ? (
          <div className="flex items-center justify-center h-48 text-text-muted text-sm">No data yet</div>
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <ComposedChart data={summary!.dailyActive.map(d => ({ ...d, dateLabel: fmtAxisDate(d.date) }))} margin={{ top: 4, right: 16, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="eventsGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#3B82F6" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="#3B82F6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
              <XAxis dataKey="dateLabel" tick={{ fontSize: 10, fill: '#94A3B8' }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
              <YAxis yAxisId="left"  tick={{ fontSize: 10, fill: '#94A3B8' }} tickLine={false} axisLine={false} width={28} />
              <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10, fill: '#94A3B8' }} tickLine={false} axisLine={false} width={32} />
              <Tooltip content={<DailyTooltip />} />
              <Area yAxisId="right" type="monotone" dataKey="events" fill="url(#eventsGrad)" stroke="#3B82F6" strokeWidth={1} dot={false} name="events" />
              <Line yAxisId="left"  type="monotone" dataKey="users"  stroke="#1E3A5F"        strokeWidth={2}   dot={false} name="users" />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* ── Section 3: Feature usage + Top users ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Feature Usage */}
        <div className="card p-5">
          <h2 className="section-title mb-4">Feature Usage by Type</h2>
          {(summary?.eventsByType ?? []).length === 0 ? (
            <div className="flex items-center justify-center h-40 text-text-muted text-sm">No data yet</div>
          ) : (
            <div className="space-y-3">
              {(summary?.eventsByType ?? []).map(et => {
                const pct = Math.round((et.count / totalEventsForPct) * 100);
                const color = EVENT_COLORS[et.event_type] ?? '#94A3B8';
                return (
                  <div key={et.event_type}>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="font-medium text-text-primary">{EVENT_LABELS[et.event_type] ?? et.event_type}</span>
                      <span className="text-text-muted">{et.count.toLocaleString()} <span className="text-text-disabled">({pct}%)</span></span>
                    </div>
                    <div className="h-2 w-full bg-bg-muted rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: color }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Top Users */}
        <div className="card overflow-hidden">
          <div className="px-5 py-4 border-b border-border-col">
            <h2 className="section-title">Most Active Users</h2>
          </div>
          {topUsers.length === 0 ? (
            <div className="flex items-center justify-center h-40 text-text-muted text-sm">No data yet</div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="bg-bg-muted/40">
                  {['User', 'Role', 'Events', 'AI', 'Last Active'].map(h => (
                    <th key={h} className="px-4 py-2.5 text-left text-[10px] font-semibold text-text-muted uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {topUsers.map((u: UserStat) => (
                  <tr key={u.user_id} className="border-t border-border-col/50 hover:bg-bg-muted/20">
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0 ${ROLE_STYLE[u.role] ?? 'bg-slate-100 text-slate-500'}`}>
                          {u.username.slice(0, 2).toUpperCase()}
                        </div>
                        <span className="text-sm font-medium text-text-primary truncate max-w-[100px]">{u.username}</span>
                      </div>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full capitalize ${ROLE_STYLE[u.role] ?? ''}`}>{u.role}</span>
                    </td>
                    <td className="px-4 py-2.5 text-sm text-text-primary font-medium">{u.total_events.toLocaleString()}</td>
                    <td className="px-4 py-2.5 text-sm text-text-secondary">{u.ai_queries}</td>
                    <td className="px-4 py-2.5 text-xs text-text-muted whitespace-nowrap">{relativeTime(u.last_active)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* ── Section 4: AI Query History ── */}
      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-border-col flex items-center justify-between gap-4 flex-wrap">
          <h2 className="section-title">AI Analysis History</h2>
          <div className="flex gap-1.5 flex-wrap">
            {AI_FILTERS.map(f => (
              <button
                key={f}
                onClick={() => { setAiFilter(f); setAiPage(1); }}
                className={`px-2.5 py-1 text-[11px] font-medium rounded-full border transition-colors ${
                  aiFilter === f
                    ? 'bg-primary text-white border-primary'
                    : 'border-border-col text-text-muted hover:border-primary/40 hover:text-text-primary'
                }`}
              >
                {f === 'all' ? 'All' : (ANALYSIS_LABELS[f] ?? f)}
              </button>
            ))}
          </div>
        </div>

        {pagedQueries.length === 0 ? (
          <div className="flex items-center justify-center py-16 text-text-muted text-sm">No AI queries recorded yet</div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="bg-bg-muted/40">
                {['#', 'Analysis Type', 'User', 'Duration', 'Status', 'Date'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-[10px] font-semibold text-text-muted uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pagedQueries.map((q: AIQuery, i: number) => (
                <tr key={q.id} className="border-t border-border-col/50 hover:bg-bg-muted/20">
                  <td className="px-4 py-3 text-xs text-text-muted">{(aiPage - 1) * AI_PER_PAGE + i + 1}</td>
                  <td className="px-4 py-3">
                    <span
                      className="inline-block text-[11px] font-semibold px-2 py-0.5 rounded-full text-white"
                      style={{ backgroundColor: ANALYSIS_COLORS[q.analysis_type] ?? '#94A3B8' }}
                    >
                      {ANALYSIS_LABELS[q.analysis_type] ?? q.analysis_type}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-text-primary">@{q.username}</td>
                  <td className="px-4 py-3 text-xs text-text-muted">{fmtDuration(q.duration_ms)}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full ${q.status === 'success' ? 'bg-success-light text-success-text' : 'bg-danger-light text-danger-text'}`}>
                      {q.status === 'success' ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                      {q.status === 'success' ? 'Success' : 'Error'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-text-muted whitespace-nowrap">{fmtDateTime(q.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* Pagination */}
        {totalAiPages > 1 && (
          <div className="flex items-center justify-between px-5 py-3 border-t border-border-col">
            <button
              onClick={() => setAiPage(p => Math.max(1, p - 1))}
              disabled={aiPage === 1}
              className="flex items-center gap-1 text-xs text-text-muted hover:text-text-primary disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="w-3.5 h-3.5" /> Previous
            </button>
            <span className="text-xs text-text-muted">Page {aiPage} of {totalAiPages}</span>
            <button
              onClick={() => setAiPage(p => Math.min(totalAiPages, p + 1))}
              disabled={aiPage === totalAiPages}
              className="flex items-center gap-1 text-xs text-text-muted hover:text-text-primary disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Next <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* ── Section 5: Upload History ── */}
      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-border-col">
          <h2 className="section-title">Data Upload History</h2>
        </div>
        {(uploadsData?.uploads ?? []).length === 0 ? (
          <div className="flex items-center justify-center py-16 text-text-muted text-sm">No uploads recorded yet</div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="bg-bg-muted/40">
                {['File Name', 'Uploaded By', 'Type', 'Duration', 'Status', 'Date'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-[10px] font-semibold text-text-muted uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(uploadsData?.uploads ?? []).map((u: UploadEvent) => (
                <tr key={u.id} className="border-t border-border-col/50 hover:bg-bg-muted/20">
                  <td className="px-4 py-3 text-sm text-text-primary font-medium max-w-[220px] truncate" title={u.filename}>
                    {u.filename || <span className="italic text-text-muted">unknown</span>}
                  </td>
                  <td className="px-4 py-3 text-sm text-text-secondary">@{u.username}</td>
                  <td className="px-4 py-3">
                    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${u.type === 'line-file' ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'}`}>
                      {u.type === 'line-file' ? 'Line File' : 'Incident'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-text-muted">{fmtDuration(u.duration_ms)}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full ${u.status === 'success' ? 'bg-success-light text-success-text' : 'bg-danger-light text-danger-text'}`}>
                      {u.status === 'success' ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                      {u.status === 'success' ? 'Success' : 'Error'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-text-muted whitespace-nowrap">{fmtDateTime(u.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
