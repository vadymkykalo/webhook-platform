import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import {
  Prose,
  DefinitionList,
  Diagram,
  DocsArticle,
  DocsTitle,
  Section,
  SketchBox,
  SketchEdge,
  SketchText,
  StepRow,
} from '../primitives';

/**
 * The one page that has to agree with CONTEXT.md word for word: it is where a
 * reader learns which noun means what, and a synonym introduced here spreads
 * through every other page.
 *
 * The flow row carries a description per stage rather than four bare labels,
 * because the labels alone said nothing the sidebar had not already said.
 */
/**
 * The two directions, as one picture: the same platform in the middle, the
 * arrows pointing opposite ways, and the one word that differs — Hookflow
 * signs what it sends and verifies what it receives.
 */
function DirectionsDiagram() {
  const { t } = useTranslation();

  return (
    <Diagram
      viewBox="0 0 440 226"
      label={t('docsPage.overview.diagDirAlt')}
      caption={t('docsPage.overview.diagDirCaption')}
    >
      <SketchText x={10} y={12} anchor="start" size={12}>
        {t('docsPage.overview.outgoing')}
      </SketchText>
      <SketchEdge d="M122,42 H160" />
      <SketchText x={141} y={80} size={12}>
        {t('docsPage.overview.diagDirSigns')}
      </SketchText>
      <SketchEdge d="M277,42 H315" />
      <SketchBox x={10} y={20} w={110} h={44} label={t('docsPage.overview.diagDirYourSystem')} />
      <SketchBox x={165} y={20} w={110} h={44} label="Hookflow" />
      <SketchBox x={320} y={20} w={110} h={44} label={t('docsPage.concepts.endpoint')} />

      <SketchText x={10} y={112} anchor="start" size={12}>
        {t('docsPage.overview.incoming')}
      </SketchText>
      <SketchEdge d="M122,142 H160" />
      <SketchText x={141} y={180} size={12}>
        {t('docsPage.overview.diagDirVerifies')}
      </SketchText>
      <SketchEdge d="M277,142 H315" />
      <SketchBox x={10} y={120} w={110} h={44} label={t('docsPage.overview.diagDirProvider')} />
      <SketchBox x={165} y={120} w={110} h={44} label="Hookflow" />
      <SketchBox x={320} y={120} w={110} h={44} label={t('docsPage.concepts.destination')} />

      <SketchText x={220} y={214} size={13}>
        {t('docsPage.overview.diagDirShared')}
      </SketchText>
    </Diagram>
  );
}

/**
 * The thing people get wrong about webhook platforms: an event is not a send.
 *
 * One event becomes one delivery per matching subscription, and from that moment the
 * deliveries have nothing to do with each other. The three lanes carry their attempt
 * counters for exactly that reason — the earlier version showed three coloured boxes and
 * three status words, which asserted the independence without showing it. `1/7`, `3/7` and
 * `7/7` on the same event is the whole point, and it is also where the retry ladder first
 * appears to a reader.
 *
 * The third lane says "Failed Messages", not "DLQ". CONTEXT.md is explicit that DLQ is
 * vocabulary you have to already know, and a drawing that labels a state differently from
 * the screen it describes teaches the reader a word the product will never say back.
 */
