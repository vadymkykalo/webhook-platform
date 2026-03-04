import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Radio, ArrowLeft, Copy, Send, Share2, Terminal, FileJson, Shield,
  FileType, Loader2, CheckCircle2, XCircle, Clock, AlertTriangle, ExternalLink
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useEvent, useEventTypes } from '../api/queries';
import { deliveriesApi } from '../api/deliveries.api';
import { debugLinksApi } from '../api/debugLinks.api';
import { useQuery } from '@tanstack/react-query';
import { formatDateTime, formatRelativeTime } from '../lib/date';
import { showSuccess, showApiError } from '../lib/toast';
import PageSkeleton from '../components/PageSkeleton';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { usePermissions } from '../auth/usePermissions';
import type { DeliveryResponse, PageResponse } from '../types/api.types';

const STATUS_COLORS: Record<string, string> = {
  SUCCESS: 'bg-green-500/10 text-green-700 dark:text-green-400',
  FAILED: 'bg-red-500/10 text-red-700 dark:text-red-400',
  DLQ: 'bg-yellow-500/10 text-yellow-700 dark:text-yellow-400',
  PENDING: 'bg-blue-500/10 text-blue-700 dark:text-blue-400',
  PROCESSING: 'bg-indigo-500/10 text-indigo-700 dark:text-indigo-400',
};

