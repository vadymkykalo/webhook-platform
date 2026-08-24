import { useTranslation } from 'react-i18next';
import {
  CodeBlock,
  CodeSample,
  DefinitionList,
  DocsArticle,
  DocsTitle,
  Note,
  Route,
  Section,
  SubSection,
} from '../primitives';
import type { SampleLanguage } from '../primitives';
import { authSamples, quickstartSamples } from '../samples';

/**
 * Step 1 used to be `POST /api/v1/auth/login` against a host the reader did not
 * have: the compose instructions live on neither the landing page nor here any
 * more, so the first step was one nobody could run. `runInstance` is that
 * missing step — it is deliberately the pulled-image path rather than the
 * build-from-source one, which is a contributor's concern, not an integrator's.
 */
const runInstance = `REPO=https://raw.githubusercontent.com/vadymkykalo/webhook-platform/main

curl -fsSLO $REPO/docker-compose.pull.yml
curl -fsSL  $REPO/.env.dist -o .env

docker compose -f docker-compose.pull.yml up -d
curl -f http://localhost:8082/actuator/health/liveness`;

/**
 * The three ports the compose file binds, and where each one is set.
 *
 * The health check above lands on 8082, which is not the API — and the sample gave no way to
 * know that or to change it. Actuator runs on its own port so a broken auth configuration
 * cannot take health and metrics down with it, and compose binds it to loopback only.
 */
const PORTS = [
  { port: '8080', envVar: 'API_PORT', key: 'docsPage.gettingStarted.portApi' },
  { port: '5173', envVar: 'UI_PORT', key: 'docsPage.gettingStarted.portUi' },
  { port: '8082', envVar: 'MANAGEMENT_PORT', key: 'docsPage.gettingStarted.portActuator' },
];

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

      <Section title={t('docsPage.gettingStarted.runTitle')} description={t('docsPage.gettingStarted.runDesc')}>
        <CodeBlock code={runInstance} label="bash" wrap />

        <SubSection title={t('docsPage.gettingStarted.portsTitle')}>
          <DefinitionList
            items={PORTS.map((p) => ({
              term: p.port,
              definition: `${t(p.key)} \`${p.envVar}\``,
            }))}
          />
        </SubSection>

        <Note label={t('docsPage.gettingStarted.runBaseUrlLabel')}>{t('docsPage.gettingStarted.runBaseUrlDesc')}</Note>
        <Note label={t('docsPage.gettingStarted.runSecretsLabel')}>{t('docsPage.gettingStarted.runSecretsDesc')}</Note>
      </Section>

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
          <Note label={t('docsPage.gettingStarted.verifyLabel')}>{t('docsPage.gettingStarted.verifyDesc')}</Note>
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
