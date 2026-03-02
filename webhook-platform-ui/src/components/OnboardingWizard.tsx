import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Sparkles, ArrowRight, ArrowLeft, X, FolderKanban,
  Webhook, Bell, Key, Send, CheckCircle2, Rocket
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from './ui/button';
import { cn } from '../lib/utils';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from './ui/dialog';

interface OnboardingWizardProps {
  open: boolean;
  onClose: () => void;
  projectId?: string;
}

interface WizardStep {
  key: string;
  icon: React.ElementType;
  iconColor: string;
  iconBg: string;
}

const WIZARD_SEEN_KEY = 'hookflow_wizard_seen';

export function hasSeenWizard(): boolean {
  return localStorage.getItem(WIZARD_SEEN_KEY) === 'true';
}

export function markWizardSeen(): void {
  localStorage.setItem(WIZARD_SEEN_KEY, 'true');
}

const STEPS: WizardStep[] = [
  { key: 'welcome', icon: Sparkles, iconColor: 'text-primary', iconBg: 'bg-primary/10' },
  { key: 'project', icon: FolderKanban, iconColor: 'text-blue-600', iconBg: 'bg-blue-100 dark:bg-blue-900/30' },
  { key: 'endpoint', icon: Webhook, iconColor: 'text-emerald-600', iconBg: 'bg-emerald-100 dark:bg-emerald-900/30' },
  { key: 'subscription', icon: Bell, iconColor: 'text-amber-600', iconBg: 'bg-amber-100 dark:bg-amber-900/30' },
  { key: 'apiKey', icon: Key, iconColor: 'text-purple-600', iconBg: 'bg-purple-100 dark:bg-purple-900/30' },
  { key: 'send', icon: Send, iconColor: 'text-rose-600', iconBg: 'bg-rose-100 dark:bg-rose-900/30' },
  { key: 'done', icon: Rocket, iconColor: 'text-success', iconBg: 'bg-success/10' },
];

export default function OnboardingWizard({ open, onClose, projectId }: OnboardingWizardProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState(0);

  const step = STEPS[currentStep];
  const isFirst = currentStep === 0;
  const isLast = currentStep === STEPS.length - 1;
  const Icon = step.icon;

  const handleNext = () => {
    if (isLast) {
      handleClose();
      return;
    }
    setCurrentStep(s => s + 1);
  };

  const handleBack = () => {
    if (!isFirst) setCurrentStep(s => s - 1);
  };

  const handleClose = () => {
    markWizardSeen();
    setCurrentStep(0);
    onClose();
  };

  const handleGoTo = () => {
    markWizardSeen();
    const paths: Record<string, string> = {
      project: '/admin/projects',
      endpoint: projectId ? `/admin/projects/${projectId}/endpoints` : '/admin/projects',
      subscription: projectId ? `/admin/projects/${projectId}/subscriptions` : '/admin/projects',
      apiKey: projectId ? `/admin/projects/${projectId}/api-keys` : '/admin/projects',
      send: projectId ? `/admin/projects/${projectId}/events` : '/admin/projects',
      done: projectId ? `/admin/projects/${projectId}/endpoints` : '/admin/dashboard',
    };
    const path = paths[step.key];
    if (path) {
      navigate(path);
      onClose();
      setCurrentStep(0);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose(); }}>
      <DialogContent className="sm:max-w-md">
        <button
          onClick={handleClose}
          className="absolute right-4 top-4 rounded-sm opacity-70 hover:opacity-100 transition-opacity"
        >
          <X className="h-4 w-4" />
        </button>

        <DialogHeader className="text-center items-center pt-2">
          <div className={cn("h-16 w-16 rounded-2xl flex items-center justify-center mb-3", step.iconBg)}>
            <Icon className={cn("h-8 w-8", step.iconColor)} />
          </div>
          <DialogTitle className="text-xl">
            {t(`wizard.${step.key}.title`)}
          </DialogTitle>
          <DialogDescription className="text-sm mt-2 max-w-sm mx-auto">
            {t(`wizard.${step.key}.description`)}
          </DialogDescription>
        </DialogHeader>

        {/* Step indicator dots */}
        <div className="flex items-center justify-center gap-1.5 py-3">
          {STEPS.map((_, i) => (
            <div
              key={i}
              className={cn(
                "h-1.5 rounded-full transition-all duration-300",
                i === currentStep
                  ? "w-6 bg-primary"
                  : i < currentStep
                    ? "w-1.5 bg-primary/40"
                    : "w-1.5 bg-muted-foreground/20"
              )}
            />
          ))}
        </div>

        {/* Tip box for non-welcome/done steps */}
        {step.key !== 'welcome' && step.key !== 'done' && (
          <div className="rounded-lg border bg-muted/50 p-3 text-center">
            <p className="text-xs text-muted-foreground">
              {t(`wizard.${step.key}.tip`)}
            </p>
          </div>
        )}

        {step.key === 'done' && (
          <div className="flex justify-center">
            <div className="flex items-center gap-3 py-2">
              {[FolderKanban, Webhook, Bell, Key, Send].map((_, i) => (
                <div key={i} className="flex items-center gap-1">
                  {i > 0 && <div className="w-4 h-px bg-success/30" />}
                  <div className="h-8 w-8 rounded-lg bg-success/10 flex items-center justify-center">
                    <CheckCircle2 className="h-4 w-4 text-success" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <DialogFooter className="flex-row gap-2 sm:justify-between">
          <div>
            {!isFirst && (
              <Button variant="ghost" size="sm" onClick={handleBack}>
                <ArrowLeft className="h-3.5 w-3.5 mr-1" />
                {t('wizard.back')}
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            {step.key !== 'welcome' && step.key !== 'done' && (
              <Button variant="outline" size="sm" onClick={handleGoTo}>
                {t('wizard.goThere')}
                <ArrowRight className="h-3.5 w-3.5 ml-1" />
              </Button>
            )}
            <Button size="sm" onClick={isLast ? handleGoTo : handleNext}>
              {isLast ? t('wizard.getStarted') : isFirst ? t('wizard.letsGo') : t('wizard.next')}
              {!isLast && <ArrowRight className="h-3.5 w-3.5 ml-1" />}
              {isLast && <Rocket className="h-3.5 w-3.5 ml-1" />}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
