/// <reference types="vitest" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    // The app calls /api/v1/... on its own origin, because in production nginx
    // serves the bundle and the API from one host. In dev there is no nginx, so
    // without this every API call lands on Vite itself and comes back 404 —
    // which the UI renders as "the requested resource was not found", sending
    // you looking for a bug in the endpoint rather than at a missing backend.
    // VITE_API_URL still wins when set; this is only the zero-config default.
    proxy: {
      '/api': {
        target: process.env.VITE_DEV_API_TARGET || 'http://localhost:8080',
        changeOrigin: true,
      },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    css: false,
    // v8 provider (no extra native instrumentation step, and it's
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
      // Baseline (recorded 2026-08-21):
      //   lines 16.38% / statements 16.38% / functions 18.63% / branches 58.04%
      // Set a couple points below that measured baseline (not aspirationally
      // high - gates nobody respects don't get respected) so normal
      // coverage-tool jitter doesn't redden the build, while still catching
      // an actual regression. Only 11 test files exist today against ~150
      // source files - ratchet these up as more UI tests land, don't
      // leave them here.
      //
      // Re-baseline (recorded 2026-08-22, same test files/assertions -
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
