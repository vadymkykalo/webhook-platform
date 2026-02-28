import { useTranslation } from 'react-i18next';

const LANGUAGES = [
  { code: 'en', label: 'EN', flag: '🇬🇧' },
  { code: 'uk', label: 'UA', flag: '🇺🇦' },
] as const;

interface LanguageSwitcherProps {
  variant?: 'icon' | 'full';
  className?: string;
}

export default function LanguageSwitcher({ variant = 'icon', className }: LanguageSwitcherProps) {
  const { i18n } = useTranslation();
  const current = LANGUAGES.find(l => l.code === i18n.language) || LANGUAGES[0];
  const next = LANGUAGES.find(l => l.code !== i18n.language) || LANGUAGES[1];

  const toggle = () => {
    i18n.changeLanguage(next.code);
  };

  if (variant === 'full') {
    return (
      <button
        type="button"
        onClick={toggle}
        className={className ?? 'flex items-center gap-2 px-3 py-2 text-[13px] font-medium text-muted-foreground hover:text-foreground transition-colors rounded-lg hover:bg-accent w-full'}
      >
        <span className="text-base leading-none">{current.flag}</span>
        <span>{current.label} → {next.label}</span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={toggle}
      className={className ?? 'p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors text-xs font-semibold'}
      title={`Switch to ${next.label}`}
    >
      {current.flag} {current.label}
    </button>
  );
}
