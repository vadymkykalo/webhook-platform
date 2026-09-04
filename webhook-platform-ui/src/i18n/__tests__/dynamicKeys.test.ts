import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';
import en from '../locales/en.json';
import uk from '../locales/uk.json';
import { STATUS_KIND } from '../../pages/EventsPage';

/**
 * Locale parity (en vs uk) cannot catch a key missing from *both* files, and
 * TypeScript cannot check a template-literal `t()` key against JSON. Between
 * them sits a whole class of bug that reaches production looking like
 * `events.deliveryStatus.unknown` printed where a label should be.
 *
 * Everything below renders a backend enum value through an interpolated key.
 * The enums come from the committed openapi.yaml, which CI already proves has
 * not drifted from what the API serves — so this list stays true on its own
 * rather than being a copy somebody has to remember to update.
 */

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const spec = yaml.load(readFileSync(resolve(root, '../openapi.yaml'), 'utf8')) as {
  components: { schemas: Record<string, { properties?: Record<string, { enum?: string[] }> }> };
};

/** Locale namespace → the schema property whose enum it has to cover. */
const ENUM_BACKED: Array<[namespace: string, schema: string, property: string]> = [
  ['billing.statuses', 'OrganizationBillingResponse', 'billingStatus'],
  ['replay.status', 'ReplaySessionResponse', 'status'],
  ['workflows.execStatus', 'WorkflowExecutionResponse', 'status'],
  ['workflows.stepStatus', 'StepExecutionResponse', 'status'],
  ['incidents.statuses', 'IncidentResponse', 'status'],
  ['alerts.severities', 'AlertRuleResponse', 'severity'],
  ['alerts.channels', 'AlertRuleResponse', 'channel'],
  ['piiRules.maskStyles', 'PiiMaskingRuleResponse', 'maskStyle'],
];

function labelsUnder(locale: object, namespace: string): Record<string, unknown> {
  let cur: unknown = locale;
  for (const part of namespace.split('.')) {
    cur = (cur as Record<string, unknown> | undefined)?.[part];
  }
  expect(cur, `${namespace} is missing from the locale file entirely`).toBeTypeOf('object');
  return cur as Record<string, unknown>;
}

describe('interpolated translation keys resolve', () => {
  describe.each(ENUM_BACKED)('%s covers %s.%s', (namespace, schema, property) => {
    const values = spec.components.schemas[schema]?.properties?.[property]?.enum;

    it('the schema still declares the enum this maps to', () => {
      expect(values, `${schema}.${property} has no enum in openapi.yaml — fix this mapping`)
        .toBeDefined();
    });

    it.each([['en', en], ['uk', uk]] as const)('%s has a label for every value', (_name, locale) => {
      const labels = labelsUnder(locale, namespace);
      expect(values!.filter((v) => !(v in labels))).toEqual([]);
    });

    it('carries no label for a value the API cannot return', () => {
      expect(Object.keys(labelsUnder(en, namespace)).filter((k) => !values!.includes(k))).toEqual([]);
    });
  });

  /* Not a backend enum: derived in the page from a rollup the API does not
     serve. STATUS_KIND is a Record over the union, so TypeScript guarantees
     its keys are the complete set — which is why the test reads it rather
     than restating the values. */
  it.each([['en', en], ['uk', uk]] as const)(
    'events.deliveryStatus has a label for every derived status (%s)',
    (_name, locale) => {
      const labels = labelsUnder(locale, 'events.deliveryStatus');
      expect(Object.keys(STATUS_KIND).filter((k) => !(k in labels))).toEqual([]);
    },
  );
});
