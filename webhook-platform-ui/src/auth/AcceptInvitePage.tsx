import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { CheckCircle2, XCircle, Loader2, AlertTriangle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { membersApi } from '../api/members.api';
import { Button } from '../components/ui/button';
import { useAuth } from './auth.store';

export default function AcceptInvitePage() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const token = searchParams.get('token');
  const orgId = searchParams.get('orgId');

  const [status, setStatus] = useState<'loading' | 'success' | 'error' | 'needsLogin'>('loading');
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    if (!token || !orgId) {
      setStatus('error');
      setErrorMessage(t('invite.noToken'));
      return;
    }

    if (!isAuthenticated) {
      setStatus('needsLogin');
      return;
    }

    membersApi.acceptInvite(orgId, token)
      .then(() => setStatus('success'))
      .catch((err: any) => {
        setStatus('error');
        setErrorMessage(err.response?.data?.message || t('invite.failed'));
      });
  }, [token, orgId, isAuthenticated]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
      <div className="w-full max-w-md bg-card border rounded-xl shadow-sm p-8 text-center space-y-4">
        {status === 'loading' && (
          <>
            <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto" />
            <h2 className="text-xl font-semibold">{t('invite.accepting')}</h2>
            <p className="text-sm text-muted-foreground">{t('invite.pleaseWait')}</p>
          </>
        )}

        {status === 'needsLogin' && (
          <>
            <AlertTriangle className="h-12 w-12 text-amber-500 mx-auto" />
            <h2 className="text-xl font-semibold">{t('invite.loginRequired')}</h2>
            <p className="text-sm text-muted-foreground">
              {t('invite.loginRequiredDesc')}
            </p>
            <div className="flex flex-col gap-2 mt-4">
              <Link to={`/login?redirect=${encodeURIComponent(window.location.pathname + window.location.search)}`}>
                <Button className="w-full">{t('invite.goToLogin')}</Button>
              </Link>
              <Link to={`/register?redirect=${encodeURIComponent(window.location.pathname + window.location.search)}`}>
                <Button variant="outline" className="w-full">{t('invite.goToRegister')}</Button>
              </Link>
            </div>
            <p className="text-xs text-muted-foreground mt-2">{t('invite.newUserHint')}</p>
          </>
        )}

        {status === 'success' && (
          <>
            <CheckCircle2 className="h-12 w-12 text-green-600 mx-auto" />
            <h2 className="text-xl font-semibold text-green-700">{t('invite.success')}</h2>
            <p className="text-sm text-muted-foreground">
              {t('invite.successDesc')}
            </p>
            <Button onClick={() => navigate('/admin/dashboard')} className="mt-4">
              {t('invite.goToDashboard')}
            </Button>
          </>
        )}

        {status === 'error' && (
          <>
            <XCircle className="h-12 w-12 text-red-500 mx-auto" />
            <h2 className="text-xl font-semibold text-red-600">{t('invite.errorTitle')}</h2>
            <p className="text-sm text-muted-foreground">{errorMessage}</p>
            <div className="flex gap-3 justify-center mt-4">
              <Link to="/login">
                <Button variant="outline">{t('invite.goToLogin')}</Button>
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
