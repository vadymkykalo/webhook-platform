import { Link } from 'react-router-dom';
import { ArrowLeft, ShieldOff } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../auth/auth.store';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';

export default function AccessDeniedPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const role = user?.role || 'VIEWER';

  return (
    <div className="min-h-[60vh] flex items-center justify-center p-6">
      <div className="text-center max-w-md">
        <div className="mx-auto h-16 w-16 rounded-2xl bg-destructive/10 flex items-center justify-center mb-6">
          <ShieldOff className="h-8 w-8 text-destructive" />
        </div>
        <h1 className="text-7xl font-bold text-foreground mb-2">403</h1>
        <h2 className="text-xl font-semibold mb-2">{t('accessDenied.title')}</h2>
        <p className="text-sm text-muted-foreground mb-4">
          {t('accessDenied.description')}
        </p>
        <Badge variant="outline" className="mb-8">
          {t('accessDenied.yourRole', { role })}
        </Badge>
        <div className="flex items-center justify-center gap-3">
          <Link to="/admin/dashboard">
            <Button>
              <ArrowLeft className="h-4 w-4" /> {t('accessDenied.backToDashboard')}
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
