import { useState } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { Webhook, Loader2, ArrowLeft, CheckCircle2, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { authApi } from '../api/auth.api';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';

export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const navigate = useNavigate();

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }

    setLoading(true);

    try {
      await authApi.resetPassword(token!, password);
      setSuccess(true);
      toast.success('Password reset successfully!');
    } catch (err: any) {
      const msg = err.response?.data?.message || 'Failed to reset password. The link may have expired.';
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center px-6 py-12 bg-background">
        <div className="w-full max-w-[420px] animate-fade-in-up text-center">
          <div className="h-14 w-14 rounded-2xl bg-destructive/10 flex items-center justify-center mx-auto mb-6">
            <AlertTriangle className="h-7 w-7 text-destructive" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight mb-2">Invalid reset link</h1>
          <p className="text-muted-foreground mb-6">
            This password reset link is invalid or missing the required token.
          </p>
          <div className="flex flex-col gap-3">
            <Link to="/forgot-password">
              <Button className="w-full">Request a new link</Button>
            </Link>
            <Link to="/login">
              <Button variant="ghost" className="w-full">Back to sign in</Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-6 py-12 bg-background">
      <div className="w-full max-w-[420px] animate-fade-in-up">
        <Link
          to="/login"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-8 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to login
        </Link>

        <div className="mb-8">
          <div className="flex items-center gap-2.5 mb-6">
            <div className="h-9 w-9 rounded-lg bg-primary flex items-center justify-center">
              <Webhook className="h-4 w-4 text-primary-foreground" />
            </div>
            <span className="text-lg font-bold">Hookflow</span>
          </div>

          {success ? (
            <div className="space-y-4">
              <div className="h-14 w-14 rounded-2xl bg-success/10 flex items-center justify-center">
                <CheckCircle2 className="h-7 w-7 text-success" />
              </div>
              <h1 className="text-2xl font-bold tracking-tight">Password reset!</h1>
              <p className="text-muted-foreground">
                Your password has been successfully reset. You can now sign in with your new password.
              </p>
              <Button className="w-full" onClick={() => navigate('/login')}>
                Sign in
              </Button>
            </div>
          ) : (
            <>
              <h1 className="text-2xl font-bold tracking-tight mb-2">Set new password</h1>
              <p className="text-muted-foreground">
                Enter your new password below. It must be at least 8 characters and include uppercase, lowercase, a number, and a special character.
              </p>
            </>
          )}
        </div>

        {!success && (
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="password" className="text-sm font-medium">New password</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={loading}
                autoComplete="new-password"
                autoFocus
                className="h-11"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword" className="text-sm font-medium">Confirm password</Label>
              <Input
                id="confirmPassword"
                type="password"
                placeholder="••••••••"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                disabled={loading}
                autoComplete="new-password"
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
              {loading ? 'Resetting...' : 'Reset password'}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
