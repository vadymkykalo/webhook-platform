import { KeyRound } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { LogoMark, Reveal, Section, SectionHeader } from './primitives';

/**
 * Three groups, deliberately three different shapes.
 *
 * The marks on the left are providers Hookflow ships a verifier for — they are
 * Sources, on the incoming side. They are not customers, and they are not where
 * outgoing deliveries go: those go to endpoints a customer's own users
 * registered. Only the four providers with a real verifier in
 * WebhookVerifierFactory get a card; everything else is honestly labelled as the
 * generic HMAC path.
 */

const PROVIDERS = [
  { name: 'Stripe', src: '/logos/stripe.svg', header: 'Stripe-Signature', detailKey: 'landing.stack.stripeDetail' },
  { name: 'GitHub', src: '/logos/github.svg', header: 'X-Hub-Signature-256', detailKey: 'landing.stack.githubDetail' },
  { name: 'Slack', src: '/logos/slack.svg', header: 'X-Slack-Signature', detailKey: 'landing.stack.slackDetail' },
];

const RUNTIME = [
  { name: 'PostgreSQL', src: '/logos/postgresql.svg' },
  { name: 'Apache Kafka', src: '/logos/apachekafka.svg' },
  { name: 'Redis', src: '/logos/redis.svg' },
  { name: 'Docker', src: '/logos/docker.svg' },
  { name: 'Spring Boot', src: '/logos/springboot.svg' },
];

const CLIENTS = [
  { name: 'Node.js', src: '/logos/nodejs.svg' },
  { name: 'TypeScript', src: '/logos/typescript.svg' },
  { name: 'Python', src: '/logos/python.svg' },
  { name: 'PHP', src: '/logos/php.svg' },
];

/** Hover lifts the rail to brand teal and the mark out of its resting opacity. */
const CARD = 'group flex h-full flex-col rounded-xl border border-rail bg-card p-5 transition-colors duration-200 hover:border-primary/60';

export default function StackSection() {
  const { t } = useTranslation();

  return (
    <Section>
      <Reveal>
        <SectionHeader
          eyebrow={t('landing.stack.eyebrow')}
          title={t('landing.stack.title')}
          body={t('landing.stack.body')}
          aside={
            <div className="rounded-xl border border-rail bg-card p-5 sm:w-72">
              <p className="mono-label">{t('landing.stack.runsOnLabel')}</p>
              <ul className="mt-4 flex flex-wrap items-center gap-3">
                {RUNTIME.map((mark) => (
                  <li key={mark.name} className="group/mark" title={mark.name}>
                    <LogoMark
                      src={mark.src}
                      name={mark.name}
                      className="h-5 w-5 transition-opacity duration-200 group-hover/mark:opacity-100"
                    />
                  </li>
                ))}
              </ul>
              <p className="mt-4 text-[13px] leading-relaxed text-muted-foreground">{t('landing.stack.runsOnNote')}</p>
            </div>
          }
        />
      </Reveal>

      <p className="mono-label mt-12">{t('landing.stack.verifiedLabel')}</p>
      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {PROVIDERS.map((provider, i) => (
          <Reveal key={provider.name} delay={i * 60}>
            <div className={CARD}>
              <LogoMark
                src={provider.src}
                name={provider.name}
                className="h-7 w-7 transition-opacity duration-200 group-hover:opacity-100"
              />
              <h3 className="mt-4 text-[15px] font-semibold text-foreground">{provider.name}</h3>
              <p className="mt-1 pb-4 text-[13px] text-muted-foreground">{t(provider.detailKey)}</p>
              <p className="mt-auto truncate border-t border-rail pt-3 font-mono text-[11px] text-muted-foreground transition-colors duration-200 group-hover:text-primary">
                {provider.header}
              </p>
            </div>
          </Reveal>
        ))}
        <Reveal delay={180}>
          <div className={CARD}>
            <KeyRound className="h-7 w-7 text-muted-foreground transition-colors duration-200 group-hover:text-primary" aria-hidden="true" />
            <h3 className="mt-4 text-[15px] font-semibold text-foreground">{t('landing.stack.genericName')}</h3>
            <p className="mt-1 pb-4 text-[13px] text-muted-foreground">{t('landing.stack.genericNote')}</p>
            <p className="mt-auto truncate border-t border-rail pt-3 font-mono text-[11px] text-muted-foreground transition-colors duration-200 group-hover:text-primary">
              {t('landing.stack.genericDetail')}
            </p>
          </div>
        </Reveal>
      </div>

      <Reveal>
        <div className="mt-4 grid gap-4 border-t border-rail pt-6 sm:grid-cols-[10rem_minmax(0,1fr)] sm:gap-8">
          <p className="mono-label pt-1">{t('landing.stack.sdkLabel')}</p>
          <div>
            <ul className="flex flex-wrap items-center gap-x-7 gap-y-4">
              {CLIENTS.map((mark) => (
                <li key={mark.name} className="group/sdk flex items-center gap-2.5">
                  <LogoMark
                    src={mark.src}
                    name={mark.name}
                    className="transition-opacity duration-200 group-hover/sdk:opacity-100"
                  />
                  <span className="text-sm text-foreground">{mark.name}</span>
                </li>
              ))}
            </ul>
            <p className="mt-3 font-mono text-[11.5px] text-muted-foreground">{t('landing.stack.sdkNote')}</p>
          </div>
        </div>
      </Reveal>
    </Section>
  );
}
