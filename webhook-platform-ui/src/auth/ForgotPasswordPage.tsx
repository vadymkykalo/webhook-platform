import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Webhook, Loader2, ArrowLeft, Mail, CheckCircle2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { authApi } from '../api/auth.api';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';

export default function ForgotPasswordPage() {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await authApi.forgotPassword(email);
      setSent(true);
    } catch (err: any) {
      if (err.response?.status === 429) {
        setError(t('auth.forgotPassword.tooMany'));
      } else {
        setError(err.response?.data?.message || t('auth.forgotPassword.genericError'));
      }
      toast.error(error || t('auth.forgotPassword.failedToast'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-6 py-12 bg-background">
      <div className="w-full max-w-[420px] animate-fade-in-up">
        <Link
          to="/login"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-8 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          {t('auth.forgotPassword.backToLogin')}
        </Link>

        <div className="mb-8">
          <div className="flex items-center gap-2.5 mb-6">
            <div className="h-9 w-9 rounded-lg bg-primary flex items-center justify-center">
              <Webhook className="h-4 w-4 text-primary-foreground" />
            </div>
            <span className="text-lg font-bold">Hookflow</span>
          </div>

          {sent ? (
            <div className="space-y-4">
              <div className="h-14 w-14 rounded-2xl bg-success/10 flex items-center justify-center">
                <CheckCircle2 className="h-7 w-7 text-success" />
              </div>
              <h1 className="text-2xl font-bold tracking-tight">{t('auth.forgotPassword.checkEmail')}</h1>
              <p className="text-muted-foreground" dangerouslySetInnerHTML={{ __html: t('auth.forgotPassword.sentMessage', { email }) }} />
              <div className="flex flex-col gap-3 pt-2">
                <Button variant="outline" onClick={() => setSent(false)}>
                  <Mail className="h-4 w-4" />
                  {t('auth.forgotPassword.tryDifferent')}
                </Button>
                <Link to="/login">
                  <Button variant="ghost" className="w-full">
                    {t('auth.forgotPassword.backToSignIn')}
                  </Button>
                </Link>
              </div>
            </div>
          ) : (
            <>
              <h1 className="text-2xl font-bold tracking-tight mb-2">{t('auth.forgotPassword.title')}</h1>
              <p className="text-muted-foreground">
                {t('auth.forgotPassword.subtitle')}
              </p>
            </>
          )}
        </div>

        {!sent && (
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-sm font-medium">{t('auth.forgotPassword.email')}</Label>
              <Input
                id="email"
                type="email"
                placeholder="name@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={loading}
                autoComplete="email"
                autoFocus
                className="h-11"
              />
            </div>

            {error && (
              <div className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-lg p-3 animate-scale-in">
                {error}
              </div>
            )}

            <Button
              type="submit"
              className="w-full h-11"
              disabled={loading}
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              {loading ? t('auth.forgotPassword.submitting') : t('auth.forgotPassword.submit')}
            </Button>
          </form>
        )}

        {!sent && (
          <p className="text-sm text-muted-foreground text-center mt-8">
            {t('auth.forgotPassword.remember')}{' '}
            <Link to="/login" className="text-primary hover:underline font-semibold">
              {t('auth.forgotPassword.signIn')}
            </Link>
          </p>
        )}
      </div>
    </div>
  );
}
