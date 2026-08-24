import { createContext, useContext, useId, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowRight, Check, Copy } from 'lucide-react';
import SyntaxHighlight, { normalizeLanguage } from '../../components/SyntaxHighlight';
import { cn } from '../../lib/utils';

/**
 * The docs voice, in one place.
 *
 * Two rules from the design brief drive everything here. The four status hues
 * are reserved for domain statuses, so nothing in the docs — not an HTTP verb,
 * not a callout, not a 4xx response code — borrows them; structure comes from
 * the rail and from mono weight instead. And "if the product said it, it is
 * mono": paths, verbs, field names, status codes and type names are all mono,
 * the prose around them is not.
 */

export function DocsArticle({ children }: { children: ReactNode }) {
  return <article className="space-y-12 pb-16">{children}</article>;
}

/**
 * Prose with the mono rule applied inside it.
 *
 * The brief at the top of this file says paths, verbs, field names, status codes
 * and type names are mono and the prose around them is not. Every heading and
 * code block obeyed that; the paragraphs did not, because they arrive as flat
 * i18n strings and a string cannot carry a span. So a sentence like "a delivery
 * to an endpoint that is neither VERIFIED nor SKIPPED fails terminally" printed
 * two status names, a header, and a full API path in the same body face as the
 * words around them, and the reader had to parse the sentence to find the parts
 * they were looking for.
 *
 * Authors mark those up in the locale file with backticks — `X-Signature`,
 * `POST /api/v1/events`, `VERIFIED` — and this splits on them. Backticks rather
 * than a richer markup because the translator has to reproduce them by hand in
 * uk.json, and one character that survives copy-paste is the most that can be
 * asked of a format nothing validates.
 *
 * Deliberately not a markdown renderer: this is the whole grammar, and a real
 * parser here would invite bold, links and lists into strings that then cannot
 * be typed or tested.
 */
