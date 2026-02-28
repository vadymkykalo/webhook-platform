/**
 * Injects Content-Security-Policy meta tag dynamically based on environment variables.
 *
 * Environment variables (set via VITE_ prefix):
 *   VITE_API_URL          — API origin (e.g. https://api.hookflow.dev). Empty = same origin.
 *   VITE_CSP_EXTRA_CONNECT — additional connect-src origins, space-separated.
 *
 * In development (localhost), connect-src automatically includes http://localhost:* and ws://localhost:*.
 * In production, only 'self' + VITE_API_URL origin are allowed.
 */
export function initCSP() {
  const apiUrl = import.meta.env.VITE_API_URL || '';
  const extraConnect = import.meta.env.VITE_CSP_EXTRA_CONNECT || '';
  const isDev = import.meta.env.DEV;

  // Build connect-src
  const connectSources = new Set<string>(["'self'"]);

  if (apiUrl) {
    try {
      const origin = new URL(apiUrl).origin;
      connectSources.add(origin);
    } catch {
      connectSources.add(apiUrl);
    }
  }

  if (isDev) {
    connectSources.add('http://localhost:*');
    connectSources.add('https://localhost:*');
    connectSources.add('ws://localhost:*');
    connectSources.add('wss://localhost:*');
  }

  if (extraConnect) {
    extraConnect.split(/\s+/).forEach((src: string) => {
      if (src) connectSources.add(src);
    });
  }

  const policy = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: blob:",
    `connect-src ${[...connectSources].join(' ')}`,
    "frame-src 'none'",
    "object-src 'none'",
    "base-uri 'self'",
  ].join('; ');

  const meta = document.createElement('meta');
  meta.httpEquiv = 'Content-Security-Policy';
  meta.content = policy;
  document.head.prepend(meta);
}
