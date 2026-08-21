/// <reference types="vitest" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    css: false,
    // P1-28: v8 provider (no extra native instrumentation step, and it's
    // already a dependency of the vitest version pinned here) - reporters
    // chosen so a human (text), a PR artifact viewer (html) and a badge/CI
    // gate (json-summary, lcov) all have a format to read.
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov', 'json-summary'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/**/*.d.ts',
        'src/**/*.{test,spec}.{ts,tsx}',
        'src/test/**',
        'src/main.tsx',
        'src/vite-env.d.ts',
        'src/i18n/locales/**',
        'src/types/**',
      ],
      // P1-28 baseline (recorded 2026-08-21, see this task's Progress log):
      //   lines 16.38% / statements 16.38% / functions 18.63% / branches 58.04%
      // Set a couple points below that measured baseline (not aspirationally
      // high - see the P1-17 postmortem on gates nobody respects) so normal
      // coverage-tool jitter doesn't redden the build, while still catching
      // an actual regression. Only 11 test files exist today against ~150
      // source files - ratchet these up as P2/P3 UI test tasks land, don't
      // leave them here.
      //
      // P1-19 re-baseline (recorded 2026-08-22, same test files/assertions -
      // no coverage regression): bumping @vitest/coverage-v8 1.6.1 -> 3.2.4
      // (alongside vitest/vite themselves) changed the v8 provider's
      // line/statement remapping and measured lines/statements at 13.35%
      // against the exact same suite that measured 16.38% before - functions
      // (20.06%) and branches (59.58%) barely moved, so this is instrumentation
      // methodology, not lost coverage. Lowered lines/statements to stay a
      // couple points under the new number; left functions/branches alone
      // since they still clear the old thresholds comfortably.
      thresholds: {
        lines: 12,
        statements: 12,
        functions: 16,
        branches: 55,
      },
    },
  }
})
