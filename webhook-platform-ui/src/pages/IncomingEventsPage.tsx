import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import {
  Activity, Loader2, Copy, ChevronLeft, ChevronRight, CheckCircle, XCircle, MinusCircle,
  RotateCcw, Clock, AlertTriangle, Calendar
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { showApiError, showSuccess } from '../lib/toast';
import { formatDateTime, formatRelativeTime } from '../lib/date';
import PageSkeleton, { SkeletonRows } from '../components/PageSkeleton';
import EmptyState from '../components/EmptyState';
import { incomingEventsApi } from '../api/incomingEvents.api';
import { incomingSourcesApi } from '../api/incomingSources.api';
import { projectsApi } from '../api/projects.api';
import type {
  IncomingEventResponse, IncomingForwardAttemptResponse, IncomingSourceResponse,
  ProjectResponse, PageResponse,
} from '../types/api.types';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Select } from '../components/ui/select';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '../components/ui/alert-dialog';
import {
  Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle,
} from '../components/ui/sheet';
import { usePermissions } from '../auth/usePermissions';

const PAGE_SIZE = 20;

export default function IncomingEventsPage() {
  const { t } = useTranslation();
  const { projectId } = useParams<{ projectId: string }>();
  const { canReplayIncomingEvents } = usePermissions();

  const [project, setProject] = useState<ProjectResponse | null>(null);
  const [events, setEvents] = useState<IncomingEventResponse[]>([]);
  const [sources, setSources] = useState<IncomingSourceResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [pageInfo, setPageInfo] = useState<PageResponse<IncomingEventResponse> | null>(null);
  const [currentPage, setCurrentPage] = useState(0);
  const [filterSourceId, setFilterSourceId] = useState<string>('');

  // Detail sheet
  const [selectedEvent, setSelectedEvent] = useState<IncomingEventResponse | null>(null);
  const [attempts, setAttempts] = useState<IncomingForwardAttemptResponse[]>([]);
  const [loadingAttempts, setLoadingAttempts] = useState(false);

  // Replay
  const [replayEventId, setReplayEventId] = useState<string | null>(null);
  const [replaying, setReplaying] = useState(false);

  useEffect(() => {
    if (projectId) loadData();
  }, [projectId, currentPage, filterSourceId]);

  const loadData = async () => {
    if (!projectId) return;
    try {
      setLoading(true);
      const [proj, eventsData, sourcesData] = await Promise.all([
        projectsApi.get(projectId),
        incomingEventsApi.list(projectId, {
          sourceId: filterSourceId || undefined,
          page: currentPage,
          size: PAGE_SIZE,
        }),
        incomingSourcesApi.list(projectId, 0, 100),
      ]);
      setProject(proj);
      setEvents(eventsData.content);
      setPageInfo(eventsData);
      setSources(sourcesData.content);
    } catch (err) {
      showApiError(err, 'incomingEvents.toast.loadFailed', { retry: loadData });
    } finally {
      setLoading(false);
    }
  };

  const openEventDetail = async (event: IncomingEventResponse) => {
    setSelectedEvent(event);
    setAttempts([]);
    if (!projectId) return;
    setLoadingAttempts(true);
    try {
      const data = await incomingEventsApi.getAttempts(projectId, event.id);
      setAttempts(data.content);
    } catch (err) {
      showApiError(err, 'incomingEvents.toast.loadFailed');
    } finally {
      setLoadingAttempts(false);
    }
  };

  const handleReplay = async () => {
    if (!replayEventId || !projectId) return;
    setReplaying(true);
    try {
      const result = await incomingEventsApi.replay(projectId, replayEventId);
      showSuccess(t('incomingEvents.toast.replayed', { count: result.destinationsCount }));
      setReplayEventId(null);
      loadData();
      if (selectedEvent?.id === replayEventId) {
        openEventDetail(selectedEvent);
      }
    } catch (err) {
      showApiError(err, 'incomingEvents.toast.replayFailed');
    } finally {
      setReplaying(false);
    }
  };

  const copyRequestId = (requestId: string) => {
    navigator.clipboard.writeText(requestId);
    showSuccess(t('incomingEvents.toast.idCopied'));
  };

  const getVerificationBadge = (event: IncomingEventResponse) => {
    if (event.verified === true) {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-success/10 px-2 py-0.5 text-[11px] font-medium text-success">
          <CheckCircle className="h-3 w-3" /> {t('incomingEvents.verified')}
        </span>
      );
    }
    if (event.verified === false) {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-[11px] font-medium text-destructive" title={event.verificationError || ''}>
          <XCircle className="h-3 w-3" /> {t('incomingEvents.failed')}
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
        <MinusCircle className="h-3 w-3" /> {t('incomingEvents.noVerification')}
      </span>
    );
  };

  const getAttemptStatusBadge = (status: string) => {
    switch (status) {
      case 'SUCCESS':
        return <span className="inline-flex items-center gap-1 rounded-full bg-success/10 px-2 py-0.5 text-[11px] font-medium text-success"><CheckCircle className="h-3 w-3" /> Success</span>;
      case 'FAILED':
        return <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-[11px] font-medium text-destructive"><XCircle className="h-3 w-3" /> Failed</span>;
      case 'PROCESSING':
        return <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary"><RotateCcw className="h-3 w-3" /> Processing</span>;
      case 'DLQ':
        return <span className="inline-flex items-center gap-1 rounded-full bg-warning/10 px-2 py-0.5 text-[11px] font-medium text-warning"><AlertTriangle className="h-3 w-3" /> DLQ</span>;
      default:
        return <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground"><Clock className="h-3 w-3" /> Pending</span>;
    }
  };

  if (loading) {
    return <PageSkeleton><SkeletonRows count={5} height="h-16" /></PageSkeleton>;
  }

  if (!project) {
    return (
      <div className="p-6 lg:p-8 max-w-6xl mx-auto">
        <EmptyState icon={Activity} title={t('endpoints.projectNotFound')} />
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 max-w-6xl mx-auto">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-6">
        <div>
          <h1 className="text-title tracking-tight">{t('incomingEvents.title')}</h1>
          <p className="text-sm text-muted-foreground mt-1" dangerouslySetInnerHTML={{ __html: t('incomingEvents.subtitle', { project: project.name }) }} />
        </div>
        <div className="flex items-center gap-2">
          <Select className="w-[200px]" value={filterSourceId} onChange={(e) => { setFilterSourceId(e.target.value); setCurrentPage(0); }}>
            <option value="">{t('incomingEvents.filters.allSources')}</option>
            {sources.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
        </div>
      </div>

      {events.length === 0 ? (
        <EmptyState
          icon={Activity}
          title={t('incomingEvents.noEvents')}
          description={t('incomingEvents.noEventsDesc')}
        />
      ) : (
        <div className="space-y-2 animate-fade-in">
          {events.map((event) => (
            <Card key={event.id} className="overflow-hidden cursor-pointer hover:border-primary/30 transition-colors"
              onClick={() => openEventDetail(event)}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap min-w-0">
                      <span className="inline-flex items-center rounded-md bg-primary/10 px-2 py-0.5 text-[11px] font-bold font-mono text-primary">
                        {event.method}
                      </span>
                      {getVerificationBadge(event)}
                      <span className="text-sm font-medium truncate">{event.sourceName || event.incomingSourceId.slice(0, 8)}</span>
                      <span className="text-[11px] text-muted-foreground font-mono truncate max-w-[200px]">{event.requestId}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                      <Calendar className="h-3 w-3" /> {formatRelativeTime(event.receivedAt)}
                    </span>
                    {canReplayIncomingEvents && (
                      <Button variant="ghost" size="icon-sm" onClick={(e) => { e.stopPropagation(); setReplayEventId(event.id); }} title={t('incomingEvents.replay.submit')}>
                        <RotateCcw className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    <Button variant="ghost" size="icon-sm" onClick={(e) => { e.stopPropagation(); copyRequestId(event.requestId); }} title={t('common.copyId')}>
                      <Copy className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}

          {pageInfo && pageInfo.totalPages > 1 && (
            <div className="flex items-center justify-between pt-4">
              <p className="text-sm text-muted-foreground">
                {t('common.showing', { from: currentPage * PAGE_SIZE + 1, to: Math.min((currentPage + 1) * PAGE_SIZE, pageInfo.totalElements), total: pageInfo.totalElements })}
              </p>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => setCurrentPage(p => p - 1)} disabled={pageInfo.first}>
                  <ChevronLeft className="h-4 w-4" /> {t('common.previous')}
                </Button>
                <span className="text-sm text-muted-foreground px-2">{currentPage + 1} / {pageInfo.totalPages}</span>
                <Button variant="outline" size="sm" onClick={() => setCurrentPage(p => p + 1)} disabled={pageInfo.last}>
                  {t('common.next')} <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Event Detail Sheet */}
      <Sheet open={!!selectedEvent} onOpenChange={(open) => !open && setSelectedEvent(null)}>
        <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{t('incomingEvents.detail.title')}</SheetTitle>
            <SheetDescription>
              {selectedEvent?.requestId}
            </SheetDescription>
          </SheetHeader>

          {selectedEvent && (
            <div className="space-y-6 mt-6">
              {/* Request Metadata */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold">{t('incomingEvents.detail.requestMeta')}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{t('incomingEvents.columns.method')}</span>
                    <span className="font-mono font-bold">{selectedEvent.method}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{t('incomingEvents.columns.source')}</span>
                    <span>{selectedEvent.sourceName || selectedEvent.incomingSourceId.slice(0, 8)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{t('incomingEvents.columns.contentType')}</span>
                    <span className="font-mono text-xs">{selectedEvent.contentType || '—'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{t('incomingEvents.columns.clientIp')}</span>
                    <span className="font-mono text-xs">{selectedEvent.clientIp || '—'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{t('incomingEvents.columns.received')}</span>
                    <span>{formatDateTime(selectedEvent.receivedAt)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">{t('incomingEvents.detail.signatureResult')}</span>
                    {getVerificationBadge(selectedEvent)}
                  </div>
                  {selectedEvent.verificationError && (
                    <div className="p-2 bg-destructive/5 border border-destructive/20 rounded text-xs text-destructive">
                      {selectedEvent.verificationError}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Headers */}
              {selectedEvent.headersJson && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-semibold">{t('incomingEvents.detail.headers')}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <pre className="text-[11px] font-mono bg-muted p-3 rounded-lg overflow-x-auto max-h-48 whitespace-pre-wrap break-all">
                      {tryFormatJson(selectedEvent.headersJson)}
                    </pre>
                  </CardContent>
                </Card>
              )}

              {/* Body */}
              {selectedEvent.bodyRaw && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-semibold">{t('incomingEvents.detail.body')}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <pre className="text-[11px] font-mono bg-muted p-3 rounded-lg overflow-x-auto max-h-64 whitespace-pre-wrap break-all">
                      {tryFormatJson(selectedEvent.bodyRaw)}
                    </pre>
                  </CardContent>
                </Card>
              )}

              {/* Forwarding Results */}
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-semibold">{t('incomingEvents.detail.forwardingResults')}</CardTitle>
                    {canReplayIncomingEvents && (
                      <Button size="sm" variant="outline" onClick={() => setReplayEventId(selectedEvent.id)}>
                        <RotateCcw className="h-3.5 w-3.5 mr-1" /> {t('incomingEvents.replay.submit')}
                      </Button>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  {loadingAttempts ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                    </div>
                  ) : attempts.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-6">{t('incomingEvents.detail.noAttempts')}</p>
                  ) : (
                    <div className="space-y-3">
                      {attempts.map((attempt) => (
                        <div key={attempt.id} className="p-3 border rounded-lg space-y-2">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-semibold">{t('incomingEvents.detail.attempt', { number: attempt.attemptNumber })}</span>
                              {getAttemptStatusBadge(attempt.status)}
                            </div>
                            {attempt.responseCode && (
                              <span className="text-xs font-mono font-medium">
                                {t('incomingEvents.detail.responseCode', { code: attempt.responseCode })}
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-muted-foreground space-y-1">
                            {attempt.destinationUrl && (
                              <p className="font-mono truncate">{attempt.destinationUrl}</p>
                            )}
                            <div className="flex items-center gap-3">
                              {attempt.startedAt && <span>{formatDateTime(attempt.startedAt)}</span>}
                              {attempt.finishedAt && attempt.startedAt && (
                                <span>{new Date(attempt.finishedAt).getTime() - new Date(attempt.startedAt).getTime()}ms</span>
                              )}
                            </div>
                            {attempt.errorMessage && (
                              <div className="p-2 bg-destructive/5 border border-destructive/20 rounded text-xs text-destructive mt-1">
                                {attempt.errorMessage}
                              </div>
                            )}
                            {attempt.nextRetryAt && (
                              <p className="flex items-center gap-1 text-warning">
                                <Clock className="h-3 w-3" /> {t('incomingEvents.detail.nextRetry', { time: formatDateTime(attempt.nextRetryAt) })}
                              </p>
                            )}
                            {attempt.responseBodySnippet && (
                              <pre className="p-2 bg-muted rounded text-[10px] font-mono mt-1 max-h-24 overflow-auto whitespace-pre-wrap break-all">
                                {attempt.responseBodySnippet}
                              </pre>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* Replay Confirmation */}
      <AlertDialog open={!!replayEventId} onOpenChange={(open) => !open && setReplayEventId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('incomingEvents.replay.title')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('incomingEvents.replay.description')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex items-start gap-2 p-3 bg-warning/10 border border-warning/20 rounded-lg mx-1">
            <AlertTriangle className="h-4 w-4 text-warning flex-shrink-0 mt-0.5" />
            <p className="text-sm text-warning">{t('incomingEvents.replay.idempotencyWarning')}</p>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={replaying}>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleReplay} disabled={replaying}>
              {replaying && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {replaying ? t('incomingEvents.replay.replaying') : t('incomingEvents.replay.submit')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function tryFormatJson(str: string): string {
  try {
    return JSON.stringify(JSON.parse(str), null, 2);
  } catch {
    return str;
  }
}
