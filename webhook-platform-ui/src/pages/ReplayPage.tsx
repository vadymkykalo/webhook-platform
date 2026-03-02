import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import {
  History, Play, Square, Loader2, AlertTriangle, CheckCircle2, XCircle,
  Clock, RefreshCw, Plus, ChevronDown, ChevronUp,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { showApiError, showSuccess } from '../lib/toast';
import { formatDateTime } from '../lib/date';
import PageSkeleton, { SkeletonCards } from '../components/PageSkeleton';
import EmptyState from '../components/EmptyState';
import { projectsApi } from '../api/projects.api';
import { endpointsApi } from '../api/endpoints.api';
import { replayApi } from '../api/replay.api';
import type { ReplaySessionResponse, ReplayEstimateResponse } from '../api/replay.api';
import type { ProjectResponse, EndpointResponse } from '../types/api.types';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Select } from '../components/ui/select';
import { Badge } from '../components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '../components/ui/alert-dialog';
import { usePermissions } from '../auth/usePermissions';
import PermissionGate from '../components/PermissionGate';

const STATUS_VARIANTS: Record<string, { variant: any; icon: any }> = {
  PENDING: { variant: 'secondary', icon: Clock },
  ESTIMATING: { variant: 'info', icon: Loader2 },
  RUNNING: { variant: 'info', icon: RefreshCw },
  COMPLETED: { variant: 'success', icon: CheckCircle2 },
  FAILED: { variant: 'destructive', icon: XCircle },
  CANCELLED: { variant: 'secondary', icon: Square },
  CANCELLING: { variant: 'secondary', icon: Loader2 },
};

function quickRange(key: string): { from: string; to: string } {
  const now = new Date();
  const to = now.toISOString();
  let from: Date;
  switch (key) {
    case '1h': from = new Date(now.getTime() - 60 * 60 * 1000); break;
    case '6h': from = new Date(now.getTime() - 6 * 60 * 60 * 1000); break;
    case '24h': from = new Date(now.getTime() - 24 * 60 * 60 * 1000); break;
    case '7d': from = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000); break;
    default: from = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  }
  return { from: from.toISOString(), to };
}

