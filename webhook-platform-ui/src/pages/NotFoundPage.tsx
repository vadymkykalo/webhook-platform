import { Link } from 'react-router-dom';
import { ArrowLeft, Webhook } from 'lucide-react';
import { Button } from '../components/ui/button';

export default function NotFoundPage() {
  const isLoggedIn = !!localStorage.getItem('auth_token');

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 p-6">
      <div className="text-center max-w-md">
        <div className="mx-auto h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-6">
          <Webhook className="h-8 w-8 text-primary" />
        </div>
        <h1 className="text-7xl font-bold text-foreground mb-2">404</h1>
        <h2 className="text-xl font-semibold mb-2">Page not found</h2>
        <p className="text-sm text-muted-foreground mb-8">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="flex items-center justify-center gap-3">
          <Link to={isLoggedIn ? '/admin/dashboard' : '/'}>
            <Button>
              <ArrowLeft className="h-4 w-4" /> {isLoggedIn ? 'Back to Dashboard' : 'Back to Home'}
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
