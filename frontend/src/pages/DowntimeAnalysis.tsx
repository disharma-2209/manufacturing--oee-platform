import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { api } from '@/lib/api-client';
import { FullAnalysis, TimelineItem } from '@/types';
import { formatHours, getCategoryColor, getDayName } from '@/lib/utils';

function IBox({ icon, color, text }: { icon: React.ReactNode; color: string; text: string }) {
  return (
    <div className={`flex items-start gap-1.5 mt-2 px-2.5 py-1.5 rounded text-[10.5px] leading-relaxed ${color}`}>
      <span className="flex-shrink-0 mt-px">{icon}</span><span>{text}</span>
    </div>
  );
}

function CT({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-border-col rounded-md shadow-card-hover px-2.5 py-1.5 text-[11px]">
      <p className="font-semibold text-text-primary mb-0.5">{label}</p>
      {payload.map((p: any, i: number) => (
        <div key={i} className="flex items-center gap-1.5">
          <div className="w-1.5 h-1.5 rounded-full" style={{ background: p.color }} />
          <span className="text-text-muted">{p.name}:</span>
          <span className="font-medium">{p.value}</span>
        </div>
      ))}
    </div>
  );
}

export function DowntimeAnalysis() {
  const { data, isLoading } = useQuery<FullAnalysis>({
    queryKey: ['analysis-summary'],
    queryFn: () => api.get('/analyze/summary'),
  });
  const { data: timeline } = useQuery<TimelineItem[]>({
    queryKey: ['timeline'],
    queryFn: () => api.get('/analyze/timeline'),
    staleTime: 60000,
  });
  const [activeTab, setActiveTab] = useState<'pareto' | 'heatmap' | 'timeline' | 'team'>('pareto');

  if (data?.empty) return (
    <div className="flex items-center justify-center h-64 text-text-muted text-sm">No data available. Upload an Excel file to begin.</div>
  );

  const tabs = [
    { id: 'pareto', label: 'Pareto Analysis' },
    { id: 'heatmap', label: 'Failure Heatmap' },
    { id: 'timeline', label: 'Incident Timeline' },
    { id: 'team', label: 'Team Performance' },
  ] as const;

  const totalHours = data?.summary?.totalDowntimeHours || 1;
  const top1 = data?.pareto?.byCategory?.[0];
  const worstTeam = [...(data?.byTeam || [])].sort((a, b) => a.slaCompliance - b.slaCompliance)[0];

  return (
    <div className="space-y-3">

      {/* Header + tabs */}
      <div className="flex items-center justify-between py-0.5">
        <div>
          <h1 className="text-lg font-bold text-text-primary tracking-tight">Downtime Analysis</h1>
          <p className="text-[11px] text-text-muted">Pareto · heatmap · timeline · team SLA</p>
        </div>
        <div className="flex gap-0.5 bg-bg-muted rounded-lg p-0.5">
          {tabs.map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={`px-3 py-1.5 text-[11px] font-semibold rounded-md transition-colors ${activeTab === tab.id ? 'bg-white text-primary shadow-sm' : 'text-text-muted hover:text-text-primary'}`}>
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Pareto ── */}
      {activeTab === 'pareto' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-2.5">
          <div className="card p-3">
            <p className="text-[11px] font-bold text-text-primary mb-1">Top Failure Categories <span className="text-text-muted font-normal">(hours)</span></p>
            {isLoading ? <div className="skeleton h-48 w-full" /> : (
              <>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={data?.pareto?.byCategory || []} layout="vertical" barSize={14} margin={{ top: 2, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="2 2" stroke="#E2E6EE" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 9, fill: '#8C95A8' }} axisLine={false} tickLine={false} />
                    <YAxis type="category" dataKey="category" width={80} tick={{ fontSize: 9, fill: '#4B5675' }} axisLine={false} tickLine={false} />
                    <Tooltip content={<CT />} />
                    <Bar dataKey="hours" name="Hours" radius={[0, 2, 2, 0]}>
                      {(data?.pareto?.byCategory || []).map((e, i) => <Cell key={i} fill={getCategoryColor(e.category)} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
                {top1 && <IBox icon={<span className="text-orange-500 font-bold text-[10px]">①</span>} color="bg-orange-50 text-orange-800"
                  text={`"${top1.category}" is #1 at ${top1.hours.toFixed(1)}h (${((top1.hours / totalHours) * 100).toFixed(1)}% of total). Address this first for maximum impact.`} />}
              </>
            )}
          </div>

          <div className="card p-3">
            <p className="text-[11px] font-bold text-text-primary mb-2">Root Cause Breakdown</p>
            {isLoading ? <div className="skeleton h-48 w-full" /> : (
              <table className="w-full text-[10.5px]">
                <thead>
                  <tr className="border-b border-border-col">
                    {['Cause', 'Category', 'Hours', 'Inc', '% Total'].map(h => (
                      <th key={h} className={`pb-1.5 font-semibold text-text-muted text-[9px] uppercase tracking-wide ${h === 'Cause' ? 'text-left pr-2' : 'text-right pr-2'}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(data?.pareto?.byCause || []).slice(0, 12).map((item, i) => (
                    <tr key={i} className="border-b border-border-col/30 hover:bg-bg-muted/40">
                      <td className="py-1 pr-2 font-medium text-text-primary max-w-[140px] truncate">{item.cause}</td>
                      <td className="py-1 pr-2 text-right">
                        <span className="text-[9px] px-1.5 py-0.5 rounded-full text-white font-semibold" style={{ backgroundColor: getCategoryColor(item.category) }}>{item.category}</span>
                      </td>
                      <td className="py-1 pr-2 text-right font-mono text-text-secondary">{item.hours.toFixed(1)}</td>
                      <td className="py-1 pr-2 text-right font-mono text-text-secondary">{item.count}</td>
                      <td className="py-1 text-right font-mono text-text-muted">{((item.hours / totalHours) * 100).toFixed(1)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* ── Heatmap ── */}
      {activeTab === 'heatmap' && (
        <div className="card p-3">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[11px] font-bold text-text-primary">Failure Frequency Heatmap <span className="text-text-muted font-normal">(Day × Hour)</span></p>
            <div className="flex items-center gap-1.5 text-[10px] text-text-muted">
              <span className="w-3 h-3 rounded-sm bg-red-100 border" />Low
              <span className="w-3 h-3 rounded-sm bg-red-500 border ml-1" />High
            </div>
          </div>
          {isLoading ? <div className="skeleton h-40 w-full" /> : (
            <div className="overflow-x-auto">
              <div className="grid" style={{ gridTemplateColumns: '44px repeat(24, 1fr)', gap: 2 }}>
                <div />
                {Array.from({ length: 24 }, (_, h) => (
                  <div key={h} className="text-center text-[9px] text-text-muted pb-1">{h}</div>
                ))}
                {[0, 1, 2, 3, 4, 5, 6].map(day => (
                  <React.Fragment key={day}>
                    <div className="text-[9px] text-text-muted flex items-center">{getDayName(day)}</div>
                    {Array.from({ length: 24 }, (_, hour) => {
                      const cell = data?.heatmap?.find(h => h.day === day && h.hour === hour);
                      const count = cell?.count || 0;
                      const maxCount = Math.max(...(data?.heatmap?.map(h => h.count) || [1]));
                      const opacity = count > 0 ? 0.12 + (count / maxCount) * 0.88 : 0;
                      return (
                        <div key={hour} title={`${getDayName(day)} ${hour}:00 — ${count} incidents`}
                          className="rounded-sm h-6 cursor-default"
                          style={{ backgroundColor: count > 0 ? `rgba(220,38,38,${opacity})` : '#F1F3F7' }} />
                      );
                    })}
                  </React.Fragment>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Timeline ── */}
      {activeTab === 'timeline' && (
        <div className="card p-3">
          <p className="text-[11px] font-bold text-text-primary mb-2">Incident Timeline <span className="text-text-muted font-normal">(last 50)</span></p>
          {!timeline || timeline.length === 0 ? (
            <p className="text-[11px] text-text-muted py-4 text-center">No timeline data available.</p>
          ) : (
            <table className="w-full text-[10.5px]">
              <thead>
                <tr className="border-b border-border-col">
                  {['Time', 'Line', 'Equipment', 'Category', 'Duration', 'Team', 'Shift'].map(h => (
                    <th key={h} className="pb-1.5 text-left pr-2 font-semibold text-text-muted text-[9px] uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {timeline.slice(0, 50).map((item, i) => (
                  <tr key={i} className="border-b border-border-col/30 hover:bg-bg-muted/40">
                    <td className="py-1.5 pr-2 text-text-muted whitespace-nowrap">
                      {new Date(item.report_time).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td className="py-1.5 pr-2 font-semibold text-text-primary">{item.line}</td>
                    <td className="py-1.5 pr-2 text-text-secondary">{item.equipment}</td>
                    <td className="py-1.5 pr-2">
                      <span className="text-[9px] px-1.5 py-0.5 rounded-full text-white font-semibold" style={{ backgroundColor: getCategoryColor(item.cause_category) }}>{item.cause_category}</span>
                    </td>
                    <td className="py-1.5 pr-2 font-mono text-text-secondary">{formatHours(item.duration_hours)}</td>
                    <td className="py-1.5 pr-2 text-text-secondary">{item.team}</td>
                    <td className="py-1.5 text-text-muted">{item.shift}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ── Team Performance ── */}
      {activeTab === 'team' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-2.5">
          <div className="card p-3">
            <p className="text-[11px] font-bold text-text-primary mb-1">Response & Resolution Times <span className="text-text-muted font-normal">(min)</span></p>
            {isLoading ? <div className="skeleton h-40 w-full" /> : (
              <>
                <ResponsiveContainer width="100%" height={160}>
                  <BarChart data={data?.byTeam || []} barSize={16} margin={{ top: 4, right: 4, left: -18, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="2 2" stroke="#E2E6EE" vertical={false} />
                    <XAxis dataKey="team" tick={{ fontSize: 9, fill: '#4B5675' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 9, fill: '#8C95A8' }} tickFormatter={v => `${v.toFixed(0)}m`} axisLine={false} tickLine={false} />
                    <Tooltip content={<CT />} />
                    <Bar dataKey="avgResponseTime" name="Response (min)" fill="#2563EB" radius={[2, 2, 0, 0]} />
                    <Bar dataKey="avgResolutionTime" name="Resolution (min)" fill="#16A34A" radius={[2, 2, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
                {worstTeam && <IBox icon={<span className="text-danger font-bold text-[10px]">!</span>} color="bg-red-50 text-red-800"
                  text={`${worstTeam.team} has lowest SLA at ${worstTeam.slaCompliance.toFixed(1)}%. Review capacity and escalation thresholds.`} />}
              </>
            )}
          </div>

          <div className="card p-3">
            <p className="text-[11px] font-bold text-text-primary mb-2">Team SLA Compliance</p>
            {isLoading ? <div className="skeleton h-40 w-full" /> : (
              <table className="w-full text-[10.5px]">
                <thead>
                  <tr className="border-b border-border-col">
                    {['Team', 'Incidents', 'Avg Response', 'Avg Resolution', 'SLA'].map(h => (
                      <th key={h} className={`pb-1.5 font-semibold text-text-muted text-[9px] uppercase tracking-wide ${h === 'Team' ? 'text-left pr-2' : 'text-right pr-2'}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(data?.byTeam || []).map((team, i) => (
                    <tr key={i} className="border-b border-border-col/30 hover:bg-bg-muted/40">
                      <td className="py-1.5 pr-2 font-semibold text-text-primary">{team.team}</td>
                      <td className="py-1.5 pr-2 text-right font-mono text-text-secondary">{team.totalIncidents}</td>
                      <td className="py-1.5 pr-2 text-right font-mono text-text-secondary">{team.avgResponseTime.toFixed(1)}m</td>
                      <td className="py-1.5 pr-2 text-right font-mono text-text-secondary">{team.avgResolutionTime.toFixed(1)}m</td>
                      <td className="py-1.5 text-right">
                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${team.slaCompliance >= 90 ? 'bg-green-50 text-success' : team.slaCompliance >= 75 ? 'bg-amber-50 text-warning' : 'bg-red-50 text-danger'}`}>
                          {team.slaCompliance.toFixed(1)}%
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
