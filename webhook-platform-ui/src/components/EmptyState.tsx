import { type LucideIcon, BookOpen } from 'lucide-react';
import { type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

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
