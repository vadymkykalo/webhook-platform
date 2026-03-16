import { useState, useEffect } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { CheckCircle2, XCircle, Loader2, Terminal, AlertTriangle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { HookflowIcon } from '../components/icons/HookflowIcon';
import { showApiError, showSuccess } from '../lib/toast';
import { http } from '../api/http';
import { useAuth } from './auth.store';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';

export default function DeviceApprovePage() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const { isAuthenticated } = useAuth();

  const codeFromUrl = searchParams.get('code') || '';
  const [userCode, setUserCode] = useState(codeFromUrl);
  const [status, setStatus] = useState<'input' | 'confirming' | 'loading' | 'success' | 'error' | 'needsLogin'>('input');
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    if (!isAuthenticated) {
      setStatus('needsLogin');
    } else if (codeFromUrl) {
      setUserCode(codeFromUrl);
      setStatus('confirming');
    }
  }, [isAuthenticated, codeFromUrl]);

  const handleSubmitCode = (e: React.FormEvent) => {
    e.preventDefault();
    if (!userCode.trim()) return;
    setStatus('confirming');
  };

  const handleApprove = async () => {
    setStatus('loading');
    try {
      await http.post('/api/v1/auth/device/approve', { userCode: userCode.trim().toUpperCase() });
      setStatus('success');
      showSuccess(t('auth.device.approved'));
    } catch (err: any) {
      const msg = err.response?.data?.message || t('auth.device.failed');
      setErrorMessage(msg);
      setStatus('error');
      showApiError(err, 'auth.device.failed');
    }
  };

  const handleReset = () => {
    setUserCode('');
    setErrorMessage('');
    setStatus('input');
  };

  const formatCode = (code: string) => {
    const clean = code.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
    if (clean.length > 4) {
      return clean.slice(0, 4) + '-' + clean.slice(4, 8);
    }
    return clean;
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
      <div className="w-full max-w-md bg-card border rounded-xl shadow-sm p-8 text-center space-y-5">
        <div className="flex items-center justify-center gap-2.5 mb-2">
          <div className="h-9 w-9 rounded-lg bg-primary flex items-center justify-center">
            <HookflowIcon className="h-4 w-4 text-primary-foreground" />
          </div>
          <span className="text-lg font-bold">Hookflow</span>
        </div>

        {status === 'needsLogin' && (
          <>
            <AlertTriangle className="h-12 w-12 text-amber-500 mx-auto" />
            <h2 className="text-xl font-semibold">{t('auth.device.loginRequired')}</h2>
            <p className="text-sm text-muted-foreground">{t('auth.device.loginRequiredDesc')}</p>
            <Link to={`/login?redirect=${encodeURIComponent(window.location.pathname + window.location.search)}`}>
              <Button className="w-full mt-2">{t('auth.device.goToLogin')}</Button>
            </Link>
          </>
        )}

        {status === 'input' && (
          <>
            <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
              <Terminal className="h-6 w-6 text-primary" />
            </div>
            <h2 className="text-xl font-semibold">{t('auth.device.title')}</h2>
            <p className="text-sm text-muted-foreground">{t('auth.device.subtitle')}</p>

            <form onSubmit={handleSubmitCode} className="space-y-4 text-left">
              <div className="space-y-2">
                <Label htmlFor="userCode" className="text-sm font-medium">{t('auth.device.codeLabel')}</Label>
                <Input
                  id="userCode"
                  type="text"
                  placeholder="XXXX-XXXX"
                  value={formatCode(userCode)}
                  onChange={(e) => setUserCode(e.target.value.replace(/[^A-Za-z0-9-]/g, ''))}
                  maxLength={9}
                  className="h-12 text-center text-xl font-mono tracking-widest"
                  autoFocus
                  autoComplete="off"
                />
              </div>
              <Button type="submit" className="w-full h-11" disabled={userCode.replace(/[^A-Za-z0-9]/g, '').length < 8}>
                {t('auth.device.continue')}
              </Button>
            </form>
          </>
        )}

        {status === 'confirming' && (
          <>
            <div className="h-12 w-12 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center mx-auto">
              <Terminal className="h-6 w-6 text-amber-600 dark:text-amber-400" />
            </div>
            <h2 className="text-xl font-semibold">{t('auth.device.confirmTitle')}</h2>
            <p className="text-sm text-muted-foreground">{t('auth.device.confirmDesc')}</p>

            <div className="bg-muted rounded-lg p-4">
              <p className="text-2xl font-mono font-bold tracking-widest">{formatCode(userCode)}</p>
            </div>

            <p className="text-xs text-muted-foreground">{t('auth.device.confirmWarning')}</p>

            <div className="flex gap-3">
              <Button variant="outline" onClick={handleReset} className="flex-1">
                {t('common.cancel')}
              </Button>
              <Button onClick={handleApprove} className="flex-1">
                {t('auth.device.approve')}
              </Button>
            </div>
          </>
        )}

        {status === 'loading' && (
          <>
            <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto" />
            <h2 className="text-xl font-semibold">{t('auth.device.approving')}</h2>
          </>
        )}

        {status === 'success' && (
          <>
            <CheckCircle2 className="h-12 w-12 text-green-600 mx-auto" />
            <h2 className="text-xl font-semibold text-green-700 dark:text-green-400">{t('auth.device.successTitle')}</h2>
            <p className="text-sm text-muted-foreground">{t('auth.device.successDesc')}</p>
            <p className="text-xs text-muted-foreground">{t('auth.device.successHint')}</p>
          </>
        )}

        {status === 'error' && (
          <>
            <XCircle className="h-12 w-12 text-red-500 mx-auto" />
            <h2 className="text-xl font-semibold text-red-600 dark:text-red-400">{t('auth.device.errorTitle')}</h2>
            <p className="text-sm text-muted-foreground">{errorMessage}</p>
            <Button variant="outline" onClick={handleReset}>
              {t('auth.device.tryAgain')}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
