import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, X } from 'lucide-react';
import { cn } from '../lib/utils';

interface PasswordStrengthIndicatorProps {
  password: string;
  className?: string;
}

interface Rule {
  key: string;
  test: (p: string) => boolean;
}

const RULES: Rule[] = [
  { key: 'minLength', test: (p) => p.length >= 8 },
  { key: 'uppercase', test: (p) => /[A-Z]/.test(p) },
  { key: 'lowercase', test: (p) => /[a-z]/.test(p) },
  { key: 'digit', test: (p) => /\d/.test(p) },
  { key: 'special', test: (p) => /[^A-Za-z0-9]/.test(p) },
];

export function getPasswordStrength(password: string): number {
  if (!password) return 0;
  return RULES.filter((r) => r.test(password)).length;
}

export default function PasswordStrengthIndicator({ password, className }: PasswordStrengthIndicatorProps) {
  const { t } = useTranslation();

  const results = useMemo(
    () => RULES.map((r) => ({ ...r, passed: r.test(password) })),
    [password],
  );

  const strength = results.filter((r) => r.passed).length;
  const level = strength <= 1 ? 'weak' : strength <= 3 ? 'fair' : strength <= 4 ? 'good' : 'strong';

  const barColor = {
    weak: 'bg-red-500',
    fair: 'bg-amber-500',
    good: 'bg-blue-500',
    strong: 'bg-green-500',
  }[level];

  if (!password) return null;

  return (
    <div className={cn('space-y-2', className)}>
      {/* Strength bar */}
      <div className="flex items-center gap-2">
        <div className="flex-1 flex gap-1">
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className={cn(
                'h-1.5 flex-1 rounded-full transition-colors duration-200',
                i < strength ? barColor : 'bg-muted',
              )}
            />
          ))}
        </div>
        <span className={cn('text-[11px] font-medium', {
          'text-red-500': level === 'weak',
          'text-amber-500': level === 'fair',
          'text-blue-500': level === 'good',
          'text-green-500': level === 'strong',
        })}>
          {t(`passwordStrength.${level}`)}
        </span>
      </div>

      {/* Rules checklist */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
        {results.map((r) => (
          <div key={r.key} className="flex items-center gap-1.5 text-[11px]">
            {r.passed ? (
              <Check className="h-3 w-3 text-green-500 shrink-0" />
            ) : (
              <X className="h-3 w-3 text-muted-foreground/50 shrink-0" />
            )}
            <span className={r.passed ? 'text-green-600 dark:text-green-400' : 'text-muted-foreground'}>
              {t(`passwordStrength.rules.${r.key}`)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
