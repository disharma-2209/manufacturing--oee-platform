import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatPercent(value: number, decimals = 1): string {
  return `${(value * 100).toFixed(decimals)}%`;
}

export function formatHours(hours: number, decimals = 1): string {
  if (hours < 1) return `${(hours * 60).toFixed(0)}m`;
  return `${hours.toFixed(decimals)}h`;
}

export function formatNumber(n: number, decimals = 0): string {
  return n.toFixed(decimals).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

export function getOEEColor(oee: number): string {
  if (oee >= 0.82) return '#16A34A';
  if (oee >= 0.75) return '#D97706';
  return '#DC2626';
}

export function getHealthColor(score: number): string {
  if (score >= 75) return '#16A34A';
  if (score >= 50) return '#D97706';
  return '#DC2626';
}

export function getPriorityLabel(priority: number): string {
  const labels: Record<number, string> = {
    1: 'Critical',
    2: 'High',
    3: 'Medium',
    4: 'Low',
    5: 'Info',
  };
  return labels[priority] || 'Medium';
}

export function getPriorityColor(priority: number): string {
  const colors: Record<number, string> = {
    1: '#DC2626',
    2: '#D97706',
    3: '#2563EB',
    4: '#8C95A8',
    5: '#0891B2',
  };
  return colors[priority] || '#8C95A8';
}

export function getStatusColor(status: string): string {
  const colors: Record<string, string> = {
    'Open': '#2563EB',
    'In Progress': '#D97706',
    'Completed': '#16A34A',
    'Overdue': '#DC2626',
    'Cancelled': '#8C95A8',
  };
  return colors[status] || '#8C95A8';
}

export const CHART_COLORS = [
  '#2563EB', '#16A34A', '#D97706', '#DC2626', '#0891B2',
  '#7C3AED', '#DB2777', '#059669', '#EA580C', '#65A30D',
];

export const CAUSE_CATEGORY_COLORS: Record<string, string> = {
  SMT: '#2563EB',
  GT: '#16A34A',
  'Wave Solder': '#D97706',
  API: '#DC2626',
  FT: '#0891B2',
  ICT: '#7C3AED',
  Carousel: '#DB2777',
  Wave3: '#059669',
  QLY: '#EA580C',
  Changeover: '#65A30D',
  'Lead Height': '#F59E0B',
  'Lack of material': '#6366F1',
  HT: '#EC4899',
  Potting: '#14B8A6',
  Depanel: '#F97316',
  USW: '#8B5CF6',
  'PCB Linking': '#06B6D4',
};

export function getCategoryColor(category: string): string {
  return CAUSE_CATEGORY_COLORS[category] || CHART_COLORS[Math.abs(hashCode(category)) % CHART_COLORS.length];
}

function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return hash;
}

export function formatDateTime(iso: string): string {
  if (!iso) return '-';
  return new Date(iso).toLocaleString('en-US', {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

export function formatDate(iso: string): string {
  if (!iso) return '-';
  return new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric',
  });
}

export function getDayName(day: number): string {
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][day] || '';
}

export function tryParseJSON<T>(str: string, fallback: T): T {
  try {
    return JSON.parse(str) as T;
  } catch {
    return fallback;
  }
}
