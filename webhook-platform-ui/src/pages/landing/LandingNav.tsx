import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Menu, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { HookflowIcon } from '../../components/icons/HookflowIcon';
import { Button } from '../../components/ui/button';
import ThemeToggle from '../../components/ThemeToggle';
import LanguageSwitcher from '../../components/LanguageSwitcher';
import { useAuth } from '../../auth/auth.store';

const LINKS = [
  { href: '#how-it-works', key: 'landing.nav.directions' },
  { href: '#retries', key: 'landing.nav.reliability' },
  { href: '#dashboard', key: 'landing.nav.product' },
  { href: '#quickstart', key: 'landing.nav.quickstart' },
  { href: '#pricing', key: 'landing.nav.pricing' },
] as const;

export default function LandingNav() {
  const { t } = useTranslation();
  const { isAuthenticated } = useAuth();
  const [open, setOpen] = useState(false);

  // The panel is a full-height sheet on small screens; letting the page behind
  // it scroll makes it feel detached from the tap that opened it.
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <header className="sticky top-0 z-50 border-b border-rail bg-background/85 backdrop-blur-md">
      <nav className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-5 sm:px-6">
        <div className="flex items-center gap-7">
          <Link to="/" className="flex items-center gap-2.5">
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-primary">
              <HookflowIcon className="h-3.5 w-3.5 text-primary-foreground" />
            </span>
            <span className="text-[15px] font-semibold tracking-tight">Hookflow</span>
          </Link>
          <ul className="hidden items-center gap-6 lg:flex">
            {LINKS.map((link) => (
              <li key={link.href}>
                <a
                  href={link.href}
                  className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                >
                  {t(link.key)}
                </a>
              </li>
            ))}
            <li>
              <Link to="/docs" className="text-sm text-muted-foreground transition-colors hover:text-foreground">
                {t('landing.nav.docs')}
              </Link>
            </li>
          </ul>
        </div>

        <div className="flex items-center gap-1.5">
          <div className="hidden sm:flex sm:items-center sm:gap-1.5">
            <LanguageSwitcher />
            <ThemeToggle className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground" />
          </div>
          {isAuthenticated ? (
            <Link to="/admin/dashboard" className="hidden sm:block">
              <Button size="sm">{t('landing.nav.goToDashboard')}</Button>
            </Link>
          ) : (
            <>
              <Link
                to="/login"
                className="hidden px-2 text-sm text-muted-foreground transition-colors hover:text-foreground sm:block"
              >
                {t('landing.nav.signIn')}
              </Link>
              <Link to="/register" className="hidden sm:block">
                <Button size="sm">{t('landing.nav.getStarted')}</Button>
              </Link>
            </>
          )}
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-controls="landing-mobile-nav"
            aria-label={open ? t('landing.nav.closeMenu') : t('landing.nav.openMenu')}
            className="inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground lg:hidden"
          >
            {open ? <X className="h-5 w-5" aria-hidden="true" /> : <Menu className="h-5 w-5" aria-hidden="true" />}
          </button>
        </div>
      </nav>

      {open && (
        <div id="landing-mobile-nav" className="border-t border-rail bg-background lg:hidden">
          <ul className="mx-auto flex max-w-6xl flex-col px-5 py-2 sm:px-6">
            {LINKS.map((link) => (
              <li key={link.href}>
                <a
                  href={link.href}
                  onClick={() => setOpen(false)}
                  className="block border-b border-rail py-3 text-[15px] text-foreground"
                >
                  {t(link.key)}
                </a>
              </li>
            ))}
            <li>
              <Link
                to="/docs"
                onClick={() => setOpen(false)}
                className="block border-b border-rail py-3 text-[15px] text-foreground"
              >
                {t('landing.nav.docs')}
              </Link>
            </li>
            <li className="flex flex-col gap-2.5 py-4">
              {isAuthenticated ? (
                <Link to="/admin/dashboard" onClick={() => setOpen(false)}>
                  <Button className="w-full">{t('landing.nav.goToDashboard')}</Button>
                </Link>
              ) : (
                <>
                  <Link to="/register" onClick={() => setOpen(false)}>
                    <Button className="w-full">{t('landing.nav.getStarted')}</Button>
                  </Link>
                  <Link to="/login" onClick={() => setOpen(false)}>
                    <Button variant="outline" className="w-full">
                      {t('landing.nav.signIn')}
                    </Button>
                  </Link>
                </>
              )}
              <div className="flex items-center gap-2 pt-1 sm:hidden">
                <LanguageSwitcher />
                <ThemeToggle className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground" />
              </div>
            </li>
          </ul>
        </div>
      )}
    </header>
  );
}
