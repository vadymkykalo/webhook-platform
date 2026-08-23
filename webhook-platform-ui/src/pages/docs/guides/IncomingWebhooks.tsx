import { useTranslation } from 'react-i18next';
import { CodeBlock, DefinitionList, DocsArticle, DocsTitle, Note, Section } from '../primitives';

export default function IncomingWebhooks() {
  const { t } = useTranslation();

  return (
    <DocsArticle>
      <DocsTitle title={t('docsPage.incomingWebhooks.title')} lede={t('docsPage.incomingWebhooks.subtitle')} />

      <Section title={t('docsPage.incomingWebhooks.overview')} description={t('docsPage.incomingWebhooks.overviewDesc1')}>
        <p className="max-w-2xl leading-relaxed text-muted-foreground">
          {t('docsPage.incomingWebhooks.overviewDesc2')}
        </p>
        <Note label={t('docsPage.incomingWebhooks.forwardLabel')}>{t('docsPage.incomingWebhooks.forwardDesc')}</Note>
      </Section>

      <Section title={t('docsPage.incomingWebhooks.ingressUrl')} description={t('docsPage.incomingWebhooks.ingressUrlDesc')}>
        <CodeBlock code={'POST https://your-api.com/ingress/{token}'} label="http" />
      </Section>

      <Section title={t('docsPage.incomingWebhooks.verificationModes')}>
        <DefinitionList
          items={[
            { term: 'NONE', definition: t('docsPage.incomingWebhooks.modeNone') },
            { term: 'HMAC_GENERIC', definition: t('docsPage.incomingWebhooks.modeHmac') },
          ]}
        />
        <p className="text-sm text-muted-foreground">{t('docsPage.incomingWebhooks.providerTypes')}</p>
      </Section>

      <Section title={t('docsPage.incomingWebhooks.destinations')} description={t('docsPage.incomingWebhooks.destinationsDesc')} />
    </DocsArticle>
  );
}