export function Prose({ children, className }: { children: string; className?: string }) {
  return (
    <>
      {children.split(/`([^`]+)`/).map((part, i) =>
        i % 2 === 1 ? (
          <code
            key={i}
            className={cn(
              'whitespace-nowrap rounded border border-rail bg-secondary/60 px-1 py-px',
              'font-mono text-[0.86em] text-foreground',
              className,
            )}
          >
            {part}
          </code>
        ) : (
          part
        ),
      )}
    </>
  );
}

export function DocsTitle({ title, lede }: { title: string; lede?: string }) {
  return (
    <header className="space-y-3">
      <h1 className="text-3xl font-semibold tracking-[-0.02em] sm:text-headline">{title}</h1>
      {lede && <p className="max-w-2xl text-body-lg text-muted-foreground">{lede}</p>}
    </header>
  );
}

export function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children?: ReactNode;
}) {
  return (
    <section className="space-y-4">
      <h2 className="text-title">{title}</h2>
      {description && (
        <p className="max-w-2xl leading-relaxed text-muted-foreground">
          <Prose>{description}</Prose>
        </p>
      )}
      {children}
    </section>
  );
}

export function SubSection({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="space-y-3">
      <h3 className="text-[15px] font-medium">{title}</h3>
      {children}
    </div>
  );
}

/**
 * A quiet aside. Deliberately not tinted: an amber "security note" next to an
 * amber "retrying" badge would teach the reader that the colour means nothing.
 */
export function Note({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="rounded-lg border border-rail bg-secondary/50 p-4">
      <div className="mono-label mb-1.5">{label}</div>
      <div className="text-sm leading-relaxed text-muted-foreground">
        {typeof children === 'string' ? <Prose>{children}</Prose> : children}
      </div>
    </div>
  );
}

export function CodeBlock({ code, label }: { code: string; label?: string }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const caption = label ?? 'shell';

  const copy = () => {
    navigator.clipboard?.writeText(code);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };

  /* Ink, not paper. A dark field is where machine output lives in this design —
     the landing's CodeBlock and the auth panel both use it, and `.surface-ink`
     redeclares the tokens locally so everything nested reads correctly on it.
     On `bg-secondary/40` a sample sat two percent off the page behind it, which
     is why a 25-line curl read as a wall of undifferentiated text.

     The other half of that wall was the flat monochrome, which `SyntaxHighlight`
     now breaks up. It takes the `label` as its language, so the caption and the
     colouring can never disagree: an unrecognised label highlights nothing
     rather than guessing wrong. */
  return (
    <figure className="surface-ink overflow-hidden rounded-lg border border-rail">
      <figcaption className="flex items-center justify-between gap-2 border-b border-rail px-3 py-1.5">
        <span className="mono-label truncate">{caption}</span>
        <button
          type="button"
          onClick={copy}
          aria-label={copied ? t('common.copied') : t('common.copy')}
          className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
        >
          {copied ? <Check className="h-3.5 w-3.5" aria-hidden /> : <Copy className="h-3.5 w-3.5" aria-hidden />}
        </button>
      </figcaption>
      <pre className="overflow-x-auto p-4">
        <code className="font-mono text-[13px] leading-relaxed text-foreground">
          <SyntaxHighlight code={code} language={normalizeLanguage(caption)} />
        </code>
      </pre>
    </figure>
  );
}

export type SampleLanguage = 'curl' | 'node' | 'python';

const LANGUAGE_LABELS: Record<SampleLanguage, string> = {
  curl: 'cURL',
  node: 'Node.js',
  python: 'Python',
};

/** A code block with the language switcher the whole docs site shares. */
export function CodeSample({
  samples,
  language,
  onLanguageChange,
}: {
  samples: Partial<Record<SampleLanguage, string>>;
  language: SampleLanguage;
  onLanguageChange: (language: SampleLanguage) => void;
}) {
  const available = (Object.keys(LANGUAGE_LABELS) as SampleLanguage[]).filter((l) => samples[l]);
  const active = samples[language] ? language : available[0];
  if (!active) return null;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1">
        {available.map((lang) => (
          <button
            key={lang}
            type="button"
            onClick={() => onLanguageChange(lang)}
            aria-pressed={active === lang}
            className={cn(
              'rounded-md px-2.5 py-1 font-mono text-[11px] uppercase tracking-[0.06em] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              active === lang
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
            )}
          >
            {LANGUAGE_LABELS[lang]}
          </button>
        ))}
      </div>
      <CodeBlock code={samples[active] as string} label={active === 'curl' ? 'bash' : active} />
    </div>
  );
}

/** An HTTP verb + path. Neutral by design — see the note at the top of this file. */
export function Route({ method, path }: { method: string; path: string }) {
  return (
    <div className="flex flex-wrap items-baseline gap-2.5">
      <span className="rounded border border-rail bg-secondary px-1.5 py-0.5 font-mono text-[11px] font-semibold uppercase tracking-[0.06em] text-foreground">
        {method}
      </span>
      <code className="break-all font-mono text-[13px] text-muted-foreground">{path}</code>
    </div>
  );
}

/** A dotted-rule definition list — the docs' answer to a two-column table. */
export function DefinitionList({ items }: { items: Array<{ term: string; definition: ReactNode }> }) {
  return (
    <dl className="divide-y divide-rail border-y border-rail">
      {items.map((item) => (
        <div key={item.term} className="grid gap-1 py-3 sm:grid-cols-[minmax(0,14rem)_1fr] sm:gap-4">
          <dt className="font-mono text-[13px] text-foreground">{item.term}</dt>
          <dd className="text-sm leading-relaxed text-muted-foreground">
            {typeof item.definition === 'string' ? <Prose>{item.definition}</Prose> : item.definition}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * A numbered sequence of stages, read left to right.
 *
 * The numbers are the whole justification for this component existing as its own
 * thing: a step row is an *ordered* sequence — "how a rule runs", "how an event
 * flows" — and nothing else in the docs is numbered. If a set of cards is a
 * menu rather than a pipeline, it is a grid, not this.
 *
 * Both copies of this used to be a flex row of independently-sized cards, which
 * meant four boxes on four different baselines with the arrows drifting to
 * wherever each card's own centre happened to fall. A grid gives every cell the
 * height of the tallest in its row for free, so the arrows — pinned to the
 * midpoint of the cell and floating in the gutter — land on one axis by
 * construction rather than by luck.
 *
 * The breakpoints are the second half of the fix. Four cards abreast at `sm`
 * squeezed a sentence into a 140px column on a phone; the row now stacks below
 * `sm`, pairs up through `lg`, and only opens out to four when there is room.
 * Arrows appear only in that last case: mid-row they would point off the end of
 * a wrapped line and lie about the order.
 */
export function StepRow({ steps }: { steps: Array<{ label: string; desc?: string }> }) {
  return (
    <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {steps.map((step, i) => (
        <li key={step.label} className="relative flex">
          <div className="flex flex-1 flex-col gap-1 rounded-lg border border-rail bg-card p-3">
            <div className="flex items-baseline gap-2">
              <span className="mono-label" aria-hidden>
                {String(i + 1).padStart(2, '0')}
              </span>
              <span className="text-sm font-medium">{step.label}</span>
            </div>
            {step.desc && (
              <p className="text-xs leading-relaxed text-muted-foreground">
                <Prose>{step.desc}</Prose>
              </p>
            )}
          </div>
          {i < steps.length - 1 && (
            <ArrowRight
              className="absolute -right-3.5 top-1/2 hidden h-4 w-4 -translate-y-1/2 text-muted-foreground lg:block"
              aria-hidden
            />
          )}
        </li>
      ))}
    </ol>
  );
}

/**
 * A framed figure with a caption — the shared shell for the diagrams and the
 * screenshots, so a drawing and a photograph of the product sit in the same
 * frame rather than each inventing one.
 */
export function Figure({ caption, children }: { caption?: string; children: ReactNode }) {
  return (
    <figure className="overflow-hidden rounded-lg border border-rail bg-card">
      {children}
      {caption && (
        <figcaption className="border-t border-rail px-3 py-2 text-xs leading-relaxed text-muted-foreground">
          {caption}
        </figcaption>
      )}
    </figure>
  );
}

/** Every tone a diagram may use. The four status hues mean what they mean everywhere else. */
export type SketchTone = 'ok' | 'retry' | 'halt' | 'idle' | 'rail';

const SketchIdContext = createContext('');

const useSketchIds = () => {
  const base = useContext(SketchIdContext);
  return {
    arrow: (tone: SketchTone) => `${base}-arrow-${tone}`,
  };
};

const TONES: SketchTone[] = ['ok', 'retry', 'halt', 'idle', 'rail'];

/**
 * The frame every docs diagram is drawn in: it owns the turbulence filter, the
 * arrowheads and the caption, so seven drawings do not each redefine them.
 *
 * `viewBox` is deliberately narrow — around 440 units — because an SVG scales
 * its text with its box. A 900-unit-wide drawing squeezed into a phone column
 * renders its 14-unit labels at six real pixels; at 440 units in a 360px column
 * the same label lands near 11px, which is the smallest worth printing. The
 * `maxWidth` cap stops the other end: without it a drawing sized for a phone
 * becomes a poster on a desktop.
 */
export function Diagram({
  caption,
  label,
  viewBox,
  maxWidth = 520,
  children,
}: {
  caption?: string;
  label: string;
  viewBox: string;
  maxWidth?: number;
  children: ReactNode;
}) {
  // useId gives every instance its own filter and marker ids: two diagrams on
  // one page sharing an id would have the second silently reuse the first.
  const base = `dg${useId().replace(/:/g, '')}`;

  return (
    <SketchIdContext.Provider value={base}>
      <Figure caption={caption}>
        <svg
          viewBox={viewBox}
          role="img"
          aria-label={label}
          className="mx-auto block w-full p-3"
          style={{ maxWidth: `${maxWidth}px` }}
        >
          <defs>
            {TONES.map((tone) => (
              <marker
                key={tone}
                id={`${base}-arrow-${tone}`}
                viewBox="0 0 10 10"
                refX={8}
                refY={5}
                markerWidth={5}
                markerHeight={5}
                orient="auto"
              >
                <path d="M0,0 L10,5 L0,10 z" fill={`hsl(var(--${tone === 'rail' ? 'muted-foreground' : tone}))`} />
              </marker>
            ))}
          </defs>
          {children}
        </svg>
      </Figure>
    </SketchIdContext.Provider>
  );
}

const stroke = (tone: SketchTone) => (tone === 'rail' ? 'hsl(var(--muted-foreground))' : `hsl(var(--${tone}))`);
const fill = (tone: SketchTone) => (tone === 'rail' ? 'hsl(var(--card))' : `hsl(var(--${tone}-soft))`);

/**
 * A box with a label, and optionally a second mono line under it.
 *
 * The irregularity comes from the filter and nothing else. Tilting the boxes as
 * well was tried and read as sloppy rather than hand-drawn: a row whose members
 * sit at slightly different angles looks like a layout that failed, not like a
 * drawing. Vary the line, keep the geometry exact — same width, same height,
 * even spacing, tops aligned — and let the turbulence supply the hand.
 */
export function SketchBox({
  x,
  y,
  w,
  h = 46,
  label,
  sub,
  tone = 'rail',
  tilt = 0,
}: {
  x: number;
  y: number;
  w: number;
  h?: number;
  label?: string;
  sub?: string;
  tone?: SketchTone;
  tilt?: number;
}) {
  const cx = x + w / 2;
  const cy = y + h / 2;

  return (
    <g transform={tilt ? `rotate(${tilt} ${cx} ${cy})` : undefined}>
      <rect
        x={x}
        y={y}
        width={w}
        height={h}
        rx={9}
        fill={fill(tone)}
        stroke={stroke(tone)}
        strokeWidth={2}
        strokeLinejoin="round"
      />
      {label && (
        <text x={cx} y={sub ? cy - 1 : cy + 5} textAnchor="middle" fontSize={15} fill="hsl(var(--foreground))">
          {label}
        </text>
      )}
      {sub && (
        <text x={cx} y={cy + 16} textAnchor="middle" fontSize={12} className="font-mono" fill="hsl(var(--muted-foreground))">
          {sub}
        </text>
      )}
    </g>
  );
}

/** A connector. `dashed` is reserved for a transition where nothing was sent. */
export function SketchEdge({
  d,
  tone = 'rail',
  dashed = false,
}: {
  d: string;
  tone?: SketchTone;
  dashed?: boolean;
}) {
  const ids = useSketchIds();
  return (
    <path
      d={d}
      fill="none"
      stroke={stroke(tone)}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeDasharray={dashed ? '5 4' : undefined}
      markerEnd={`url(#${ids.arrow(tone)})`}
    />
  );
}

/** Diagram text that is not a box label: an edge annotation, a heading, a footnote. */
export function SketchText({
  x,
  y,
  anchor = 'middle',
  size = 14,
  mono = false,
  tone,
  children,
}: {
  x: number;
  y: number;
  anchor?: 'start' | 'middle' | 'end';
  size?: number;
  mono?: boolean;
  tone?: SketchTone;
  children: string;
}) {
  return (
    <text
      x={x}
      y={y}
      textAnchor={anchor}
      fontSize={size}
      className={mono ? 'font-mono' : undefined}
      fill={tone && tone !== 'rail' ? `hsl(var(--${tone}))` : 'hsl(var(--muted-foreground))'}
    >
      {children}
    </text>
  );
}
