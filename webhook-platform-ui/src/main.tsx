import React, { Suspense } from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './i18n';
import { initCSP } from './lib/csp';
import { initTheme } from './lib/theme';
import './index.css';

initCSP();
initTheme();

// Locale bundles now load via a dynamic import() per language (see src/i18n),
// so any component that calls useTranslation() before its language's bundle
// has resolved will suspend. This top-level boundary catches that on first
// load and on every language switch — nested route-level <Suspense> boundaries
// (see router.tsx) still handle their own lazy-loaded page chunks separately.
function AppLoader() {
  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Suspense fallback={<AppLoader />}>
      <App />
    </Suspense>
  </React.StrictMode>
);
