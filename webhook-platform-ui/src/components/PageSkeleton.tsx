import { type ReactNode } from 'react';

interface PageSkeletonProps {
  maxWidth?: string;
  header?: boolean;
  children?: ReactNode;
}

export default function PageSkeleton({ maxWidth = 'max-w-6xl', header = true, children }: PageSkeletonProps) {
  return (
    <div className={`p-6 lg:p-8 ${maxWidth} mx-auto space-y-6`}>
      {header && (
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <div className="h-7 w-32 bg-muted animate-pulse rounded-lg" />
            <div className="h-4 w-56 bg-muted animate-pulse rounded" />
          </div>
          <div className="h-10 w-36 bg-muted animate-pulse rounded-lg" />
        </div>
      )}
      {children ?? <div className="h-[400px] bg-muted animate-pulse rounded-xl" />}
    </div>
  );
}

export function SkeletonCards({ count = 3, height = 'h-32', cols = 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3' }: { count?: number; height?: string; cols?: string }) {
  return (
    <div className={`grid gap-4 ${cols}`}>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className={`${height} bg-muted animate-pulse rounded-xl`} />
      ))}
    </div>
  );
}

export function SkeletonRows({ count = 3, height = 'h-16' }: { count?: number; height?: string }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className={`${height} bg-muted animate-pulse rounded-xl`} />
      ))}
    </div>
  );
}

export function SkeletonTable({ rows = 5 }: { rows?: number }) {
  return (
    <div className="p-4 space-y-3">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-4">
          <div className="h-4 w-24 bg-muted animate-pulse rounded" />
          <div className="h-4 w-20 bg-muted animate-pulse rounded" />
          <div className="h-4 flex-1 bg-muted animate-pulse rounded" />
          <div className="h-4 w-16 bg-muted animate-pulse rounded" />
        </div>
      ))}
    </div>
  );
}
