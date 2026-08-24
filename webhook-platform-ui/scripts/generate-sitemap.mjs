#!/usr/bin/env node
/**
 * Derives public/sitemap.xml from the routes the app actually serves.
 *
 * The public surface is the landing page, pricing, contact, and one URL per
 * documentation guide — and the guide list already exists, in
 * `src/pages/docs/sections.ts`, as the thing the sidebar renders. Reading it
 * here rather than retyping the paths means a guide added to the docs is in the
 * sitemap on the next run, and a guide removed cannot leave a 404 behind in it.
 *
 * Admin routes are excluded on purpose: they are behind auth, they render
 * nothing to a crawler, and listing them only invites requests.
 *
 *   npm run seo:sitemap             regenerate (commit the result)
 *   npm run seo:sitemap -- --check  fail if the committed copy is stale
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const SECTIONS = resolve(here, '../src/pages/docs/sections.ts');
const OUT = resolve(here, '../public/sitemap.xml');

const SITE = 'https://hookflow.dev';

/** The marketing pages, with the priority they deserve relative to each other. */
const MARKETING = [
  { path: '/', priority: '1.0', changefreq: 'weekly' },
  { path: '/pricing', priority: '0.9', changefreq: 'weekly' },
  { path: '/contact', priority: '0.5', changefreq: 'monthly' },
  { path: '/docs', priority: '0.8', changefreq: 'weekly' },
];

/**
 * Pulls the guide ids out of the GUIDE_SECTIONS literal.
 *
 * A regex rather than an import because this file is TypeScript with a
 * `LucideIcon` type import — running it through a transpiler to read a list of
 * string literals would be the more fragile of the two.
 */
function guideIds() {
  const source = readFileSync(SECTIONS, 'utf8');
  const block = source.match(/export const GUIDE_SECTIONS[^[]*\[([\s\S]*?)\n\];/);
  if (!block) throw new Error('GUIDE_SECTIONS not found in sections.ts — did its shape change?');
  const ids = [...block[1].matchAll(/\bid:\s*'([^']+)'/g)].map((m) => m[1]);
  if (ids.length === 0) throw new Error('GUIDE_SECTIONS matched but held no ids');
  return ids;
}

/**
 * No hreflang alternates. The app has two locales but one set of URLs — the
 * language is chosen client-side — so every alternate would point at the URL it
 * sits on, which tells a crawler nothing and misreports the page as having
 * localized variants. When there are real `/uk/...` paths, they belong here.
 */
function urlEntry({ path, priority, changefreq }) {
  return [
    '  <url>',
    `    <loc>${SITE}${path}</loc>`,
    `    <changefreq>${changefreq}</changefreq>`,
    `    <priority>${priority}</priority>`,
    '  </url>',
  ].join('\n');
}

const entries = [
  ...MARKETING,
  // 'overview' is /docs, already listed above.
  ...guideIds()
    .filter((id) => id !== 'overview')
    .map((id) => ({ path: `/docs/${id}`, priority: '0.7', changefreq: 'monthly' })),
  { path: '/docs/api-reference', priority: '0.7', changefreq: 'weekly' },
];

const xml = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
  ...entries.map(urlEntry),
  '</urlset>',
  '',
].join('\n');

if (process.argv.includes('--check')) {
  let current = '';
  try {
    current = readFileSync(OUT, 'utf8');
  } catch {
    console.error('public/sitemap.xml is missing. Run: npm run seo:sitemap');
    process.exit(1);
  }
  if (current !== xml) {
    console.error('public/sitemap.xml is stale. Run: npm run seo:sitemap');
    process.exit(1);
  }
  console.log(`sitemap.xml is up to date (${entries.length} URLs).`);
} else {
  writeFileSync(OUT, xml);
  console.log(`Wrote public/sitemap.xml (${entries.length} URLs).`);
}
