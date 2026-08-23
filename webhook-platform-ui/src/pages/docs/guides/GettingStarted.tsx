import { useTranslation } from 'react-i18next';
import { CodeBlock, CodeSample, DocsArticle, DocsTitle, Note, Route } from '../primitives';
import type { SampleLanguage } from '../primitives';
import { authSamples, quickstartSamples } from '../samples';

function Step({
  number,
  title,
  description,
  method,
  path,
  children,
}: {
  number: number;
  title: string;
  description: string;
  method: string;
  path: string;
  children: React.ReactNode;
}) {
  return (
    <li className="grid gap-3 border-t border-rail pt-6 first:border-t-0 first:pt-0">
      <div className="flex items-baseline gap-3">
        <span className="mono-label">{String(number).padStart(2, '0')}</span>
        <h2 className="text-title">{title}</h2>
      </div>
      <p className="max-w-2xl text-muted-foreground">{description}</p>
      <Route method={method} path={path} />
      {children}
    </li>
  );
}

export default function GettingStarted({
  language,
  onLanguageChange,
}: {
  language: SampleLanguage;
  onLanguageChange: (language: SampleLanguage) => void;
}) {
  const { t } = useTranslation();

  return (
    <DocsArticle>
      <DocsTitle title={t('docsPage.gettingStarted.title')} lede={t('docsPage.gettingStarted.subtitle')} />

      <ol className="space-y-6">
        <Step
          number={1}
          title={t('docsPage.gettingStarted.step1')}
          description={t('docsPage.gettingStarted.step1Desc')}
          method="POST"
          path="/api/v1/auth/login"
        >
          <CodeSample samples={authSamples.login} language={language} onLanguageChange={onLanguageChange} />
        </Step>

        <Step
          number={2}
          title={t('docsPage.gettingStarted.step2')}
          description={t('docsPage.gettingStarted.step2Desc')}
          method="POST"
          path="/api/v1/projects"
        >
          <CodeBlock code={quickstartSamples.project} label="bash" />
        </Step>

        <Step
          number={3}
          title={t('docsPage.gettingStarted.step3')}
          description={t('docsPage.gettingStarted.step3Desc')}
          method="POST"
          path="/api/v1/projects/{projectId}/api-keys"
        >
          <CodeBlock code={quickstartSamples.apiKey} label="bash" />
        </Step>

        <Step
          number={4}
          title={t('docsPage.gettingStarted.step4')}
          description={t('docsPage.gettingStarted.step4Desc')}
          method="POST"
          path="/api/v1/projects/{projectId}/endpoints"
        >
          <CodeBlock code={quickstartSamples.endpoint} label="bash" />
        </Step>

        <Step
          number={5}
          title={t('docsPage.gettingStarted.step5')}
          description={t('docsPage.gettingStarted.step5Desc')}
          method="POST"
          path="/api/v1/projects/{projectId}/subscriptions"
        >
          <CodeBlock code={quickstartSamples.subscription} label="bash" />
        </Step>

        <Step
          number={6}
          title={t('docsPage.gettingStarted.step6')}
          description={t('docsPage.gettingStarted.step6Desc')}
          method="POST"
          path="/api/v1/events"
        >
          <CodeBlock code={quickstartSamples.event} label="bash" />
        </Step>
      </ol>

      <Note label={t('docsPage.gettingStarted.nextLabel')}>{t('docsPage.gettingStarted.nextDesc')}</Note>
    </DocsArticle>
  );
}
