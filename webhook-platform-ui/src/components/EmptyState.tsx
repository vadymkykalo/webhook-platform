import { type LucideIcon, BookOpen, AlertTriangle, RefreshCw } from 'lucide-react';
import { type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { resolveErrorMessage } from '../lib/toast';
import { Button } from './ui/button';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
  docsLink?: string;
  className?: string;
}

export default function EmptyState({ icon: Icon, title, description, action, docsLink, className }: EmptyStateProps) {
  const { t } = useTranslation();
  return (
    <div className={className ?? 'flex flex-col items-center justify-center py-20 border border-dashed rounded-xl'}>
      <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-6">
        <Icon className="h-8 w-8 text-primary" />
      </div>
      <h3 className="text-lg font-semibold mb-2">{title}</h3>
      {description && (
        <p className="text-sm text-muted-foreground text-center mb-6 max-w-sm">{description}</p>
      )}
      {action && <div className="mb-3">{action}</div>}
      {docsLink && (
        <Link to={docsLink} className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
          <BookOpen className="h-3.5 w-3.5" />
          {t('common.learnMore')}
        </Link>
      )}
    </div>
  );
}

interface ErrorStateProps {
  /** The caught error, if any — used to derive a specific, human-readable cause. */
  error?: unknown;
  /** i18n key used as a last-resort message when the error carries no server message. */
  fallbackKey?: string;
  /** Overrides the derived message entirely (skips resolveErrorMessage). */
  description?: string;
  title?: string;
  /** Refetch/retry callback. Renders a "Retry" button when provided. */
  onRetry?: () => void;
  /** True while a retry is in flight — disables the button and shows a spinner. */
  retrying?: boolean;
  className?: string;
  testId?: string;
}

/**
 * The "something is wrong, here's why, here's how to recover" state.
 * Distinct from EmptyState (which means "this loaded fine and there's just
 * nothing here yet") — never render EmptyState when a request actually failed,
 * or a down backend looks identical to an empty account.
 */
export function ErrorState({
  error,
  fallbackKey = 'common.error',
  description,
  title,
  onRetry,
  retrying = false,
  className,
  testId = 'error-state',
}: ErrorStateProps) {
  const { t } = useTranslation();
  const resolvedDescription = description ?? (error !== undefined ? resolveErrorMessage(error, fallbackKey) : t(fallbackKey));

  return (
    <div
      data-testid={testId}
      role="alert"
      className={className ?? 'flex flex-col items-center justify-center py-20 border border-dashed border-destructive/30 rounded-xl'}
    >
      <div className="h-16 w-16 rounded-2xl bg-destructive/10 flex items-center justify-center mb-6">
        <AlertTriangle className="h-8 w-8 text-destructive" />
      </div>
      <h3 className="text-lg font-semibold mb-2">{title ?? t('common.loadErrorTitle')}</h3>
      <p className="text-sm text-muted-foreground text-center mb-6 max-w-sm">{resolvedDescription}</p>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry} disabled={retrying}>
          <RefreshCw className={`h-3.5 w-3.5 ${retrying ? 'animate-spin' : ''}`} />
          {retrying ? t('common.retrying') : t('common.retry')}
        </Button>
      )}
    </div>
  );
}
