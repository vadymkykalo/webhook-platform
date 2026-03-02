import { useState, useEffect } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { GitCompare, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { showApiError } from '../lib/toast';
import PageSkeleton from '../components/PageSkeleton';
import { eventDiffApi, EventDiffResponse } from '../api/eventDiff.api';
import { eventsApi, EventResponse } from '../api/events.api';
import EventDiffView from '../components/EventDiffView';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Select } from '../components/ui/select';
import { formatDateTime } from '../lib/date';

export default function EventDiffPage() {
  const { t } = useTranslation();
  const { projectId } = useParams<{ projectId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const [events, setEvents] = useState<EventResponse[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(true);
  const [leftId, setLeftId] = useState(searchParams.get('left') || '');
  const [rightId, setRightId] = useState(searchParams.get('right') || '');
  const [diffResult, setDiffResult] = useState<EventDiffResponse | null>(null);
  const [diffing, setDiffing] = useState(false);
  const [sanitize, setSanitize] = useState(true);

  useEffect(() => {
    if (projectId) loadEvents();
  }, [projectId]);

  useEffect(() => {
    if (leftId && rightId && projectId) {
      loadDiff();
    }
  }, [leftId, rightId, sanitize]);

  const loadEvents = async () => {
    if (!projectId) return;
    try {
      setLoadingEvents(true);
      const data = await eventsApi.listByProject(projectId, { page: 0, size: 50 });
      setEvents(data.content);
    } catch (err: any) {
      showApiError(err, 'eventDiff.toast.loadEventsFailed');
    } finally {
      setLoadingEvents(false);
    }
  };

  const loadDiff = async () => {
    if (!projectId || !leftId || !rightId) return;
    try {
      setDiffing(true);
      const result = await eventDiffApi.diff(projectId, leftId, rightId, sanitize);
      setDiffResult(result);
      setSearchParams({ left: leftId, right: rightId });
    } catch (err: any) {
      showApiError(err, 'eventDiff.toast.diffFailed');
    } finally {
      setDiffing(false);
    }
  };

  if (loadingEvents) {
    return <PageSkeleton><div className="h-64 bg-muted animate-pulse rounded-xl" /></PageSkeleton>;
  }

  return (
    <div className="p-6 lg:p-8 max-w-6xl mx-auto">
      <div className="mb-8">
        <h1 className="text-title tracking-tight flex items-center gap-2">
          <GitCompare className="h-6 w-6 text-primary" />
          {t('eventDiff.title')}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">{t('eventDiff.subtitle')}</p>
      </div>

      <Card className="mb-6">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">{t('eventDiff.selectEvents')}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-[1fr_auto_1fr_auto]  items-end">
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">{t('eventDiff.leftEvent')}</label>
              <Select value={leftId} onChange={(e) => setLeftId(e.target.value)}>
                <option value="">{t('eventDiff.selectPlaceholder')}</option>
                {events.map(ev => (
                  <option key={ev.id} value={ev.id}>
                    {ev.eventType} — {formatDateTime(ev.createdAt)}
                  </option>
                ))}
              </Select>
            </div>
            <div className="flex items-center justify-center pb-1">
              <GitCompare className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">{t('eventDiff.rightEvent')}</label>
              <Select value={rightId} onChange={(e) => setRightId(e.target.value)}>
                <option value="">{t('eventDiff.selectPlaceholder')}</option>
                {events.map(ev => (
                  <option key={ev.id} value={ev.id}>
                    {ev.eventType} — {formatDateTime(ev.createdAt)}
                  </option>
                ))}
              </Select>
            </div>
            <div className="flex gap-2">
              <Button onClick={loadDiff} disabled={!leftId || !rightId || diffing}>
                {diffing ? <Loader2 className="h-4 w-4 animate-spin" /> : <GitCompare className="h-4 w-4" />}
                {t('eventDiff.compare')}
              </Button>
            </div>
          </div>
          <label className="flex items-center gap-2 mt-3 text-xs text-muted-foreground cursor-pointer">
            <input
              type="checkbox"
              checked={sanitize}
              onChange={(e) => setSanitize(e.target.checked)}
              className="rounded border-muted-foreground"
            />
            {t('eventDiff.sanitizePii')}
          </label>
        </CardContent>
      </Card>

      {diffResult && (
        <EventDiffView
          leftPayload={diffResult.leftPayload}
          rightPayload={diffResult.rightPayload}
          diffs={diffResult.diffs}
          leftLabel={`${diffResult.eventType} — ${formatDateTime(diffResult.leftCreatedAt)}`}
          rightLabel={`${diffResult.eventType} — ${formatDateTime(diffResult.rightCreatedAt)}`}
        />
      )}
    </div>
  );
}
