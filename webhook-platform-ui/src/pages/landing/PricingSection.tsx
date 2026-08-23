import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '../../components/ui/button';
import { Reveal, Section, SectionHeader } from './primitives';

/**
 * The fork: run it yourself, or let us run it.
 *
 * Every number below is the seeded plan row in V036__billing_plans.sql, with
 * the tunnel limits from V042 and the yearly prices from V038 — the same values
 * the quota enforcement applies at runtime. The self-hosted plan really is
 * unlimited on events, projects, endpoints, members and retention, with every
 * feature flag on, so it leads rather than sitting in a table's last column.
 */

const REPO_URL = 'https://github.com/vadymkykalo/webhook-platform';

interface Plan {
  key: 'free' | 'starter' | 'pro' | 'enterprise';
  monthly: number | null;
  yearly: number | null;
  events: number | null;
  projects: number | null;
  endpoints: number | null;
  members: number | null;
  rate: number;
  retention: number;
  tunnels: number | null;
}

const PLANS: Plan[] = [
  { key: 'free', monthly: 0, yearly: null, events: 10000, projects: 3, endpoints: 5, members: 5, rate: 10, retention: 7, tunnels: 0 },
  { key: 'starter', monthly: 29, yearly: 290, events: 100000, projects: 10, endpoints: 20, members: 10, rate: 50, retention: 30, tunnels: 3 },
  { key: 'pro', monthly: 99, yearly: 990, events: 1000000, projects: 50, endpoints: 100, members: 50, rate: 200, retention: 90, tunnels: 10 },
  { key: 'enterprise', monthly: null, yearly: null, events: null, projects: null, endpoints: null, members: null, rate: 1000, retention: 365, tunnels: null },
];

const SELF_HOSTED_ROWS = ['events', 'projects', 'endpoints', 'members', 'retention'] as const;

