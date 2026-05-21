import React, { useState } from 'react';
import {
  AlertTriangle, CheckCircle2, TrendingUp, TrendingDown, Zap,
  Target, Wrench, Users, ArrowRight, Clock, Activity, ShieldAlert,
  ThumbsUp, ThumbsDown, CircleCheck, Check, X,
} from 'lucide-react';

export interface AcceptedAction {
  description: string;
  action_required: string;
  dri: string;
  priority: number;
  due_date: string;
  line: string;
  area: string;
  remarks: string;
}

interface AIInsightCardProps {
  analysisType: string;
  response: string;
  compact?: boolean;
  dashboard?: boolean;
  overrideOEE?: string;
  onAcceptAction?: (action: AcceptedAction) => void;
}

function s(v: unknown): string { return v == null ? '' : String(v); }

function parseJSON(text: string): Record<string, unknown> | null {
  if (!text || typeof text !== 'string') return null;

  // Step 1: if the value is already a parsed object (shouldn't happen but guard it)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (typeof (text as any) === 'object') return text as any;

  // Step 2: strip ALL markdown fences (multiline-aware)
  let cleaned = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();

  // Step 3: if it looks like a double-encoded JSON string (starts with '"'), unwrap it
  if (cleaned.startsWith('"') && cleaned.endsWith('"')) {
    try { cleaned = JSON.parse(cleaned) as string; } catch { /* ignore */ }
  }

  // Step 4: find outermost JSON object
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    console.error('[parseJSON] no braces found. first100=', cleaned.slice(0, 100));
    return null;
  }

  const candidate = cleaned.slice(start, end + 1);

  // Step 5: direct parse
  try {
    return JSON.parse(candidate) as Record<string, unknown>;
  } catch (e1) {
    console.error('[parseJSON] direct parse failed:', (e1 as Error).message, 'last50=', candidate.slice(-50));
  }

  // Step 6: repair truncated JSON — walk back to last complete structure
  for (let i = candidate.length - 1; i > start; i--) {
    const ch = candidate[i];
    if (ch === '}' || ch === ']') {
      const partial = candidate.slice(0, i + 1);
      const opens = (partial.match(/\{/g) || []).length - (partial.match(/\}/g) || []).length;
      const arrOpens = (partial.match(/\[/g) || []).length - (partial.match(/\]/g) || []).length;
      if (opens < 0 || arrOpens < 0) continue;
      const closing = ']'.repeat(arrOpens) + '}'.repeat(opens);
      try {
        return JSON.parse(partial + closing) as Record<string, unknown>;
      } catch { continue; }
    }
  }

  console.error('[parseJSON] repair failed. full candidate=', candidate.slice(0, 200));
  return null;
}

