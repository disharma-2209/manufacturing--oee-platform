import React from 'react';
import { cn } from '@/lib/utils';

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn('animate-skeleton rounded-sm', className)}
      style={{ background: '#DCDCD6' }}
    />
  );
}

export function KPICardSkeleton() {
  return (
    <div
      className="rounded-sm p-5 space-y-3"
      style={{ background: '#FFFFFF', border: '1px solid #DCDCD6' }}
    >
      <Skeleton className="h-2.5 w-20" />
      <Skeleton className="h-9 w-28" />
      <Skeleton className="h-1.5 w-full" />
      <div className="flex gap-2">
        <Skeleton className="h-2.5 w-14" />
        <Skeleton className="h-2.5 w-10" />
      </div>
    </div>
  );
}

export function ChartSkeleton({ height = 200 }: { height?: number }) {
  return (
    <div
      className="rounded-sm p-5"
      style={{ background: '#FFFFFF', border: '1px solid #DCDCD6' }}
    >
      <Skeleton className="h-3.5 w-28 mb-4" />
      <div
        className="rounded-sm animate-skeleton w-full"
        style={{ height, background: '#DCDCD6' }}
      />
    </div>
  );
}

export function TableRowSkeleton({ cols = 5 }: { cols?: number }) {
  return (
    <tr>
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i} className="px-4 py-3">
          <Skeleton className="h-3 w-full" />
        </td>
      ))}
    </tr>
  );
}
