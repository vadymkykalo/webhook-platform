import { useState } from 'react';
import { Moon, Sun } from 'lucide-react';
import { getTheme, setTheme } from '../lib/theme';

interface ThemeToggleProps {
  variant?: 'icon' | 'full';
  className?: string;
}

export default function ThemeToggle({ variant = 'icon', className }: ThemeToggleProps) {
  const [, setToggle] = useState(false);
  const isDark = typeof document !== 'undefined' && document.documentElement.classList.contains('dark');

  const toggle = () => {
    const next = getTheme() === 'dark' ? 'light' : 'dark';
    setTheme(next);
    setToggle(p => !p);
  };

  if (variant === 'full') {
    return (
      <button
        type="button"
        onClick={toggle}
        className={className ?? 'flex items-center gap-2 px-3 py-2 text-[13px] font-medium text-muted-foreground hover:text-foreground transition-colors rounded-lg hover:bg-accent w-full'}
        title="Toggle theme"
      >
        {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        <span>{isDark ? 'Light mode' : 'Dark mode'}</span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggle(); }}
      className={className ?? 'p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors'}
      title="Toggle theme"
    >
      {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </button>
  );
}
