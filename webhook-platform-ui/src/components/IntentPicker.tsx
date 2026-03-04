import { useState } from 'react';
import { Send, Radio, ArrowLeftRight, ArrowRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from './ui/button';
import { cn } from '../lib/utils';

export type WebhookIntent = 'send' | 'receive' | 'both';

const INTENT_SEEN_KEY = 'hookflow_intent_seen';
const INTENT_VALUE_KEY = 'hookflow_intent';

export function hasSeenIntentPicker(): boolean {
  return localStorage.getItem(INTENT_SEEN_KEY) === 'true';
}

export function getStoredIntent(): WebhookIntent | null {
  return localStorage.getItem(INTENT_VALUE_KEY) as WebhookIntent | null;
}

interface IntentPickerProps {
  onSelect: (intent: WebhookIntent) => void;
}

const INTENTS: { key: WebhookIntent; icon: React.ElementType; iconColor: string; iconBg: string }[] = [
  { key: 'send', icon: Send, iconColor: 'text-blue-600', iconBg: 'bg-blue-100 dark:bg-blue-900/30' },
  { key: 'receive', icon: Radio, iconColor: 'text-emerald-600', iconBg: 'bg-emerald-100 dark:bg-emerald-900/30' },
  { key: 'both', icon: ArrowLeftRight, iconColor: 'text-purple-600', iconBg: 'bg-purple-100 dark:bg-purple-900/30' },
];

export default function IntentPicker({ onSelect }: IntentPickerProps) {
  const { t } = useTranslation();
  const [selected, setSelected] = useState<WebhookIntent | null>(null);

  const handleContinue = () => {
    if (!selected) return;
    localStorage.setItem(INTENT_SEEN_KEY, 'true');
    localStorage.setItem(INTENT_VALUE_KEY, selected);
    onSelect(selected);
  };

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-xl font-bold tracking-tight">{t('auth.intent.title')}</h2>
        <p className="text-sm text-muted-foreground mt-1">{t('auth.intent.subtitle')}</p>
      </div>

      <div className="space-y-3">
        {INTENTS.map(({ key, icon: Icon, iconColor, iconBg }) => (
          <button
            key={key}
            onClick={() => setSelected(key)}
            className={cn(
              'w-full flex items-start gap-4 p-4 rounded-xl border text-left transition-all',
              selected === key
                ? 'border-primary bg-primary/5 ring-2 ring-primary/20'
                : 'border-border hover:border-primary/30 hover:bg-muted/30'
            )}
          >
            <div className={cn('h-10 w-10 rounded-lg flex items-center justify-center shrink-0', iconBg)}>
              <Icon className={cn('h-5 w-5', iconColor)} />
            </div>
            <div className="min-w-0">
              <span className="text-sm font-semibold block">{t(`auth.intent.${key}`)}</span>
              <span className="text-xs text-muted-foreground mt-0.5 block">{t(`auth.intent.${key}Desc`)}</span>
            </div>
          </button>
        ))}
      </div>

      <Button onClick={handleContinue} disabled={!selected} className="w-full">
        {t('auth.intent.continue')}
        <ArrowRight className="h-4 w-4 ml-1.5" />
      </Button>
    </div>
  );
}
