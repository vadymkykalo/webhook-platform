import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import {
  Copy, Radio, Send, Clock, FileJson, Shield, ExternalLink,
  CheckCircle2, XCircle, Loader2, RotateCcw
} from 'lucide-react';
import { useEvent } from '../api/queries';
import { useQuery } from '@tanstack/react-query';
import { deliveriesApi } from '../api/deliveries.api';
import { debugLinksApi } from '../api/debugLinks.api';
import { formatDateTime, formatRelativeTime } from '../lib/date';
import { showSuccess, showApiError } from '../lib/toast';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from './ui/sheet';
import { Button } from './ui/button';
import { Badge } from './ui/badge';

const DELIVERY_STATUS_COLORS: Record<string, string> = {
  SUCCESS: 'bg-green-500/10 text-green-700 dark:text-green-400',
  FAILED: 'bg-red-500/10 text-red-700 dark:text-red-400',
  DLQ: 'bg-orange-500/10 text-orange-700 dark:text-orange-400',
  PENDING: 'bg-blue-500/10 text-blue-700 dark:text-blue-400',
  PROCESSING: 'bg-cyan-500/10 text-cyan-700 dark:text-cyan-400',
};

interface EventDetailsSheetProps {
  projectId: string;
  eventId: string | null;
  onClose: () => void;
  onViewDeliveries?: (eventId: string) => void;
}

