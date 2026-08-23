import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { DefinitionList, DocsArticle, DocsTitle, Section } from '../primitives';

/**
 * The one page that has to agree with CONTEXT.md word for word: it is where a
 * reader learns which noun means what, and a synonym introduced here spreads
 * through every other page.
 */
export default function Overview() {
  const { t } = useTranslation();

  return (
    <DocsArticle>
      <DocsTitle title={t('docsPage.overview.title')} lede={t('docsPage.overview.subtitle')} />

      <Section title={t('docsPage.overview.whatIs')} description={t('docsPage.overview.whatIsDesc1')}>
        <p className="max-w-2xl leading-relaxed text-muted-foreground">{t('docsPage.overview.whatIsDesc2')}</p>
      </Section>

      <Section title={t('docsPage.overview.directions')}>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-lg border border-rail bg-card p-4">
            <div className="mono-label mb-1.5">{t('docsPage.overview.outgoing')}</div>
            <p className="text-sm leading-relaxed text-muted-foreground">{t('docsPage.overview.outgoingDesc')}</p>
          </div>
          <div className="rounded-lg border border-rail bg-card p-4">
            <div className="mono-label mb-1.5">{t('docsPage.overview.incoming')}</div>
            <p className="text-sm leading-relaxed text-muted-foreground">{t('docsPage.overview.incomingDesc')}</p>
          </div>
        </div>
      </Section>

      <Section title={t('docsPage.overview.coreConcepts')}>
        <DefinitionList
          items={[
            { term: t('docsPage.concepts.event'), definition: t('docsPage.concepts.eventDesc') },
            { term: t('docsPage.concepts.endpoint'), definition: t('docsPage.concepts.endpointDesc') },
            { term: t('docsPage.concepts.subscription'), definition: t('docsPage.concepts.subscriptionDesc') },
            { term: t('docsPage.concepts.delivery'), definition: t('docsPage.concepts.deliveryDesc') },
            { term: t('docsPage.concepts.attempt'), definition: t('docsPage.concepts.attemptDesc') },
            { term: t('docsPage.concepts.source'), definition: t('docsPage.concepts.sourceDesc') },
            { term: t('docsPage.concepts.destination'), definition: t('docsPage.concepts.destinationDesc') },
            { term: t('docsPage.concepts.forward'), definition: t('docsPage.concepts.forwardDesc') },
          ]}
        />
      </Section>

      <Section title={t('docsPage.overview.eventFlow')}>
        <ol className="flex flex-col gap-3 sm:flex-row sm:items-stretch">
          {[
            t('docsPage.overview.yourSystem'),
            t('docsPage.overview.eventsApi'),
            t('docsPage.overview.deliveryEngine'),
            t('docsPage.overview.customerEndpoint'),
          ].map((step, i, all) => (
            <li key={step} className="flex flex-1 items-center gap-3">
              <div className="flex-1 rounded-lg border border-rail bg-card px-3 py-3">
                <span className="mono-label mr-2">{i + 1}</span>
                <span className="text-sm">{step}</span>
              </div>
              {i < all.length - 1 && (
                <ArrowRight className="hidden h-4 w-4 flex-shrink-0 text-muted-foreground sm:block" aria-hidden />
              )}
            </li>
          ))}
        </ol>
      </Section>

      <p className="text-sm text-muted-foreground">
        <Link to="/docs#getting-started" className="text-primary hover:underline">
          {t('docsPage.overview.next')}
        </Link>
      </p>
    </DocsArticle>
  );
}
