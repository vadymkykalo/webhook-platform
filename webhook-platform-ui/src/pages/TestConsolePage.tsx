import { useState, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import {
  Send, Play, Loader2, CheckCircle2, XCircle, Clock, ArrowRight,
  ChevronDown, ChevronRight, Zap, Timer, AlertTriangle,
  FileJson2, Copy, Check
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { showApiError, showSuccess, showWarning } from '../lib/toast';
import { eventsApi, type EventResponse } from '../api/events.api';
import { endpointsApi, type EndpointTestResponse } from '../api/endpoints.api';
import { deliveriesApi } from '../api/deliveries.api';
import { useProject, useEndpoints, useSubscriptions, useEventTypes } from '../api/queries';
import type { DeliveryResponse, DeliveryAttemptResponse } from '../types/api.types';
import PageSkeleton from '../components/PageSkeleton';
import { usePermissions } from '../auth/usePermissions';
import PermissionGate from '../components/PermissionGate';
import VerificationGate from '../components/VerificationGate';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Select } from '../components/ui/select';
import { cn } from '../lib/utils';

type ConsoleMode = 'event' | 'ping';

interface DeliveryWithAttempts extends DeliveryResponse {
  attempts?: DeliveryAttemptResponse[];
  endpointUrl?: string;
}

export default function TestConsolePage() {
  const { t } = useTranslation();
  const { projectId } = useParams<{ projectId: string }>();
  const { canManageEndpoints } = usePermissions();
  const { data: project, isLoading: projectLoading } = useProject(projectId);
  const { data: endpoints = [], isLoading: endpointsLoading } = useEndpoints(projectId);
  const { data: subscriptions = [] } = useSubscriptions(projectId);
  const { data: catalogTypes = [] } = useEventTypes(projectId);

  const loading = projectLoading || endpointsLoading;

  // Console mode
  const [mode, setMode] = useState<ConsoleMode>('event');

  // Send Event mode
  const [eventType, setEventType] = useState('');
  const [payload, setPayload] = useState('{\n  "user_id": "123",\n  "action": "created"\n}');
  const [jsonError, setJsonError] = useState('');
  const [sending, setSending] = useState(false);

  // Ping Endpoint mode
  const [selectedEndpointId, setSelectedEndpointId] = useState('');
  const [pinging, setPinging] = useState(false);
  const [pingResult, setPingResult] = useState<EndpointTestResponse | null>(null);

  // Results
  const [lastEvent, setLastEvent] = useState<EventResponse | null>(null);
  const [deliveries, setDeliveries] = useState<DeliveryWithAttempts[]>([]);
  const [loadingResults, setLoadingResults] = useState(false);
  const [expandedDelivery, setExpandedDelivery] = useState<string | null>(null);
  const [polling, setPolling] = useState(false);

  // Expected subscriptions for the typed event type
  const matchingSubscriptions = subscriptions.filter(sub => {
    if (!eventType.trim()) return false;
    if (sub.eventType === '**') return true;
    if (sub.eventType === eventType) return true;
    if (sub.eventType.endsWith('.**')) {
      const prefix = sub.eventType.slice(0, -3);
      return eventType.startsWith(prefix + '.') || eventType === prefix;
    }
    if (sub.eventType.endsWith('.*')) {
      const prefix = sub.eventType.slice(0, -2);
      const rest = eventType.slice(prefix.length + 1);
      return eventType.startsWith(prefix + '.') && !rest.includes('.');
    }
    return false;
  });

  const validateJson = (text: string): boolean => {
    try {
      JSON.parse(text);
      setJsonError('');
      return true;
    } catch {
      setJsonError(t('testConsole.invalidJson'));
      return false;
    }
  };

  const handlePayloadChange = (value: string) => {
    setPayload(value);
    if (value.trim()) validateJson(value);
    else setJsonError('');
  };

  // Poll deliveries for the sent event
  const pollDeliveries = useCallback(async (eventId: string, maxPolls = 10) => {
    if (!projectId) return;
    setPolling(true);
    let polls = 0;
    const poll = async () => {
      try {
        const res = await deliveriesApi.listByProject(projectId, { eventId, size: 50 });
        const enriched: DeliveryWithAttempts[] = await Promise.all(
          res.content.map(async (d) => {
            const ep = endpoints.find(e => e.id === d.endpointId);
            let attempts: DeliveryAttemptResponse[] = [];
            if (d.status !== 'PENDING') {
              try {
                attempts = await deliveriesApi.getAttempts(d.id);
              } catch { /* ignore */ }
            }
            return { ...d, endpointUrl: ep?.url, attempts };
          })
        );
        setDeliveries(enriched);

        // Keep polling if any deliveries are still pending/processing
        const allDone = enriched.length > 0 && enriched.every(d => d.status === 'SUCCESS' || d.status === 'FAILED' || d.status === 'DLQ');
        polls++;
        if (!allDone && polls < maxPolls) {
          setTimeout(() => poll(), 2000);
        } else {
          setPolling(false);
        }
      } catch {
        setPolling(false);
      }
    };
    poll();
  }, [projectId, endpoints]);

  // Send test event
  const handleSendEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectId) return;
    if (!validateJson(payload)) {
      showWarning(t('testConsole.fixJson'));
      return;
    }

    setSending(true);
    setDeliveries([]);
    setPingResult(null);
    setLastEvent(null);
    setExpandedDelivery(null);

    try {
      const data = JSON.parse(payload);
      const response = await eventsApi.sendTestEvent(projectId, { type: eventType, data });
      setLastEvent(response);
      showSuccess(t('testConsole.eventSent', { count: response.deliveriesCreated || 0 }));

      // Start polling deliveries
      if (response.id) {
        setLoadingResults(true);
        // Small delay to let the system create deliveries
        setTimeout(() => {
          pollDeliveries(response.id);
          setLoadingResults(false);
        }, 1000);
      }
    } catch (err: any) {
      showApiError(err, 'toast.errors.server');
    } finally {
      setSending(false);
    }
  };

  // Ping endpoint
  const handlePingEndpoint = async () => {
    if (!projectId || !selectedEndpointId) return;
    setPinging(true);
    setPingResult(null);
    setDeliveries([]);
    setLastEvent(null);

    try {
      const result = await endpointsApi.test(projectId, selectedEndpointId);
      setPingResult(result);
    } catch (err: any) {
      showApiError(err, 'toast.errors.server');
    } finally {
      setPinging(false);
    }
  };

  // Copy helper
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const copyText = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  if (loading) return <PageSkeleton />;
  if (!project) return null;

  const getEndpointUrl = (endpointId: string) => {
    const ep = endpoints.find(e => e.id === endpointId);
    return ep?.url || endpointId;
  };

  return (
    <div className="p-6 lg:p-8 max-w-6xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-title tracking-tight">{t('testConsole.title')}</h1>
        <p className="text-sm text-muted-foreground mt-1" dangerouslySetInnerHTML={{ __html: t('testConsole.subtitle', { project: project.name }) }} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_1fr] gap-6">
        {/* Left: Input Panel */}
        <div className="space-y-4">
          {/* Mode Tabs */}
          <div className="flex gap-1 p-1 bg-muted rounded-lg">
            <button
              onClick={() => setMode('event')}
              className={cn(
                'flex-1 flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium rounded-md transition-all',
                mode === 'event' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <Send className="h-4 w-4" />
              {t('testConsole.sendEvent')}
            </button>
            <button
              onClick={() => setMode('ping')}
              className={cn(
                'flex-1 flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium rounded-md transition-all',
                mode === 'ping' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <Zap className="h-4 w-4" />
              {t('testConsole.pingEndpoint')}
            </button>
          </div>

          {mode === 'event' ? (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">{t('testConsole.sendEvent')}</CardTitle>
                <CardDescription>{t('testConsole.sendEventDesc')}</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSendEvent} className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="tc-eventType" className="text-xs">{t('testConsole.eventType')}</Label>
                    <Input
                      id="tc-eventType"
                      placeholder="user.created"
                      value={eventType}
                      onChange={(e) => setEventType(e.target.value)}
                      required
                      disabled={sending}
                    />
                    {/* Schema hint */}
                    {(() => {
                      const match = catalogTypes.find(et => et.name === eventType.trim());
                      if (!match) return null;
                      return (
                        <div className="flex items-center gap-1.5 text-[11px] text-primary">
                          <FileJson2 className="h-3 w-3" />
                          <span className="font-mono">{match.name}</span>
                          {match.latestVersion != null && <span className="text-muted-foreground">v{match.latestVersion}</span>}
                          {match.activeVersionStatus === 'ACTIVE' && <CheckCircle2 className="h-3 w-3 text-green-500" />}
                        </div>
                      );
                    })()}
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="tc-payload" className="text-xs">{t('testConsole.payload')}</Label>
                    <Textarea
                      id="tc-payload"
                      value={payload}
                      onChange={(e) => handlePayloadChange(e.target.value)}
                      disabled={sending}
                      rows={10}
                      className="font-mono text-xs"
                    />
                    {jsonError && <p className="text-xs text-destructive">{jsonError}</p>}
                  </div>

                  {/* Expected subscriptions preview */}
                  {eventType.trim() && (
                    <div className="rounded-lg border p-3 space-y-2">
                      <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                        {t('testConsole.expectedDeliveries')}
                      </p>
                      {matchingSubscriptions.length === 0 ? (
                        <p className="text-xs text-muted-foreground flex items-center gap-1">
                          <AlertTriangle className="h-3 w-3 text-amber-500" />
                          {t('testConsole.noMatchingSubs')}
                        </p>
                      ) : (
                        <div className="space-y-1">
                          {matchingSubscriptions.map(sub => (
                            <div key={sub.id} className="flex items-center justify-between text-xs">
                              <div className="flex items-center gap-2 min-w-0">
                                <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0" />
                                <span className="font-mono truncate">{getEndpointUrl(sub.endpointId)}</span>
                              </div>
                              <Badge variant={sub.enabled ? 'success' : 'secondary'} className="text-[10px] shrink-0">
                                {sub.enabled ? t('common.on') : t('common.off')}
                              </Badge>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  <PermissionGate allowed={canManageEndpoints}>
                    <VerificationGate>
                      <Button type="submit" className="w-full" disabled={sending || !!jsonError || !eventType.trim()}>
                        {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                        {sending ? t('testConsole.sending') : t('testConsole.runTest')}
                      </Button>
                    </VerificationGate>
                  </PermissionGate>
                </form>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">{t('testConsole.pingEndpoint')}</CardTitle>
                <CardDescription>{t('testConsole.pingDesc')}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="tc-endpoint" className="text-xs">{t('testConsole.selectEndpoint')}</Label>
                  <Select
                    id="tc-endpoint"
                    value={selectedEndpointId}
                    onChange={(e) => setSelectedEndpointId(e.target.value)}
                    disabled={pinging}
                  >
                    <option value="">{t('testConsole.chooseEndpoint')}</option>
                    {endpoints.map(ep => (
                      <option key={ep.id} value={ep.id}>{ep.url}</option>
                    ))}
                  </Select>
                </div>

                <PermissionGate allowed={canManageEndpoints}>
                  <VerificationGate>
                    <Button className="w-full" onClick={handlePingEndpoint} disabled={pinging || !selectedEndpointId}>
                      {pinging ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
                      {pinging ? t('testConsole.pinging') : t('testConsole.runPing')}
                    </Button>
                  </VerificationGate>
                </PermissionGate>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right: Results Panel */}
        <div className="space-y-4">
          <ResultsPanel
            t={t}
            mode={mode}
            lastEvent={lastEvent}
            deliveries={deliveries}
            pingResult={pingResult}
            loadingResults={loadingResults || sending || pinging}
            polling={polling}
            expandedDelivery={expandedDelivery}
            setExpandedDelivery={setExpandedDelivery}
            getEndpointUrl={getEndpointUrl}
            copiedId={copiedId}
            copyText={copyText}
          />
        </div>
      </div>
    </div>
  );
}

// ── Results Panel ──────────────────────────────────────────────────

function ResultsPanel({
  t, mode, lastEvent, deliveries, pingResult, loadingResults, polling,
  expandedDelivery, setExpandedDelivery, getEndpointUrl, copiedId, copyText,
}: {
  t: (key: string, opts?: any) => string;
  mode: ConsoleMode;
  lastEvent: EventResponse | null;
  deliveries: DeliveryWithAttempts[];
  pingResult: EndpointTestResponse | null;
  loadingResults: boolean;
  polling: boolean;
  expandedDelivery: string | null;
  setExpandedDelivery: (id: string | null) => void;
  getEndpointUrl: (id: string) => string;
  copiedId: string | null;
  copyText: (text: string, id: string) => void;
}) {
  // Empty state
  if (!lastEvent && !pingResult && !loadingResults) {
    return (
      <Card className="h-full flex items-center justify-center min-h-[400px]">
        <div className="text-center p-8">
          <div className="h-16 w-16 rounded-full bg-muted/50 flex items-center justify-center mx-auto mb-4">
            <Play className="h-7 w-7 text-muted-foreground" />
          </div>
          <p className="text-sm font-medium text-muted-foreground">{t('testConsole.emptyTitle')}</p>
          <p className="text-xs text-muted-foreground/70 mt-1 max-w-[240px]">{t('testConsole.emptyDesc')}</p>
        </div>
      </Card>
    );
  }

  // Loading
  if (loadingResults && !lastEvent && !pingResult) {
    return (
      <Card className="h-full flex items-center justify-center min-h-[400px]">
        <div className="text-center p-8">
          <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-4" />
          <p className="text-sm text-muted-foreground">{t('testConsole.processing')}</p>
        </div>
      </Card>
    );
  }

  // Ping result
  if (mode === 'ping' && pingResult) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            {pingResult.success ? (
              <CheckCircle2 className="h-5 w-5 text-green-500" />
            ) : (
              <XCircle className="h-5 w-5 text-destructive" />
            )}
            {t('testConsole.pingResult')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-lg border p-3 text-center">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">{t('testConsole.status')}</p>
              <p className={cn('text-2xl font-bold', pingResult.success ? 'text-green-500' : 'text-destructive')}>
                {pingResult.httpStatusCode || '—'}
              </p>
            </div>
            <div className="rounded-lg border p-3 text-center">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">{t('testConsole.latency')}</p>
              <p className="text-2xl font-bold">{pingResult.latencyMs}<span className="text-sm font-normal text-muted-foreground">ms</span></p>
            </div>
            <div className="rounded-lg border p-3 text-center">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">{t('testConsole.result')}</p>
              <Badge variant={pingResult.success ? 'success' : 'destructive'} className="text-xs">
                {pingResult.success ? t('testConsole.pass') : t('testConsole.fail')}
              </Badge>
            </div>
          </div>

          {pingResult.message && (
            <div className="rounded-lg border bg-muted/30 p-3">
              <p className="text-xs font-medium text-muted-foreground mb-1">{t('testConsole.message')}</p>
              <p className="text-sm">{pingResult.message}</p>
            </div>
          )}

          {pingResult.responseBody && (
            <div className="rounded-lg border bg-muted/30 p-3">
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs font-medium text-muted-foreground">{t('testConsole.responseBody')}</p>
                <button
                  onClick={() => copyText(pingResult.responseBody!, 'ping-body')}
                  className="text-muted-foreground hover:text-foreground"
                >
                  {copiedId === 'ping-body' ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                </button>
              </div>
              <pre className="text-xs font-mono overflow-x-auto max-h-48 whitespace-pre-wrap">{formatJson(pingResult.responseBody)}</pre>
            </div>
          )}

          {pingResult.errorMessage && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3">
              <p className="text-xs font-medium text-destructive mb-1">{t('testConsole.error')}</p>
              <p className="text-sm text-destructive">{pingResult.errorMessage}</p>
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  // Event + deliveries result
  return (
    <div className="space-y-4">
      {/* Event summary */}
      {lastEvent && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-green-500" />
              {t('testConsole.eventCreated')}
              {polling && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="rounded-lg border p-2.5">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">{t('testConsole.eventId')}</p>
                <div className="flex items-center gap-1">
                  <code className="font-mono text-[11px] truncate">{lastEvent.id}</code>
                  <button onClick={() => copyText(lastEvent.id, 'event-id')} className="text-muted-foreground hover:text-foreground shrink-0">
                    {copiedId === 'event-id' ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                  </button>
                </div>
              </div>
              <div className="rounded-lg border p-2.5">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">{t('testConsole.deliveriesCreated')}</p>
                <p className="font-bold text-lg">{lastEvent.deliveriesCreated || 0}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Delivery results */}
      {deliveries.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{t('testConsole.deliveryResults')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {deliveries.map((d) => (
              <DeliveryCard
                key={d.id}
                delivery={d}
                expanded={expandedDelivery === d.id}
                onToggle={() => setExpandedDelivery(expandedDelivery === d.id ? null : d.id)}
                getEndpointUrl={getEndpointUrl}
                copiedId={copiedId}
                copyText={copyText}
                t={t}
              />
            ))}
          </CardContent>
        </Card>
      )}

      {/* No deliveries yet but event sent */}
      {lastEvent && deliveries.length === 0 && !polling && !loadingResults && (
        <Card className="border-amber-200 bg-amber-50 dark:border-amber-900/50 dark:bg-amber-900/10">
          <CardContent className="p-4 flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0" />
            <div>
              <p className="text-sm font-medium">{t('testConsole.noDeliveries')}</p>
              <p className="text-xs text-muted-foreground">{t('testConsole.noDeliveriesDesc')}</p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ── Delivery Card ──────────────────────────────────────────────────

function DeliveryCard({
  delivery, expanded, onToggle, getEndpointUrl, copiedId, copyText, t,
}: {
  delivery: DeliveryWithAttempts;
  expanded: boolean;
  onToggle: () => void;
  getEndpointUrl: (id: string) => string;
  copiedId: string | null;
  copyText: (text: string, id: string) => void;
  t: (key: string, opts?: any) => string;
}) {
  const statusConfig: Record<string, { icon: typeof CheckCircle2; color: string; label: string }> = {
    SUCCESS: { icon: CheckCircle2, color: 'text-green-500', label: t('testConsole.statusSuccess') },
    FAILED: { icon: XCircle, color: 'text-destructive', label: t('testConsole.statusFailed') },
    PENDING: { icon: Clock, color: 'text-muted-foreground', label: t('testConsole.statusPending') },
    PROCESSING: { icon: Loader2, color: 'text-blue-500', label: t('testConsole.statusProcessing') },
    DLQ: { icon: AlertTriangle, color: 'text-amber-500', label: 'DLQ' },
  };

  const cfg = statusConfig[delivery.status] || statusConfig.PENDING;
  const StatusIcon = cfg.icon;
  const latestAttempt = delivery.attempts?.[delivery.attempts.length - 1];

  return (
    <div className="rounded-lg border overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 p-3 text-left hover:bg-muted/30 transition-colors"
      >
        <StatusIcon className={cn('h-4 w-4 shrink-0', cfg.color, delivery.status === 'PROCESSING' && 'animate-spin')} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs truncate">{delivery.endpointUrl || getEndpointUrl(delivery.endpointId)}</span>
          </div>
          <div className="flex items-center gap-3 mt-0.5 text-[10px] text-muted-foreground">
            <span>{cfg.label}</span>
            {latestAttempt?.httpStatusCode && (
              <span className={cn(
                'font-mono font-bold',
                latestAttempt.httpStatusCode >= 200 && latestAttempt.httpStatusCode < 300 ? 'text-green-600' : 'text-destructive'
              )}>
                HTTP {latestAttempt.httpStatusCode}
              </span>
            )}
            {latestAttempt?.durationMs != null && (
              <span className="flex items-center gap-0.5">
                <Timer className="h-2.5 w-2.5" />
                {latestAttempt.durationMs}ms
              </span>
            )}
            <span>{delivery.attemptCount}/{delivery.maxAttempts} {t('testConsole.attempts')}</span>
          </div>
        </div>
        {expanded ? <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" /> : <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />}
      </button>

      {expanded && delivery.attempts && delivery.attempts.length > 0 && (
        <div className="border-t bg-muted/20 p-3 space-y-3">
          {delivery.attempts.map((attempt) => (
            <AttemptDetail
              key={attempt.id}
              attempt={attempt}
              copiedId={copiedId}
              copyText={copyText}
              t={t}
            />
          ))}
        </div>
      )}

      {expanded && (!delivery.attempts || delivery.attempts.length === 0) && (
        <div className="border-t bg-muted/20 p-3 text-center">
          <p className="text-xs text-muted-foreground">{t('testConsole.noAttempts')}</p>
        </div>
      )}
    </div>
  );
}

// ── Attempt Detail ─────────────────────────────────────────────────

function AttemptDetail({
  attempt, copiedId, copyText, t,
}: {
  attempt: DeliveryAttemptResponse;
  copiedId: string | null;
  copyText: (text: string, id: string) => void;
  t: (key: string, opts?: any) => string;
}) {
  const [showRequest, setShowRequest] = useState(false);
  const [showResponse, setShowResponse] = useState(true);

  const isSuccess = attempt.httpStatusCode != null && attempt.httpStatusCode >= 200 && attempt.httpStatusCode < 300;

  return (
    <div className="rounded-lg border bg-background p-3 space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs">
          <Badge variant={isSuccess ? 'success' : 'destructive'} className="text-[10px]">
            #{attempt.attemptNumber}
          </Badge>
          {attempt.httpStatusCode && (
            <span className={cn('font-mono font-bold', isSuccess ? 'text-green-600' : 'text-destructive')}>
              {attempt.httpStatusCode}
            </span>
          )}
          {attempt.durationMs != null && (
            <span className="text-muted-foreground flex items-center gap-0.5">
              <Timer className="h-3 w-3" /> {attempt.durationMs}ms
            </span>
          )}
        </div>
      </div>

      {attempt.errorMessage && (
        <div className="rounded border border-destructive/20 bg-destructive/5 px-2.5 py-1.5">
          <p className="text-xs text-destructive">{attempt.errorMessage}</p>
        </div>
      )}

      {/* Request/Response toggles */}
      <div className="flex gap-1 text-[10px]">
        <button
          onClick={() => setShowRequest(!showRequest)}
          className={cn(
            'px-2 py-1 rounded transition-colors',
            showRequest ? 'bg-primary/10 text-primary font-medium' : 'text-muted-foreground hover:text-foreground'
          )}
        >
          {t('testConsole.request')}
        </button>
        <button
          onClick={() => setShowResponse(!showResponse)}
          className={cn(
            'px-2 py-1 rounded transition-colors',
            showResponse ? 'bg-primary/10 text-primary font-medium' : 'text-muted-foreground hover:text-foreground'
          )}
        >
          {t('testConsole.response')}
        </button>
      </div>

      {showRequest && (
        <div className="space-y-2">
          {attempt.requestHeaders && (
            <CodeBlock
              label={t('testConsole.requestHeaders')}
              content={formatJson(attempt.requestHeaders)}
              id={`req-h-${attempt.id}`}
              copiedId={copiedId}
              copyText={copyText}
            />
          )}
          {attempt.requestBody && (
            <CodeBlock
              label={t('testConsole.requestBody')}
              content={formatJson(attempt.requestBody)}
              id={`req-b-${attempt.id}`}
              copiedId={copiedId}
              copyText={copyText}
            />
          )}
        </div>
      )}

      {showResponse && (
        <div className="space-y-2">
          {attempt.responseHeaders && (
            <CodeBlock
              label={t('testConsole.responseHeaders')}
              content={formatJson(attempt.responseHeaders)}
              id={`res-h-${attempt.id}`}
              copiedId={copiedId}
              copyText={copyText}
            />
          )}
          {attempt.responseBody && (
            <CodeBlock
              label={t('testConsole.responseBody')}
              content={formatJson(attempt.responseBody)}
              id={`res-b-${attempt.id}`}
              copiedId={copiedId}
              copyText={copyText}
            />
          )}
        </div>
      )}
    </div>
  );
}

// ── Code Block ─────────────────────────────────────────────────────

function CodeBlock({
  label, content, id, copiedId, copyText,
}: {
  label: string;
  content: string;
  id: string;
  copiedId: string | null;
  copyText: (text: string, id: string) => void;
}) {
  return (
    <div className="rounded border bg-muted/30">
      <div className="flex items-center justify-between px-2.5 py-1 border-b">
        <span className="text-[10px] font-medium text-muted-foreground">{label}</span>
        <button onClick={() => copyText(content, id)} className="text-muted-foreground hover:text-foreground">
          {copiedId === id ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
        </button>
      </div>
      <pre className="text-[11px] font-mono p-2.5 overflow-x-auto max-h-40 whitespace-pre-wrap">{content}</pre>
    </div>
  );
}

// ── Helpers ─────────────────────────────────────────────────────────

function formatJson(str: string): string {
  try {
    return JSON.stringify(JSON.parse(str), null, 2);
  } catch {
    return str;
  }
}