export default function EventDetailsSheet({
  projectId,
  eventId,
  onClose,
  onViewDeliveries,
}: EventDetailsSheetProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: event, isLoading } = useEvent(projectId, eventId ?? undefined);
  const [activeTab, setActiveTab] = useState<'raw' | 'sanitized' | 'deliveries'>('raw');

  // Fetch deliveries for this event
  const { data: deliveriesData, isLoading: deliveriesLoading } = useQuery({
    queryKey: ['deliveries', projectId, eventId, 'sheet'],
    queryFn: () => deliveriesApi.listByProject(projectId, { eventId: eventId!, size: 50 }),
    enabled: !!eventId && activeTab === 'deliveries',
  });
  const deliveries = deliveriesData?.content ?? [];

  // Fetch sanitized view from debug link (create a temporary one)
  const [sanitizedPayload, setSanitizedPayload] = useState<string | null>(null);
  const [sanitizedLoading, setSanitizedLoading] = useState(false);

  const loadSanitized = async () => {
    if (!projectId || !eventId || sanitizedPayload) return;
    setSanitizedLoading(true);
    try {
      const link = await debugLinksApi.create(projectId, eventId, { expiryHours: 1 });
      const pub = await debugLinksApi.viewPublic(link.token);
      setSanitizedPayload(pub.sanitizedPayload);
    } catch {
      setSanitizedPayload(t('events.details.sanitizedUnavailable', 'Sanitized view unavailable. Configure PII rules first.'));
    } finally {
      setSanitizedLoading(false);
    }
  };

  const handleCopy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    showSuccess(`${label} copied`);
  };

  const formatPayload = (payload: string | undefined) => {
    if (!payload) return '';
    try {
      return JSON.stringify(JSON.parse(payload), null, 2);
    } catch {
      return payload;
    }
  };

  return (
    <Sheet open={!!eventId} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="sm:max-w-2xl w-full overflow-y-auto">
        <SheetHeader className="pb-4 border-b">
          <SheetTitle className="flex items-center gap-2">
            <Radio className="h-5 w-5 text-primary" />
            {t('events.details.title', 'Event Details')}
          </SheetTitle>
          <SheetDescription>
            {event?.eventType && (
              <Badge variant="secondary" className="font-mono text-xs">
                {event.eventType}
              </Badge>
            )}
          </SheetDescription>
        </SheetHeader>

        {isLoading ? (
          <div className="space-y-4 pt-6">
            <div className="h-4 w-48 bg-muted animate-pulse rounded" />
            <div className="h-32 bg-muted animate-pulse rounded" />
            <div className="h-4 w-32 bg-muted animate-pulse rounded" />
          </div>
        ) : event ? (
          <div className="pt-4 space-y-6">
            {/* Meta info */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">
                  {t('events.eventId', 'Event ID')}
                </p>
                <div className="flex items-center gap-1.5 group">
                  <code className="text-xs font-mono text-foreground break-all">{event.id}</code>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                    onClick={() => handleCopy(event.id, 'Event ID')}
                  >
                    <Copy className="h-3 w-3" />
                  </Button>
                </div>
              </div>
              <div className="space-y-1">
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">
                  {t('events.created', 'Created')}
                </p>
                <div className="flex items-center gap-1.5 text-xs">
                  <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                  {formatDateTime(event.createdAt)}
                </div>
              </div>
              <div className="space-y-1">
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">
                  {t('events.eventType', 'Event Type')}
                </p>
                <code className="text-xs font-mono font-semibold">{event.eventType}</code>
              </div>
              {event.deliveriesCreated !== undefined && (
                <div className="space-y-1">
                  <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">
                    {t('events.details.deliveries', 'Deliveries')}
                  </p>
                  <div className="flex items-center gap-1.5 text-xs">
                    <Send className="h-3.5 w-3.5 text-muted-foreground" />
                    {event.deliveriesCreated}
                  </div>
                </div>
              )}
            </div>

            {/* Tabs */}
            <div className="border-b">
              <div className="flex gap-4">
                {(['raw', 'sanitized', 'deliveries'] as const).map((tab) => (
                  <button
                    key={tab}
                    className={`pb-2 text-sm font-medium border-b-2 transition-colors ${
                      activeTab === tab
                        ? 'border-primary text-primary'
                        : 'border-transparent text-muted-foreground hover:text-foreground'
                    }`}
                    onClick={() => {
                      setActiveTab(tab);
                      if (tab === 'sanitized') loadSanitized();
                    }}
                  >
                    {tab === 'raw' && <><FileJson className="h-3.5 w-3.5 inline mr-1.5" />{t('events.details.raw', 'Raw')}</>}
                    {tab === 'sanitized' && <><Shield className="h-3.5 w-3.5 inline mr-1.5" />{t('events.details.sanitized', 'Sanitized')}</>}
                    {tab === 'deliveries' && <><Send className="h-3.5 w-3.5 inline mr-1.5" />{t('events.details.deliveries', 'Deliveries')}
                      {event.deliveriesCreated != null && <Badge variant="secondary" className="ml-1.5 text-[10px] px-1.5 py-0">{event.deliveriesCreated}</Badge>}
                    </>}
                  </button>
                ))}
              </div>
            </div>

            {/* Raw tab */}
            {activeTab === 'raw' && (
              <div className="relative">
                <Button variant="ghost" size="sm" className="absolute top-2 right-2 h-7 text-xs z-10" onClick={() => handleCopy(formatPayload(event.payload), 'Payload')}>
                  <Copy className="h-3 w-3 mr-1" /> {t('common.copy', 'Copy')}
                </Button>
                <pre className="bg-muted/50 border rounded-lg p-4 text-xs font-mono overflow-x-auto max-h-[50vh] whitespace-pre-wrap break-words">
                  {formatPayload(event.payload) || <span className="text-muted-foreground italic">{t('events.details.noPayload', 'No payload')}</span>}
                </pre>
              </div>
            )}

            {/* Sanitized tab */}
            {activeTab === 'sanitized' && (
              <div className="relative">
                {sanitizedLoading ? (
                  <div className="flex items-center justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
                ) : sanitizedPayload ? (
                  <>
                    <Button variant="ghost" size="sm" className="absolute top-2 right-2 h-7 text-xs z-10" onClick={() => handleCopy(formatPayload(sanitizedPayload), 'Sanitized')}>
                      <Copy className="h-3 w-3 mr-1" /> {t('common.copy', 'Copy')}
                    </Button>
                    <pre className="bg-muted/50 border rounded-lg p-4 text-xs font-mono overflow-x-auto max-h-[50vh] whitespace-pre-wrap break-words">
                      {formatPayload(sanitizedPayload)}
                    </pre>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground py-8 text-center">{t('events.details.sanitizedUnavailable', 'Sanitized view unavailable')}</p>
                )}
              </div>
            )}

            {/* Deliveries tab */}
            {activeTab === 'deliveries' && (
              <div className="space-y-2">
                {deliveriesLoading ? (
                  <div className="flex items-center justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
                ) : deliveries.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-8 text-center">{t('events.details.noDeliveries', 'No deliveries for this event')}</p>
                ) : (
                  deliveries.map((d) => (
                    <div key={d.id} className="flex items-center justify-between px-3 py-2 border rounded-lg hover:bg-muted/30">
                      <div className="flex items-center gap-3 min-w-0">
                        {d.status === 'SUCCESS' ? <CheckCircle2 className="h-4 w-4 text-green-600 flex-shrink-0" /> :
                         d.status === 'FAILED' || d.status === 'DLQ' ? <XCircle className="h-4 w-4 text-red-500 flex-shrink-0" /> :
                         <Clock className="h-4 w-4 text-blue-500 flex-shrink-0" />}
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${DELIVERY_STATUS_COLORS[d.status] || ''}`}>{d.status}</span>
                            <code className="text-[11px] font-mono text-muted-foreground">{d.endpointId.substring(0, 8)}…</code>
                          </div>
                          <span className="text-[10px] text-muted-foreground">{d.attemptCount}/{d.maxAttempts} attempts · {formatRelativeTime(d.createdAt)}</span>
                        </div>
                      </div>
                      {(d.status === 'FAILED' || d.status === 'DLQ') && (
                        <Button variant="ghost" size="icon-sm" title="Replay" onClick={() => deliveriesApi.replay(d.id).then(() => showSuccess('Replayed')).catch(e => showApiError(e, 'deliveries.replayFailed'))}>
                          <RotateCcw className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  ))
                )}
              </div>
            )}

            {/* Actions */}
            <div className="pt-2 border-t flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="flex-1"
                onClick={() => { onClose(); navigate(`/admin/projects/${projectId}/events/${event.id}`); }}
              >
                <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                {t('events.details.openFull', 'Open Full Details')}
              </Button>
              {onViewDeliveries && (
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  onClick={() => onViewDeliveries(event.id)}
                >
                  <Send className="h-3.5 w-3.5 mr-1.5" />
                  {t('events.viewDeliveries', 'View Deliveries')}
                </Button>
              )}
            </div>
          </div>
        ) : (
          <div className="pt-6 text-center text-sm text-muted-foreground">
            {t('events.details.notFound', 'Event not found')}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

