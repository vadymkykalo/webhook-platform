import { useTranslation } from 'react-i18next';
import {
  CodeBlock,
  CodeSample,
  DefinitionList,
  DocsArticle,
  DocsTitle,
  Note,
  Section,
  SubSection,
} from '../primitives';
import type { SampleLanguage } from '../primitives';
import { challengeSamples, signatureSamples } from '../samples';

export default function WebhookSecurity({
  language,
  onLanguageChange,
}: {
  language: SampleLanguage;
  onLanguageChange: (language: SampleLanguage) => void;
}) {
  const { t } = useTranslation();

  return (
    <DocsArticle>
      <DocsTitle title={t('docsPage.security.title')} lede={t('docsPage.security.subtitle')} />

      <Section title={t('docsPage.security.sigVerification')} description={t('docsPage.security.sigVerificationDesc')}>
        <SubSection title={t('docsPage.security.headers')}>
          <DefinitionList
            items={[
              { term: 'X-Signature', definition: t('docsPage.security.headerSignature') },
              { term: 'X-Event-Id', definition: t('docsPage.security.headerEventId') },
              { term: 'X-Delivery-Id', definition: t('docsPage.security.headerDeliveryId') },
              { term: 'X-Timestamp', definition: t('docsPage.security.headerTimestamp') },
            ]}
          />
        </SubSection>

        <SubSection title={t('docsPage.security.verificationExamples')}>
          <CodeSample samples={signatureSamples} language={language} onLanguageChange={onLanguageChange} />
        </SubSection>

        <Note label={t('docsPage.security.pitfallsLabel')}>{t('docsPage.security.pitfallsDesc')}</Note>
      </Section>

      <Section
        title={t('docsPage.security.endpointVerification')}
        description={t('docsPage.security.endpointVerificationDesc')}
      >
        <SubSection title={t('docsPage.security.challengeRequest')}>
          <CodeBlock code={challengeSamples.request} label="http" />
        </SubSection>
        <SubSection title={t('docsPage.security.expectedResponse')}>
          <CodeBlock code={challengeSamples.response} label="http" />
        </SubSection>
      </Section>
    </DocsArticle>
  );
}
