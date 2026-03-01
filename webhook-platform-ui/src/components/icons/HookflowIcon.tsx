import { type SVGProps } from 'react';

/**
 * Unique Hookflow brand icon — a stylized hook with flow arrow.
 * Drop-in replacement for Lucide icons (accepts className for sizing).
 */
export function HookflowIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="M5 4v9c0 3.3 2.7 6 6 6s6-2.7 6-6V9" />
      <path d="M14 12l3-3 3 3" />
      <circle cx="5" cy="4" r="1.5" fill="currentColor" stroke="none" />
    </svg>
  );
}
