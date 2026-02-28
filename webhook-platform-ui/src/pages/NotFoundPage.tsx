import { Link } from 'react-router-dom';
import { ArrowLeft, Webhook } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '../components/ui/button';

export default function NotFoundPage() {
  const { t } = useTranslation();
  const isLoggedIn = !!localStorage.getItem('auth_token');

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 p-6">
      <div className="text-center max-w-md">
        <div className="mx-auto h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-6">
          <Webhook className="h-8 w-8 text-primary" />
        </div>
        <h1 className="text-7xl font-bold text-foreground mb-2">404</h1>
        <h2 className="text-xl font-semibold mb-2">{t('notFound.title')}</h2>
        <p className="text-sm text-muted-foreground mb-8">
          {t('notFound.description')}
        </p>
        <div className="flex items-center justify-center gap-3">
          <Link to={isLoggedIn ? '/admin/dashboard' : '/'}>
            <Button>
              <ArrowLeft className="h-4 w-4" /> {isLoggedIn ? t('notFound.backToDashboard') : t('notFound.backToHome')}
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
