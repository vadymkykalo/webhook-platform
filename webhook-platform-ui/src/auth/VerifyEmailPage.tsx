import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import { authApi } from '../api/auth.api';
import { Button } from '../components/ui/button';

export default function VerifyEmailPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token');

  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    if (!token) {
      setStatus('error');
      setErrorMessage('No verification token provided.');
      return;
    }

    authApi.verifyEmail(token)
      .then(() => setStatus('success'))
      .catch((err: any) => {
        setStatus('error');
        setErrorMessage(err.response?.data?.message || 'Verification failed. The token may be invalid or expired.');
      });
  }, [token]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
      <div className="w-full max-w-md bg-card border rounded-xl shadow-sm p-8 text-center space-y-4">
        {status === 'loading' && (
          <>
            <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto" />
            <h2 className="text-xl font-semibold">Verifying your email...</h2>
            <p className="text-sm text-muted-foreground">Please wait a moment.</p>
          </>
        )}

        {status === 'success' && (
          <>
            <CheckCircle2 className="h-12 w-12 text-green-600 mx-auto" />
            <h2 className="text-xl font-semibold text-green-700">Email Verified!</h2>
            <p className="text-sm text-muted-foreground">
              Your email has been successfully verified. You can now use all features.
            </p>
            <Button onClick={() => navigate('/admin/dashboard')} className="mt-4">
              Go to Dashboard
            </Button>
          </>
        )}

        {status === 'error' && (
          <>
            <XCircle className="h-12 w-12 text-red-500 mx-auto" />
            <h2 className="text-xl font-semibold text-red-600">Verification Failed</h2>
            <p className="text-sm text-muted-foreground">{errorMessage}</p>
            <div className="flex gap-3 justify-center mt-4">
              <Link to="/login">
                <Button variant="outline">Go to Login</Button>
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
