# P2-31 — Hardcoded strings and a 704KB bundle from eager locales

- **Status:** TODO
- **Priority:** P2
- **Branch:** `feature/P2-31-i18n-and-bundle`
- **Depends on:** nothing
- **Module:** `webhook-platform-ui`

## Context

The i18n foundation is genuinely good and unusual — `en` and `uk`, **2916 keys
each, zero drift in either direction**. The ~60 identical values are mostly
legitimate (`you@example.com`, "SSO", "mTLS", "FIFO"). Credit where due; this
task is about the leaks around the edges, not the system.

## 31a — Hardcoded English on core operational pages

`DeliveriesPage.tsx:39-52` — the filter dropdowns on your busiest operational
page are raw English, rendered directly as `{opt.label}`:

```ts
const STATUS_OPTIONS = [
  { value: '', label: 'All Statuses' }, { value: 'SUCCESS', label: 'Success' },
  { value: 'FAILED', label: 'Failed' }, { value: 'DLQ', label: 'DLQ' }, …];
const DATE_RANGE_OPTIONS = [
  { value: '24h', label: 'Last 24 hours' }, { value: '7d', label: 'Last 7 days' }, …];
```

Same class of leak in `RulesPage.tsx:49-52` ("Route to endpoint", "Transform
payload", "Drop event", "Tag event"), `IncomingSourceDetailPage.tsx:41-44`
("Aggressive"/"Standard"/"Patient"/"No retry"), `PiiRulesPage.tsx:29-31`, and all
9 workflow node labels in `components/workflow/nodes/nodeTypes.ts`. Status badges
render the raw enum (`{status}` → `SUCCESS`).

Plus ~18 untranslated JSX text nodes outside Landing/Docs, concentrated in
`TransformationsPage.tsx` (13), `SendTestEventModal.tsx`, `ErrorBoundary.tsx`,
`EventDetailPage.tsx`, `WorkflowBuilderPage.tsx`.

Switching to Ukrainian gives a visibly half-translated Deliveries page.

- [ ] Move all of the above into the locale files, in both languages.
- [ ] Map status enums to translated labels rather than rendering the raw value.
- [ ] Add an eslint rule or a CI grep that catches new hardcoded JSX text, so
      this does not re-accumulate. Without it, it will.

## 31b — Both locales ship in the main chunk

`src/i18n/index.ts` statically imports both:
```ts
import en from './locales/en.json';   // 158 KB
import uk from './locales/uk.json';   // 230 KB
```

`dist/assets/index-*.js` is **704 KB** — the largest chunk in the build. Every
English visitor downloads 230 KB of Ukrainian they will never use.

- [ ] Switch to `i18next-http-backend` or a dynamic `import()` per language.
- [ ] Verify the language switcher still works, including on first load with a
      detected language and on refresh.
- [ ] Record the entry-chunk size before and after — the expected drop is roughly
      55%.
- [ ] While in the build: `AnalyticsPage` is 374 KB, essentially all Recharts.
      Confirm it is lazily loaded (routes appear to be) and note whether further
      splitting is worth it.

## Tests to write

- [ ] A locale-parity test: every key in `en.json` exists in `uk.json` and vice
      versa. Currently true — lock it in before it drifts.
- [ ] A render test asserting a translated label appears for a status badge and a
      filter option, in both languages.

## Verification

```bash
cd webhook-platform-ui
npm run build
ls -la dist/assets/index-*.js         # before vs after
npm run test:ci
```

Manual:
```bash
# switch the dashboard to Ukrainian, walk Deliveries / Rules / PII / Workflows
# no English should remain outside brand terms
# reload on each page and confirm the language persists
```

## Definition of done

- [ ] No hardcoded user-facing strings outside Landing/Docs code samples.
- [ ] Locales lazy-loaded; entry chunk measurably smaller (numbers in the log).
- [ ] Parity test and anti-regression lint in place.

## Progress log
