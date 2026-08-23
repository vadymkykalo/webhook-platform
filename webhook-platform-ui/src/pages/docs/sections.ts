import type { LucideIcon } from 'lucide-react';
import {
  ArrowDownToLine,
  Book,
  Code,
  FileCheck,
  Fingerprint,
  GitBranch,
  Key,
  Package,
  Shield,
  Terminal,
  Workflow,
  Zap,
} from 'lucide-react';

/**
 * What the docs are made of: guides a person writes, and one reference nobody
 * writes. The reference is generated from `openapi.yaml`, so an endpoint added
 * to the backend appears here without anyone editing this file.
 */

export type SectionId =
  | 'overview'
  | 'getting-started'
  | 'authentication'
  | 'webhook-security'
  | 'incoming-webhooks'
  | 'rules-engine'
  | 'schema-registry'
  | 'deterministic-replay'
  | 'workflows'
  | 'errors'
  | 'cli'
  | 'sdks'
  | 'api-reference';

export interface SectionMeta {
  id: SectionId;
  labelKey: string;
  icon: LucideIcon;
}

export const GUIDE_SECTIONS: SectionMeta[] = [
  { id: 'overview', labelKey: 'docsPage.sections.overview', icon: Book },
  { id: 'getting-started', labelKey: 'docsPage.sections.gettingStarted', icon: Zap },
  { id: 'authentication', labelKey: 'docsPage.sections.authentication', icon: Key },
  { id: 'webhook-security', labelKey: 'docsPage.sections.webhookSecurity', icon: Shield },
  { id: 'incoming-webhooks', labelKey: 'docsPage.sections.incomingWebhooks', icon: ArrowDownToLine },
  { id: 'rules-engine', labelKey: 'docsPage.sections.rulesEngine', icon: GitBranch },
  { id: 'schema-registry', labelKey: 'docsPage.sections.schemaRegistry', icon: FileCheck },
  { id: 'deterministic-replay', labelKey: 'docsPage.sections.deterministicReplay', icon: Fingerprint },
  { id: 'workflows', labelKey: 'docsPage.sections.workflowAutomation', icon: Workflow },
  { id: 'errors', labelKey: 'docsPage.sections.errors', icon: Code },
  { id: 'cli', labelKey: 'docsPage.sections.cli', icon: Terminal },
  { id: 'sdks', labelKey: 'docsPage.sections.sdks', icon: Package },
];

export const REFERENCE_SECTION: SectionMeta = {
  id: 'api-reference',
  labelKey: 'docsPage.sections.apiReference',
  icon: Code,
};

const ALL_IDS = new Set<string>([...GUIDE_SECTIONS.map((s) => s.id), REFERENCE_SECTION.id]);

/**
 * The hand-written per-resource API pages are gone; `EmptyState docsLink`s and
 * bookmarks still point at their anchors. Each one now lands on the generated
 * reference, opened at the group that replaced it, so no existing link 404s.
 */
const LEGACY_ANCHORS: Record<string, { section: SectionId; group?: string }> = {
  'events-api': { section: 'api-reference', group: 'events' },
  'endpoints-api': { section: 'api-reference', group: 'endpoints' },
  'subscriptions-api': { section: 'api-reference', group: 'subscriptions' },
  'deliveries-api': { section: 'api-reference', group: 'deliveries' },
  'transformations-api': { section: 'api-reference', group: 'transformations' },
  'workflow-automation': { section: 'workflows' },
  api: { section: 'api-reference' },
  reference: { section: 'api-reference' },
};

/** Resolves a URL hash (current or long-obsolete) to a section and, maybe, a group. */
export function resolveAnchor(hash: string): { section: SectionId; group?: string } {
  const id = hash.replace(/^#/, '');
  if (ALL_IDS.has(id)) return { section: id as SectionId };
  return LEGACY_ANCHORS[id] ?? { section: 'overview' };
}
