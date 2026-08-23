import { useTranslation } from 'react-i18next';
import { CodeBlock, DefinitionList, DocsArticle, DocsTitle, Note, Section } from '../primitives';
import { errorSamples } from '../samples';

/**
 * What the spec cannot say: which headers carry the rate-limit budget, what the
 * error envelope looks like, and what to do when you hit a 429. The per-endpoint
 * status codes live in the generated reference.
 */
export default function ErrorsAndLimits() {
  const { t } = useTranslation();

  return (
    <DocsArticle>
      <DocsTitle title={t('docsPage.errors.title')} lede={t('docsPage.errors.subtitle')} />

      <Section title={t('docsPage.errors.rateLimiting')} description={t('docsPage.errors.rateLimitingDesc')}>
        <DefinitionList
          items={[
            { term: 'X-RateLimit-Limit', definition: t('docsPage.errors.headerLimit') },
            { term: 'X-RateLimit-Remaining', definition: t('docsPage.errors.headerRemaining') },
            { term: 'X-RateLimit-Reset', definition: t('docsPage.errors.headerReset') },
            { term: 'Retry-After', definition: t('docsPage.errors.headerRetryAfter') },
          ]}
        />
        <Note label={t('docsPage.errors.rateLimitExceeded')}>{t('docsPage.errors.rateLimitExceededDesc')}</Note>
      </Section>

      <Section title={t('docsPage.errors.errorFormat')} description={t('docsPage.errors.errorFormatDesc')}>
        <CodeBlock code={errorSamples.envelope} label="json" />
      </Section>

      <Section title={t('docsPage.errors.httpStatusCodes')} description={t('docsPage.errors.httpStatusCodesDesc')}>
        <DefinitionList
          items={[
            { term: '2xx', definition: t('docsPage.errors.code2xx') },
            { term: '400', definition: t('docsPage.errors.code400') },
            { term: '401', definition: t('docsPage.errors.code401') },
            { term: '403', definition: t('docsPage.errors.code403') },
            { term: '404', definition: t('docsPage.errors.code404') },
            { term: '409', definition: t('docsPage.errors.code409') },
            { term: '429', definition: t('docsPage.errors.code429') },
            { term: '5xx', definition: t('docsPage.errors.code5xx') },
          ]}
        />
      </Section>
    </DocsArticle>
  );
}