export default function EventDetailPage() {
  const { t } = useTranslation();
  const { projectId, eventId } = useParams<{ projectId: string; eventId: string }>();
  const navigate = useNavigate();
  const { canManageEndpoints } = usePermissions();

  const [activeTab, setActiveTab] = useState<'raw' | 'sanitized' | 'schema' | 'deliveries' | 'debug'>('raw');
  const [sharingDebug, setSharingDebug] = useState(false);

  const { data: event, isLoading } = useEvent(projectId, eventId);
  const { data: eventTypes } = useEventTypes(projectId);

  const { data: deliveriesData, isLoading: deliveriesLoading } = useQuery({
    queryKey: ['event-deliveries', projectId, eventId],
    queryFn: () => deliveriesApi.listByProject(projectId!, { eventId, size: 50 }),
    enabled: !!projectId && !!eventId,
  });

  const { data: debugLinks = [], refetch: refetchLinks } = useQuery({
    queryKey: ['debug-links', projectId, eventId],
    queryFn: () => debugLinksApi.listForEvent(projectId!, eventId!),
    enabled: !!projectId && !!eventId,
  });

  const deliveries: DeliveryResponse[] = (deliveriesData as PageResponse<DeliveryResponse>)?.content ?? [];

  const handleCopy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    showSuccess(`${label} copied`);
  };

  const formatPayload = (payload: string | undefined) => {
    if (!payload) return '';
    try { return JSON.stringify(JSON.parse(payload), null, 2); } catch { return payload; }
  };

  const generateCurl = () => {
    if (!event) return '';
    return `curl -X POST \\\n  -H "Content-Type: application/json" \\\n  -H "X-API-Key: YOUR_API_KEY" \\\n  -d '${event.payload || '{}'}' \\\n  "https://your-api.com/api/v1/events"`;
  };

  const handleShareDebug = async () => {
    if (!projectId || !eventId) return;
    setSharingDebug(true);
    try {
      const link = await debugLinksApi.create(projectId, eventId, { expiryHours: 24 });
      await navigator.clipboard.writeText(link.shareUrl);
      showSuccess(t('eventDetail.debugLinkCreated', 'Debug link copied to clipboard'));
      refetchLinks();
    } catch (err: any) {
      showApiError(err, 'eventDetail.debugLinkFailed');
    } finally {
      setSharingDebug(false);
    }
  };

  const handleReplayFailed = async () => {
    const failedDeliveries = deliveries.filter(d => d.status === 'FAILED' || d.status === 'DLQ');
    for (const d of failedDeliveries) {
      try { await deliveriesApi.replay(d.id); } catch { /* continue */ }
    }
    showSuccess(t('eventDetail.replayedFailed', { count: failedDeliveries.length, defaultValue: 'Replayed {{count}} failed deliveries' }));
  };

  // Find matching schema for event type
  const matchingSchema = eventTypes?.find((et: any) => et.name === event?.eventType);

  if (isLoading) return <PageSkeleton maxWidth="max-w-7xl" />;
  if (!event) return <div className="p-8 text-center text-muted-foreground">{t('events.details.notFound', 'Event not found')}</div>;

  const failedCount = deliveries.filter(d => d.status === 'FAILED' || d.status === 'DLQ').length;

  const tabs = [
    { id: 'raw' as const, label: t('eventDetail.tabs.raw', 'Raw Payload'), icon: FileJson },
    { id: 'sanitized' as const, label: t('eventDetail.tabs.sanitized', 'Sanitized'), icon: Shield },
    { id: 'schema' as const, label: t('eventDetail.tabs.schema', 'Schema'), icon: FileType },
    { id: 'deliveries' as const, label: t('eventDetail.tabs.deliveries', 'Deliveries'), icon: Send, badge: deliveries.length },
    { id: 'debug' as const, label: t('eventDetail.tabs.debug', 'Debug Links'), icon: Share2, badge: debugLinks.length },
  ];

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate(`/admin/projects/${projectId}/events`)}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <Radio className="h-5 w-5 text-primary flex-shrink-0" />
            <h1 className="text-2xl font-bold tracking-tight truncate">{event.eventType}</h1>
          </div>
          <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground flex-wrap">
            <div className="flex items-center gap-1.5 group">
              <code className="font-mono text-xs">{event.id}</code>
              <Button variant="ghost" size="icon-sm" className="h-5 w-5 opacity-0 group-hover:opacity-100" onClick={() => handleCopy(event.id, 'Event ID')}>
                <Copy className="h-3 w-3" />
              </Button>
            </div>
            <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" /> {formatDateTime(event.createdAt)}</span>
            <span className="text-xs">({formatRelativeTime(event.createdAt)})</span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <Button variant="outline" size="sm" onClick={() => handleCopy(generateCurl(), 'cURL')}>
            <Terminal className="h-4 w-4 mr-1" /> cURL
          </Button>
          <Button variant="outline" size="sm" onClick={handleShareDebug} disabled={sharingDebug}>
            {sharingDebug ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Share2 className="h-4 w-4 mr-1" />}
            {t('eventDetail.share', 'Share Debug')}
          </Button>
          {failedCount > 0 && canManageEndpoints && (
            <Button size="sm" variant="destructive" onClick={handleReplayFailed}>
              <Send className="h-4 w-4 mr-1" /> {t('eventDetail.replayFailed', { count: failedCount, defaultValue: 'Replay {{count}} Failed' })}
            </Button>
          )}
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground mb-1">{t('eventDetail.eventType', 'Event Type')}</p>
            <Badge variant="secondary" className="font-mono text-xs">{event.eventType}</Badge>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground mb-1">{t('eventDetail.deliveriesCount', 'Deliveries')}</p>
            <p className="text-xl font-bold">{event.deliveriesCreated ?? deliveries.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground mb-1">{t('eventDetail.payloadSize', 'Payload Size')}</p>
            <p className="text-xl font-bold">{event.payload ? `${(event.payload.length / 1024).toFixed(1)} KB` : '—'}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground mb-1">{t('eventDetail.project', 'Project')}</p>
            <code className="text-xs font-mono">{event.projectId.substring(0, 8)}…</code>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <div className="border-b">
        <div className="flex gap-1 overflow-x-auto">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              className={`flex items-center gap-1.5 px-3 pb-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                activeTab === tab.id ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
              onClick={() => setActiveTab(tab.id)}
            >
              <tab.icon className="h-3.5 w-3.5" />
              {tab.label}
              {tab.badge !== undefined && tab.badge > 0 && (
                <span className="ml-1 text-[10px] bg-muted px-1.5 py-0.5 rounded-full">{tab.badge}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div className="animate-fade-in">
        {/* Raw Payload */}
        {activeTab === 'raw' && (
          <Card>
            <CardHeader className="pb-2 flex flex-row items-center justify-between">
              <CardTitle className="text-sm">{t('eventDetail.rawPayload', 'Raw Payload')}</CardTitle>
              <Button variant="ghost" size="sm" onClick={() => handleCopy(formatPayload(event.payload), 'Payload')}>
                <Copy className="h-3.5 w-3.5 mr-1" /> {t('common.copy', 'Copy')}
              </Button>
            </CardHeader>
            <CardContent>
              <pre className="bg-muted/50 border rounded-lg p-4 text-xs font-mono overflow-x-auto max-h-[60vh] whitespace-pre-wrap break-words">
                {formatPayload(event.payload) || <span className="italic text-muted-foreground">No payload</span>}
              </pre>
            </CardContent>
          </Card>
        )}

        {/* Sanitized (PII-masked) */}
        {activeTab === 'sanitized' && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Shield className="h-4 w-4 text-green-600" />
                {t('eventDetail.sanitized', 'PII-Sanitized Payload')}
              </CardTitle>
              <p className="text-xs text-muted-foreground">{t('eventDetail.sanitizedHint', 'This is the payload with PII masking rules applied — safe to share externally')}</p>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground py-8 text-center">
                {t('eventDetail.sanitizedUseDebug', 'Use "Share Debug" to create a PII-safe shareable link. The sanitized view is generated server-side with your project\'s PII rules.')}
              </p>
              {debugLinks.length > 0 && (
                <div className="border-t pt-4">
                  <p className="text-xs text-muted-foreground mb-2">{t('eventDetail.existingLinks', 'Existing debug links (PII-safe):')}</p>
                  {debugLinks.map((link) => (
                    <div key={link.id} className="flex items-center gap-2 py-1">
                      <a href={link.shareUrl} target="_blank" rel="noopener noreferrer" className="text-xs font-mono text-primary hover:underline truncate flex-1">
                        {link.shareUrl}
                      </a>
                      <Button variant="ghost" size="icon-sm" onClick={() => handleCopy(link.shareUrl, 'Link')}>
                        <Copy className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Schema */}
        {activeTab === 'schema' && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">{t('eventDetail.schemaInfo', 'Schema Information')}</CardTitle>
            </CardHeader>
            <CardContent>
              {matchingSchema ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">{matchingSchema.name}</Badge>
                    {matchingSchema.latestVersion && <Badge variant="outline">v{matchingSchema.latestVersion}</Badge>}
                  </div>
                  {matchingSchema.description && <p className="text-sm text-muted-foreground">{matchingSchema.description}</p>}
                  <Button variant="outline" size="sm" onClick={() => navigate(`/admin/projects/${projectId}/schemas`)}>
                    <ExternalLink className="h-3.5 w-3.5 mr-1" /> {t('eventDetail.viewSchemaRegistry', 'View in Schema Registry')}
                  </Button>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground py-8 text-center">
                  {t('eventDetail.noSchema', 'No schema registered for event type "{{type}}"', { type: event.eventType })}
                </p>
              )}
            </CardContent>
          </Card>
        )}

        {/* Linked Deliveries */}
        {activeTab === 'deliveries' && (
          <Card className="overflow-hidden">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">{t('eventDetail.linkedDeliveries', 'Linked Deliveries')} ({deliveries.length})</CardTitle>
            </CardHeader>
            {deliveriesLoading ? (
              <CardContent><Loader2 className="h-5 w-5 animate-spin mx-auto my-8" /></CardContent>
            ) : deliveries.length === 0 ? (
              <CardContent>
                <div className="text-center py-8 space-y-2">
                  <p className="text-sm font-medium">{t('eventDetail.noDeliveries', 'No deliveries for this event')}</p>
                  <p className="text-xs text-muted-foreground max-w-sm mx-auto" dangerouslySetInnerHTML={{ __html: t('events.details.noDeliveriesNoSub', { eventType: event.eventType }) }} />
                  <p className="text-[11px] text-muted-foreground">{t('events.details.noDeliveriesHint')}</p>
                  <Button variant="outline" size="sm" className="mt-3" onClick={() => navigate(`/admin/projects/${projectId}/subscriptions`)}>
                    {t('deliveries.noDeliveriesForEventAction')}
                  </Button>
                </div>
              </CardContent>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[100px]">{t('deliveries.columns.status', 'Status')}</TableHead>
                    <TableHead>{t('deliveries.columns.endpoint', 'Endpoint')}</TableHead>
                    <TableHead className="w-[80px]">{t('deliveries.columns.attempts', 'Attempts')}</TableHead>
                    <TableHead className="w-[140px]">{t('deliveries.columns.time', 'Time')}</TableHead>
                    <TableHead className="w-[60px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {deliveries.map((d) => (
                    <TableRow key={d.id}>
                      <TableCell>
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[d.status] || ''}`}>
                          {d.status === 'SUCCESS' ? <CheckCircle2 className="h-3 w-3" /> :
                           d.status === 'DLQ' ? <AlertTriangle className="h-3 w-3" /> :
                           d.status === 'FAILED' ? <XCircle className="h-3 w-3" /> :
                           <Clock className="h-3 w-3" />}
                          {d.status}
                        </span>
                      </TableCell>
                      <TableCell>
                        <code className="text-xs font-mono">{d.endpointId?.substring(0, 8)}…</code>
                      </TableCell>
                      <TableCell className="font-mono text-xs">{d.attemptCount}/{d.maxAttempts}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{formatRelativeTime(d.createdAt)}</TableCell>
                      <TableCell>
                        {(d.status === 'FAILED' || d.status === 'DLQ') && canManageEndpoints && (
                          <Button variant="ghost" size="icon-sm" onClick={() => deliveriesApi.replay(d.id).then(() => showSuccess('Replayed'))}>
                            <Send className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Card>
        )}

        {/* Debug Links */}
        {activeTab === 'debug' && (
          <Card>
            <CardHeader className="pb-2 flex flex-row items-center justify-between">
              <CardTitle className="text-sm">{t('eventDetail.debugLinks', 'Debug Links')}</CardTitle>
              <Button size="sm" onClick={handleShareDebug} disabled={sharingDebug}>
                {sharingDebug ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Share2 className="h-4 w-4 mr-1" />}
                {t('eventDetail.createLink', 'Create Link')}
              </Button>
            </CardHeader>
            <CardContent>
              {debugLinks.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">{t('eventDetail.noDebugLinks', 'No debug links created yet')}</p>
              ) : (
                <div className="space-y-3">
                  {debugLinks.map((link) => (
                    <div key={link.id} className="flex items-center justify-between gap-3 p-3 border rounded-lg">
                      <div className="min-w-0 flex-1">
                        <a href={link.shareUrl} target="_blank" rel="noopener noreferrer" className="text-sm font-mono text-primary hover:underline truncate block">
                          {link.shareUrl}
                        </a>
                        <div className="flex items-center gap-3 mt-1 text-[11px] text-muted-foreground">
                          <span>{t('eventDetail.views', '{{count}} views', { count: link.viewCount })}</span>
                          <span>{t('eventDetail.expires', 'Expires {{time}}', { time: formatRelativeTime(link.expiresAt) })}</span>
                        </div>
                      </div>
                      <Button variant="ghost" size="icon-sm" onClick={() => handleCopy(link.shareUrl, 'Debug link')}>
                        <Copy className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
