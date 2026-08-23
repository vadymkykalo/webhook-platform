import { Link, Outlet } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { HookflowIcon } from '../components/icons/HookflowIcon';
import { RailRule } from '../pages/landing/primitives';

const REPO_URL = 'https://github.com/vadymkykalo/webhook-platform';
const API_REFERENCE_URL = 'https://vadymkykalo.github.io/webhook-platform/';

export default function PublicLayout() {
  return (
    <div className="flex min-h-screen flex-col">
      <div className="flex-1">
        <Outlet />
      </div>
      <Footer />
    </div>
  );
}

function FooterLink({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <li>
      <Link to={to} className="text-sm text-muted-foreground transition-colors hover:text-foreground">
        {children}
      </Link>
    </li>
  );
}

function FooterExternal({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <li>
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        {children}
      </a>
    </li>
  );
}

export function Footer() {
  const { t } = useTranslation();
  return (
    <footer>
      <RailRule />
      <div className="mx-auto max-w-6xl px-5 py-12 sm:px-6">
        <div className="grid gap-10 sm:grid-cols-2 md:grid-cols-4">
          <div>
            <Link to="/" className="mb-4 flex items-center gap-2.5">
              <span className="flex h-7 w-7 items-center justify-center rounded-md bg-primary">
                <HookflowIcon className="h-3.5 w-3.5 text-primary-foreground" />
              </span>
              <span className="text-sm font-semibold">Hookflow</span>
            </Link>
            <p className="max-w-xs text-xs leading-relaxed text-muted-foreground">{t('footer.tagline')}</p>
          </div>
          <div>
            <h2 className="mono-label mb-3">{t('footer.product')}</h2>
            <ul className="space-y-2">
              <li>
                <a href="/#how-it-works" className="text-sm text-muted-foreground transition-colors hover:text-foreground">
                  {t('landing.nav.directions')}
                </a>
              </li>
              <li>
                <a href="/#retries" className="text-sm text-muted-foreground transition-colors hover:text-foreground">
                  {t('footer.retries')}
                </a>
              </li>
              <li>
                <a href="/#quickstart" className="text-sm text-muted-foreground transition-colors hover:text-foreground">
                  {t('footer.quickstart')}
                </a>
              </li>
              <FooterLink to="/docs">{t('footer.documentation')}</FooterLink>
            </ul>
          </div>
          <div>
            <h2 className="mono-label mb-3">{t('footer.access')}</h2>
            <ul className="space-y-2">
              <FooterLink to="/login">{t('footer.signIn')}</FooterLink>
              <FooterLink to="/register">{t('footer.createAccount')}</FooterLink>
              <FooterLink to="/admin/dashboard">{t('footer.dashboard')}</FooterLink>
            </ul>
          </div>
          <div>
            <h2 className="mono-label mb-3">{t('footer.selfHost')}</h2>
            <ul className="space-y-2">
              <FooterExternal href={REPO_URL}>{t('footer.sourceCode')}</FooterExternal>
              <FooterExternal href={API_REFERENCE_URL}>{t('footer.apiReference')}</FooterExternal>
              <FooterExternal href="https://www.npmjs.com/package/@hookflow/node">Node.js SDK</FooterExternal>
              <FooterExternal href="https://pypi.org/project/hookflow-sdk/">Python SDK</FooterExternal>
              <FooterExternal href="https://packagist.org/packages/hookflow/php">PHP SDK</FooterExternal>
            </ul>
          </div>
        </div>
        <div className="mt-10 flex flex-col items-start justify-between gap-3 border-t border-rail pt-6 sm:flex-row sm:items-center">
          <p className="font-mono text-[11px] text-muted-foreground">
            {t('footer.copyright', { year: new Date().getFullYear() })}
          </p>
          <a
            href={REPO_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="font-mono text-[11px] text-muted-foreground transition-colors hover:text-foreground"
          >
            {t('footer.github')}
          </a>
        </div>
      </div>
    </footer>
  );
}
