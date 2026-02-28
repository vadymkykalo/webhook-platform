import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle2, ChevronDown, ChevronUp, ArrowRight, Sparkles, X, FolderKanban, Webhook, Bell, Key, Send, Eye } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent } from './ui/card';
import { Button } from './ui/button';
import { cn } from '../lib/utils';

interface OnboardingChecklistProps {
  projectId: string | undefined;
  hasProjects: boolean;
  hasEndpoints: boolean;
  hasSubscriptions: boolean;
  hasApiKeys: boolean;
  hasEvents: boolean;
  hasDeliveries: boolean;
}

const DISMISS_KEY = 'hookflow_onboarding_dismissed';

export default function OnboardingChecklist({
  projectId,
  hasProjects,
  hasEndpoints,
  hasSubscriptions,
  hasApiKeys,
  hasEvents,
  hasDeliveries,
}: OnboardingChecklistProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [dismissed, setDismissed] = useState(() => localStorage.getItem(DISMISS_KEY) === 'true');
  const [expanded, setExpanded] = useState(true);

  if (dismissed) return null;

  const steps = [
    {
      key: 'createProject',
      done: hasProjects,
      icon: FolderKanban,
      path: '/admin/projects',
    },
    {
      key: 'createEndpoint',
      done: hasEndpoints,
      icon: Webhook,
      path: projectId ? `/admin/projects/${projectId}/endpoints` : '/admin/projects',
    },
    {
      key: 'createSubscription',
      done: hasSubscriptions,
      icon: Bell,
      path: projectId ? `/admin/projects/${projectId}/subscriptions` : '/admin/projects',
    },
    {
      key: 'createApiKey',
      done: hasApiKeys,
      icon: Key,
      path: projectId ? `/admin/projects/${projectId}/api-keys` : '/admin/projects',
    },
    {
      key: 'sendEvent',
      done: hasEvents,
      icon: Send,
      path: projectId ? `/admin/projects/${projectId}/events` : '/admin/projects',
    },
    {
      key: 'checkDelivery',
      done: hasDeliveries,
      icon: Eye,
      path: projectId ? `/admin/projects/${projectId}/deliveries` : '/admin/projects',
    },
  ];

  const completedCount = steps.filter((s) => s.done).length;
  const allDone = completedCount === steps.length;
  const progress = (completedCount / steps.length) * 100;

  const handleDismiss = () => {
    localStorage.setItem(DISMISS_KEY, 'true');
    setDismissed(true);
  };

  return (
    <Card className="mb-6 border-primary/20 bg-gradient-to-br from-primary/5 via-card to-card overflow-hidden">
      <CardContent className="p-0">
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
              <Sparkles className="h-[18px] w-[18px] text-primary" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-foreground">{t('onboarding.title')}</h3>
              {!expanded && (
                <p className="text-xs text-muted-foreground">
                  {t('onboarding.collapsed', { completed: completedCount, total: steps.length })}
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => setExpanded(!expanded)}
              className="text-muted-foreground h-7 w-7"
            >
              {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={handleDismiss}
              className="text-muted-foreground h-7 w-7"
              title={t('onboarding.dismiss')}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        {/* Progress bar */}
        <div className="px-5 pb-3">
          <div className="h-1.5 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all duration-500 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="text-[11px] text-muted-foreground mt-1.5">
            {t('onboarding.collapsed', { completed: completedCount, total: steps.length })}
          </p>
        </div>

        {/* Steps */}
        {expanded && (
          <div className="px-5 pb-5">
            {allDone ? (
              <div className="flex flex-col items-center text-center py-4">
                <div className="h-12 w-12 rounded-full bg-success/10 flex items-center justify-center mb-3">
                  <CheckCircle2 className="h-6 w-6 text-success" />
                </div>
                <p className="text-sm font-medium text-foreground mb-1">{t('onboarding.allDone')}</p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3"
                  onClick={() => navigate('/quickstart')}
                >
                  {t('onboarding.allDoneAction')} <ArrowRight className="h-3.5 w-3.5 ml-1" />
                </Button>
              </div>
            ) : (
              <div className="space-y-1">
                {steps.map((step) => (
                    <div
                      key={step.key}
                      className={cn(
                        'flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors group',
                        step.done
                          ? 'opacity-60'
                          : 'hover:bg-accent cursor-pointer'
                      )}
                      onClick={() => !step.done && navigate(step.path)}
                      role={step.done ? undefined : 'button'}
                    >
                      {step.done ? (
                        <CheckCircle2 className="h-[18px] w-[18px] text-success flex-shrink-0" />
                      ) : (
                        <step.icon className="h-[18px] w-[18px] text-muted-foreground/40 flex-shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className={cn(
                          'text-sm font-medium',
                          step.done ? 'line-through text-muted-foreground' : 'text-foreground'
                        )}>
                          {t(`onboarding.steps.${step.key}`)}
                        </p>
                        <p className="text-[11px] text-muted-foreground leading-tight mt-0.5">
                          {t(`onboarding.steps.${step.key}Desc`)}
                        </p>
                      </div>
                      {!step.done && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="opacity-0 group-hover:opacity-100 transition-opacity text-xs h-7 px-2 flex-shrink-0"
                          onClick={(e) => { e.stopPropagation(); navigate(step.path); }}
                        >
                          {t('onboarding.go')} <ArrowRight className="h-3 w-3 ml-1" />
                        </Button>
                      )}
                    </div>
                ))}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