export default function PricingSection() {
  const { t, i18n } = useTranslation();
  const nf = new Intl.NumberFormat(i18n.language);

  const amount = (value: number | null) => (value === null ? t('landing.pricing.unlimited') : nf.format(value));

  return (
    <Section id="pricing">
      <Reveal>
        <SectionHeader
          eyebrow={t('landing.pricing.eyebrow')}
          title={t('landing.pricing.title')}
          body={t('landing.pricing.body')}
        />
      </Reveal>

      <div className="mt-10 grid gap-5 md:grid-cols-2">
        <div className="flex flex-col rounded-xl border border-rail bg-card p-6 sm:p-7">
          <p className="mono-label">{t('landing.pricing.selfHostedLabel')}</p>
          <h3 className="mt-3 text-title text-foreground">{t('landing.pricing.selfHostedName')}</h3>
          <p className="mt-3 flex items-baseline gap-2">
            <span className="font-display text-3xl tracking-tight text-foreground">{t('landing.pricing.selfHostedPrice')}</span>
            <span className="font-mono text-[11.5px] text-muted-foreground">{t('landing.pricing.selfHostedPriceNote')}</span>
          </p>
          <p className="mt-4 text-[15px] leading-relaxed text-muted-foreground">{t('landing.pricing.selfHostedBody')}</p>
          <dl className="mt-5 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5 border-t border-rail pt-4 font-mono text-[11.5px]">
            {SELF_HOSTED_ROWS.map((row) => (
              <div key={row} className="contents">
                <dt className="text-muted-foreground">{t(`landing.pricing.${row}`)}</dt>
                <dd className="text-foreground">{t('landing.pricing.unlimited')}</dd>
              </div>
            ))}
            <dt className="text-muted-foreground">{t('landing.pricing.rate')}</dt>
            <dd className="text-foreground">{nf.format(10000)}</dd>
          </dl>
          <div className="mt-6 flex flex-wrap gap-2.5">
            <a href={REPO_URL} target="_blank" rel="noopener noreferrer">
              <Button>{t('landing.pricing.selfHostedCta')}</Button>
            </a>
            <a href="#quickstart">
              <Button variant="outline">{t('landing.pricing.selfHostedCtaSecondary')}</Button>
            </a>
          </div>
        </div>

        <div className="flex flex-col rounded-xl border border-rail bg-card p-6 sm:p-7">
          <p className="mono-label">{t('landing.pricing.cloudLabel')}</p>
          <h3 className="mt-3 text-title text-foreground">{t('landing.pricing.cloudName')}</h3>
          <p className="mt-3 flex items-baseline gap-2">
            <span className="font-display text-3xl tracking-tight text-foreground">$0</span>
            <span className="font-mono text-[11.5px] text-muted-foreground">{t('landing.pricing.free')}</span>
          </p>
          <p className="mt-4 text-[15px] leading-relaxed text-muted-foreground">{t('landing.pricing.cloudBody')}</p>
          <dl className="mt-5 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5 border-t border-rail pt-4 font-mono text-[11.5px]">
            <dt className="text-muted-foreground">{t('landing.pricing.events')}</dt>
            <dd className="text-foreground">{amount(PLANS[0].events)}</dd>
            <dt className="text-muted-foreground">{t('landing.pricing.projects')}</dt>
            <dd className="text-foreground">{amount(PLANS[0].projects)}</dd>
            <dt className="text-muted-foreground">{t('landing.pricing.endpoints')}</dt>
            <dd className="text-foreground">{amount(PLANS[0].endpoints)}</dd>
            <dt className="text-muted-foreground">{t('landing.pricing.members')}</dt>
            <dd className="text-foreground">{amount(PLANS[0].members)}</dd>
            <dt className="text-muted-foreground">{t('landing.pricing.rate')}</dt>
            <dd className="text-foreground">{nf.format(PLANS[0].rate)}</dd>
          </dl>
          <div className="mt-6 flex flex-wrap gap-2.5">
            <Link to="/register">
              <Button>{t('landing.pricing.cloudCta')}</Button>
            </Link>
            <a href="#plans">
              <Button variant="outline">{t('landing.pricing.cloudCtaSecondary')}</Button>
            </a>
          </div>
        </div>
      </div>

      <div id="plans" className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {PLANS.map((plan, i) => (
          <Reveal key={plan.key} delay={i * 60} className="h-full">
          <div className="group h-full rounded-lg border border-rail bg-card p-5 transition-colors duration-200 hover:border-primary/60">
            <div className="flex items-baseline justify-between gap-2">
              <h3 className="text-[15px] font-semibold text-foreground">{t(`landing.pricing.${plan.key}`)}</h3>
              <span className="font-mono text-[13px] text-foreground">
                {plan.monthly === null ? t('landing.pricing.custom') : `$${plan.monthly}${t('landing.pricing.perMonth')}`}
              </span>
            </div>
            {plan.yearly !== null && (
              <p className="mt-1 font-mono text-[11px] text-muted-foreground">
                {t('landing.pricing.yearlyNote', { price: `$${plan.yearly}` })}
              </p>
            )}
            <dl className="mt-4 space-y-1.5 border-t border-rail pt-3 font-mono text-[11.5px]">
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">{t('landing.pricing.events')}</dt>
                <dd className="text-foreground">{amount(plan.events)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">{t('landing.pricing.projects')}</dt>
                <dd className="text-foreground">{amount(plan.projects)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">{t('landing.pricing.endpoints')}</dt>
                <dd className="text-foreground">{amount(plan.endpoints)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">{t('landing.pricing.members')}</dt>
                <dd className="text-foreground">{amount(plan.members)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">{t('landing.pricing.rate')}</dt>
                <dd className="text-foreground">{nf.format(plan.rate)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">{t('landing.pricing.retention')}</dt>
                <dd className="text-foreground">{nf.format(plan.retention)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">{t('landing.pricing.tunnels')}</dt>
                <dd className="text-foreground">
                  {plan.tunnels === null
                    ? t('landing.pricing.unlimited')
                    : plan.tunnels === 0
                      ? t('landing.pricing.tunnelsNone')
                      : nf.format(plan.tunnels)}
                </dd>
              </div>
            </dl>
          </div>
          </Reveal>
        ))}
      </div>

      <p className="mt-6 max-w-3xl text-sm text-muted-foreground">{t('landing.pricing.featuresFrom')}</p>
    </Section>
  );
}
