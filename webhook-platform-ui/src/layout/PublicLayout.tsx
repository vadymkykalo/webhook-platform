import { Outlet } from 'react-router-dom';
import { Link } from 'react-router-dom';
import { Webhook } from 'lucide-react';

export default function PublicLayout() {
  return (
    <div className="min-h-screen flex flex-col">
      <div className="flex-1">
        <Outlet />
      </div>
      <Footer />
    </div>
  );
}

export function Footer() {
  return (
    <footer className="border-t border-border/50 bg-muted/30">
      <div className="max-w-7xl mx-auto px-6 py-12">
        <div className="grid sm:grid-cols-2 md:grid-cols-4 gap-8">
          <div>
            <Link to="/" className="flex items-center gap-2.5 mb-4">
              <div className="h-7 w-7 rounded-md bg-primary flex items-center justify-center">
                <Webhook className="h-3.5 w-3.5 text-primary-foreground" />
              </div>
              <span className="text-sm font-bold">Hookflow</span>
            </Link>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Production-ready webhook infrastructure. Reliable delivery at any scale.
            </p>
          </div>
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Product</h3>
            <ul className="space-y-2">
              <li><a href="#features" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Features</a></li>
              <li><Link to="/quickstart" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Quickstart</Link></li>
              <li><Link to="/docs" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Documentation</Link></li>
            </ul>
          </div>
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Access</h3>
            <ul className="space-y-2">
              <li><Link to="/login" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Sign in</Link></li>
              <li><Link to="/register" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Create account</Link></li>
              <li><Link to="/admin/dashboard" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Dashboard</Link></li>
            </ul>
          </div>
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">SDKs</h3>
            <ul className="space-y-2">
              <li><a href="https://www.npmjs.com/package/@webhook-platform/node" target="_blank" rel="noopener noreferrer" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Node.js / TypeScript</a></li>
              <li><a href="https://pypi.org/project/webhook-platform/" target="_blank" rel="noopener noreferrer" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Python</a></li>
              <li><a href="https://packagist.org/packages/webhook-platform/php" target="_blank" rel="noopener noreferrer" className="text-sm text-muted-foreground hover:text-foreground transition-colors">PHP</a></li>
            </ul>
          </div>
        </div>
        <div className="mt-10 pt-6 border-t border-border/50 flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            © {new Date().getFullYear()} Hookflow. Built for production systems.
          </p>
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <a href="#" className="hover:text-foreground transition-colors">Status</a>
            <a href="#" className="hover:text-foreground transition-colors">GitHub</a>
          </div>
        </div>
      </div>
    </footer>
  );
}
