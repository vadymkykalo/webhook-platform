import type { ReactNode } from 'react';
import { cn } from '../lib/utils';

/**
 * One page header for every admin page, so the title, the count and the primary
 * action always land in the same place. The mono eyebrow carries the scope
 * (which project, which direction) — machine facts belong in the machine voice.
 */
export default function PageHeader({
  eyebrow, title, description, actions, className,
}: {
  eyebrow?: ReactNode;
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-wrap items-start justify-between gap-4 pb-5', className)}>
      <div className="min-w-0">
        {eyebrow && <div className="mono-label mb-1.5">{eyebrow}</div>}
        <h2 className="text-title">{title}</h2>
        {description && (
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {actions && <div className="flex flex-shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}
