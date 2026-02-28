import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { authApi } from '../api/auth.api';
import { Button } from '../components/ui/button';

export default function VerifyEmailPage() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token');

  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    if (!token) {
      setStatus('error');
      setErrorMessage(t('verifyEmail.noToken'));
      return;
    }

    authApi.verifyEmail(token)
      .then(() => setStatus('success'))
      .catch((err: any) => {
        setStatus('error');
        setErrorMessage(err.response?.data?.message || t('verifyEmail.failed'));
      });
  }, [token]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
      <div className="w-full max-w-md bg-card border rounded-xl shadow-sm p-8 text-center space-y-4">
        {status === 'loading' && (
          <>
            <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto" />
            <h2 className="text-xl font-semibold">{t('verifyEmail.verifying')}</h2>
            <p className="text-sm text-muted-foreground">{t('verifyEmail.pleaseWait')}</p>
          </>
        )}

        {status === 'success' && (
          <>
            <CheckCircle2 className="h-12 w-12 text-green-600 mx-auto" />
            <h2 className="text-xl font-semibold text-green-700">{t('verifyEmail.success')}</h2>
            <p className="text-sm text-muted-foreground">
              {t('verifyEmail.successDesc')}
            </p>
            <Button onClick={() => navigate('/admin/dashboard')} className="mt-4">
              {t('verifyEmail.goToDashboard')}
            </Button>
          </>
        )}

        {status === 'error' && (
          <>
            <XCircle className="h-12 w-12 text-red-500 mx-auto" />
            <h2 className="text-xl font-semibold text-red-600">{t('verifyEmail.errorTitle')}</h2>
            <p className="text-sm text-muted-foreground">{errorMessage}</p>
            <div className="flex gap-3 justify-center mt-4">
              <Link to="/login">
                <Button variant="outline">{t('verifyEmail.goToLogin')}</Button>
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
