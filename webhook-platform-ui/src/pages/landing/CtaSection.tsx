import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../components/ui/button';
import { Reveal, Section } from './primitives';
import { useAuth } from '../../auth/auth.store';

const REPO_URL = 'https://github.com/vadymkykalo/webhook-platform';

export default function CtaSection() {
  const { t } = useTranslation();
  const { isAuthenticated } = useAuth();

  return (
    <Section>
      <Reveal className="max-w-2xl">
        <h2 className="font-display text-3xl leading-[1.1] tracking-tight text-foreground sm:text-headline">
          {t('landing.cta.title')}
        </h2>
        <p className="mt-4 text-body-lg text-muted-foreground">{t('landing.cta.body')}</p>
        <div className="mt-7 flex flex-col gap-3 sm:flex-row">
          <a href={REPO_URL} target="_blank" rel="noopener noreferrer">
            <Button size="lg" className="w-full sm:w-auto">
              {t('landing.cta.primary')} <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Button>
          </a>
          <Link to={isAuthenticated ? '/admin/dashboard' : '/register'}>
            <Button size="lg" variant="outline" className="w-full sm:w-auto">
              {isAuthenticated ? t('landing.nav.goToDashboard') : t('landing.cta.secondary')}
            </Button>
          </Link>
        </div>
        <p className="mt-6 font-mono text-[11.5px] text-muted-foreground">{t('landing.cta.note')}</p>
      </Reveal>
    </Section>
  );
}