function FanOutDiagram() {
  const { t } = useTranslation();

  const lane = (
    x: number,
    endpoint: string,
    tone: 'ok' | 'retry' | 'halt',
    attempts: string,
    status: string,
  ) => (
    <>
      <SketchBox x={x} y={152} w={124} h={50} label={t('docsPage.concepts.delivery')} sub={endpoint} tone={tone} />
      <SketchText x={x + 62} y={222} size={12} mono tone={tone}>
        {attempts}
      </SketchText>
      <SketchText x={x + 62} y={240} size={12} tone={tone}>
        {status}
      </SketchText>
    </>
  );

  return (
    <Diagram
      viewBox="0 0 440 274"
      maxWidth={560}
      label={t('docsPage.overview.diagFanAlt')}
      caption={t('docsPage.overview.diagFanCaption')}
    >
      <SketchEdge d="M198,66 C186,104 84,110 72,146" />
      <SketchEdge d="M220,66 V146" />
      <SketchEdge d="M242,66 C254,104 356,110 368,146" />

      <SketchBox x={140} y={18} w={160} h={48} label={t('docsPage.concepts.event')} sub="order.created" />

      {lane(10, 'endpoint A', 'ok', '1/7', t('docsPage.overview.diagFanDelivered'))}
      {lane(158, 'endpoint B', 'retry', '3/7', t('docsPage.overview.diagFanRetrying'))}
      {lane(306, 'endpoint C', 'halt', '7/7', t('docsPage.overview.diagFanAbandoned'))}

      <SketchText x={220} y={264} size={12}>
        {t('docsPage.overview.diagFanEach')}
      </SketchText>
    </Diagram>
  );
}

export default function Overview() {
  const { t } = useTranslation();

  return (
    <DocsArticle>
      <DocsTitle title={t('docsPage.overview.title')} lede={t('docsPage.overview.subtitle')} />

      <Section title={t('docsPage.overview.whatIs')} description={t('docsPage.overview.whatIsDesc1')}>
        <p className="max-w-2xl leading-relaxed text-muted-foreground"><Prose>{t('docsPage.overview.whatIsDesc2')}</Prose></p>
      </Section>

      <Section title={t('docsPage.overview.directions')}>
        <DirectionsDiagram />
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-lg border border-rail bg-card p-4">
            <div className="mono-label mb-1.5">{t('docsPage.overview.outgoing')}</div>
            <p className="text-sm leading-relaxed text-muted-foreground"><Prose>{t('docsPage.overview.outgoingDesc')}</Prose></p>
          </div>
          <div className="rounded-lg border border-rail bg-card p-4">
            <div className="mono-label mb-1.5">{t('docsPage.overview.incoming')}</div>
            <p className="text-sm leading-relaxed text-muted-foreground"><Prose>{t('docsPage.overview.incomingDesc')}</Prose></p>
          </div>
        </div>
      </Section>

      <Section title={t('docsPage.overview.coreConcepts')}>
        <DefinitionList
          items={[
            { term: t('docsPage.concepts.event'), definition: t('docsPage.concepts.eventDesc') },
            { term: t('docsPage.concepts.endpoint'), definition: t('docsPage.concepts.endpointDesc') },
            { term: t('docsPage.concepts.subscription'), definition: t('docsPage.concepts.subscriptionDesc') },
            { term: t('docsPage.concepts.connection'), definition: t('docsPage.concepts.connectionDesc') },
            { term: t('docsPage.concepts.delivery'), definition: t('docsPage.concepts.deliveryDesc') },
            { term: t('docsPage.concepts.attempt'), definition: t('docsPage.concepts.attemptDesc') },
            { term: t('docsPage.concepts.source'), definition: t('docsPage.concepts.sourceDesc') },
            { term: t('docsPage.concepts.destination'), definition: t('docsPage.concepts.destinationDesc') },
            { term: t('docsPage.concepts.forward'), definition: t('docsPage.concepts.forwardDesc') },
          ]}
        />
      </Section>

      <Section title={t('docsPage.overview.eventFlow')}>
        <FanOutDiagram />
        <StepRow
          steps={[
            { label: t('docsPage.overview.flow1'), desc: t('docsPage.overview.flow1Desc') },
            { label: t('docsPage.overview.flow2'), desc: t('docsPage.overview.flow2Desc') },
            { label: t('docsPage.overview.flow3'), desc: t('docsPage.overview.flow3Desc') },
            { label: t('docsPage.overview.flow4'), desc: t('docsPage.overview.flow4Desc') },
          ]}
        />
      </Section>

      <p className="text-sm text-muted-foreground">
        <Link to="/docs/getting-started" className="text-primary hover:underline">
          {t('docsPage.overview.next')}
        </Link>
      </p>
    </DocsArticle>
  );
}
