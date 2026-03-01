import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CheckCircle2, ChevronDown, ChevronUp, ArrowRight, Sparkles, X, FolderKanban,
  Webhook, Bell, Key, Send, Eye, ArrowDownToLine, Globe, ShieldCheck, Terminal, Activity
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent } from './ui/card';
import { Button } from './ui/button';
import { cn } from '../lib/utils';

interface Step {
  key: string;
  done: boolean;
  icon: React.ElementType;
  path: string;
}

interface OnboardingChecklistProps {
  projectId: string | undefined;
  hasProjects: boolean;
  hasEndpoints: boolean;
  hasSubscriptions: boolean;
  hasApiKeys: boolean;
  hasEvents: boolean;
  hasDeliveries: boolean;
  hasIncomingSources?: boolean;
  hasIncomingDestinations?: boolean;
}

const DISMISS_KEY = 'hookflow_onboarding_dismissed';

function TrackHeader({ icon: Icon, label, completedCount, totalCount, iconColor }: {
  icon: React.ElementType; label: string; completedCount: number; totalCount: number; iconColor: string;
}) {
  const progress = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;
  return (
    <div className="mb-2">
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-2">
          <Icon className={cn("h-4 w-4", iconColor)} />
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</span>
        </div>
        <span className="text-[11px] text-muted-foreground">{completedCount}/{totalCount}</span>
      </div>
      <div className="h-1 bg-muted rounded-full overflow-hidden">
        <div
          className={cn("h-full rounded-full transition-all duration-500 ease-out", completedCount === totalCount ? "bg-success" : "bg-primary")}
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}

function StepRow({ step, navigate, t }: { step: Step; navigate: (path: string) => void; t: (key: string) => string }) {
  return (
    <div
      key={step.key}
      className={cn(
        'flex items-center gap-3 px-3 py-2 rounded-lg transition-colors group',
        step.done ? 'opacity-60' : 'hover:bg-accent cursor-pointer'
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
        <p className={cn('text-sm font-medium', step.done ? 'line-through text-muted-foreground' : 'text-foreground')}>
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
  );
}

export default function OnboardingChecklist({
  projectId,
  hasProjects,
  hasEndpoints,
  hasSubscriptions,
  hasApiKeys,
  hasEvents,
  hasDeliveries,
  hasIncomingSources = false,
  hasIncomingDestinations = false,
}: OnboardingChecklistProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [dismissed, setDismissed] = useState(() => localStorage.getItem(DISMISS_KEY) === 'true');
  const [expanded, setExpanded] = useState(true);
  const [activeTab, setActiveTab] = useState<'outgoing' | 'incoming'>(() => {
    if (hasIncomingSources && !hasEndpoints && !hasSubscriptions) return 'incoming';
    return 'outgoing';
  });

  if (dismissed) return null;

  const outgoingSteps: Step[] = [
    { key: 'createProject', done: hasProjects, icon: FolderKanban, path: '/admin/projects' },
    { key: 'createEndpoint', done: hasEndpoints, icon: Webhook, path: projectId ? `/admin/projects/${projectId}/endpoints` : '/admin/projects' },
    { key: 'createSubscription', done: hasSubscriptions, icon: Bell, path: projectId ? `/admin/projects/${projectId}/subscriptions` : '/admin/projects' },
    { key: 'createApiKey', done: hasApiKeys, icon: Key, path: projectId ? `/admin/projects/${projectId}/api-keys` : '/admin/projects' },
    { key: 'sendEvent', done: hasEvents, icon: Send, path: projectId ? `/admin/projects/${projectId}/events` : '/admin/projects' },
    { key: 'checkDelivery', done: hasDeliveries, icon: Eye, path: projectId ? `/admin/projects/${projectId}/deliveries` : '/admin/projects' },
  ];

  const incomingSteps: Step[] = [
    { key: 'createProject', done: hasProjects, icon: FolderKanban, path: '/admin/projects' },
    { key: 'createIncomingSource', done: hasIncomingSources, icon: ArrowDownToLine, path: projectId ? `/admin/projects/${projectId}/incoming-sources` : '/admin/projects' },
    { key: 'enableHmac', done: hasIncomingSources, icon: ShieldCheck, path: projectId ? `/admin/projects/${projectId}/incoming-sources` : '/admin/projects' },
    { key: 'createIncomingDestination', done: hasIncomingDestinations, icon: Globe, path: projectId ? `/admin/projects/${projectId}/incoming-sources` : '/admin/projects' },
    { key: 'testIncomingCurl', done: false, icon: Terminal, path: projectId ? `/admin/projects/${projectId}/incoming-sources` : '/admin/projects' },
    { key: 'verifyForwarding', done: false, icon: Activity, path: projectId ? `/admin/projects/${projectId}/incoming-events` : '/admin/projects' },
  ];

  const activeSteps = activeTab === 'outgoing' ? outgoingSteps : incomingSteps;
  const outCompleted = outgoingSteps.filter((s) => s.done).length;
  const inCompleted = incomingSteps.filter((s) => s.done).length;
  const totalCompleted = outCompleted + inCompleted;
  const totalSteps = outgoingSteps.length + incomingSteps.length;
  const allDone = totalCompleted === totalSteps;

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
                  {t('onboarding.collapsed', { completed: totalCompleted, total: totalSteps })}
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

        {/* Tabs */}
        {expanded && (
          <div className="px-5 pb-3">
            <div className="flex gap-1 p-0.5 bg-muted rounded-lg">
              <button
                onClick={() => setActiveTab('outgoing')}
                className={cn(
                  'flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all',
                  activeTab === 'outgoing'
                    ? 'bg-card text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                <Send className="h-3 w-3" />
                {t('onboarding.tabOutgoing')}
                <span className={cn(
                  'ml-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full',
                  outCompleted === outgoingSteps.length ? 'bg-success/10 text-success' : 'bg-primary/10 text-primary'
                )}>
                  {outCompleted}/{outgoingSteps.length}
                </span>
              </button>
              <button
                onClick={() => setActiveTab('incoming')}
                className={cn(
                  'flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all',
                  activeTab === 'incoming'
                    ? 'bg-card text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                <ArrowDownToLine className="h-3 w-3" />
                {t('onboarding.tabIncoming')}
                <span className={cn(
                  'ml-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full',
                  inCompleted === incomingSteps.length ? 'bg-success/10 text-success' : 'bg-primary/10 text-primary'
                )}>
                  {inCompleted}/{incomingSteps.length}
                </span>
              </button>
            </div>
          </div>
        )}

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
              <div>
                <TrackHeader
                  icon={activeTab === 'outgoing' ? Send : ArrowDownToLine}
                  label={activeTab === 'outgoing' ? t('onboarding.trackOutgoing') : t('onboarding.trackIncoming')}
                  completedCount={activeTab === 'outgoing' ? outCompleted : inCompleted}
                  totalCount={activeSteps.length}
                  iconColor={activeTab === 'outgoing' ? 'text-primary' : 'text-emerald-500'}
                />
                <div className="space-y-0.5">
                  {activeSteps.map((step) => (
                    <StepRow key={step.key} step={step} navigate={navigate} t={t} />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