function toLocalDatetime(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromLocalDatetime(local: string): string {
  return new Date(local).toISOString();
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}m ${rem}s`;
}

export default function ReplayPage() {
  const { t } = useTranslation();
  const { projectId } = useParams<{ projectId: string }>();
  const { canReplayDeliveries } = usePermissions();

  const [project, setProject] = useState<ProjectResponse | null>(null);
  const [endpoints, setEndpoints] = useState<EndpointResponse[]>([]);
  const [sessions, setSessions] = useState<ReplaySessionResponse[]>([]);
  const [loading, setLoading] = useState(true);

  // New replay form
  const [showForm, setShowForm] = useState(false);
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [eventType, setEventType] = useState('');
  const [endpointId, setEndpointId] = useState('');
  const [selectedRange, setSelectedRange] = useState('24h');

  // Estimate
  const [estimate, setEstimate] = useState<ReplayEstimateResponse | null>(null);
  const [estimating, setEstimating] = useState(false);

  // Create
  const [showConfirm, setShowConfirm] = useState(false);
  const [creating, setCreating] = useState(false);

  // Polling
  const [pollingActive, setPollingActive] = useState(false);

  useEffect(() => {
    if (projectId) loadData();
  }, [projectId]);

  // Poll running sessions
  useEffect(() => {
    const hasRunning = sessions.some(s =>
      s.status === 'RUNNING' || s.status === 'PENDING' || s.status === 'ESTIMATING' || s.status === 'CANCELLING'
    );
    setPollingActive(hasRunning);

    if (hasRunning) {
      const interval = setInterval(() => loadSessions(), 2000);
      return () => clearInterval(interval);
    }
  }, [sessions]);

  // Set default date range
  useEffect(() => {
    const range = quickRange('24h');
    setFromDate(toLocalDatetime(range.from));
    setToDate(toLocalDatetime(range.to));
  }, []);

  const loadData = async () => {
    if (!projectId) return;
    try {
      setLoading(true);
      const [projectData, endpointsData, sessionsData] = await Promise.all([
        projectsApi.get(projectId),
        endpointsApi.list(projectId),
        replayApi.list(projectId, 0, 50),
      ]);
      setProject(projectData);
      setEndpoints(endpointsData);
      setSessions(sessionsData.content);
    } catch (err: any) {
      showApiError(err, 'replay.toast.loadFailed', { retry: loadData });
    } finally {
      setLoading(false);
    }
  };

  const loadSessions = useCallback(async () => {
    if (!projectId) return;
    try {
      const data = await replayApi.list(projectId, 0, 50);
      setSessions(data.content);
    } catch {
      // Silent — polling
    }
  }, [projectId]);

  const handleQuickRange = (key: string) => {
    setSelectedRange(key);
    if (key !== 'custom') {
      const range = quickRange(key);
      setFromDate(toLocalDatetime(range.from));
      setToDate(toLocalDatetime(range.to));
    }
    setEstimate(null);
  };

  const handleEstimate = async () => {
    if (!projectId || !fromDate || !toDate) return;
    setEstimating(true);
    setEstimate(null);
    try {
      const result = await replayApi.estimate(projectId, {
        fromDate: fromLocalDatetime(fromDate),
        toDate: fromLocalDatetime(toDate),
        eventType: eventType || undefined,
        endpointId: endpointId || undefined,
      });
      setEstimate(result);
    } catch (err: any) {
      showApiError(err, 'replay.toast.estimateFailed');
    } finally {
      setEstimating(false);
    }
  };

  const handleCreate = async () => {
    if (!projectId || !fromDate || !toDate) return;
    setCreating(true);
    try {
      await replayApi.create(projectId, {
        fromDate: fromLocalDatetime(fromDate),
        toDate: fromLocalDatetime(toDate),
        eventType: eventType || undefined,
        endpointId: endpointId || undefined,
      });
      showSuccess(t('replay.toast.created'));
      setShowConfirm(false);
      setShowForm(false);
      setEstimate(null);
      loadSessions();
    } catch (err: any) {
      showApiError(err, 'replay.toast.createFailed');
    } finally {
      setCreating(false);
    }
  };

  const handleCancel = async (sessionId: string) => {
    if (!projectId) return;
    try {
      await replayApi.cancel(projectId, sessionId);
      showSuccess(t('replay.toast.cancelled'));
      loadSessions();
    } catch (err: any) {
      showApiError(err, 'replay.toast.cancelFailed');
    }
  };

  const getStatusBadge = (status: string) => {
    const config = STATUS_VARIANTS[status] || STATUS_VARIANTS.PENDING;
    const Icon = config.icon;
    const isAnimated = status === 'RUNNING' || status === 'ESTIMATING' || status === 'CANCELLING';
    return (
      <Badge variant={config.variant} className="gap-1">
        <Icon className={`h-3 w-3 ${isAnimated ? 'animate-spin' : ''}`} />
        {t(`replay.status.${status}`)}
      </Badge>
    );
  };

  const getEndpointUrl = (id?: string) => {
    if (!id) return t('replay.session.allEndpoints');
    return endpoints.find(e => e.id === id)?.url || id.substring(0, 8);
  };

  if (loading && !project) {
    return (
      <PageSkeleton maxWidth="max-w-7xl">
        <SkeletonCards count={3} height="h-20" cols="grid-cols-3" />
        <div className="h-[300px] bg-muted animate-pulse rounded-xl" />
      </PageSkeleton>
    );
  }

  if (!project) {
    return (
      <div className="p-6 lg:p-8 max-w-7xl mx-auto">
        <EmptyState icon={History} title={t('replay.projectNotFound')} />
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-8">
        <div>
          <h1 className="text-title tracking-tight">{t('replay.title')}</h1>
          <p className="text-sm text-muted-foreground mt-1" dangerouslySetInnerHTML={{ __html: t('replay.subtitle', { project: project.name }) }} />
        </div>
        <PermissionGate allowed={canReplayDeliveries}>
          <Button onClick={() => setShowForm(!showForm)} size="sm">
            {showForm ? <ChevronUp className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
            {t('replay.newReplay')}
          </Button>
        </PermissionGate>
      </div>

      {/* New Replay Form */}
      {showForm && (
        <Card className="mb-6 border-primary/20">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{t('replay.createNew')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Quick ranges */}
            <div className="flex gap-2 flex-wrap">
              {['1h', '6h', '24h', '7d', 'custom'].map((key) => (
                <Button
                  key={key}
                  variant={selectedRange === key ? 'default' : 'outline'}
                  size="sm"
                  className="text-xs h-7"
                  onClick={() => handleQuickRange(key)}
                >
                  {t(`replay.quickRanges.${key}`)}
                </Button>
              ))}
            </div>

            {/* Filters */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="fromDate" className="text-xs">{t('replay.filters.fromDate')}</Label>
                <Input
                  id="fromDate"
                  type="datetime-local"
                  value={fromDate}
                  onChange={(e) => { setFromDate(e.target.value); setSelectedRange('custom'); setEstimate(null); }}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="toDate" className="text-xs">{t('replay.filters.toDate')}</Label>
                <Input
                  id="toDate"
                  type="datetime-local"
                  value={toDate}
                  onChange={(e) => { setToDate(e.target.value); setSelectedRange('custom'); setEstimate(null); }}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="eventType" className="text-xs">{t('replay.filters.eventType')}</Label>
                <Input
                  id="eventType"
                  placeholder={t('replay.filters.eventTypePlaceholder')}
                  value={eventType}
                  onChange={(e) => { setEventType(e.target.value); setEstimate(null); }}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="endpointId" className="text-xs">{t('replay.filters.endpoint')}</Label>
                <Select
                  id="endpointId"
                  value={endpointId}
                  onChange={(e) => { setEndpointId(e.target.value); setEstimate(null); }}
                >
                  <option value="">{t('replay.filters.allEndpoints')}</option>
                  {endpoints.map(ep => (
                    <option key={ep.id} value={ep.id}>{ep.url}</option>
                  ))}
                </Select>
              </div>
            </div>

            {/* Estimate result */}
            {estimate && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <Card>
                  <CardContent className="p-3">
                    <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">{t('replay.estimate_result.totalEvents')}</p>
                    <p className="text-xl font-bold mt-0.5">{estimate.totalEvents.toLocaleString()}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-3">
                    <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">{t('replay.estimate_result.estimatedDeliveries')}</p>
                    <p className="text-xl font-bold mt-0.5">{estimate.estimatedDeliveries.toLocaleString()}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-3">
                    <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">{t('replay.estimate_result.activeSubscriptions')}</p>
                    <p className="text-xl font-bold mt-0.5">{estimate.activeSubscriptions}</p>
                  </CardContent>
                </Card>
              </div>
            )}

            {estimate?.warning && (
              <div className="flex items-start gap-2 p-3 bg-warning/10 border border-warning/20 rounded-lg">
                <AlertTriangle className="h-4 w-4 text-warning flex-shrink-0 mt-0.5" />
                <p className="text-sm text-warning">{estimate.warning}</p>
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={handleEstimate} disabled={estimating || !fromDate || !toDate}>
                {estimating && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                {estimating ? t('replay.estimating') : t('replay.estimate')}
              </Button>
              <Button
                size="sm"
                onClick={() => setShowConfirm(true)}
                disabled={!estimate || estimate.totalEvents === 0 || !!estimate.warning}
              >
                <Play className="h-3.5 w-3.5" />
                {t('replay.startReplay')}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Sessions list */}
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold">{t('replay.history')}</h2>
        {pollingActive && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <RefreshCw className="h-3 w-3 animate-spin" />
            <span>Live</span>
          </div>
        )}
      </div>

      {sessions.length === 0 ? (
        <EmptyState icon={History} title={t('replay.noSessions')} description={t('replay.noSessionsDesc')} docsLink="/docs#deterministic-replay" />
      ) : (
        <div className="space-y-3 animate-fade-in">
          {sessions.map((session) => (
            <SessionCard
              key={session.id}
              session={session}
              getStatusBadge={getStatusBadge}
              getEndpointUrl={getEndpointUrl}
              onCancel={handleCancel}
              canCancel={canReplayDeliveries}
              t={t}
            />
          ))}
        </div>
      )}

      {/* Confirm dialog */}
      <AlertDialog open={showConfirm} onOpenChange={setShowConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('replay.startReplay')}</AlertDialogTitle>
            <AlertDialogDescription>{t('replay.confirmStart')}</AlertDialogDescription>
          </AlertDialogHeader>
          {estimate && (
            <div className="text-sm space-y-1 px-1">
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t('replay.estimate_result.totalEvents')}</span>
                <span className="font-medium">{estimate.totalEvents.toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t('replay.estimate_result.estimatedDeliveries')}</span>
                <span className="font-medium">{estimate.estimatedDeliveries.toLocaleString()}</span>
              </div>
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={creating}>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleCreate} disabled={creating}>
              {creating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {creating ? t('replay.starting') : t('replay.startReplay')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function SessionCard({
  session, getStatusBadge, getEndpointUrl, onCancel, canCancel, t,
}: {
  session: ReplaySessionResponse;
  getStatusBadge: (status: string) => React.ReactNode;
  getEndpointUrl: (id?: string) => string;
  onCancel: (id: string) => void;
  canCancel: boolean;
  t: (key: string, opts?: any) => string;
}) {
  const [expanded, setExpanded] = useState(
    session.status === 'RUNNING' || session.status === 'PENDING'
  );
  const isRunning = session.status === 'RUNNING' || session.status === 'PENDING' || session.status === 'CANCELLING';
  const progressPct = session.progressPercent ?? 0;

  return (
    <Card className={isRunning ? 'border-primary/30' : ''}>
      <CardContent className="p-4">
        {/* Header row */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            {getStatusBadge(session.status)}
            <span className="text-sm text-muted-foreground truncate">
              {formatDateTime(session.createdAt)}
            </span>
            {session.eventType && (
              <code className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded">{session.eventType}</code>
            )}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {isRunning && canCancel && (
              <Button variant="outline" size="sm" className="text-xs h-7" onClick={() => onCancel(session.id)}>
                <Square className="h-3 w-3" />
                {t('replay.cancel')}
              </Button>
            )}
            <Button variant="ghost" size="icon-sm" onClick={() => setExpanded(!expanded)}>
              {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </Button>
          </div>
        </div>

        {/* Progress bar */}
        {(session.status === 'RUNNING' || session.status === 'COMPLETED') && (
          <div className="mt-3">
            <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
              <span>{session.processedEvents.toLocaleString()} / {session.totalEvents.toLocaleString()} {t('replay.session.events')}</span>
              <span>{progressPct}%</span>
            </div>
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  session.status === 'COMPLETED' ? 'bg-green-500' : 'bg-primary'
                }`}
                style={{ width: `${Math.min(progressPct, 100)}%` }}
              />
            </div>
          </div>
        )}

        {/* Expanded details */}
        {expanded && (
          <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
            <div>
              <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider block">{t('replay.session.deliveries')}</span>
              <span className="font-semibold">{session.deliveriesCreated.toLocaleString()}</span>
            </div>
            <div>
              <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider block">{t('replay.session.errors')}</span>
              <span className={`font-semibold ${session.errors > 0 ? 'text-destructive' : ''}`}>{session.errors}</span>
            </div>
            <div>
              <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider block">{t('replay.session.duration')}</span>
              <span className="font-semibold">{session.durationMs ? formatDuration(session.durationMs) : '—'}</span>
            </div>
            <div>
              <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider block">{t('replay.session.endpoint')}</span>
              <span className="font-mono text-xs truncate block">{getEndpointUrl(session.endpointId)}</span>
            </div>
            <div className="col-span-2">
              <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider block">{t('replay.session.timeRange')}</span>
              <span className="text-xs">{formatDateTime(session.fromDate)} → {formatDateTime(session.toDate)}</span>
            </div>
            {session.errorMessage && (
              <div className="col-span-2 sm:col-span-4">
                <span className="text-[11px] font-medium text-destructive uppercase tracking-wider block">{t('replay.session.errors')}</span>
                <p className="text-xs text-destructive font-mono bg-destructive/5 p-2 rounded mt-0.5">{session.errorMessage}</p>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
