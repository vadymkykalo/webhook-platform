import { Outlet } from 'react-router-dom';
import { Link } from 'react-router-dom';
import { Webhook } from 'lucide-react';
import { useTranslation } from 'react-i18next';

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
  const { t } = useTranslation();
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
              {t('footer.tagline')}
            </p>
          </div>
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">{t('footer.product')}</h3>
            <ul className="space-y-2">
              <li><a href="#features" className="text-sm text-muted-foreground hover:text-foreground transition-colors">{t('footer.features')}</a></li>
              <li><Link to="/quickstart" className="text-sm text-muted-foreground hover:text-foreground transition-colors">{t('footer.quickstart')}</Link></li>
              <li><Link to="/docs" className="text-sm text-muted-foreground hover:text-foreground transition-colors">{t('footer.documentation')}</Link></li>
            </ul>
          </div>
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">{t('footer.access')}</h3>
            <ul className="space-y-2">
              <li><Link to="/login" className="text-sm text-muted-foreground hover:text-foreground transition-colors">{t('footer.signIn')}</Link></li>
              <li><Link to="/register" className="text-sm text-muted-foreground hover:text-foreground transition-colors">{t('footer.createAccount')}</Link></li>
              <li><Link to="/admin/dashboard" className="text-sm text-muted-foreground hover:text-foreground transition-colors">{t('footer.dashboard')}</Link></li>
            </ul>
          </div>
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">{t('footer.sdks')}</h3>
            <ul className="space-y-2">
              <li><a href="https://www.npmjs.com/package/@webhook-platform/node" target="_blank" rel="noopener noreferrer" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Node.js / TypeScript</a></li>
              <li><a href="https://pypi.org/project/webhook-platform/" target="_blank" rel="noopener noreferrer" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Python</a></li>
              <li><a href="https://packagist.org/packages/webhook-platform/php" target="_blank" rel="noopener noreferrer" className="text-sm text-muted-foreground hover:text-foreground transition-colors">PHP</a></li>
            </ul>
          </div>
        </div>
        <div className="mt-10 pt-6 border-t border-border/50 flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            {t('footer.copyright', { year: new Date().getFullYear() })}
          </p>
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <a href="https://github.com/vadymkykalo/webhook-platform" target="_blank" rel="noopener noreferrer" className="hover:text-foreground transition-colors">{t('footer.github')}</a>
          </div>
        </div>
      </div>
    </footer>
  );
}
