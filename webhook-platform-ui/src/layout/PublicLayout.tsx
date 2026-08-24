import { Link, Outlet } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { HookflowIcon } from '../components/icons/HookflowIcon';
import { RailRule } from '../pages/landing/primitives';
import LandingNav from '../pages/landing/LandingNav';
import { REPO_URL } from '../pages/landing/plans';

const API_REFERENCE_URL = 'https://vadymkykalo.github.io/webhook-platform/';

/**
 * The chrome every public page shares.
 *
 * `nav` is opt-in because the documentation brings its own: a full-height
 * sidebar with a sticky bar of its own on small screens, which a second sticky
 * header would sit on top of. The footer is not opt-in — /docs used to render
 * outside this layout entirely, so the deepest page in the funnel was the one
 * page with no link back to pricing, the repository or a signup.
 */
export default function PublicLayout({ nav = true }: { nav?: boolean }) {
  return (
    <div className="flex min-h-screen flex-col">
      {nav && <LandingNav />}
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
              <FooterLink to="/#capabilities">{t('footer.capabilities')}</FooterLink>
              <FooterLink to="/#how-it-works">{t('footer.directions')}</FooterLink>
              <FooterLink to="/#security">{t('footer.security')}</FooterLink>
              <FooterLink to="/pricing">{t('footer.pricing')}</FooterLink>
              <FooterLink to="/docs">{t('footer.documentation')}</FooterLink>
            </ul>
          </div>
          <div>
            <h2 className="mono-label mb-3">{t('footer.access')}</h2>
            <ul className="space-y-2">
              <FooterLink to="/register">{t('footer.createAccount')}</FooterLink>
              <FooterLink to="/login">{t('footer.signIn')}</FooterLink>
              <FooterLink to="/admin/dashboard">{t('footer.dashboard')}</FooterLink>
              <FooterLink to="/contact">{t('footer.contact')}</FooterLink>
              <FooterLink to="/#faq">{t('footer.faq')}</FooterLink>
            </ul>
          </div>
          <div>
            <h2 className="mono-label mb-3">{t('footer.selfHost')}</h2>
            <ul className="space-y-2">
              <FooterExternal href={REPO_URL}>{t('footer.sourceCode')}</FooterExternal>
              <FooterExternal href={API_REFERENCE_URL}>{t('footer.apiReference')}</FooterExternal>
              <FooterExternal href="https://www.npmjs.com/package/@webhook-platform/node">Node.js SDK</FooterExternal>
              <FooterExternal href="https://pypi.org/project/webhook-platform/">Python SDK</FooterExternal>
              <FooterExternal href="https://packagist.org/packages/webhook-platform/php">PHP SDK</FooterExternal>
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
