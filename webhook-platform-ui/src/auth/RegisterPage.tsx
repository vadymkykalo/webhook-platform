import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Webhook, Loader2, ArrowLeft, CheckCircle2, Mail } from 'lucide-react';
import { toast } from 'sonner';
import { authApi } from '../api/auth.api';
import { http } from '../api/http';
import { useAuth } from './auth.store';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';

export default function RegisterPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [organizationName, setOrganizationName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [registered, setRegistered] = useState(false);
  const [resending, setResending] = useState(false);
  const navigate = useNavigate();
  const { login } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const authResponse = await authApi.register({
        email,
        password,
        fullName,
        organizationName,
      });
      http.setToken(authResponse.accessToken);
      http.setRefreshToken(authResponse.refreshToken);
      const user = await authApi.getCurrentUser();
      login(authResponse.accessToken, authResponse.refreshToken, user);
      toast.success('Account created! Please verify your email.');
      setRegistered(true);
    } catch (err: any) {
      const errorMessage = err.response?.data?.message || 'Registration failed. Please try again.';
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setResending(true);
    try {
      await authApi.resendVerification(email);
      toast.success('Verification email sent!');
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to resend verification email');
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="min-h-screen flex">
      {/* Left panel - branding */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-primary via-primary/90 to-purple-700 relative overflow-hidden">
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmYiIGZpbGwtb3BhY2l0eT0iMC4wNCI+PHBhdGggZD0iTTM2IDM0djZoLTZWMzRoNnptMC0zMHY2aC02VjRoNnptMCAyNHY2aC02di02aDZ6bTAgLTEydjZoLTZ2LTZoNnptLTI0IDI0djZIMnYtNmg2em0wLTMwdjZIMlY0aDZ6bTAgMjR2Nkgydi02aDZ6bTAtMTJ2Nkgydi02aDZ6bTEyIDEydjZoLTZ2LTZoNnptMC0zMHY2aC02VjRoNnptMCAyNHY2aC02di02aDZ6bTAtMTJ2NmgtNnYtNmg2eiIvPjwvZz48L2c+PC9zdmc+')] opacity-50" />
        <div className="relative z-10 flex flex-col justify-between p-12 text-white">
          <Link to="/" className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center">
              <Webhook className="h-5 w-5 text-white" />
            </div>
            <span className="text-xl font-bold">Hookflow</span>
          </Link>

          <div className="space-y-8">
            <div>
              <h2 className="text-4xl font-bold leading-tight mb-4">
                Start delivering<br />webhooks in minutes
              </h2>
              <p className="text-white/70 text-lg max-w-md">
                Create your account and send your first webhook event in under 5 minutes.
              </p>
            </div>
            <div className="space-y-3">
              {[
                'Free to start — no credit card required',
                'Unlimited endpoints during trial',
                'Full API access from day one',
                'Automatic retries with exponential backoff',
              ].map((text) => (
                <div key={text} className="flex items-center gap-3 text-white/80">
                  <CheckCircle2 className="h-4 w-4 text-green-300 flex-shrink-0" />
                  <span className="text-sm">{text}</span>
                </div>
              ))}
            </div>
          </div>

          <p className="text-white/40 text-sm">
            © {new Date().getFullYear()} Hookflow. Built for production systems.
          </p>
        </div>
      </div>

      {/* Right panel - form */}
      <div className="flex-1 flex items-center justify-center px-6 py-12 bg-background">
        <div className="w-full max-w-[420px] animate-fade-in-up">

          {registered ? (
            <div className="text-center space-y-6">
              <div className="mx-auto h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
                <Mail className="h-8 w-8 text-primary" />
              </div>
              <div>
                <h1 className="text-2xl font-bold tracking-tight mb-2">Check your email</h1>
                <p className="text-muted-foreground">
                  We've sent a verification link to <strong>{email}</strong>.
                  Click it to activate your account.
                </p>
              </div>
              <div className="space-y-3">
                <Button onClick={() => navigate('/dashboard')} className="w-full">
                  Continue to Dashboard
                </Button>
                <Button
                  variant="outline"
                  onClick={handleResend}
                  disabled={resending}
                  className="w-full"
                >
                  {resending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                  {resending ? 'Sending...' : 'Resend verification email'}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Didn't receive it? Check your spam folder or click resend above.
              </p>
            </div>
          ) : (
          <>
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-8 transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to home
          </Link>

          <div className="mb-8">
            <div className="lg:hidden flex items-center gap-2.5 mb-6">
              <div className="h-9 w-9 rounded-lg bg-primary flex items-center justify-center">
                <Webhook className="h-4 w-4 text-primary-foreground" />
              </div>
              <span className="text-lg font-bold">Hookflow</span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight mb-2">Create your account</h1>
            <p className="text-muted-foreground">
              Get started with your webhook infrastructure
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="fullName" className="text-sm font-medium">Full name</Label>
                <Input
                  id="fullName"
                  type="text"
                  placeholder="John Doe"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  required
                  disabled={loading}
                  autoComplete="name"
                  className="h-11"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="organizationName" className="text-sm font-medium">Organization</Label>
                <Input
                  id="organizationName"
                  type="text"
                  placeholder="Acme Inc."
                  value={organizationName}
                  onChange={(e) => setOrganizationName(e.target.value)}
                  required
                  disabled={loading}
                  autoComplete="organization"
                  className="h-11"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="email" className="text-sm font-medium">Email address</Label>
              <Input
                id="email"
                type="email"
                placeholder="name@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={loading}
                autoComplete="email"
                className="h-11"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password" className="text-sm font-medium">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="Min. 8 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
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
              {loading ? 'Creating account...' : 'Create account'}
            </Button>
          </form>

          <p className="text-xs text-muted-foreground text-center mt-6">
            By creating an account, you agree to our Terms of Service and Privacy Policy.
          </p>

          <p className="text-sm text-muted-foreground text-center mt-4">
            Already have an account?{' '}
            <Link to="/login" className="text-primary hover:underline font-semibold">
              Sign in
            </Link>
          </p>
          </>
          )}
        </div>
      </div>
    </div>
  );
}
