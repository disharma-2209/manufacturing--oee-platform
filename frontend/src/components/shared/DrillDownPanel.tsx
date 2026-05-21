import React, { useEffect } from 'react';
import { X } from 'lucide-react';
import { formatPercent, formatHours, getCategoryColor } from '@/lib/utils';

export type DrillRow = { [key: string]: string | number | boolean | null | undefined };

export interface DrillConfig {
  title: string;
  subtitle?: string;
  columns: {
    key: string;
    label: string;
    align?: 'left' | 'right' | 'center';
    format?: (v: unknown, row: DrillRow) => React.ReactNode;
  }[];
  rows: DrillRow[];
  badge?: { label: string; color: string };
}

interface Props {
  config: DrillConfig | null;
  onClose: () => void;
}

export function DrillDownPanel({ config, onClose }: Props) {
  useEffect(() => {
    if (!config) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [config, onClose]);

  if (!config) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/30 z-40 backdrop-blur-[1px]"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="fixed right-0 top-0 h-full w-full max-w-2xl bg-white shadow-2xl z-50 flex flex-col">

        {/* Header */}
        <div className="flex items-start justify-between px-5 py-4 border-b border-border-col bg-bg-muted/40">
          <div className="min-w-0 flex-1 pr-4">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-[13px] font-bold text-text-primary leading-tight">{config.title}</h2>
              {config.badge && (
                <span className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${config.badge.color}`}>
                  {config.badge.label}
                </span>
              )}
            </div>
            {config.subtitle && (
              <p className="text-[11px] text-text-muted mt-0.5">{config.subtitle}</p>
            )}
          </div>
          <button
            onClick={onClose}
            className="flex-shrink-0 p-1.5 rounded-md hover:bg-bg-muted transition-colors"
          >
            <X className="w-4 h-4 text-text-muted" />
          </button>
        </div>

        {/* Row count */}
        <div className="px-5 py-2 border-b border-border-col/50 bg-white">
          <span className="text-[10px] text-text-muted font-medium">{config.rows.length} row{config.rows.length !== 1 ? 's' : ''}</span>
        </div>

        {/* Table */}
        <div className="flex-1 overflow-auto px-5 py-3">
          {config.rows.length === 0 ? (
            <div className="flex items-center justify-center h-40 text-text-muted text-[12px]">No data to display</div>
          ) : (
            <table className="w-full text-[10.5px]">
              <thead className="sticky top-0 bg-white z-10">
                <tr className="border-b border-border-col">
                  {config.columns.map(col => (
                    <th
                      key={col.key}
                      className={`pb-2 pt-0.5 font-semibold text-text-muted text-[9px] uppercase tracking-wide whitespace-nowrap
                        ${col.align === 'right' ? 'text-right pr-3' : col.align === 'center' ? 'text-center' : 'text-left pr-3'}`}
                    >
                      {col.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {config.rows.map((row, i) => (
                  <tr key={i} className="border-b border-border-col/30 hover:bg-bg-muted/30 transition-colors">
                    {config.columns.map(col => {
                      const val = row[col.key];
                      const cell = col.format ? col.format(val, row) : val;
                      return (
                        <td
                          key={col.key}
                          className={`py-2 text-text-secondary
                            ${col.align === 'right' ? 'text-right pr-3 font-mono' : col.align === 'center' ? 'text-center' : 'pr-3'}`}
                        >
                          {cell as React.ReactNode}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </>
  );
}

/* ─── Pre-built drill configs ────────────────────────────────────────────── */

export function buildOEEByLineDrill(byLine: any[], metric: string, label: string, goal: number): DrillConfig {
  const sorted = [...byLine].sort((a, b) => (b[metric] || 0) - (a[metric] || 0));
  return {
    title: `${label} — By Line`,
    subtitle: 'All production lines ranked by metric value',
    badge: { label: 'OEE Explorer', color: 'bg-primary/10 text-primary' },
    columns: [
      { key: 'line', label: 'Line', align: 'left', format: v => <span className="font-semibold text-text-primary">{String(v)}</span> },
      {
        key: metric, label: label, align: 'right',
        format: (v, row) => {
          const val = Number(v) || 0;
          const ok = val >= goal;
          return (
            <span className={`font-bold font-mono ${ok ? 'text-success' : 'text-danger'}`}>
              {formatPercent(val)}
            </span>
          );
        },
      },
      { key: 'totalIncidents',    label: 'Incidents',  align: 'right', format: v => <span className="font-mono">{String(v)}</span> },
      { key: 'totalDowntimeHours', label: 'Downtime',  align: 'right', format: v => <span className="font-mono text-warning font-semibold">{formatHours(Number(v))}</span> },
      { key: 'mttr',              label: 'MTTR',       align: 'right', format: v => <span className="font-mono">{formatHours(Number(v))}</span> },
      { key: 'mtbf',              label: 'MTBF',       align: 'right', format: v => <span className="font-mono">{formatHours(Number(v))}</span> },
      {
        key: 'oee', label: 'vs Goal', align: 'center',
        format: (v) => {
          const gap = Number(v) - goal;
          return gap >= 0
            ? <span className="text-[9px] font-bold text-success">+{(gap * 100).toFixed(1)}pp</span>
            : <span className="text-[9px] font-bold text-danger">{(gap * 100).toFixed(1)}pp</span>;
        },
      },
    ],
    rows: sorted,
  };
}

export function buildDowntimeByLineDrill(byLine: any[]): DrillConfig {
  const sorted = [...byLine].sort((a, b) => (b.totalDowntimeHours || 0) - (a.totalDowntimeHours || 0));
  const total = sorted.reduce((s, l) => s + (l.totalDowntimeHours || 0), 0);
  return {
    title: 'Total Downtime — By Line',
    subtitle: 'Downtime hours and incidents per production line',
    badge: { label: 'Downtime', color: 'bg-amber-50 text-warning' },
    columns: [
      { key: 'line',              label: 'Line',       align: 'left',   format: v => <span className="font-semibold text-text-primary">{String(v)}</span> },
      { key: 'totalDowntimeHours', label: 'Downtime',  align: 'right',  format: v => <span className="font-mono font-bold text-danger">{formatHours(Number(v))}</span> },
      { key: 'totalIncidents',    label: 'Incidents',  align: 'right',  format: v => <span className="font-mono">{String(v)}</span> },
      { key: 'mttr',              label: 'MTTR',       align: 'right',  format: v => <span className="font-mono">{formatHours(Number(v))}</span> },
      {
        key: 'totalDowntimeHours', label: '% of Total', align: 'right',
        format: (v) => {
          const pct = total > 0 ? (Number(v) / total * 100).toFixed(1) : '0.0';
          return <span className="font-mono text-text-muted">{pct}%</span>;
        },
      },
      {
        key: 'totalDowntimeHours', label: 'Share Bar', align: 'left',
        format: (v) => {
          const pct = total > 0 ? Number(v) / total * 100 : 0;
          return (
            <div className="w-24 h-1.5 bg-bg-muted rounded-full overflow-hidden">
              <div className="h-1.5 bg-warning rounded-full" style={{ width: `${pct}%` }} />
            </div>
          );
        },
      },
    ],
    rows: sorted,
  };
}

export function buildMTTRByLineDrill(byLine: any[], bench: number): DrillConfig {
  const sorted = [...byLine].sort((a, b) => (b.mttr || 0) - (a.mttr || 0));
  return {
    title: 'Avg MTTR — By Line',
    subtitle: `Benchmark: ${bench}h. Lines above benchmark highlighted.`,
    badge: { label: 'Response Time', color: 'bg-red-50 text-danger' },
    columns: [
      { key: 'line',  label: 'Line',  align: 'left', format: v => <span className="font-semibold text-text-primary">{String(v)}</span> },
      {
        key: 'mttr', label: 'MTTR', align: 'right',
        format: v => {
          const val = Number(v) || 0;
          return <span className={`font-mono font-bold ${val > bench ? 'text-danger' : 'text-success'}`}>{formatHours(val)}</span>;
        },
      },
      {
        key: 'mttr', label: 'vs Bench', align: 'right',
        format: v => {
          const diff = Number(v) - bench;
          return diff > 0
            ? <span className="text-[9px] font-bold text-danger">+{formatHours(diff)}</span>
            : <span className="text-[9px] font-bold text-success">{formatHours(diff)}</span>;
        },
      },
      { key: 'mtbf',           label: 'MTBF',      align: 'right', format: v => <span className="font-mono">{formatHours(Number(v))}</span> },
      { key: 'totalIncidents', label: 'Incidents', align: 'right', format: v => <span className="font-mono">{String(v)}</span> },
    ],
    rows: sorted,
  };
}

export function buildRepeatFailureDrill(byEquipment: any[]): DrillConfig {
  const repeats = [...byEquipment].filter(e => e.isChronicFailure || e.totalIncidents > 1)
    .sort((a, b) => (b.totalIncidents || 0) - (a.totalIncidents || 0));
  return {
    title: 'Repeat Failures — Equipment Detail',
    subtitle: 'Equipment with multiple incidents — chronic failures flagged',
    badge: { label: 'Reliability Risk', color: 'bg-red-50 text-danger' },
    columns: [
      {
        key: 'equipment', label: 'Equipment', align: 'left',
        format: (v, row) => (
          <div className="flex items-center gap-1.5">
            {row.isChronicFailure && <span className="text-[9px] font-bold text-danger">🔥</span>}
            <span className="font-semibold text-text-primary">{String(v)}</span>
          </div>
        ),
      },
      { key: 'line',            label: 'Line',      align: 'left',  format: v => <span className="text-text-secondary">{String(v)}</span> },
      { key: 'totalIncidents',  label: 'Incidents', align: 'right', format: v => <span className="font-mono font-bold text-danger">{String(v)}</span> },
      { key: 'totalDowntimeHours', label: 'Downtime', align: 'right', format: v => <span className="font-mono">{formatHours(Number(v))}</span> },
      { key: 'avgMttr',         label: 'Avg MTTR',  align: 'right', format: v => <span className="font-mono">{formatHours(Number(v))}</span> },
      {
        key: 'healthScore', label: 'Health', align: 'center',
        format: v => {
          const h = Number(v) || 0;
          const c = h >= 75 ? 'text-success' : h >= 50 ? 'text-warning' : 'text-danger';
          return <span className={`font-mono font-bold ${c}`}>{h.toFixed(0)}</span>;
        },
      },
    ],
    rows: repeats,
  };
}

export function buildParetoCategDrill(byLine: any[], category: string, pareto: any): DrillConfig {
  const causeRows = (pareto?.byCause || []).filter((c: any) => c.category === category);
  return {
    title: `Pareto Drill — "${category}"`,
    subtitle: 'Root causes within this failure category',
    badge: { label: 'Failure Analysis', color: 'bg-orange-50 text-orange-700' },
    columns: [
      { key: 'cause',    label: 'Root Cause', align: 'left',  format: v => <span className="font-semibold text-text-primary">{String(v)}</span> },
      { key: 'hours',    label: 'Hours',      align: 'right', format: v => <span className="font-mono font-bold text-danger">{Number(v).toFixed(1)}h</span> },
      { key: 'count',    label: 'Incidents',  align: 'right', format: v => <span className="font-mono">{String(v)}</span> },
      {
        key: 'hours', label: 'Avg/Inc', align: 'right',
        format: (v, row) => {
          const avg = row.count ? Number(v) / Number(row.count) : 0;
          return <span className="font-mono text-text-muted">{avg.toFixed(1)}h</span>;
        },
      },
    ],
    rows: [...causeRows].sort((a: any, b: any) => b.hours - a.hours),
  };
}

export function buildShiftDrill(shiftAnalysis: any[], shiftName: string): DrillConfig {
  const rows = shiftAnalysis.filter(s => s.shift === shiftName)
    .sort((a, b) => (b.totalHours || 0) - (a.totalHours || 0));
  return {
    title: `${shiftName} Shift — Line Breakdown`,
    subtitle: 'Incidents and downtime per line during this shift',
    badge: { label: 'Shift Analysis', color: 'bg-blue-50 text-primary' },
    columns: [
      { key: 'line',         label: 'Line',      align: 'left',  format: v => <span className="font-semibold text-text-primary">{String(v)}</span> },
      { key: 'count',        label: 'Incidents', align: 'right', format: v => <span className="font-mono">{String(v)}</span> },
      { key: 'totalHours',   label: 'Downtime',  align: 'right', format: v => <span className="font-mono text-warning font-semibold">{formatHours(Number(v))}</span> },
      { key: 'avgResolution', label: 'Avg Resolution', align: 'right', format: v => v != null ? <span className="font-mono">{formatHours(Number(v))}</span> : <span className="text-text-muted">—</span> },
    ],
    rows,
  };
}

export function buildEquipmentIncidentDrill(equipment: string, line: string, incidents: any[]): DrillConfig {
  const rows = incidents
    .filter(i => i.equipment === equipment)
    .sort((a, b) => new Date(b.report_time || 0).getTime() - new Date(a.report_time || 0).getTime());
  return {
    title: `${equipment} — Incident History`,
    subtitle: `Line: ${line}`,
    badge: { label: 'Equipment Detail', color: 'bg-purple-50 text-purple-700' },
    columns: [
      {
        key: 'report_time', label: 'Date/Time', align: 'left',
        format: v => v ? <span className="text-text-muted whitespace-nowrap">{new Date(String(v)).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span> : <span>—</span>,
      },
      { key: 'cause_category', label: 'Category', align: 'left',
        format: v => {
          const cat = String(v || 'Unknown');
          return <span className="text-[9px] px-1.5 py-0.5 rounded-full text-white font-semibold" style={{ backgroundColor: getCategoryColor(cat) }}>{cat}</span>;
        },
      },
      { key: 'cause',          label: 'Cause',    align: 'left',  format: v => <span className="text-text-secondary">{String(v || '—')}</span> },
      { key: 'duration_hours', label: 'Duration', align: 'right', format: v => <span className="font-mono text-danger font-semibold">{formatHours(Number(v))}</span> },
      { key: 'shift',          label: 'Shift',    align: 'center', format: v => <span className="text-text-muted">{String(v || '—')}</span> },
      { key: 'remarks',        label: 'Remarks',  align: 'left',
        format: v => v ? <span className="text-text-muted truncate max-w-[160px] block" title={String(v)}>{String(v).slice(0, 40)}{String(v).length > 40 ? '…' : ''}</span> : <span>—</span>,
      },
    ],
    rows,
  };
}

export function buildOEEComponentsDrill(byLine: any[], component: string, label: string, bench: number): DrillConfig {
  const sorted = [...byLine].sort((a, b) => (a[component] || 0) - (b[component] || 0));
  return {
    title: `${label} — By Line`,
    subtitle: `World-class benchmark: ${(bench * 100).toFixed(1)}%`,
    badge: { label: 'OEE Component', color: 'bg-emerald-50 text-emerald-700' },
    columns: [
      { key: 'line', label: 'Line', align: 'left', format: v => <span className="font-semibold text-text-primary">{String(v)}</span> },
      {
        key: component, label: label, align: 'right',
        format: v => {
          const val = Number(v) || 0;
          const ok = val >= bench;
          return <span className={`font-mono font-bold ${ok ? 'text-success' : 'text-danger'}`}>{formatPercent(val)}</span>;
        },
      },
      {
        key: component, label: 'Gap to WC', align: 'right',
        format: v => {
          const gap = Number(v) - bench;
          return gap >= 0
            ? <span className="text-[9px] text-success font-bold">+{(gap * 100).toFixed(1)}pp</span>
            : <span className="text-[9px] text-danger font-bold">{(gap * 100).toFixed(1)}pp</span>;
        },
      },
      { key: 'totalDowntimeHours', label: 'Downtime',  align: 'right', format: v => <span className="font-mono">{formatHours(Number(v))}</span> },
      { key: 'totalIncidents',     label: 'Incidents', align: 'right', format: v => <span className="font-mono">{String(v)}</span> },
    ],
    rows: sorted,
  };
}
