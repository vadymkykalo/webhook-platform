import { useTranslation } from 'react-i18next';
import {
  CodeBlock,
  DefinitionList,
  Diagram,
  DocsArticle,
  DocsTitle,
  Section,
  SketchBox,
  SketchEdge,
  SketchText,
} from '../primitives';
import { schemaSample } from '../samples';

/**
 * The lifecycle drawing is neutral on purpose. The four status hues mean four
 * delivery outcomes everywhere else in the product, and a green ACTIVE schema
 * would teach a reader that green means "current" — so this one carries its
 * emphasis in weight and position, and leaves the hues to the states that own
 * them.
 *
 * It exists because the transition is the part a table cannot show: promoting
 * a DRAFT does not only change that version, it pushes the version it replaces
 * into DEPRECATED.
 */
function VersionLifecycle() {
  const { t } = useTranslation();

  return (
    <Diagram
      viewBox="0 0 440 130"
      maxWidth={500}
      label={t('docsPage.schemaRegistry.lifecycleAlt')}
      caption={t('docsPage.schemaRegistry.lifecycleCaption')}
    >
      <SketchEdge d="M132,56 H156" />
      <SketchText x={144} y={24} size={12}>
        {t('docsPage.schemaRegistry.lifecyclePromote')}
      </SketchText>

      <SketchEdge d="M284,56 H308" />
      <SketchText x={296} y={24} size={12}>
        {t('docsPage.schemaRegistry.lifecycleReplaced')}
      </SketchText>

      <SketchBox x={12} y={34} w={120} h={44} label="DRAFT" />
      <SketchBox x={160} y={34} w={124} h={44} label="ACTIVE" />
      <SketchBox x={312} y={34} w={124} h={44} label="DEPRECATED" />

      <SketchText x={220} y={112} size={13}>
        {t('docsPage.schemaRegistry.lifecycleOnlyOne')}
      </SketchText>
    </Diagram>
  );
}

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
        <VersionLifecycle />
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