function Badge({ label, color }: { label: string; color: 'red' | 'yellow' | 'green' | 'blue' | 'purple' | 'gray' }) {
  const styles: Record<string, string> = {
    red: 'bg-red-50 text-red-700 border border-red-200',
    yellow: 'bg-yellow-50 text-yellow-700 border border-yellow-200',
    green: 'bg-green-50 text-green-700 border border-green-200',
    blue: 'bg-blue-50 text-blue-700 border border-blue-200',
    purple: 'bg-purple-50 text-purple-700 border border-purple-200',
    gray: 'bg-gray-100 text-gray-600 border border-gray-200',
  };
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${styles[color]}`}>{label}</span>;
}

function priorityColor(p: string | number): 'red' | 'yellow' | 'green' | 'blue' | 'gray' {
  const lc = String(p).toLowerCase();
  if (lc === 'critical' || lc === '1') return 'red';
  if (lc === 'high' || lc === '2') return 'yellow';
  if (lc === 'medium' || lc === '3') return 'blue';
  return 'gray';
}

function riskColor(r: string): 'red' | 'yellow' | 'blue' | 'gray' {
  const lc = r?.toLowerCase();
  if (lc === 'critical') return 'red';
  if (lc === 'high') return 'yellow';
  if (lc === 'medium') return 'blue';
  return 'gray';
}

function trendIcon(t: string) {
  if (!t) return null;
  const lc = t.toLowerCase();
  if (lc === 'improving') return <TrendingUp className="w-4 h-4 text-success" />;
  if (lc === 'declining') return <TrendingDown className="w-4 h-4 text-danger" />;
  return <Activity className="w-4 h-4 text-warning" />;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function WeeklySummaryCard({ data, compact, dashboard, overrideOEE }: { data: Record<string, any>; compact?: boolean; dashboard?: boolean; overrideOEE?: string }) {
  if (dashboard) {
    const highlights = Array.isArray(data.highlights) ? (data.highlights as string[]) : [];
    const concerns = Array.isArray(data.concerns) ? (data.concerns as string[]) : [];
    const hasData = highlights.length > 0 || concerns.length > 0;
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          {trendIcon(data.trend as string)}
          <span className={`text-xs font-semibold capitalize px-2 py-0.5 rounded-full border ${
            data.trend === 'improving' ? 'bg-green-500/20 text-green-300 border-green-500/30' :
            data.trend === 'declining' ? 'bg-red-500/20 text-red-300 border-red-500/30' :
            'bg-amber-500/20 text-amber-300 border-amber-500/30'
          }`}>{(data.trend as string) || 'stable'}</span>
          {(overrideOEE || data.keyMetric) && <span className="text-xs text-slate-300">OEE: <strong className="text-white">{overrideOEE ? `Facility OEE ${overrideOEE} (target 85%)` : s(data.keyMetric)}</strong></span>}
        </div>
        {hasData ? (
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <p className="text-[10px] font-semibold text-green-400 uppercase tracking-wider flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> Highlights</p>
              {highlights.slice(0, 3).map((h, i) => (
                <div key={i} className="flex items-start gap-2 px-2.5 py-1.5 rounded-lg bg-green-500/10 border border-green-500/20">
                  <CheckCircle2 className="w-3 h-3 text-green-400 flex-shrink-0 mt-0.5" />
                  <span className="text-xs text-slate-200 leading-snug">{h}</span>
                </div>
              ))}
              {highlights.length === 0 && <p className="text-xs text-slate-500 italic px-1">No highlights</p>}
            </div>
            <div className="space-y-1.5">
              <p className="text-[10px] font-semibold text-red-400 uppercase tracking-wider flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> Concerns</p>
              {concerns.slice(0, 3).map((c, i) => (
                <div key={i} className="flex items-start gap-2 px-2.5 py-1.5 rounded-lg bg-red-500/10 border border-red-500/20">
                  <AlertTriangle className="w-3 h-3 text-red-400 flex-shrink-0 mt-0.5" />
                  <span className="text-xs text-slate-200 leading-snug">{c}</span>
                </div>
              ))}
              {concerns.length === 0 && <p className="text-xs text-slate-500 italic px-1">No concerns</p>}
            </div>
          </div>
        ) : (
          <p className="text-xs text-slate-400 italic">No data available</p>
        )}
      </div>
    );
  }
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        {trendIcon(data.trend as string)}
        <Badge label={(data.trend as string) || 'stable'} color={data.trend === 'improving' ? 'green' : data.trend === 'declining' ? 'red' : 'yellow'} />
        {data.keyMetric && <span className="text-xs text-text-muted ml-auto">Key metric: <strong className="text-text-primary">{s(data.keyMetric)}</strong></span>}
      </div>

      {data.summary && !compact && (
        <div className="text-sm text-text-secondary leading-relaxed bg-bg-muted rounded-lg p-4">
          {s(data.summary)}
        </div>
      )}

      {Array.isArray(data.highlights) && data.highlights.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-success uppercase tracking-wide mb-2">Highlights</p>
          <ul className="space-y-1.5">
            {(data.highlights as string[]).slice(0, compact ? 2 : 99).map((h, i) => (
              <li key={i} className="flex items-start gap-2 text-sm">
                <CheckCircle2 className="w-3.5 h-3.5 text-success flex-shrink-0 mt-0.5" />
                <span className="text-text-secondary">{h}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {Array.isArray(data.concerns) && data.concerns.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-danger uppercase tracking-wide mb-2">Concerns</p>
          <ul className="space-y-1.5">
            {(data.concerns as string[]).slice(0, compact ? 2 : 99).map((c, i) => (
              <li key={i} className="flex items-start gap-2 text-sm">
                <AlertTriangle className="w-3.5 h-3.5 text-danger flex-shrink-0 mt-0.5" />
                <span className="text-text-secondary">{c}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizeCause(c: Record<string, any>): Record<string, any> {
  // Normalize ALL field name variants Claude produces across schema versions
  const category =
    c.category ?? c.failureCategory ?? c.failure_category ?? c.type ?? c.causeCategory;
  const downtime_hours =
    c.downtime_hours ?? c.downtimeHours ?? c.downtime ?? c.equipmentDowntime;
  const percent_of_total =
    c.percent_of_total ??
    c.percentOfTotal ??
    (c.percent_total != null ? `${c.percent_total}%` : undefined) ??
    (c.percentageOfTotal != null ? `${c.percentageOfTotal}%` : undefined);
  const primary_equipment =
    c.primary_equipment ?? c.equipmentKey ?? c.criticalEquipment ?? c.equipment;
  const line = c.line ?? c.affectedLine ?? c.primaryLine;
  const problemStatement =
    c.problemStatement ?? c.problem ?? c.description;
  return {
    ...c,
    rank: c.rank,
    category,
    downtime_hours,
    percent_of_total,
    primary_equipment,
    line,
    problemStatement,
    fiveWhys: Array.isArray(c.fiveWhys) ? c.fiveWhys : [],
    rootCause: c.rootCause ?? c.root_cause ?? c.cause,
    recommendedCountermeasure:
      c.recommendedCountermeasure ?? c.countermeasure ?? c.recommendedAction ?? c.action,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function RootCauseCard({ data, compact, dashboard }: { data: Record<string, any>; compact?: boolean; dashboard?: boolean }) {
  // Support all schema variants Claude produces:
  //   { rootCauses: [...] }           — newest variant
  //   { topThreeRootCauses: [...] }   — previous variant
  //   { topRootCauses: [...] }        — another variant
  //   { problemStatement, fiveWhys }  — single-cause variant
  const causeArray: Array<Record<string, any>> =
    Array.isArray(data.analysis)            ? data.analysis :
    Array.isArray(data.rootCauses)          ? data.rootCauses :
    Array.isArray(data.topThreeRootCauses)  ? data.topThreeRootCauses :
    Array.isArray(data.topRootCauses)       ? data.topRootCauses :
    [data]; // single-cause fallback

  const isMulti = causeArray !== undefined && !(causeArray.length === 1 && causeArray[0] === data);
  const causes = causeArray.map(normalizeCause);

  if (compact) {
    const isDark = dashboard;
    return (
      <div className="space-y-1.5">
        {causes.slice(0, 3).map((cause, ci) => (
          <div key={ci} className={`flex items-start gap-2 py-1.5 last:border-0 ${isDark ? 'border-b border-white/10' : 'border-b border-border-col/40'}`}>
            <span className="w-4 h-4 rounded-full bg-primary text-white text-[9px] font-bold flex items-center justify-center flex-shrink-0 mt-0.5">{cause.rank ?? ci + 1}</span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                {cause.downtime_hours != null && <span className={`text-[10px] font-semibold flex-shrink-0 ${isDark ? 'text-red-400' : 'text-danger'}`}>{s(cause.downtime_hours)}h</span>}
                <span className={`text-[10.5px] font-semibold leading-snug ${isDark ? 'text-slate-100' : 'text-text-primary'}`}>{s(cause.category || cause.failureCategory)}</span>
              </div>
              {cause.rootCause && <p className={`text-[10px] leading-snug mt-0.5 ${isDark ? 'text-orange-300' : 'text-orange-700'}`}>{s(cause.rootCause)}</p>}
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {causes.slice(0, 3).map((cause, ci) => {
        const whys: Array<{ level: number; why: string; answer: string }> =
          Array.isArray(cause.fiveWhys) ? cause.fiveWhys : [];
        return (
          <div key={ci} className={ci > 0 ? 'pt-3 border-t border-border-col' : ''}>
            {(cause.category || cause.rank != null) && (
              <div className="flex items-center gap-2 mb-2">
                <span className="w-5 h-5 rounded-full bg-primary text-white text-xs font-bold flex items-center justify-center flex-shrink-0">
                  {cause.rank ?? ci + 1}
                </span>
                {cause.category && <span className="text-xs font-semibold text-text-primary">{s(cause.category)}</span>}
                {cause.downtime_hours != null && <span className="text-xs text-danger font-medium">{s(cause.downtime_hours)}h downtime</span>}
                {cause.percent_of_total && <span className="text-xs text-text-muted">({s(cause.percent_of_total)})</span>}
              </div>
            )}
            {(cause.problemStatement || cause.primary_equipment) && (
              <div className="bg-red-50 border border-red-100 rounded-lg p-3 mb-2">
                {cause.problemStatement && (
                  <><p className="text-xs font-semibold text-red-600 mb-1">Problem</p>
                  <p className="text-sm text-red-800">{s(cause.problemStatement)}</p></>
                )}
                {!cause.problemStatement && cause.primary_equipment && (
                  <><p className="text-xs font-semibold text-red-600 mb-1">Top Equipment</p>
                  <p className="text-sm text-red-800">{s(cause.primary_equipment)} — {s(cause.line)}</p></>
                )}
              </div>
            )}
            {whys.length > 0 && (
              <div className="mb-2">
                <p className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-2">5-Why Analysis</p>
                <div className="space-y-1.5">
                  {whys.slice(0, 3).map((w) => (
                    <div key={w.level} className="flex gap-3 items-start">
                      <span className="w-5 h-5 rounded-full bg-primary text-white text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">{w.level}</span>
                      <div className="flex-1 border-l-2 border-border-col pl-3">
                        <p className="text-xs text-text-muted">{w.why}</p>
                        <p className="text-sm font-medium text-text-primary">{w.answer}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {cause.rootCause && (
              <div className="bg-orange-50 border border-orange-100 rounded-lg p-2.5">
                <p className="text-xs font-semibold text-orange-600 mb-0.5">Root Cause</p>
                <p className="text-sm text-orange-800 font-medium">{s(cause.rootCause)}</p>
              </div>
            )}
            {cause.recommendedCountermeasure && (
              <div className="flex items-start gap-2 mt-2">
                <ArrowRight className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-semibold text-text-muted mb-0.5">Action</p>
                  <p className="text-sm text-text-secondary">{s(cause.recommendedCountermeasure)}</p>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

const DRIROLE_MAP: Record<string, string> = {
  TE: 'Technical Engineer', ME: 'Maintenance Engineer',
  PE: 'Process Engineer', EM: 'Engineering Manager', '01-PROD': 'Production',
};

function dueDateFromDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + (Number(days) || 7));
  return d.toISOString().split('T')[0];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ActionPlanCard({ data, compact, dashboard, onAcceptAction }: { data: Record<string, any>; compact?: boolean; dashboard?: boolean; onAcceptAction?: (action: AcceptedAction) => void }) {
  const [actionStates, setActionStates] = useState<Record<number, 'accepted' | 'rejected'>>({});
  const actions: Array<Record<string, any>> = Array.isArray(data.actions) ? data.actions : [];

  const handleAccept = (a: Record<string, any>, i: number) => {
    const p = Math.min(5, Math.max(1, Number(a.priority) || 3));
    const accepted: AcceptedAction = {
      description: s(a.problemStatement),
      action_required: s(a.recommendedAction),
      dri: DRIROLE_MAP[s(a.driRole)] || s(a.driRole),
      priority: p,
      due_date: dueDateFromDays(Number(a.suggestedDueDateDays) || 7),
      line: s(a.line),
      area: s(a.area),
      remarks: [
        a.expectedImpact ? `Impact: ${s(a.expectedImpact)}` : '',
        a.successMetric ? `Metric: ${s(a.successMetric)}` : '',
        a.rootCauseHypothesis ? `Root cause: ${s(a.rootCauseHypothesis)}` : '',
      ].filter(Boolean).join('. '),
    };
    setActionStates(prev => ({ ...prev, [i]: 'accepted' }));
    onAcceptAction?.(accepted);
  };

  if (dashboard || compact) {
    const isDark = dashboard;
    return (
      <div className="space-y-2">
        {(data.totalExpectedDowntimeReduction || data.totalExpectedOEEImprovement) && (
          <div className="flex gap-2 mb-1">
            {data.totalExpectedDowntimeReduction && <span className={`text-[10px] px-2 py-0.5 rounded-full border font-semibold ${isDark ? 'bg-green-500/15 text-green-300 border-green-500/25' : 'bg-green-50 text-green-700 border-green-200'}`}>↓ {s(data.totalExpectedDowntimeReduction)}</span>}
            {data.totalExpectedOEEImprovement && <span className={`text-[10px] px-2 py-0.5 rounded-full border font-semibold ${isDark ? 'bg-blue-500/15 text-blue-300 border-blue-500/25' : 'bg-blue-50 text-blue-700 border-blue-200'}`}>↑ {s(data.totalExpectedOEEImprovement)}</span>}
          </div>
        )}
        {actions.slice(0, 3).map((a, i) => (
          <div key={i} className={`rounded-lg border px-3 py-2 transition-colors ${
            actionStates[i] === 'accepted' ? (isDark ? 'border-green-500/30 bg-green-500/10' : 'border-green-300 bg-green-50') :
            actionStates[i] === 'rejected' ? (isDark ? 'border-red-500/20 bg-red-500/5 opacity-60' : 'border-red-200 bg-red-50 opacity-60') :
            isDark ? 'border-white/10 bg-white/5' : 'border-border-col bg-bg-muted/40'
          }`}>
            <div className="flex items-start gap-2">
              <span className="w-4 h-4 rounded-full bg-primary text-white text-[9px] font-bold flex items-center justify-center flex-shrink-0 mt-0.5">{i+1}</span>
              <div className="flex-1 min-w-0">
                <p className={`text-[10.5px] font-semibold leading-snug ${isDark ? 'text-slate-100' : 'text-text-primary'}`}>{s(a.problemStatement)}</p>
                {a.recommendedAction && (
                  <p className={`text-[10px] leading-snug mt-0.5 flex items-start gap-1 ${isDark ? 'text-blue-200' : 'text-blue-700'}`}>
                    <ArrowRight className={`w-2.5 h-2.5 flex-shrink-0 mt-0.5 ${isDark ? 'text-blue-400' : 'text-blue-500'}`} />
                    {s(a.recommendedAction)}
                  </p>
                )}
                <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                  {a.line && <span className={`text-[9px] px-1.5 py-0.5 rounded font-medium ${isDark ? 'bg-blue-500/20 text-blue-300' : 'bg-blue-100 text-blue-700'}`}>{s(a.line)}</span>}
                  {a.area && <span className={`text-[9px] px-1.5 py-0.5 rounded font-medium ${isDark ? 'bg-purple-500/20 text-purple-300' : 'bg-purple-100 text-purple-700'}`}>{s(a.area)}</span>}
                  {a.driRole && <span className={`text-[9px] px-1.5 py-0.5 rounded font-medium ${isDark ? 'bg-white/10 text-slate-300' : 'bg-gray-100 text-gray-700'}`}>{DRIROLE_MAP[s(a.driRole)] || s(a.driRole)}</span>}
                  {(a.expectedImpact || a.expectedOEEImpact) && (
                    <span className={`text-[9px] font-semibold ${isDark ? 'text-green-300' : 'text-green-700'}`}>↑ {s(a.expectedImpact || a.expectedOEEImpact)}</span>
                  )}
                  {a.suggestedDueDateDays && (
                    <span className={`text-[9px] flex items-center gap-0.5 ${isDark ? 'text-slate-400' : 'text-text-muted'}`}>
                      <Clock className="w-2.5 h-2.5" />{s(a.suggestedDueDateDays)}d
                    </span>
                  )}
                </div>
              </div>
              <div className="flex-shrink-0 flex items-center gap-1 mt-0.5">
                {actionStates[i] === 'accepted' ? (
                  <span className={`flex items-center gap-0.5 text-[9px] font-semibold whitespace-nowrap ${isDark ? 'text-green-400' : 'text-green-700'}`}>
                    <CheckCircle2 className="w-3 h-3" /> Added
                  </span>
                ) : actionStates[i] === 'rejected' ? (
                  <span className={`text-[9px] ${isDark ? 'text-slate-500' : 'text-text-muted'}`}>Dismissed</span>
                ) : (
                  <>
                    <button
                      onClick={() => handleAccept(a, i)}
                      className={`flex items-center gap-0.5 text-[9px] px-1.5 py-0.5 rounded font-semibold transition-colors ${isDark ? 'bg-green-500/20 text-green-300 hover:bg-green-500/40' : 'bg-green-100 text-green-700 hover:bg-green-200'}`}
                      title="Accept &amp; add to Action Plans"
                    >
                      <Check className="w-2.5 h-2.5" /> Accept
                    </button>
                    <button
                      onClick={() => setActionStates(prev => ({ ...prev, [i]: 'rejected' }))}
                      className={`flex items-center gap-0.5 text-[9px] px-1.5 py-0.5 rounded font-semibold transition-colors ${isDark ? 'bg-white/5 text-slate-400 hover:bg-red-500/20 hover:text-red-300' : 'bg-gray-100 text-gray-600 hover:bg-red-50 hover:text-red-600'}`}
                      title="Dismiss"
                    >
                      <X className="w-2.5 h-2.5" /> Dismiss
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }
  return (
    <div className="space-y-4">
      {(data.totalExpectedDowntimeReduction || data.totalExpectedOEEImprovement) && (
        <div className="grid grid-cols-2 gap-3">
          {data.totalExpectedDowntimeReduction && (
            <div className="bg-green-50 border border-green-100 rounded-lg p-3 text-center">
              <p className="text-xs text-green-600 font-semibold">Downtime Reduction</p>
              <p className="text-base font-bold text-green-800 mt-0.5">{s(data.totalExpectedDowntimeReduction)}</p>
            </div>
          )}
          {data.totalExpectedOEEImprovement && (
            <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 text-center">
              <p className="text-xs text-blue-600 font-semibold">OEE Improvement</p>
              <p className="text-base font-bold text-blue-800 mt-0.5">{s(data.totalExpectedOEEImprovement)}</p>
            </div>
          )}
        </div>
      )}

      <div className="space-y-3">
        {actions.slice(0, 3).map((a, i) => (
          <div key={i} className="border border-border-col rounded-lg p-3 hover:border-primary/30 transition-colors">
            <div className="flex items-start justify-between gap-2 mb-2">
              <div className="flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-primary text-white text-xs font-bold flex items-center justify-center flex-shrink-0">
                  {s(a.priority || i + 1)}
                </span>
                <Badge label={s(a.line) || 'All Lines'} color="blue" />
                {a.area && <Badge label={s(a.area)} color="purple" />}
              </div>
              {a.driRole && <Badge label={s(a.driRole)} color="gray" />}
            </div>
            <p className="text-sm font-semibold text-text-primary mb-1">{s(a.problemStatement || a.recommendedAction)}</p>
            {a.recommendedAction && a.problemStatement && (
              <p className="text-xs text-text-muted flex items-start gap-1.5">
                <ArrowRight className="w-3 h-3 flex-shrink-0 mt-0.5 text-primary" />
                {s(a.recommendedAction)}
              </p>
            )}
            {!compact && (
              <div className="flex gap-4 mt-2 pt-2 border-t border-border-col/40">
                {a.expectedImpact && (
                  <div className="flex items-center gap-1 text-xs text-success">
                    <TrendingUp className="w-3 h-3" />
                    {s(a.expectedImpact)}
                  </div>
                )}
                {a.suggestedDueDateDays && (
                  <div className="flex items-center gap-1 text-xs text-text-muted">
                    <Clock className="w-3 h-3" />
                    Due in {s(a.suggestedDueDateDays)} days
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function PredictiveRiskCard({ data, compact, dashboard }: { data: Record<string, any>; compact?: boolean; dashboard?: boolean }) {
  // Filter out items that are just characters (string parsed as char-array)
  const rawItems = Array.isArray(data.highRiskItems) ? data.highRiskItems : [];
  const items: Array<Record<string, any>> = rawItems.filter(
    (item) => typeof item === 'object' && item !== null && !Array.isArray(item) && typeof item.equipment === 'string'
  );
  // Ensure recommendedMonitoring is always a proper string array, not char-array
  const monitoring: string[] = (() => {
    const m = data.recommendedMonitoring;
    if (!m) return [];
    if (Array.isArray(m) && m.length > 0 && typeof m[0] === 'string' && m[0].length === 1 && m.length > 10) {
      // It's a string split into chars — join it back
      return [m.join('')];
    }
    if (Array.isArray(m)) return m.filter((x: unknown) => typeof x === 'string' && x.length > 1);
    if (typeof m === 'string') return [m];
    return [];
  })();
  if (compact) {
    const isDark = dashboard;
    return (
      <div className="space-y-1.5">
        {items.length === 0 ? (
          <p className={`text-[10.5px] italic ${isDark ? 'text-slate-500' : 'text-text-muted'}`}>No high-risk items identified.</p>
        ) : items.slice(0, 3).map((item, i) => (
          <div key={i} className={`flex items-start gap-2 py-1.5 last:border-0 ${isDark ? 'border-b border-white/10' : 'border-b border-border-col/40'}`}>
            <ShieldAlert className={`w-3.5 h-3.5 flex-shrink-0 mt-0.5 ${
              s(item.riskLevel).toLowerCase() === 'critical' ? 'text-danger' :
              s(item.riskLevel).toLowerCase() === 'high' ? 'text-warning' : isDark ? 'text-blue-400' : 'text-blue-500'
            }`} />
            <div className="flex-1 min-w-0">
              <p className={`text-[10.5px] font-semibold leading-snug ${isDark ? 'text-slate-100' : 'text-text-primary'}`}>{s(item.equipment)}</p>
              <div className="flex items-center gap-1.5 mt-0.5">
                {item.line && <span className={`text-[9px] px-1.5 py-0.5 rounded font-medium ${isDark ? 'bg-blue-500/20 text-blue-300' : 'bg-blue-100 text-blue-700'}`}>{s(item.line)}</span>}
                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                  s(item.riskLevel).toLowerCase() === 'critical' ? (isDark ? 'bg-red-500/20 text-red-300' : 'bg-red-100 text-red-700') :
                  s(item.riskLevel).toLowerCase() === 'high' ? (isDark ? 'bg-amber-500/20 text-amber-300' : 'bg-amber-100 text-amber-700') :
                  isDark ? 'bg-blue-500/20 text-blue-300' : 'bg-blue-100 text-blue-700'
                }`}>{s(item.riskLevel) || 'medium'}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }
  return (
    <div className="space-y-4">
      {data.overallRiskAssessment && (
        <div className="bg-orange-50 border border-orange-100 rounded-lg p-3">
          <p className="text-xs font-semibold text-orange-600 mb-1">Overall Risk Assessment</p>
          <p className="text-sm text-orange-800">{s(data.overallRiskAssessment)}</p>
        </div>
      )}
      {items.length === 0 ? (
        <p className="text-sm text-text-muted text-center py-4">No high-risk items identified.</p>
      ) : (
        <div className="space-y-2">
          {items.slice(0, 3).map((item, i) => {
            const reasons: string[] = Array.isArray(item.reasons)
              ? (item.reasons as unknown[]).filter((r): r is string => typeof r === 'string' && r.length > 1)
              : [];
            return (
              <div key={i} className="flex items-start gap-3 p-3 border border-border-col rounded-lg">
                <ShieldAlert className={`w-4 h-4 flex-shrink-0 mt-0.5 ${
                  s(item.riskLevel).toLowerCase() === 'critical' ? 'text-danger' :
                  s(item.riskLevel).toLowerCase() === 'high' ? 'text-warning' : 'text-blue-500'
                }`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <p className="text-sm font-semibold text-text-primary">{s(item.equipment)}</p>
                    {item.line && <Badge label={s(item.line)} color="blue" />}
                    <Badge label={s(item.riskLevel) || 'medium'} color={riskColor(s(item.riskLevel))} />
                  </div>
                  {reasons.length > 0 && <p className="text-xs text-text-muted">{reasons.join(' · ')}</p>}
                  {item.recommendedPreventiveAction && (
                    <p className="text-xs text-primary mt-1 flex items-start gap-1">
                      <ArrowRight className="w-3 h-3 flex-shrink-0 mt-0.5" />
                      {s(item.recommendedPreventiveAction)}
                    </p>
                  )}
                </div>
                {item.urgency && (
                  <Badge label={s(item.urgency)} color={s(item.urgency) === 'immediate' ? 'red' : s(item.urgency) === 'this week' ? 'yellow' : 'gray'} />
                )}
              </div>
            );
          })}
        </div>
      )}
      {monitoring.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-1.5">Monitor</p>
          <ul className="space-y-1">
            {monitoring.map((m, i) => (
              <li key={i} className="text-xs text-text-secondary flex items-start gap-1.5">
                <ShieldAlert className="w-3 h-3 text-warning flex-shrink-0 mt-0.5" />{m}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function BenchmarkGapCard({ data, compact, dashboard }: { data: Record<string, any>; compact?: boolean; dashboard?: boolean }) {
  const gaps: Array<Record<string, any>> = Array.isArray(data.gaps) ? data.gaps : [];
  const roadmap: Array<Record<string, any>> = Array.isArray(data.roadmap) ? data.roadmap : [];

  if (compact) {
    const isDark = dashboard;
    return (
      <div className="space-y-1.5">
        {(data.overallMaturityLevel || data.topPriorityGap) && (
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            {data.overallMaturityLevel && <span className={`text-[9px] px-1.5 py-0.5 rounded capitalize flex-shrink-0 font-medium ${isDark ? 'bg-white/10 text-slate-300' : 'bg-gray-100 text-gray-700'}`}>{s(data.overallMaturityLevel)}</span>}
            {data.topPriorityGap && <span className={`text-[10px] font-medium leading-snug ${isDark ? 'text-red-300' : 'text-red-700'}`}>↑ gap: {s(data.topPriorityGap)}</span>}
          </div>
        )}
        {gaps.slice(0, 3).map((g, i) => {
          const current = Number(g.currentValue || 0);
          const benchmark = Number(g.benchmarkValue || 0);
          const pct = benchmark > 0 ? Math.min(100, (current / benchmark) * 100) : 0;
          return (
            <div key={i} className={`py-1.5 last:border-0 ${isDark ? 'border-b border-white/10' : 'border-b border-border-col/40'}`}>
              <div className="flex items-center justify-between mb-0.5">
                <span className={`text-[10.5px] font-semibold leading-snug ${isDark ? 'text-slate-100' : 'text-text-primary'}`}>{s(g.metric)}</span>
                <span className={`text-[9px] flex-shrink-0 ml-2 font-mono ${isDark ? 'text-slate-400' : 'text-text-muted'}`}>{(current * 100 > 1 ? current : current * 100).toFixed(1)}% / {(benchmark * 100 > 1 ? benchmark : benchmark * 100).toFixed(1)}%</span>
              </div>
              <div className={`w-full h-1.5 rounded-full overflow-hidden ${isDark ? 'bg-white/10' : 'bg-bg-muted'}`}>
                <div className={`h-1.5 rounded-full ${pct >= 90 ? 'bg-success' : pct >= 75 ? 'bg-warning' : 'bg-danger'}`} style={{ width: `${pct}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        {data.overallMaturityLevel && (
          <div className="bg-bg-muted rounded-lg px-3 py-2">
            <p className="text-xs text-text-muted">Maturity Level</p>
            <p className="text-sm font-bold text-text-primary capitalize">{s(data.overallMaturityLevel)}</p>
          </div>
        )}
        {data.topPriorityGap && (
          <div className="bg-red-50 border border-red-100 rounded-lg px-3 py-2">
            <p className="text-xs text-red-500">Top Priority Gap</p>
            <p className="text-sm font-bold text-red-800">{s(data.topPriorityGap)}</p>
          </div>
        )}
      </div>
      <div className="space-y-2">
        {gaps.slice(0, 3).map((g, i) => {
          const current = Number(g.currentValue || 0);
          const benchmark = Number(g.benchmarkValue || 0);
          const pct = benchmark > 0 ? Math.min(100, (current / benchmark) * 100) : 0;
          return (
            <div key={i} className="space-y-1">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium text-text-primary">{s(g.metric)}</span>
                <div className="flex items-center gap-2">
                  <span className="text-text-muted text-xs">{(current * 100 > 1 ? current : current * 100).toFixed(1)}% / {(benchmark * 100 > 1 ? benchmark : benchmark * 100).toFixed(1)}%</span>
                  <Badge label={s(g.priority) || 'medium'} color={priorityColor(s(g.priority))} />
                </div>
              </div>
              <div className="w-full bg-bg-muted rounded-full h-2">
                <div className={`h-2 rounded-full transition-all ${pct >= 90 ? 'bg-success' : pct >= 75 ? 'bg-warning' : 'bg-danger'}`} style={{ width: `${pct}%` }} />
              </div>
            </div>
          );
        })}
      </div>
      {roadmap.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-2">Roadmap</p>
          <div className="space-y-2">
            {roadmap.map((r, i) => (
              <div key={i} className="flex items-start gap-3 text-sm">
                <span className="w-5 h-5 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">{i + 1}</span>
                <div>
                  <p className="font-semibold text-text-primary">{s(r.phase)}</p>
                  <p className="text-xs text-text-muted">{s(r.focus)} — <span className="text-success">{s(r.expectedGain)}</span></p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function MaintenanceStrategyCard({ data, compact, dashboard }: { data: Record<string, any>; compact?: boolean; dashboard?: boolean }) {
  const recs: Array<Record<string, any>> = Array.isArray(data.recommendations) ? data.recommendations : [];

  if (compact) {
    const isDark = dashboard;
    return (
      <div className="space-y-1.5">
        {recs.slice(0, 3).map((r, i) => (
          <div key={i} className={`flex items-start gap-2 py-1.5 last:border-0 ${isDark ? 'border-b border-white/10' : 'border-b border-border-col/40'}`}>
            <Wrench className={`w-3 h-3 flex-shrink-0 mt-0.5 ${isDark ? 'text-purple-400' : 'text-purple-600'}`} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className={`text-[10.5px] font-semibold leading-snug ${isDark ? 'text-slate-100' : 'text-text-primary'}`}>{s(r.equipment)}</span>
                {r.line && <span className={`text-[9px] px-1.5 py-0.5 rounded flex-shrink-0 font-medium ${isDark ? 'bg-blue-500/20 text-blue-300' : 'bg-blue-100 text-blue-700'}`}>{s(r.line)}</span>}
              </div>
              <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                <span className={`text-[9px] line-through ${isDark ? 'text-slate-500' : 'text-text-muted'}`}>{s(r.currentStrategy)}</span>
                <ArrowRight className={`w-2.5 h-2.5 flex-shrink-0 ${isDark ? 'text-slate-500' : 'text-text-muted'}`} />
                <span className={`text-[9px] font-semibold ${isDark ? 'text-blue-300' : 'text-blue-700'}`}>{s(r.recommendedStrategy)}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {data.overallStrategy && (
        <div className="bg-blue-50 border border-blue-100 rounded-lg p-3">
          <p className="text-xs font-semibold text-blue-600 mb-1">Strategy Summary</p>
          <p className="text-sm text-blue-800">{s(data.overallStrategy)}</p>
        </div>
      )}
      <div className="space-y-2">
        {recs.slice(0, 3).map((r, i) => (
          <div key={i} className="border border-border-col rounded-lg p-3">
            <div className="flex items-center gap-2 mb-2">
              <Wrench className="w-3.5 h-3.5 text-text-muted" />
              <p className="text-sm font-semibold text-text-primary">{s(r.equipment)}</p>
              <Badge label={s(r.line)} color="blue" />
            </div>
            <div className="flex items-center gap-2 text-xs text-text-muted mb-1.5">
              <span className="line-through">{s(r.currentStrategy)}</span>
              <ArrowRight className="w-3 h-3" />
              <span className="text-primary font-semibold">{s(r.recommendedStrategy)}</span>
            </div>
            {r.justification && <p className="text-xs text-text-muted">{s(r.justification)}</p>}
            <div className="flex gap-3 mt-2 pt-2 border-t border-border-col/40">
              {r.estimatedMTBFImprovement && <span className="text-xs text-success">MTBF +{s(r.estimatedMTBFImprovement)}</span>}
              {r.estimatedMTTRReduction && <span className="text-xs text-primary">MTTR -{s(r.estimatedMTTRReduction)}</span>}
              {r.roi && <span className="text-xs text-text-muted">ROI: {s(r.roi)}</span>}
            </div>
          </div>
        ))}
      </div>
      {Array.isArray(data.quickWins) && data.quickWins.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-success uppercase tracking-wide mb-2">Quick Wins</p>
          {(data.quickWins as string[]).map((w, i) => (
            <p key={i} className="text-xs text-text-muted flex items-start gap-1.5 mb-1">
              <Zap className="w-3 h-3 text-warning flex-shrink-0 mt-0.5" />{w}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function TeamPerformanceCard({ data, compact, dashboard }: { data: Record<string, any>; compact?: boolean; dashboard?: boolean }) {
  const teams: Array<Record<string, any>> = Array.isArray(data.teamAnalysis) ? data.teamAnalysis : [];

  if (compact) {
    const isDark = dashboard;
    return (
      <div className="space-y-1.5">
        {teams.slice(0, 3).map((t, i) => (
          <div key={i} className={`flex items-start gap-2 py-1.5 last:border-0 ${isDark ? 'border-b border-white/10' : 'border-b border-border-col/40'}`}>
            <Users className={`w-3 h-3 flex-shrink-0 mt-0.5 ${isDark ? 'text-indigo-400' : 'text-indigo-600'}`} />
            <div className="flex-1 min-w-0">
              <p className={`text-[10.5px] font-semibold leading-snug ${isDark ? 'text-slate-100' : 'text-text-primary'}`}>{s(t.team)}</p>
              <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                {Array.isArray(t.strengths) && t.strengths[0] && (
                  <span className={`text-[9px] px-1.5 py-0.5 rounded font-medium leading-snug ${isDark ? 'bg-green-500/15 text-green-300' : 'bg-green-100 text-green-700'}`}>{s(t.strengths[0])}</span>
                )}
                {Array.isArray(t.gaps) && t.gaps[0] && (
                  <span className={`text-[9px] px-1.5 py-0.5 rounded font-medium leading-snug ${isDark ? 'bg-red-500/15 text-red-300' : 'bg-red-100 text-red-700'}`}>{s(t.gaps[0])}</span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        {teams.slice(0, 3).map((t, i) => (
          <div key={i} className="border border-border-col rounded-lg p-3">
            <div className="flex items-center gap-2 mb-2">
              <Users className="w-3.5 h-3.5 text-text-muted" />
              <p className="text-sm font-semibold text-text-primary">{s(t.team)}</p>
            </div>
            {Array.isArray(t.strengths) && (
              <div className="flex flex-wrap gap-1 mb-1">
                {(t.strengths as string[]).map((str, j) => (
                  <span key={j} className="text-xs bg-green-50 text-green-700 px-2 py-0.5 rounded-full">{str}</span>
                ))}
              </div>
            )}
            {Array.isArray(t.gaps) && (
              <div className="flex flex-wrap gap-1">
                {(t.gaps as string[]).map((g, j) => (
                  <span key={j} className="text-xs bg-red-50 text-red-600 px-2 py-0.5 rounded-full">{g}</span>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
      {data.crossTeamInsights && (
        <div className="text-xs text-text-muted border-t border-border-col pt-3">{s(data.crossTeamInsights)}</div>
      )}
    </div>
  );
}

function GenericCard() {
  return (
    <div className="flex items-center gap-3 py-4 px-3 bg-amber-50 border border-amber-100 rounded-lg">
      <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0" />
      <div>
        <p className="text-sm font-medium text-amber-800">Could not parse structured output</p>
        <p className="text-xs text-amber-600 mt-0.5">Re-run this analysis to get a formatted result.</p>
      </div>
    </div>
  );
}

const TYPE_LABELS: Record<string, string> = {
  root_cause: 'Root Cause Analysis',
  action_plan: 'Action Plan',
  predictive: 'Predictive Risk',
  predictive_risk: 'Predictive Risk',
  oee_improvement: 'OEE Improvement',
  benchmark_gap: 'Benchmark Gap',
  equipment_health: 'Equipment Health',
  maintenance_strategy: 'Maintenance Strategy',
  team_performance: 'Team Performance',
  weekly_summary: 'Weekly Summary',
  correlation_explanation: 'Correlation Insight',
};

const TYPE_ICONS: Record<string, React.ReactNode> = {
  root_cause: <AlertTriangle className="w-4 h-4" />,
  action_plan: <Target className="w-4 h-4" />,
  predictive: <ShieldAlert className="w-4 h-4" />,
  predictive_risk: <ShieldAlert className="w-4 h-4" />,
  oee_improvement: <TrendingUp className="w-4 h-4" />,
  benchmark_gap: <TrendingUp className="w-4 h-4" />,
  equipment_health: <Wrench className="w-4 h-4" />,
  maintenance_strategy: <Wrench className="w-4 h-4" />,
  team_performance: <Users className="w-4 h-4" />,
  weekly_summary: <Activity className="w-4 h-4" />,
};

const TYPE_COLORS: Record<string, string> = {
  root_cause: 'bg-red-100 text-red-700',
  action_plan: 'bg-blue-100 text-blue-700',
  predictive: 'bg-orange-100 text-orange-700',
  predictive_risk: 'bg-orange-100 text-orange-700',
  oee_improvement: 'bg-green-100 text-green-700',
  benchmark_gap: 'bg-green-100 text-green-700',
  equipment_health: 'bg-purple-100 text-purple-700',
  maintenance_strategy: 'bg-purple-100 text-purple-700',
  team_performance: 'bg-indigo-100 text-indigo-700',
  weekly_summary: 'bg-primary/10 text-primary',
};

export function AIInsightCard({ analysisType, response, compact = false, dashboard = false, overrideOEE, onAcceptAction }: AIInsightCardProps) {
  const parsed = parseJSON(response) as Record<string, any> | null;

  const label = TYPE_LABELS[analysisType] || analysisType.replace(/_/g, ' ');
  const icon = TYPE_ICONS[analysisType];
  const colorClass = TYPE_COLORS[analysisType] || 'bg-bg-muted text-text-muted';

  const renderContent = (): React.ReactNode => {
    if (!parsed) return <GenericCard />;
    const typeAliases: Record<string, string> = {
      predictive: 'predictive_risk',
      oee_improvement: 'benchmark_gap',
      equipment_health: 'maintenance_strategy',
    };
    const type = typeAliases[analysisType] ?? analysisType;
    switch (type) {
      case 'weekly_summary':       return <WeeklySummaryCard data={parsed} compact={compact} dashboard={dashboard} overrideOEE={overrideOEE} />;
      case 'root_cause':           return <RootCauseCard data={parsed} compact={compact} dashboard={dashboard} />;
      case 'action_plan':          return <ActionPlanCard data={parsed} compact={compact} dashboard={dashboard} onAcceptAction={onAcceptAction} />;
      case 'predictive_risk':      return <PredictiveRiskCard data={parsed} compact={compact} dashboard={dashboard} />;
      case 'benchmark_gap':        return <BenchmarkGapCard data={parsed} compact={compact} dashboard={dashboard} />;
      case 'maintenance_strategy': return <MaintenanceStrategyCard data={parsed} compact={compact} dashboard={dashboard} />;
      case 'team_performance':     return <TeamPerformanceCard data={parsed} compact={compact} dashboard={dashboard} />;
      default: return <GenericCard />;
    }
  };

  return (
    <div className={compact ? '' : 'space-y-3'}>
      {!compact && (
        <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${colorClass}`}>
          {icon}
          {label}
        </div>
      )}
      {renderContent()}
    </div>
  );
}
