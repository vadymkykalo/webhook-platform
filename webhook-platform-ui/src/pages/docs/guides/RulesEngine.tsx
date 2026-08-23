import { useTranslation } from 'react-i18next';
import { ArrowRight } from 'lucide-react';
import { CodeBlock, DefinitionList, DocsArticle, DocsTitle, Note, Section } from '../primitives';
import { rulesSample } from '../samples';

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
        <ol className="flex flex-col gap-3 lg:flex-row">
          {steps.map((step, i) => (
            <li key={step.label} className="flex flex-1 items-center gap-3">
              <div className="flex-1 rounded-lg border border-rail bg-card p-3">
                <div className="mono-label mb-1">{i + 1}</div>
                <div className="text-sm font-medium">{step.label}</div>
                <div className="text-xs text-muted-foreground">{step.desc}</div>
              </div>
              {i < steps.length - 1 && (
                <ArrowRight className="hidden h-4 w-4 flex-shrink-0 text-muted-foreground lg:block" aria-hidden />
              )}
            </li>
          ))}
        </ol>
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
