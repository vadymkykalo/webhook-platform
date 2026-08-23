import { useTranslation } from 'react-i18next';
import { CodeBlock, DefinitionList, DocsArticle, DocsTitle, Section } from '../primitives';
import { schemaSample } from '../samples';

export default function SchemaRegistry() {
  const { t } = useTranslation();

  return (
    <DocsArticle>
      <DocsTitle title={t('docsPage.schemaRegistry.title')} lede={t('docsPage.schemaRegistry.subtitle')} />

      <Section title={t('docsPage.schemaRegistry.overview')} description={t('docsPage.schemaRegistry.overviewDesc1')}>
        <p className="max-w-2xl leading-relaxed text-muted-foreground">
          {t('docsPage.schemaRegistry.overviewDesc2')}
        </p>
      </Section>

      <Section title={t('docsPage.schemaRegistry.lifecycle')}>
        <DefinitionList
          items={[
            { term: 'DRAFT', definition: t('docsPage.schemaRegistry.statusDraft') },
            { term: 'ACTIVE', definition: t('docsPage.schemaRegistry.statusActive') },
            { term: 'DEPRECATED', definition: t('docsPage.schemaRegistry.statusDeprecated') },
          ]}
        />
        <CodeBlock code={schemaSample} label="bash" />
      </Section>

      <Section
        title={t('docsPage.schemaRegistry.validationPolicies')}
        description={t('docsPage.schemaRegistry.validationPoliciesDesc')}
      >
        <DefinitionList
          items={[
            { term: 'WARN', definition: t('docsPage.schemaRegistry.policyWarnDesc') },
            { term: 'BLOCK', definition: t('docsPage.schemaRegistry.policyBlockDesc') },
          ]}
        />
      </Section>

      <Section
        title={t('docsPage.schemaRegistry.compatibilityModes')}
        description={t('docsPage.schemaRegistry.compatibilityModesDesc')}
      >
        <DefinitionList
          items={[
            { term: 'NONE', definition: t('docsPage.schemaRegistry.compatNoneDesc') },
            { term: 'BACKWARD', definition: t('docsPage.schemaRegistry.compatBackwardDesc') },
            { term: 'FORWARD', definition: t('docsPage.schemaRegistry.compatForwardDesc') },
            { term: 'FULL', definition: t('docsPage.schemaRegistry.compatFullDesc') },
          ]}
        />
      </Section>

      <Section
        title={t('docsPage.schemaRegistry.wildcardRouting')}
        description={t('docsPage.schemaRegistry.wildcardRoutingDesc')}
      >
        <DefinitionList
          items={[
            { term: 'order.created', definition: t('docsPage.schemaRegistry.wildcardExactDesc') },
            { term: 'order.*', definition: t('docsPage.schemaRegistry.wildcardSingleDesc') },
            { term: 'order.**', definition: t('docsPage.schemaRegistry.wildcardMultiDesc') },
            { term: 'order.**.completed', definition: t('docsPage.schemaRegistry.wildcardMiddleDesc') },
            { term: '**', definition: t('docsPage.schemaRegistry.wildcardAllDesc') },
          ]}
        />
      </Section>
    </DocsArticle>
  );
}
