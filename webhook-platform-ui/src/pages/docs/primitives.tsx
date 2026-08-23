import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Copy } from 'lucide-react';
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
      {description && <p className="max-w-2xl leading-relaxed text-muted-foreground">{description}</p>}
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
      <div className="text-sm leading-relaxed text-muted-foreground">{children}</div>
    </div>
  );
}

export function CodeBlock({ code, label }: { code: string; label?: string }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  const copy = () => {
    navigator.clipboard?.writeText(code);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };

  return (
    <figure className="overflow-hidden rounded-lg border border-rail bg-secondary/40">
      <figcaption className="flex items-center justify-between gap-2 border-b border-rail px-3 py-1.5">
        <span className="mono-label truncate">{label ?? 'shell'}</span>
        <button
          type="button"
          onClick={copy}
          aria-label={copied ? t('common.copied') : t('common.copy')}
          className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-background hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {copied ? <Check className="h-3.5 w-3.5" aria-hidden /> : <Copy className="h-3.5 w-3.5" aria-hidden />}
        </button>
      </figcaption>
      <pre className="overflow-x-auto p-4">
        <code className="font-mono text-[13px] leading-relaxed text-foreground">{code}</code>
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
          <dd className="text-sm leading-relaxed text-muted-foreground">{item.definition}</dd>
        </div>
      ))}
    </dl>
  );
}
