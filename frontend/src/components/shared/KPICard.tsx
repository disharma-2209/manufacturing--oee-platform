import React from 'react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';

interface KPICardProps {
  title: string;
  value: string | number;
  unit?: string;
  trend?: number;
  trendLabel?: string;
  status?: 'success' | 'warning' | 'danger' | 'neutral';
  icon?: React.ReactNode;
  loading?: boolean;
  subtitle?: string;
}

export function KPICard({ title, value, unit, trend, trendLabel, status = 'neutral', icon, loading, subtitle }: KPICardProps) {
  if (loading) {
    return (
      <div className="card p-5">
        <div className="skeleton h-4 w-24 mb-3" />
        <div className="skeleton h-10 w-32 mb-2" />
        <div className="skeleton h-3 w-20" />
      </div>
    );
  }

  const statusColors = {
    success: 'text-success',
    warning: 'text-warning',
    danger: 'text-danger',
    neutral: 'text-text-primary',
  };

  const trendColor = trend === undefined ? '' : trend > 0 ? 'text-success' : trend < 0 ? 'text-danger' : 'text-text-muted';
  const TrendIcon = trend === undefined ? null : trend > 0 ? TrendingUp : trend < 0 ? TrendingDown : Minus;

  return (
    <div className="card p-5 hover:shadow-card-hover transition-shadow">
      <div className="flex items-start justify-between mb-3">
        <p className="label-text">{title}</p>
        {icon && <div className="text-text-muted">{icon}</div>}
      </div>
      <div className="flex items-baseline gap-1.5 mb-1">
        <span className={cn('kpi-number', statusColors[status])}>{value}</span>
        {unit && <span className="text-sm text-text-muted font-medium">{unit}</span>}
      </div>
      {(trend !== undefined || subtitle) && (
        <div className="flex items-center gap-1.5">
          {trend !== undefined && TrendIcon && (
            <div className={cn('flex items-center gap-0.5 text-xs font-medium', trendColor)}>
              <TrendIcon className="w-3 h-3" />
              <span>{Math.abs(trend).toFixed(1)}%</span>
            </div>
          )}
          {trendLabel && <span className="text-xs text-text-muted">{trendLabel}</span>}
          {subtitle && !trendLabel && <span className="text-xs text-text-muted">{subtitle}</span>}
        </div>
      )}
    </div>
  );
}
