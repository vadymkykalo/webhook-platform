import { Link } from 'react-router-dom';
import { AlertTriangle, ArrowRight, FileJson2, GitBranch, Repeat2, Shield, Workflow } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { panel, Reveal, Section, SectionHeader } from './primitives';
import { cn } from '../../lib/utils';

/**
 * What the platform does to a webhook, for someone deciding whether to buy it.
 *
 * This slot used to be a quickstart: a curl-and-compose block and three
 * localhost ports. That is documentation — it belongs in /docs, where it still
 * is — and it answered a question a buyer never asked. The six capabilities
 * below are the ones that change what a webhook does without a deploy, and
 * every one of them is a screen in the product today:
 *
 *   transformations  TransformationController + PayloadTransformService
 *   rules            RuleController, actions ROUTE / TRANSFORM / DROP / TAG
 *   workflows        WorkflowController + the eight node executors
 *   PII masking      PiiMaskingController, PiiSanitizer's email/phone/card
 *   schemas          SchemaController, SchemaValidationPolicy WARN | BLOCK
 *   alerts           AlertController + AlertNotificationService's four channels
 *
 * The id stays `quickstart` because PublicLayout's footer links to /#quickstart
 * and that file has another owner.
 */

const CAPABILITIES = [
  { key: 'transformations', icon: Repeat2 },
  { key: 'rules', icon: GitBranch },
  { key: 'workflows', icon: Workflow },
  { key: 'pii', icon: Shield },
  { key: 'schemas', icon: FileJson2 },
  { key: 'alerts', icon: AlertTriangle },
] as const;

export default function QuickstartSection() {
  const { t } = useTranslation();

  return (
    <Section id="quickstart">
      <Reveal>
        <SectionHeader
          eyebrow={t('landing.platform.eyebrow')}
          title={t('landing.platform.title')}
          body={t('landing.platform.body')}
        />
      </Reveal>

      <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {CAPABILITIES.map(({ key, icon: Icon }, i) => (
          <Reveal key={key} delay={i * 60} className="h-full">
            <div className={cn('flex h-full flex-col p-5 sm:p-6', panel(true))}>
              <Icon className="h-4 w-4 text-primary" aria-hidden="true" />
              <h3 className="mt-3 text-[15px] font-semibold text-foreground">
                {t(`landing.platform.${key}Title`)}
              </h3>
              <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">
                {t(`landing.platform.${key}Body`)}
              </p>
            </div>
          </Reveal>
        ))}
      </div>

      <div className="mt-8 flex flex-col gap-3 border-t border-rail pt-6 sm:flex-row sm:items-center sm:justify-between">
        <p className="max-w-3xl text-sm text-muted-foreground">{t('landing.platform.note')}</p>
        <Link
          to="/docs"
          className="inline-flex shrink-0 items-center gap-1.5 text-sm font-medium text-primary hover:underline"
        >
          {t('landing.platform.docsLink')} <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
        </Link>
      </div>
    </Section>
  );
}
