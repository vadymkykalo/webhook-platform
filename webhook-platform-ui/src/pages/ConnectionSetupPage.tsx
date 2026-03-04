import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Webhook, CheckCircle2, Circle, Copy, Loader2, Zap, Plus, ArrowRight,
  Key, Radio, RefreshCw, ChevronDown, ChevronUp, Shield,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { showApiError, showSuccess } from '../lib/toast';
import { endpointsApi, type EndpointTestResponse } from '../api/endpoints.api';
import { subscriptionsApi } from '../api/subscriptions.api';
import { useProject, useEndpoints, useSubscriptions } from '../api/queries';
import PageSkeleton from '../components/PageSkeleton';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { cn } from '../lib/utils';
import { usePermissions } from '../auth/usePermissions';
import PermissionGate from '../components/PermissionGate';
import VerificationGate from '../components/VerificationGate';

function generateSecret(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

type Step = 'url' | 'secret' | 'test' | 'events' | 'retry';

const STEPS: Step[] = ['url', 'secret', 'test', 'events', 'retry'];

const DEFAULT_EVENT_TYPES = [
  'order.created',
  'order.updated',
  'payment.succeeded',
  'payment.failed',
  'customer.created',
];

export default function ConnectionSetupPage() {
  const { t } = useTranslation();
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const { canManageEndpoints } = usePermissions();
  const { data: project, isLoading: projectLoading } = useProject(projectId);
  const { data: endpoints = [], isLoading: endpointsLoading, refetch: refetchEndpoints } = useEndpoints(projectId);
  const { refetch: refetchSubs } = useSubscriptions(projectId);

  // Wizard state
  const [activeStep, setActiveStep] = useState<Step>('url');
  const [expandedSteps, setExpandedSteps] = useState<Set<Step>>(new Set(['url']));

  // Step 1: URL
  const [url, setUrl] = useState('');
  const [description, setDescription] = useState('');
  const [creatingEndpoint, setCreatingEndpoint] = useState(false);
  const [createdEndpointId, setCreatedEndpointId] = useState<string | null>(null);

  // Step 2: Secret
  const [secret, setSecret] = useState<string | null>(null);
  const [secretCopied, setSecretCopied] = useState(false);

  // Step 3: Test
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<EndpointTestResponse | null>(null);

  // Step 4: Event types
  const [eventTypes, setEventTypes] = useState<string[]>(['']);
  const [creatingSubscriptions, setCreatingSubscriptions] = useState(false);
  const [subscriptionsCreated, setSubscriptionsCreated] = useState(false);

  // Step 5: Retry
  const [maxAttempts, setMaxAttempts] = useState(7);
  const [timeoutSeconds, setTimeoutSeconds] = useState(30);
  const [retryDelays, setRetryDelays] = useState('60,300,900,3600,21600,86400');
  const [retryConfigured, setRetryConfigured] = useState(false);

  // Detect existing state — resume from where user left off
  useEffect(() => {
    if (endpoints.length > 0 && !createdEndpointId) {
      const latest = endpoints[endpoints.length - 1];
      setCreatedEndpointId(latest.id);
      setUrl(latest.url);
      setDescription(latest.description || '');
      // Secret can't be recovered, but mark step 1 as done
      // Open next uncompleted step
      setExpandedSteps(new Set(['secret']));
      setActiveStep('secret');
    }
  }, [endpoints]); // eslint-disable-line react-hooks/exhaustive-deps

  const stepDone = (step: Step): boolean => {
    switch (step) {
      case 'url':
        return !!createdEndpointId;
      case 'secret':
        return secretCopied;
      case 'test':
        return testResult?.success === true;
      case 'events':
        return subscriptionsCreated;
      case 'retry':
        return retryConfigured;
    }
  };

  const completedCount = STEPS.filter(stepDone).length;

  const toggleStep = (step: Step) => {
    setExpandedSteps((prev) => {
      const next = new Set(prev);
      if (next.has(step)) next.delete(step);
      else next.add(step);
      return next;
    });
    setActiveStep(step);
  };

  const advanceTo = (step: Step) => {
    setExpandedSteps((prev) => {
      const next = new Set(prev);
      next.add(step);
      return next;
    });
    setActiveStep(step);
  };

  // ── Step 1: Create endpoint ───────────────────────────────────────
  const handleCreateEndpoint = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectId) return;

    setCreatingEndpoint(true);
    try {
      const sec = generateSecret();
      const endpoint = await endpointsApi.create(projectId, {
        url,
        description,
        enabled: true,
        secret: sec,
      });
      setCreatedEndpointId(endpoint.id);
      setSecret(sec);
      showSuccess(t('connectionSetup.toast.endpointCreated'));
      refetchEndpoints();
      advanceTo('secret');
    } catch (err: any) {
      showApiError(err, 'endpoints.toast.createFailed');
    } finally {
      setCreatingEndpoint(false);
    }
  };

  // ── Step 2: Copy secret ───────────────────────────────────────────
  const handleCopySecret = () => {
    if (!secret) return;
    navigator.clipboard.writeText(secret);
    setSecretCopied(true);
    showSuccess(t('connectionSetup.toast.secretCopied'));
  };

  // ── Step 3: Test ping ─────────────────────────────────────────────
  const handleTestPing = async () => {
    if (!projectId || !createdEndpointId) return;

    setTesting(true);
    setTestResult(null);
    try {
      const result = await endpointsApi.test(projectId, createdEndpointId);
      setTestResult(result);
      if (result.success) {
        showSuccess(t('connectionSetup.toast.testPassed'));
      }
    } catch (err: any) {
      showApiError(err, 'endpoints.toast.testError');
    } finally {
      setTesting(false);
    }
  };

  // ── Step 4: Create subscriptions ──────────────────────────────────
  const handleCreateSubscriptions = async () => {
    if (!projectId || !createdEndpointId) return;

    const types = eventTypes.map((t) => t.trim()).filter(Boolean);
    if (types.length === 0) return;

    setCreatingSubscriptions(true);
    try {
      for (const eventType of types) {
        await subscriptionsApi.create(projectId, {
          endpointId: createdEndpointId,
          eventType,
          enabled: true,
          maxAttempts,
          timeoutSeconds,
          retryDelays,
        });
      }
      setSubscriptionsCreated(true);
      showSuccess(t('connectionSetup.toast.subscriptionsCreated', { count: types.length }));
      refetchSubs();
      advanceTo('retry');
    } catch (err: any) {
      showApiError(err, 'toast.errors.server');
    } finally {
      setCreatingSubscriptions(false);
    }
  };

  const addEventType = () => setEventTypes((prev) => [...prev, '']);
  const updateEventType = (index: number, value: string) =>
    setEventTypes((prev) => prev.map((v, i) => (i === index ? value : v)));
  const removeEventType = (index: number) =>
    setEventTypes((prev) => prev.filter((_, i) => i !== index));

  // ── Step 5: Retry policy ──────────────────────────────────────────
  const handleSaveRetryPolicy = () => {
    setRetryConfigured(true);
    showSuccess(t('connectionSetup.toast.retryConfigured'));
  };

  // ── Render ────────────────────────────────────────────────────────
  if (projectLoading || endpointsLoading) {
    return <PageSkeleton />;
  }

  const stepIcon = (step: Step) =>
    stepDone(step) ? (
      <CheckCircle2 className="h-5 w-5 text-green-500 shrink-0" />
    ) : (
      <Circle className={cn('h-5 w-5 shrink-0', activeStep === step ? 'text-primary' : 'text-muted-foreground/40')} />
    );

  return (
    <div className="p-6 lg:p-8 max-w-3xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-title tracking-tight">{t('connectionSetup.title')}</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {t('connectionSetup.subtitle', { project: project?.name })}
        </p>
        <div className="flex items-center gap-3 mt-4">
          <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all duration-500"
              style={{ width: `${(completedCount / STEPS.length) * 100}%` }}
            />
          </div>
          <span className="text-xs font-medium text-muted-foreground">
            {completedCount}/{STEPS.length}
          </span>
        </div>
      </div>

      {/* Steps */}
      <div className="space-y-3">
        {/* ── STEP 1: Endpoint URL ─────────────────────────────────── */}
        <Card className={cn(stepDone('url') && 'border-green-200 dark:border-green-900/40')}>
          <CardHeader
            className="cursor-pointer select-none"
            onClick={() => toggleStep('url')}
          >
            <div className="flex items-center gap-3">
              {stepIcon('url')}
              <div className="flex-1 min-w-0">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Webhook className="h-4 w-4 text-primary" />
                  {t('connectionSetup.steps.url.title')}
                </CardTitle>
                <CardDescription className="text-xs mt-0.5">
                  {t('connectionSetup.steps.url.desc')}
                </CardDescription>
              </div>
              {expandedSteps.has('url') ? (
                <ChevronUp className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              )}
            </div>
          </CardHeader>
          {expandedSteps.has('url') && (
            <CardContent className="pt-0">
              {stepDone('url') ? (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-green-50 dark:bg-green-900/10 border border-green-200 dark:border-green-900/30">
                  <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
                  <code className="text-xs font-mono truncate">{url}</code>
                </div>
              ) : (
                <form onSubmit={handleCreateEndpoint} className="space-y-3">
                  <div className="space-y-2">
                    <Label htmlFor="ep-url">{t('connectionSetup.steps.url.urlLabel')}</Label>
                    <Input
                      id="ep-url"
                      type="url"
                      placeholder="https://api.example.com/webhooks"
                      value={url}
                      onChange={(e) => setUrl(e.target.value)}
                      required
                      disabled={creatingEndpoint}
                      autoFocus
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="ep-desc">{t('connectionSetup.steps.url.descLabel')}</Label>
                    <Textarea
                      id="ep-desc"
                      placeholder={t('connectionSetup.steps.url.descPlaceholder')}
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      disabled={creatingEndpoint}
                      rows={2}
                    />
                  </div>
                  <PermissionGate allowed={canManageEndpoints}>
                    <VerificationGate>
                      <Button type="submit" disabled={creatingEndpoint} size="sm">
                        {creatingEndpoint && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                        {t('connectionSetup.steps.url.create')}
                      </Button>
                    </VerificationGate>
                  </PermissionGate>
                </form>
              )}
            </CardContent>
          )}
        </Card>

        {/* ── STEP 2: Signing Secret ─────────────────────────────────── */}
        <Card className={cn(stepDone('secret') && 'border-green-200 dark:border-green-900/40')}>
          <CardHeader
            className="cursor-pointer select-none"
            onClick={() => toggleStep('secret')}
          >
            <div className="flex items-center gap-3">
              {stepIcon('secret')}
              <div className="flex-1 min-w-0">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Key className="h-4 w-4 text-primary" />
                  {t('connectionSetup.steps.secret.title')}
                </CardTitle>
                <CardDescription className="text-xs mt-0.5">
                  {t('connectionSetup.steps.secret.desc')}
                </CardDescription>
              </div>
              {expandedSteps.has('secret') ? (
                <ChevronUp className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              )}
            </div>
          </CardHeader>
          {expandedSteps.has('secret') && (
            <CardContent className="pt-0">
              {!secret ? (
                <p className="text-xs text-muted-foreground italic">
                  {t('connectionSetup.steps.secret.pending')}
                </p>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Input
                      value={secret}
                      readOnly
                      className="font-mono text-xs"
                    />
                    <Button variant="outline" size="icon" onClick={handleCopySecret} title={t('common.copy')}>
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-900/30">
                    <p className="text-xs text-amber-800 dark:text-amber-300">
                      <Shield className="h-3.5 w-3.5 inline mr-1 -mt-0.5" />
                      {t('connectionSetup.steps.secret.warning')}
                    </p>
                  </div>
                  {secretCopied && (
                    <Button size="sm" variant="ghost" onClick={() => advanceTo('test')}>
                      {t('connectionSetup.next')} <ArrowRight className="h-3.5 w-3.5 ml-1" />
                    </Button>
                  )}
                </div>
              )}
            </CardContent>
          )}
        </Card>

        {/* ── STEP 3: Test Ping ──────────────────────────────────────── */}
        <Card className={cn(stepDone('test') && 'border-green-200 dark:border-green-900/40')}>
          <CardHeader
            className="cursor-pointer select-none"
            onClick={() => toggleStep('test')}
          >
            <div className="flex items-center gap-3">
              {stepIcon('test')}
              <div className="flex-1 min-w-0">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Zap className="h-4 w-4 text-primary" />
                  {t('connectionSetup.steps.test.title')}
                </CardTitle>
                <CardDescription className="text-xs mt-0.5">
                  {t('connectionSetup.steps.test.desc')}
                </CardDescription>
              </div>
              {expandedSteps.has('test') ? (
                <ChevronUp className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              )}
            </div>
          </CardHeader>
          {expandedSteps.has('test') && (
            <CardContent className="pt-0">
              {!createdEndpointId ? (
                <p className="text-xs text-muted-foreground italic">
                  {t('connectionSetup.steps.test.pending')}
                </p>
              ) : (
                <div className="space-y-3">
                  <Button onClick={handleTestPing} disabled={testing} size="sm">
                    {testing ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Zap className="h-3.5 w-3.5" />
                    )}
                    {t('connectionSetup.steps.test.send')}
                  </Button>

                  {testResult && (
                    <div
                      className={cn(
                        'p-3 rounded-lg border',
                        testResult.success
                          ? 'bg-green-50 dark:bg-green-900/10 border-green-200 dark:border-green-900/30'
                          : 'bg-red-50 dark:bg-red-900/10 border-red-200 dark:border-red-900/30'
                      )}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        {testResult.success ? (
                          <CheckCircle2 className="h-4 w-4 text-green-600" />
                        ) : (
                          <Circle className="h-4 w-4 text-red-600" />
                        )}
                        <span className={cn('text-xs font-semibold', testResult.success ? 'text-green-700 dark:text-green-400' : 'text-red-700 dark:text-red-400')}>
                          {testResult.success ? t('connectionSetup.steps.test.passed') : t('connectionSetup.steps.test.failed')}
                        </span>
                      </div>
                      <p className="text-[11px] text-muted-foreground">
                        HTTP {testResult.httpStatusCode || '—'} · {testResult.latencyMs}ms
                      </p>
                      {testResult.errorMessage && (
                        <p className="text-[11px] text-red-600 mt-1">{testResult.errorMessage}</p>
                      )}
                    </div>
                  )}

                  {testResult?.success && (
                    <Button size="sm" variant="ghost" onClick={() => advanceTo('events')}>
                      {t('connectionSetup.next')} <ArrowRight className="h-3.5 w-3.5 ml-1" />
                    </Button>
                  )}

                  {testResult && !testResult.success && (
                    <p className="text-[11px] text-muted-foreground">
                      {t('connectionSetup.steps.test.retryHint')}
                    </p>
                  )}
                </div>
              )}
            </CardContent>
          )}
        </Card>

        {/* ── STEP 4: Event Types ──────────────────────────────────── */}
        <Card className={cn(stepDone('events') && 'border-green-200 dark:border-green-900/40')}>
          <CardHeader
            className="cursor-pointer select-none"
            onClick={() => toggleStep('events')}
          >
            <div className="flex items-center gap-3">
              {stepIcon('events')}
              <div className="flex-1 min-w-0">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Radio className="h-4 w-4 text-primary" />
                  {t('connectionSetup.steps.events.title')}
                </CardTitle>
                <CardDescription className="text-xs mt-0.5">
                  {t('connectionSetup.steps.events.desc')}
                </CardDescription>
              </div>
              {expandedSteps.has('events') ? (
                <ChevronUp className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              )}
            </div>
          </CardHeader>
          {expandedSteps.has('events') && (
            <CardContent className="pt-0">
              {!createdEndpointId ? (
                <p className="text-xs text-muted-foreground italic">
                  {t('connectionSetup.steps.events.pending')}
                </p>
              ) : subscriptionsCreated ? (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-green-50 dark:bg-green-900/10 border border-green-200 dark:border-green-900/30">
                  <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
                  <span className="text-xs">
                    {t('connectionSetup.steps.events.done', { count: eventTypes.filter((t) => t.trim()).length })}
                  </span>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {DEFAULT_EVENT_TYPES.map((type) => (
                      <button
                        key={type}
                        type="button"
                        onClick={() => {
                          if (!eventTypes.includes(type)) {
                            setEventTypes((prev) => {
                              const filtered = prev.filter((t) => t.trim());
                              return [...filtered, type];
                            });
                          }
                        }}
                        className="px-2 py-0.5 text-[11px] rounded-full border bg-muted hover:bg-accent transition-colors"
                      >
                        + {type}
                      </button>
                    ))}
                  </div>

                  {eventTypes.map((type, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <Input
                        value={type}
                        onChange={(e) => updateEventType(i, e.target.value)}
                        placeholder="e.g. order.created, payment.*, **"
                        className="text-xs"
                      />
                      {eventTypes.length > 1 && (
                        <Button variant="ghost" size="icon-sm" onClick={() => removeEventType(i)}>
                          ×
                        </Button>
                      )}
                    </div>
                  ))}

                  <Button variant="ghost" size="sm" onClick={addEventType}>
                    <Plus className="h-3.5 w-3.5" /> {t('connectionSetup.steps.events.add')}
                  </Button>

                  <div className="pt-1">
                    <PermissionGate allowed={canManageEndpoints}>
                      <VerificationGate>
                        <Button
                          size="sm"
                          onClick={handleCreateSubscriptions}
                          disabled={creatingSubscriptions || eventTypes.every((t) => !t.trim())}
                        >
                          {creatingSubscriptions && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                          {t('connectionSetup.steps.events.create')}
                        </Button>
                      </VerificationGate>
                    </PermissionGate>
                  </div>
                </div>
              )}
            </CardContent>
          )}
        </Card>

        {/* ── STEP 5: Retry Policy ─────────────────────────────────── */}
        <Card className={cn(stepDone('retry') && 'border-green-200 dark:border-green-900/40')}>
          <CardHeader
            className="cursor-pointer select-none"
            onClick={() => toggleStep('retry')}
          >
            <div className="flex items-center gap-3">
              {stepIcon('retry')}
              <div className="flex-1 min-w-0">
                <CardTitle className="text-sm flex items-center gap-2">
                  <RefreshCw className="h-4 w-4 text-primary" />
                  {t('connectionSetup.steps.retry.title')}
                </CardTitle>
                <CardDescription className="text-xs mt-0.5">
                  {t('connectionSetup.steps.retry.desc')}
                </CardDescription>
              </div>
              {expandedSteps.has('retry') ? (
                <ChevronUp className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              )}
            </div>
          </CardHeader>
          {expandedSteps.has('retry') && (
            <CardContent className="pt-0">
              {retryConfigured ? (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-green-50 dark:bg-green-900/10 border border-green-200 dark:border-green-900/30">
                  <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
                  <span className="text-xs">
                    {t('connectionSetup.steps.retry.done', { attempts: maxAttempts, timeout: timeoutSeconds })}
                  </span>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs">{t('connectionSetup.steps.retry.maxAttempts')}</Label>
                      <Input
                        type="number"
                        min={1}
                        max={20}
                        value={maxAttempts}
                        onChange={(e) => setMaxAttempts(Number(e.target.value))}
                        className="text-xs"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">{t('connectionSetup.steps.retry.timeout')}</Label>
                      <Input
                        type="number"
                        min={1}
                        max={60}
                        value={timeoutSeconds}
                        onChange={(e) => setTimeoutSeconds(Number(e.target.value))}
                        className="text-xs"
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">{t('connectionSetup.steps.retry.delays')}</Label>
                    <Input
                      value={retryDelays}
                      onChange={(e) => setRetryDelays(e.target.value)}
                      placeholder="60,300,900,3600,21600,86400"
                      className="text-xs font-mono"
                    />
                    <p className="text-[10px] text-muted-foreground">{t('connectionSetup.steps.retry.delaysHint')}</p>
                  </div>
                  <div className="flex items-center gap-4 p-3 rounded-lg bg-muted/50 border text-[11px]">
                    <div>
                      <span className="font-medium">{t('connectionSetup.steps.retry.preview')}:</span>{' '}
                      {retryDelays.split(',').map((d, i) => {
                        const secs = parseInt(d.trim());
                        if (isNaN(secs)) return null;
                        const label = secs >= 3600 ? `${Math.round(secs / 3600)}h` : secs >= 60 ? `${Math.round(secs / 60)}m` : `${secs}s`;
                        return (
                          <Badge key={i} variant="secondary" className="text-[10px] mr-1">
                            #{i + 1}: {label}
                          </Badge>
                        );
                      })}
                    </div>
                  </div>
                  <PermissionGate allowed={canManageEndpoints}>
                    <VerificationGate>
                      <Button size="sm" onClick={handleSaveRetryPolicy}>
                        {t('connectionSetup.steps.retry.save')}
                      </Button>
                    </VerificationGate>
                  </PermissionGate>
                </div>
              )}
            </CardContent>
          )}
        </Card>
      </div>

      {/* Footer */}
      {completedCount === STEPS.length && (
        <div className="mt-8 p-6 rounded-xl border bg-gradient-to-r from-primary/5 to-primary/10 text-center animate-fade-in">
          <CheckCircle2 className="h-10 w-10 text-green-500 mx-auto mb-3" />
          <h2 className="text-lg font-bold">{t('connectionSetup.complete.title')}</h2>
          <p className="text-sm text-muted-foreground mt-1 mb-4">
            {t('connectionSetup.complete.desc')}
          </p>
          <div className="flex justify-center gap-3">
            <Button variant="outline" onClick={() => navigate(`/admin/projects/${projectId}/endpoints`)}>
              {t('connectionSetup.complete.viewEndpoints')}
            </Button>
            <Button onClick={() => navigate(`/admin/projects/${projectId}/events`)}>
              {t('connectionSetup.complete.sendEvent')}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
