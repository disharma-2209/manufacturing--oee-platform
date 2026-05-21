import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import { AlertCircle, TrendingUp, TrendingDown, Activity, CheckCircle2, Info } from 'lucide-react';
import { api } from '@/lib/api-client';
import { FullAnalysis, OEETransparency } from '@/types';
import { formatPercent, formatHours, formatNumber, getOEEColor } from '@/lib/utils';

function IBox({ icon, color, text }: { icon: React.ReactNode; color: string; text: string }) {
  return (
    <div className={`flex items-start gap-1.5 mt-2 px-2.5 py-1.5 rounded text-[10.5px] leading-relaxed ${color}`}>
      <span className="flex-shrink-0 mt-px">{icon}</span><span>{text}</span>
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
          <div className="w-1.5 h-1.5 rounded-full" style={{ background: p.color }} />
          <span className="text-text-muted">{p.name}:</span>
          <span className="font-medium">{formatter ? formatter(p.value) : p.value}</span>
        </div>
      ))}
    </div>
  );
}

export function OEEExplorer() {
  const { data, isLoading } = useQuery<FullAnalysis>({
    queryKey: ['analysis-summary'],
    queryFn: () => api.get('/analyze/summary'),
  });
  const { data: transparency } = useQuery<OEETransparency>({
    queryKey: ['oee-transparency'],
    queryFn: () => api.get('/analyze/oee-transparency'),
    staleTime: 60000,
  });
  const [selectedLine, setSelectedLine] = useState<string | null>(null);

  if (isLoading) return (
    <div className="space-y-3">{[...Array(3)].map((_, i) => <div key={i} className="skeleton h-32 w-full" />)}</div>
  );
  if (data?.empty) return (
    <div className="flex items-center justify-center h-64 text-text-muted text-sm">No data. Upload an Excel file to explore OEE.</div>
  );

  const lines = [...(data?.byLine || [])].sort((a, b) => {
    const numA = parseInt(a.line.replace(/\D/g, ''), 10);
    const numB = parseInt(b.line.replace(/\D/g, ''), 10);
    if (!isNaN(numA) && !isNaN(numB) && numA !== numB) return numA - numB;
    return a.line.localeCompare(b.line, undefined, { numeric: true, sensitivity: 'base' });
  });
  const sel = selectedLine ? lines.find(l => l.line === selectedLine) : lines[0];
  const goal = data?.settings?.oee_goal || 0.82;
  const worstLine = [...lines].sort((a, b) => a.oee - b.oee)[0];
  const bestLine = [...lines].sort((a, b) => b.oee - a.oee)[0];

  const radarData = sel ? [
    { subject: 'Availability', value: +(sel.availability * 100).toFixed(1), goal: (data?.settings?.availability_goal || 0.9) * 100 },
    { subject: 'Performance',  value: +(sel.performance  * 100).toFixed(1), goal: (data?.settings?.performance_goal  || 0.95) * 100 },
    { subject: 'Quality',      value: +(sel.quality      * 100).toFixed(1), goal: (data?.settings?.quality_goal      || 0.995) * 100 },
  ] : [];

  const barData = lines.map(l => ({
    line: l.line,
    OEE: +(l.oee * 100).toFixed(1),
    Avail: +(l.availability * 100).toFixed(1),
    Perf: +(l.performance * 100).toFixed(1),
  }));

  return (
    <div className="space-y-3">

      {/* Header */}
      <div className="flex items-center justify-between py-0.5">
        <div>
          <h1 className="text-lg font-bold text-text-primary tracking-tight">OEE Explorer</h1>
          <p className="text-[11px] text-text-muted">Drill into availability, performance & quality by line</p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {lines.map(l => (
            <button key={l.line} onClick={() => setSelectedLine(l.line)}
              className={`px-2.5 py-1 rounded text-[11px] font-semibold transition-colors ${(selectedLine || lines[0]?.line) === l.line ? 'bg-primary text-white' : 'bg-bg-muted text-text-secondary hover:bg-primary/10 hover:text-primary'}`}>
              {l.line}
            </button>
          ))}
        </div>
      </div>

      {/* KPI strip for selected line */}
      {sel && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
          {[
            { label: 'OEE',          value: sel.oee,          goal: data?.settings?.oee_goal          || 0.82,  color: 'bg-blue-500' },
            { label: 'Availability', value: sel.availability, goal: data?.settings?.availability_goal || 0.90,  color: 'bg-blue-400' },
            { label: 'Performance',  value: sel.performance,  goal: data?.settings?.performance_goal  || 0.95,  color: 'bg-emerald-500' },
            { label: 'Quality',      value: sel.quality,      goal: data?.settings?.quality_goal      || 0.995, color: 'bg-purple-500' },
          ].map(m => {
            const pct = m.value * 100;
            const ok = m.value >= m.goal;
            return (
              <div key={m.label} className="card px-3 py-2.5">
                <div className="flex justify-between items-center mb-1">
                  <span className="text-[10px] font-semibold text-text-muted uppercase tracking-wider">{m.label}</span>
                  {ok ? <CheckCircle2 className="w-3 h-3 text-success" /> : <AlertCircle className="w-3 h-3 text-danger" />}
                </div>
                <p className="font-mono text-2xl font-bold" style={{ color: getOEEColor(m.value) }}>{pct.toFixed(1)}%</p>
                <div className="mt-1.5 h-1 bg-bg-muted rounded-full overflow-hidden">
                  <div className={`h-1 rounded-full ${m.color}`} style={{ width: `${Math.min(100, pct)}%` }} />
                </div>
                <p className="text-[10px] text-text-muted mt-0.5">
                  Goal {(m.goal * 100).toFixed(1)}%{!ok && <span className="text-danger font-semibold ml-1">−{((m.goal - m.value) * 100).toFixed(1)}pp</span>}
                </p>
              </div>
            );
          })}
        </div>
      )}

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-2.5">

        {/* Radar */}
        <div className="card p-3">
          <p className="text-[11px] font-bold text-text-primary mb-1">Component Radar — {sel?.line}</p>
          <ResponsiveContainer width="100%" height={170}>
            <RadarChart data={radarData} margin={{ top: 4, right: 12, bottom: 4, left: 12 }}>
              <PolarGrid stroke="#E2E6EE" />
              <PolarAngleAxis dataKey="subject" tick={{ fontSize: 9, fill: '#4B5675' }} />
              <PolarRadiusAxis angle={90} domain={[0, 100]} tick={{ fontSize: 8, fill: '#8C95A8' }} />
              <Radar name="Actual" dataKey="value" stroke="#2563EB" fill="#2563EB" fillOpacity={0.2} />
              <Radar name="Goal" dataKey="goal" stroke="#16A34A" fill="none" strokeDasharray="3 3" strokeWidth={1.5} />
            </RadarChart>
          </ResponsiveContainer>
          <div className="flex items-center gap-3 mt-1">
            <span className="flex items-center gap-1 text-[10px] text-primary"><span className="w-3 h-0.5 bg-primary inline-block rounded" />Actual</span>
            <span className="flex items-center gap-1 text-[10px] text-success"><span className="w-3 h-0.5 bg-success inline-block rounded" />Goal</span>
          </div>
        </div>

        {/* All lines bar */}
        <div className="card p-3">
          <p className="text-[11px] font-bold text-text-primary mb-1">OEE Comparison — All Lines</p>
          <ResponsiveContainer width="100%" height={170}>
            <BarChart data={barData} barSize={12} margin={{ top: 4, right: 4, left: -18, bottom: 0 }}>
              <CartesianGrid strokeDasharray="2 2" stroke="#E2E6EE" vertical={false} />
              <XAxis dataKey="line" tick={{ fontSize: 9, fill: '#4B5675' }} axisLine={false} tickLine={false} />
              <YAxis domain={[0, 100]} tickFormatter={v => `${v}%`} tick={{ fontSize: 9, fill: '#8C95A8' }} axisLine={false} tickLine={false} />
              <Tooltip content={<CT formatter={(v: number) => `${v}%`} />} />
              <Bar dataKey="OEE" name="OEE" radius={[2, 2, 0, 0]}>
                {barData.map((e, i) => <Cell key={i} fill={getOEEColor(e.OEE / 100)} />)}
              </Bar>
              <Bar dataKey="Avail" name="Avail" fill="#93C5FD" radius={[2, 2, 0, 0]} opacity={0.6} />
              <Bar dataKey="Perf" name="Perf" fill="#6EE7B7" radius={[2, 2, 0, 0]} opacity={0.6} />
            </BarChart>
          </ResponsiveContainer>
          {worstLine && bestLine && worstLine.line !== bestLine.line && (
            <IBox icon={<AlertCircle className="w-3 h-3 text-danger" />} color="bg-red-50 text-red-700"
              text={`Gap: ${bestLine.line} (${formatPercent(bestLine.oee)}) vs ${worstLine.line} (${formatPercent(worstLine.oee)}) — ${((bestLine.oee - worstLine.oee) * 100).toFixed(1)}pp spread.`} />
          )}
        </div>

        {/* OEE vs Goal summary */}
        <div className="card p-3">
          <p className="text-[11px] font-bold text-text-primary mb-2">Lines vs OEE Goal ({formatPercent(goal)})</p>
          <div className="space-y-2">
            {lines.map(l => {
              const pct = l.oee * 100;
              const ok = l.oee >= goal;
              return (
                <div key={l.line}>
                  <div className="flex justify-between mb-0.5">
                    <span className="text-[10.5px] font-medium text-text-primary">{l.line}</span>
                    <span className={`text-[10.5px] font-bold font-mono ${ok ? 'text-success' : 'text-danger'}`}>{pct.toFixed(1)}%</span>
                  </div>
                  <div className="relative h-1.5 bg-bg-muted rounded-full overflow-visible">
                    <div className={`h-1.5 rounded-full ${ok ? 'bg-success' : 'bg-danger'}`} style={{ width: `${Math.min(100, pct)}%` }} />
                    <div className="absolute top-1/2 -translate-y-1/2 w-px h-3 bg-text-secondary/50 rounded-full" style={{ left: `${goal * 100}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
          {worstLine && (
            <IBox icon={<TrendingDown className="w-3 h-3 text-danger" />} color="bg-red-50 text-red-700"
              text={`${worstLine.line} needs +${((goal - worstLine.oee) * 100).toFixed(1)}pp to reach goal.`} />
          )}
          {lines.filter(l => l.oee >= goal).length > 0 && (
            <IBox icon={<TrendingUp className="w-3 h-3 text-success" />} color="bg-green-50 text-green-800"
              text={`${lines.filter(l => l.oee >= goal).length} of ${lines.length} lines meeting OEE goal.`} />
          )}
        </div>
      </div>

      {/* Reliability metrics table */}
      <div className="card p-3">
        <p className="text-[11px] font-bold text-text-primary mb-2">Reliability Metrics by Line</p>
        <table className="w-full text-[10.5px]">
          <thead>
            <tr className="border-b border-border-col">
              {['Line', 'OEE', 'Avail', 'Perf', 'Quality', 'Incidents', 'Downtime', 'MTTR', 'MTBF'].map(h => (
                <th key={h} className={`pb-1.5 font-semibold text-text-muted uppercase tracking-wide text-[9px] ${h === 'Line' ? 'text-left pr-3' : 'text-right pr-2'}`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {lines.map((l, i) => {
              const ok = l.oee >= goal;
              return (
                <tr key={i} className="border-b border-border-col/30 hover:bg-bg-muted/40">
                  <td className="py-1.5 pr-3 font-semibold text-text-primary">{l.line}</td>
                  <td className={`py-1.5 pr-2 text-right font-mono font-bold ${ok ? 'text-success' : 'text-danger'}`}>{formatPercent(l.oee)}</td>
                  <td className="py-1.5 pr-2 text-right font-mono text-text-secondary">{formatPercent(l.availability)}</td>
                  <td className="py-1.5 pr-2 text-right font-mono text-text-secondary">{formatPercent(l.performance)}</td>
                  <td className="py-1.5 pr-2 text-right font-mono text-text-secondary">{formatPercent(l.quality)}</td>
                  <td className="py-1.5 pr-2 text-right font-mono text-text-secondary">{l.totalIncidents}</td>
                  <td className="py-1.5 pr-2 text-right font-mono text-danger font-semibold">{formatHours(l.totalDowntimeHours)}</td>
                  <td className={`py-1.5 pr-2 text-right font-mono ${l.mttr > 2 ? 'text-danger' : 'text-success'}`}>{formatHours(l.mttr)}</td>
                  <td className="py-1.5 text-right font-mono text-text-muted">{formatHours(l.mtbf)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <IBox icon={<Activity className="w-3 h-3 text-blue-500" />} color="bg-blue-50 text-blue-800"
          text={`Total ${lines.reduce((s, l) => s + l.totalIncidents, 0)} incidents across ${lines.length} lines · ${formatHours(lines.reduce((s, l) => s + l.totalDowntimeHours, 0))} total downtime.`} />
      </div>

      {/* ── OEE Calculation Transparency — per line, always expanded ── */}
      <div className="card p-4">
        <div className="flex items-center gap-2 mb-4">
          <Info className="w-4 h-4 text-primary flex-shrink-0" />
          <span className="text-[11px] font-bold text-text-primary">OEE Calculation Transparency</span>
          <span className="text-[9px] text-text-muted font-normal">— how each line's OEE is derived</span>
          {transparency && transparency.lines.filter(l => l.oeeSource === 'line_file').length > 0 && (
            <span className="text-[8.5px] font-semibold px-1.5 py-0.5 rounded bg-primary/10 text-primary border border-primary/20 ml-1">
              {transparency.lines.filter(l => l.oeeSource === 'line_file').length} line-file override{transparency.lines.filter(l => l.oeeSource === 'line_file').length > 1 ? 's' : ''} active
            </span>
          )}
        </div>

        {/* Formula legend */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-5">
          <div className="bg-primary/5 border border-primary/15 rounded-lg p-3">
            <div className="flex items-center gap-1.5 mb-2">
              <span className="text-[8.5px] font-bold px-1.5 py-0.5 rounded bg-primary text-white">📊 Line File</span>
              <span className="text-[10.5px] font-bold text-text-primary">Throughput-based (Siemens CMES)</span>
            </div>
            <div className="space-y-1 text-[10px] text-text-secondary">
              <p><span className="font-semibold text-text-primary">OEE</span> = avg( SPI · API · Lead Height · Carousel · Wave 3 station OEEs )</p>
              <p><span className="font-semibold text-text-primary">Availability</span> = (112.5h − Stoppage Hours) ÷ 112.5h</p>
              <p><span className="font-semibold text-text-primary">Performance</span> = Boards Produced ÷ (Available Hours × 500 UPH)</p>
              <p><span className="font-semibold text-text-primary">Quality</span> = (Tested − Fails) ÷ Tested</p>
              <p className="text-[9px] text-text-muted mt-1">Stoppage = (gap − tackTime) &gt; 10 min · 112.5h scheduled · Lead Height quality = 100%</p>
            </div>
          </div>
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
            <div className="flex items-center gap-1.5 mb-2">
              <span className="text-[8.5px] font-bold px-1.5 py-0.5 rounded bg-amber-500 text-white">📋 Incident Log</span>
              <span className="text-[10.5px] font-bold text-text-primary">Downtime-based (MES)</span>
            </div>
            <div className="space-y-1 text-[10px] text-text-secondary">
              <p><span className="font-semibold text-text-primary">Availability</span> = (Planned Hours − Total Downtime) ÷ Planned Hours</p>
              <p><span className="font-semibold text-text-primary">Performance</span> = estimated from downtime ratio (no cycle-time data)</p>
              <p><span className="font-semibold text-text-primary">Quality</span> = 1 − cascade/repeat failure ratio</p>
              <p className="text-[9px] text-text-muted mt-1">Used when no CMES timestamp file has been uploaded for this line/week</p>
            </div>
          </div>
        </div>

        {/* Per-line tiles — only selected line */}
        {!transparency ? (
          <div className="flex items-center gap-2 text-[11px] text-text-muted py-6 justify-center">
            <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            Loading transparency data…
          </div>
        ) : (
          <div className="space-y-4">
            {transparency.lines.filter(l => l.line === (selectedLine || lines[0]?.line)).map((l) => {
              const isLineFile = l.oeeSource === 'line_file';
              return (
                <div key={l.line} className={`border rounded-lg overflow-hidden ${isLineFile ? 'border-primary/25' : 'border-amber-200'}`}>

                  {/* Line header — metrics summary */}
                  <div className={`flex items-center gap-4 px-4 py-3 flex-wrap ${isLineFile ? 'bg-primary/5' : 'bg-amber-50/60'}`}>
                    <span className={`text-[8.5px] font-bold px-1.5 py-0.5 rounded flex-shrink-0 ${isLineFile ? 'bg-primary text-white' : 'bg-amber-500 text-white'}`}>
                      {isLineFile ? '📊 Line File' : '📋 Incident'}
                    </span>
                    <span className="text-[13px] font-bold text-text-primary w-20 flex-shrink-0">{l.line}</span>
                    {[
                      { label: 'OEE',     val: l.oee,          color: l.oee >= 0.72 ? 'text-success' : l.oee >= 0.60 ? 'text-warning' : 'text-danger' },
                      { label: 'Avail',   val: l.availability, color: 'text-text-secondary' },
                      { label: 'Perf',    val: l.performance,  color: 'text-text-secondary' },
                      { label: 'Quality', val: l.quality,      color: 'text-text-secondary' },
                    ].map(m => (
                      <div key={m.label} className="text-center">
                        <p className="text-[8px] text-text-muted uppercase tracking-wide">{m.label}</p>
                        <p className={`text-[13px] font-bold font-mono ${m.color}`}>{formatPercent(m.val)}</p>
                      </div>
                    ))}
                    {isLineFile && (
                      <div className="text-center ml-2">
                        <p className="text-[8px] text-text-muted uppercase tracking-wide">vs Incident Est.</p>
                        <p className={`text-[11px] font-semibold font-mono ${l.oee - l.incidentOEE >= 0 ? 'text-success' : 'text-danger'}`}>
                          {l.oee - l.incidentOEE >= 0 ? '+' : ''}{((l.oee - l.incidentOEE) * 100).toFixed(1)}pp
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Station breakdown — always shown for line-file lines */}
                  {isLineFile && l.stations.length > 0 && (
                    <div className="px-4 py-3 bg-white border-t border-primary/10">
                      <p className="text-[9px] font-semibold text-text-muted uppercase tracking-wide mb-2">Station Breakdown (from CMES timestamps)</p>
                      <div className="overflow-x-auto">
                        <table className="w-full text-[10px]">
                          <thead>
                            <tr className="border-b border-border-col/40">
                              {[
                                ['STATION', false],
                                ['PRODUCED QTY', true],
                                ['SCHED HRS', true],
                                ['TACK (S)', true],
                                ['MICRO <10m', true],
                                ['MICRO HRS', true],
                                ['DOWNTIME (HR)', true],
                                ['AVAIL TIME (HR)', true],
                                ['AVAILABILITY', true],
                                ['PERFORMANCE', true],
                                ['QC PERF', true],
                                ['OEE', true],
                                ['STOPS >10m', true],
                                ['MTTR (HR)', true],
                                ['MTBF (HR)', true],
                                ['EL', true],
                              ].map(([h, r]) => (
                                <th key={String(h)} className={`pb-1.5 text-[8px] font-semibold text-text-muted uppercase tracking-wide pr-3 ${r ? 'text-right' : 'text-left'}`}>{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {l.stations.map((s) => (
                              <tr key={s.station} className="border-b border-border-col/20 hover:bg-bg-muted/30">
                                <td className="py-1.5 pr-3 font-semibold text-text-primary whitespace-nowrap">{s.station}</td>
                                <td className="py-1.5 pr-3 text-right text-text-muted font-mono">{formatNumber(s.producedQty)}</td>
                                <td className="py-1.5 pr-3 text-right text-text-muted font-mono">{s.plannedHours.toFixed(1)}h</td>
                                <td className="py-1.5 pr-3 text-right font-mono text-text-muted">{(s.tackTimeSec ?? 0).toFixed(1)}s</td>
                                <td className="py-1.5 pr-3 text-right font-mono text-text-muted">{s.microStopCount ?? 0}</td>
                                <td className="py-1.5 pr-3 text-right font-mono text-text-muted">{(s.microStopHours ?? 0).toFixed(2)}h</td>
                                <td className="py-1.5 pr-3 text-right text-danger font-mono">{s.stoppageHours.toFixed(2)}h</td>
                                <td className="py-1.5 pr-3 text-right text-text-secondary font-mono">{(s.plannedHours - s.stoppageHours).toFixed(2)}h</td>
                                <td className={`py-1.5 pr-3 text-right font-mono font-semibold ${s.availability >= 0.80 ? 'text-success' : s.availability >= 0.65 ? 'text-warning' : 'text-danger'}`}>{(s.availability * 100).toFixed(2)}%</td>
                                <td className={`py-1.5 pr-3 text-right font-mono font-semibold ${s.performance >= 0.80 ? 'text-success' : s.performance >= 0.55 ? 'text-warning' : 'text-danger'}`}>{(s.performance * 100).toFixed(2)}%</td>
                                <td className="py-1.5 pr-3 text-right font-mono text-text-secondary">{(s.quality * 100).toFixed(4)}%</td>
                                <td className={`py-1.5 pr-3 text-right font-bold font-mono ${s.oee >= 0.72 ? 'text-success' : s.oee >= 0.50 ? 'text-warning' : 'text-danger'}`}>{(s.oee * 100).toFixed(2)}%</td>
                                <td className="py-1.5 pr-3 text-right text-text-muted">{s.stoppageCount}</td>
                                <td className="py-1.5 pr-3 text-right font-mono text-text-muted">{s.mttr.toFixed(3)}</td>
                                <td className="py-1.5 pr-3 text-right font-mono text-text-muted">{s.mtbf.toFixed(3)}</td>
                                <td className="py-1.5 pr-3 text-right">
                                  <span className={`text-[8px] font-bold px-1 py-0.5 rounded ${s.elVariant === 'EL01' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>{s.elVariant}</span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot>
                            <tr className="border-t-2 border-border-col/60 bg-bg-muted/30 font-semibold">
                              <td className="py-1.5 pr-3 text-[9px] text-text-secondary uppercase">Line Total</td>
                              <td className="py-1.5 pr-3 text-right font-mono text-text-primary">{formatNumber(l.totalBoardsProduced)}</td>
                              <td className="py-1.5 pr-3 text-right font-mono text-text-muted">{(l.stations[0]?.plannedHours ?? 0).toFixed(1)}h</td>
                              <td className="py-1.5 pr-3"></td>
                              <td className="py-1.5 pr-3"></td>
                              <td className="py-1.5 pr-3"></td>
                              <td className="py-1.5 pr-3"></td>
                              <td className="py-1.5 pr-3"></td>
                              <td className={`py-1.5 pr-3 text-right font-bold font-mono ${l.availability >= 0.80 ? 'text-success' : 'text-warning'}`}>{(l.availability * 100).toFixed(2)}%</td>
                              <td className={`py-1.5 pr-3 text-right font-bold font-mono ${l.performance >= 0.80 ? 'text-success' : 'text-warning'}`}>{(l.performance * 100).toFixed(2)}%</td>
                              <td className={`py-1.5 pr-3 text-right font-bold font-mono ${l.quality >= 0.99 ? 'text-success' : 'text-warning'}`}>{(l.quality * 100).toFixed(4)}%</td>
                              <td className={`py-1.5 pr-3 text-right font-bold font-mono ${l.oee >= 0.72 ? 'text-success' : l.oee >= 0.50 ? 'text-warning' : 'text-danger'}`}>{(l.oee * 100).toFixed(2)}%</td>
                              <td className="py-1.5 pr-3"></td><td className="py-1.5 pr-3"></td><td className="py-1.5 pr-3"></td><td className="py-1.5 pr-3"></td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                      <div className="mt-2 pt-2 border-t border-border-col/20 flex flex-wrap items-center gap-4 text-[9.5px] text-text-muted">
                        <span className="font-semibold text-text-secondary">Incident-based estimate:</span>
                        <span>OEE {formatPercent(l.incidentOEE)}</span>
                        <span>Avail {formatPercent(l.incidentAvailability)}</span>
                        <span>Perf {formatPercent(l.incidentPerformance)}</span>
                        <span>Quality {formatPercent(l.incidentQuality)}</span>
                        <span className="ml-auto">{l.incidentCount} incidents · {formatHours(l.incidentDowntimeHours)} downtime</span>
                      </div>
                    </div>
                  )}

                  {/* Incident-only lines: simple derivation note */}
                  {!isLineFile && (
                    <div className="px-4 py-3 bg-amber-50/30 border-t border-amber-100">
                      <p className="text-[9px] font-semibold text-text-muted uppercase tracking-wide mb-2">Incident Log Derivation</p>
                      <div className="flex flex-wrap gap-6 text-[10px] text-text-secondary">
                        <span><span className="font-semibold text-text-primary">Incidents:</span> {l.incidentCount}</span>
                        <span><span className="font-semibold text-text-primary">Downtime:</span> {formatHours(l.incidentDowntimeHours)}</span>
                        <span><span className="font-semibold text-text-primary">Method:</span> {l.formula?.method ?? 'Incident Log'}</span>
                      </div>
                      <p className="text-[9px] text-text-muted mt-2 italic">Upload a CMES timestamp file for this line to switch to throughput-based OEE calculation.</p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

    </div>
  );
}
