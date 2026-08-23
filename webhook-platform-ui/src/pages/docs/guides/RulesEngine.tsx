import { useTranslation } from 'react-i18next';
import {
  CodeBlock,
  DefinitionList,
  Diagram,
  DocsArticle,
  DocsTitle,
  Note,
  Section,
  SketchBox,
  SketchEdge,
  SketchText,
  StepRow,
} from '../primitives';
import { rulesSample } from '../samples';

/**
 * The ordering fact, which is the whole reason DROP behaves the way it does:
 * rules are evaluated before subscriptions are looked up, so a dropped event
 * has no deliveries to cancel — none were ever created.
 */
function RuleOrderDiagram() {
  const { t } = useTranslation();

  return (
    <Diagram
      viewBox="0 0 440 260"
      label={t('docsPage.rulesEngine.diagAlt')}
      caption={t('docsPage.rulesEngine.diagCaption')}
    >
      <SketchEdge d="M220,62 V84" />
      <SketchEdge d="M220,138 V160" />
      <SketchEdge d="M304,112 H326" tone="halt" />
      <SketchText x={315} y={84} size={12} mono tone="halt">
        DROP
      </SketchText>

      <SketchBox x={136} y={16} w={168} label={t('docsPage.concepts.event')} />
      <SketchBox x={136} y={90} w={168} label={t('docsPage.rulesEngine.diagRules')} />
      <SketchBox x={330} y={90} w={106} label={t('docsPage.rulesEngine.diagStop')} tone="halt" />
      <SketchBox x={136} y={166} w={168} label={t('docsPage.rulesEngine.diagSubs')} tone="ok" />

      <SketchText x={220} y={246} size={13}>
        {t('docsPage.rulesEngine.diagFoot')}
      </SketchText>
    </Diagram>
  );
}

export default function RulesEngine() {
  const { t } = useTranslation();

  const steps = [
    { label: t('docsPage.rulesEngine.step1'), desc: t('docsPage.rulesEngine.step1Desc') },
    { label: t('docsPage.rulesEngine.step2'), desc: t('docsPage.rulesEngine.step2Desc') },
    { label: t('docsPage.rulesEngine.step3'), desc: t('docsPage.rulesEngine.step3Desc') },
    { label: t('docsPage.rulesEngine.step4'), desc: t('docsPage.rulesEngine.step4Desc') },
  ];

  return (
    <DocsArticle>
      <DocsTitle title={t('docsPage.rulesEngine.title')} lede={t('docsPage.rulesEngine.subtitle')} />

      <Section title={t('docsPage.rulesEngine.howItWorks')}>
        <RuleOrderDiagram />
        <StepRow steps={steps} />
        <Note label={t('docsPage.rulesEngine.importantLabel')}>{t('docsPage.rulesEngine.importantBody')}</Note>
      </Section>

      <Section title={t('docsPage.rulesEngine.concepts')}>
        <DefinitionList
          items={[
            { term: t('docsPage.rulesEngine.conceptRule'), definition: t('docsPage.rulesEngine.conceptRuleDesc') },
            {
              term: t('docsPage.rulesEngine.conceptCondition'),
              definition: t('docsPage.rulesEngine.conceptConditionDesc'),
            },
            { term: t('docsPage.rulesEngine.conceptAction'), definition: t('docsPage.rulesEngine.conceptActionDesc') },
            {
              term: t('docsPage.rulesEngine.conceptPriority'),
              definition: t('docsPage.rulesEngine.conceptPriorityDesc'),
            },
          ]}
        />
      </Section>

      <Section title={t('docsPage.rulesEngine.actions')}>
        <DefinitionList
          items={[
            { term: 'ROUTE', definition: t('docsPage.rulesEngine.actionRoute') },
            { term: 'TRANSFORM', definition: t('docsPage.rulesEngine.actionTransform') },
            { term: 'TAG', definition: t('docsPage.rulesEngine.actionTag') },
            { term: 'DROP', definition: t('docsPage.rulesEngine.actionDrop') },
          ]}
        />
      </Section>

      <Section title={t('docsPage.rulesEngine.exampleTitle')} description={t('docsPage.rulesEngine.exampleDesc')}>
        <CodeBlock code={rulesSample} label="bash" />
      </Section>
    </DocsArticle>
  );
}
