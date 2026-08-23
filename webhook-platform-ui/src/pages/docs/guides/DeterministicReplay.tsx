import { useTranslation } from 'react-i18next';
import { CodeBlock, DefinitionList, DocsArticle, DocsTitle, Note, Route, Section } from '../primitives';
import { replaySamples } from '../samples';

export default function DeterministicReplay() {
  const { t } = useTranslation();

  return (
    <DocsArticle>
      <DocsTitle
        title={t('docsPage.deterministicReplay.title')}
        lede={t('docsPage.deterministicReplay.subtitle')}
      />

      <Section
        title={t('docsPage.deterministicReplay.overview')}
        description={t('docsPage.deterministicReplay.overviewDesc')}
      />

      <Section
        title={t('docsPage.deterministicReplay.idempotencyKeyHeader')}
        description={t('docsPage.deterministicReplay.idempotencyKeyHeaderDesc')}
      >
        <CodeBlock code={replaySamples.header} label="http" />
      </Section>

      <Section title={t('docsPage.deterministicReplay.dryRunTitle')} description={t('docsPage.deterministicReplay.dryRunDesc')}>
        <Route method="POST" path="/api/v1/deliveries/{id}/replay?dryRun=true" />
        <CodeBlock code={replaySamples.dryRun} label="json" />
      </Section>

      <Section
        title={t('docsPage.deterministicReplay.replayFromAttemptTitle')}
        description={t('docsPage.deterministicReplay.replayFromAttemptDesc')}
      >
        <Route method="POST" path="/api/v1/deliveries/{id}/replay?fromAttempt=2" />
        <Note label={t('docsPage.deterministicReplay.whenLabel')}>
          {t('docsPage.deterministicReplay.replayFromAttemptNote')}
        </Note>
      </Section>

      <Section
        title={t('docsPage.deterministicReplay.idempotencyPoliciesTitle')}
        description={t('docsPage.deterministicReplay.idempotencyPoliciesDesc')}
      >
        <DefinitionList
          items={[
            { term: 'NONE', definition: t('docsPage.deterministicReplay.policyNone') },
            { term: 'AUTO', definition: t('docsPage.deterministicReplay.policyAuto') },
            { term: 'REQUIRED', definition: t('docsPage.deterministicReplay.policyRequired') },
          ]}
        />
      </Section>
    </DocsArticle>
  );
}
