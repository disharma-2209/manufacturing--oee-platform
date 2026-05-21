import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { TrendingUp, TrendingDown, Minus, Info } from 'lucide-react';
import { api } from '@/lib/api-client';
import { FullAnalysis } from '@/types';
import { getCategoryColor } from '@/lib/utils';

function correlationColor(r: number): string {
  const abs = Math.abs(r);
  if (abs >= 0.7) return r > 0 ? '#16A34A' : '#DC2626';
  if (abs >= 0.4) return r > 0 ? '#65A30D' : '#EA580C';
  return '#C7CDD8';
}

function IBox({ icon, color, text }: { icon: React.ReactNode; color: string; text: string }) {
  return (
    <div className={`flex items-start gap-1.5 mt-2 px-2.5 py-1.5 rounded text-[10.5px] leading-relaxed ${color}`}>
      <span className="flex-shrink-0 mt-px">{icon}</span><span>{text}</span>
    </div>
  );
}

export function CorrelationEngine() {
  const { data, isLoading } = useQuery<FullAnalysis>({
    queryKey: ['analysis-summary'],
    queryFn: () => api.get('/analyze/summary'),
  });

  const corr = data?.correlation;

  if (data?.empty) return (
    <div className="flex items-center justify-center h-64 text-text-muted text-sm">No data available. Upload an Excel file first.</div>
  );

  const strongCorr = (corr?.insights || []).filter(i => Math.abs(i.correlation) >= 0.7);
  const modCorr = (corr?.insights || []).filter(i => Math.abs(i.correlation) >= 0.4 && Math.abs(i.correlation) < 0.7);

  return (
    <div className="space-y-3">

      {/* Header */}
      <div className="py-0.5">
        <h1 className="text-lg font-bold text-text-primary tracking-tight">Correlation Engine</h1>
        <p className="text-[11px] text-text-muted">Statistical relationships between OEE metrics, failures & products</p>
      </div>

      {/* Stats strip */}
      <div className="grid grid-cols-3 gap-2.5">
        {[
          { label: 'Strong Correlations', value: strongCorr.length, sub: '|r| ≥ 0.7', color: 'text-success' },
          { label: 'Moderate Correlations', value: modCorr.length, sub: '0.4 ≤ |r| < 0.7', color: 'text-warning' },
          { label: 'Product-Failure Pairs', value: data?.productCorrelation?.length || 0, sub: 'cross-category', color: 'text-primary' },
        ].map(s => (
          <div key={s.label} className="card px-3 py-2.5">
            <span className="text-[10px] font-semibold text-text-muted uppercase tracking-wider">{s.label}</span>
            <p className={`font-mono text-2xl font-bold mt-0.5 ${s.color}`}>{s.value}</p>
            <p className="text-[10px] text-text-muted">{s.sub}</p>
          </div>
        ))}
      </div>

      {/* Matrix + Insights side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-2.5">

        {/* Correlation Matrix */}
        <div className="card p-3">
          <p className="text-[11px] font-bold text-text-primary mb-0.5">Correlation Matrix</p>
          <p className="text-[10px] text-text-muted mb-2">|r| ≥ 0.7 strong · 0.4–0.7 moderate · &lt;0.4 weak</p>
          {isLoading ? <div className="skeleton h-40 w-full" /> : !corr?.labels?.length ? (
            <p className="text-[11px] text-text-muted">Not enough data for correlation analysis.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="text-[10px] border-collapse">
                <thead>
                  <tr>
                    <th className="w-24" />
                    {corr.labels.map((label, j) => (
                      <th key={j} className="px-1 py-0.5 text-center text-text-muted font-semibold whitespace-nowrap text-[9px]" style={{ minWidth: 52 }}>{label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {corr.labels.map((rowLabel, i) => (
                    <tr key={i}>
                      <td className="pr-2 py-0.5 text-right text-text-secondary font-semibold whitespace-nowrap text-[9px]">{rowLabel}</td>
                      {corr.matrix[i]?.map((val, j) => (
                        <td key={j} className="px-0.5 py-0.5 text-center" style={{ minWidth: 52 }}>
                          <div className="rounded px-1 py-0.5 font-mono font-bold text-[9.5px]"
                            style={{ backgroundColor: i === j ? '#F1F3F7' : `${correlationColor(val)}20`, color: i === j ? '#8C95A8' : correlationColor(val) }}>
                            {i === j ? '—' : val.toFixed(2)}
                          </div>
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Key Insights */}
        <div className="card p-3">
          <p className="text-[11px] font-bold text-text-primary mb-2">Key Correlation Insights</p>
          {isLoading ? (
            <div className="space-y-1.5">{[...Array(4)].map((_, i) => <div key={i} className="skeleton h-10 w-full" />)}</div>
          ) : !corr?.insights?.length ? (
            <p className="text-[11px] text-text-muted">No significant correlations found.</p>
          ) : (
            <div className="space-y-1.5">
              {corr.insights.map((ins, i) => {
                const abs = Math.abs(ins.correlation);
                const strength = abs >= 0.7 ? 'Strong' : abs >= 0.4 ? 'Moderate' : 'Weak';
                const color = correlationColor(ins.correlation);
                const Icon = ins.correlation > 0.1 ? TrendingUp : ins.correlation < -0.1 ? TrendingDown : Minus;
                return (
                  <div key={i} className="flex items-center gap-2 p-2 rounded border border-border-col/60 hover:bg-bg-muted/30 transition-colors">
                    <div className="flex-shrink-0 w-9 h-9 rounded-md flex items-center justify-center font-mono text-[10.5px] font-bold"
                      style={{ backgroundColor: `${color}15`, color }}>
                      {ins.correlation > 0 ? '+' : ''}{ins.correlation.toFixed(2)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[10.5px] font-semibold text-text-primary leading-tight">{ins.metric1} ↔ {ins.metric2}</p>
                      <p className="text-[10px] text-text-muted">
                        <span className="font-semibold" style={{ color }}>{strength}</span>
                        {ins.correlation > 0 ? ' positive' : ' negative'} · {ins.significance}
                      </p>
                    </div>
                    <Icon className="w-3.5 h-3.5 flex-shrink-0" style={{ color }} />
                  </div>
                );
              })}
            </div>
          )}
          {strongCorr.length > 0 && (
            <IBox icon={<Info className="w-3 h-3 text-blue-500" />} color="bg-blue-50 text-blue-800"
              text={`${strongCorr.length} strong correlation${strongCorr.length > 1 ? 's' : ''} detected. These represent actionable drivers — prioritize investigation here.`} />
          )}
        </div>
      </div>

      {/* Product-Category table */}
      {(data?.productCorrelation?.length ?? 0) > 0 && (
        <div className="card p-3">
          <p className="text-[11px] font-bold text-text-primary mb-2">Product Type vs Failure Category</p>
          <table className="w-full text-[10.5px]">
            <thead>
              <tr className="border-b border-border-col">
                {['Product', 'Failure Category', 'Downtime (h)', 'Incidents'].map(h => (
                  <th key={h} className={`pb-1.5 font-semibold text-text-muted text-[9px] uppercase tracking-wide ${h === 'Product' || h === 'Failure Category' ? 'text-left pr-3' : 'text-right pr-2'}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data!.productCorrelation.slice(0, 15).map((row, i) => (
                <tr key={i} className="border-b border-border-col/30 hover:bg-bg-muted/40">
                  <td className="py-1.5 pr-3 font-semibold text-text-primary">{row.product}</td>
                  <td className="py-1.5 pr-3">
                    <span className="text-[9px] px-1.5 py-0.5 rounded-full text-white font-semibold" style={{ backgroundColor: getCategoryColor(row.category) }}>{row.category}</span>
                  </td>
                  <td className="py-1.5 pr-2 text-right font-mono text-danger font-semibold">{row.hours.toFixed(1)}</td>
                  <td className="py-1.5 text-right font-mono text-text-secondary">{row.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

    </div>
  );
}
