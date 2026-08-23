import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { CodeBlock, Reveal, Section, SectionHeader } from './primitives';

/**
 * The commands are the ones in the repository README, verbatim: two curl calls
 * and a compose up, then one SDK call. If a command here stops working, the
 * README is wrong too.
 */

const COMPOSE = `BASE=https://raw.githubusercontent.com/vadymkykalo/webhook-platform/main

curl -fsSLO $BASE/docker-compose.pull.yml
curl -fsSL  $BASE/.env.dist -o .env

docker compose -f docker-compose.pull.yml up -d`;

const SDKS = [
  {
    id: 'node',
    name: 'Node.js',
    install: 'npm install @hookflow/node',
    code: `import { Hookflow } from '@hookflow/node';

const client = new Hookflow({ apiKey: 'wh_live_...' });

await client.events.send({
  type: 'order.completed',
  data: { orderId: 'ord_12345', amount: 99.99 },
});`,
  },
  {
    id: 'python',
    name: 'Python',
    install: 'pip install hookflow-sdk',
    code: `from hookflow import Hookflow, Event

client = Hookflow(api_key="wh_live_...")

client.events.send(Event(
    type="order.completed",
    data={"order_id": "ord_12345", "amount": 99.99},
))`,
  },
  {
    id: 'php',
    name: 'PHP',
    install: 'composer require hookflow/php',
    code: `use Hookflow\\Hookflow;

$client = new Hookflow(apiKey: 'wh_live_...');

$client->events->send(
    type: 'order.completed',
    data: ['orderId' => 'ord_12345', 'amount' => 99.99]
);`,
  },
];

export default function QuickstartSection() {
  const { t } = useTranslation();
  const [active, setActive] = useState(0);
  const sdk = SDKS[active];

  return (
    <Section id="quickstart">
      <Reveal>
        <SectionHeader
          eyebrow={t('landing.quickstart.eyebrow')}
          title={t('landing.quickstart.title')}
          body={t('landing.quickstart.body')}
        />
      </Reveal>

      <div className="mt-10 grid items-start gap-6 lg:grid-cols-2">
        <Reveal className="min-w-0">
          <p className="mono-label">{t('landing.quickstart.step1Label')}</p>
          <h3 className="mt-2 text-title text-foreground">{t('landing.quickstart.step1Title')}</h3>
          <CodeBlock className="mt-4" label="bash" code={COMPOSE} wrap />
          <dl className="mt-4 grid grid-cols-[auto_minmax(0,1fr)] gap-x-5 gap-y-1.5 border-t border-rail pt-4 font-mono text-[11.5px]">
            <dt className="text-muted-foreground">dashboard</dt>
            <dd className="text-foreground">http://localhost:5173</dd>
            <dt className="text-muted-foreground">api</dt>
            <dd className="text-foreground">http://localhost:8080</dd>
            <dt className="text-muted-foreground">health</dt>
            <dd className="text-foreground">http://localhost:8082</dd>
          </dl>
          <p className="mt-4 text-sm text-muted-foreground">{t('landing.quickstart.step1Note')}</p>
          <Link
            to="/docs"
            className="mt-5 inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
          >
            {t('landing.quickstart.docsLink')} <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        </Reveal>

        <Reveal delay={90} className="min-w-0">
          <p className="mono-label">{t('landing.quickstart.step2Label')}</p>
          <h3 className="mt-2 text-title text-foreground">{t('landing.quickstart.step2Title')}</h3>
          <div role="tablist" aria-label={t('landing.quickstart.step2Title')} className="mt-4 flex gap-1">
            {SDKS.map((item, i) => (
              <button
                key={item.id}
                type="button"
                role="tab"
                id={`sdk-tab-${item.id}`}
                aria-selected={i === active}
                aria-controls="sdk-panel"
                onClick={() => setActive(i)}
                className={`rounded-md px-3 py-1.5 font-mono text-[11.5px] transition-colors ${
                  i === active
                    ? 'bg-secondary text-foreground'
                    : 'text-muted-foreground hover:bg-secondary/60 hover:text-foreground'
                }`}
              >
                {item.name}
              </button>
            ))}
          </div>
          <div id="sdk-panel" role="tabpanel" aria-labelledby={`sdk-tab-${sdk.id}`}>
            <CodeBlock className="mt-3" label={sdk.install} code={sdk.code} />
          </div>
          <p className="mt-4 font-mono text-[11.5px] text-muted-foreground">{t('landing.quickstart.step2Note')}</p>
        </Reveal>
      </div>
    </Section>
  );
}
