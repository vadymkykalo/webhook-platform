import { useState, useEffect, useRef, useMemo } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { GitCompare, Loader2, Search, ChevronLeft, ChevronRight, AlertTriangle, Plus, Minus, ArrowLeftRight, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { showApiError } from '../lib/toast';
import PageSkeleton from '../components/PageSkeleton';
import { eventDiffApi, EventDiffResponse } from '../api/eventDiff.api';
import { eventsApi, EventResponse } from '../api/events.api';
import EventDiffView from '../components/EventDiffView';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Badge } from '../components/ui/badge';
import { formatDateTime, formatRelativeTime } from '../lib/date';

// ── Searchable Event Picker ──────────────────────────────────────────

interface EventPickerProps {
  label: string;
  events: EventResponse[];
  selectedId: string;
  onSelect: (id: string) => void;
  totalPages: number;
  currentPage: number;
  onPageChange: (page: number) => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  loading: boolean;
  totalElements: number;
}

function EventPicker({ label, events, selectedId, onSelect, totalPages, currentPage, onPageChange, searchQuery, onSearchChange, loading, totalElements }: EventPickerProps) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const selected = events.find(e => e.id === selectedId);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  return (
    <div className="space-y-1.5" ref={wrapperRef}>
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      <div className="relative">
        {/* Trigger */}
        <button
          type="button"
          className={`w-full flex items-center justify-between gap-2 px-3 py-2 text-sm border rounded-md bg-background hover:bg-accent transition-colors text-left ${selectedId ? '' : 'text-muted-foreground'}`}
          onClick={() => setOpen(!open)}
        >
          {selected ? (
            <span className="truncate">
              <span className="font-mono font-medium">{selected.eventType}</span>
              <span className="text-muted-foreground ml-2 text-xs">{selected.id.substring(0, 8)}… · {formatRelativeTime(selected.createdAt)}</span>
            </span>
          ) : (
            <span>Select an event...</span>
          )}
          {selectedId && (
            <X className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground shrink-0" onClick={(e) => { e.stopPropagation(); onSelect(''); }} />
          )}
        </button>

        {/* Dropdown */}
        {open && (
          <div className="absolute z-50 w-full mt-1 rounded-lg border bg-popover shadow-lg overflow-hidden">
            {/* Search */}
            <div className="p-2 border-b">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  placeholder="Search by type or ID..."
                  value={searchQuery}
                  onChange={(e) => onSearchChange(e.target.value)}
                  className="h-8 pl-8 text-xs"
                  autoFocus
                />
              </div>
            </div>

            {/* Event list */}
            <div className="max-h-64 overflow-y-auto">
              {loading ? (
                <div className="flex items-center justify-center py-6">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                </div>
              ) : events.length === 0 ? (
                <div className="py-6 text-center text-xs text-muted-foreground">
                  {searchQuery ? 'No events match your search' : 'No events found'}
                </div>
              ) : (
                events.map(ev => (
                  <button
                    key={ev.id}
                    type="button"
                    className={`w-full text-left px-3 py-2 text-xs hover:bg-accent transition-colors border-b last:border-b-0 ${ev.id === selectedId ? 'bg-primary/5' : ''}`}
                    onClick={() => { onSelect(ev.id); setOpen(false); }}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono font-semibold text-[13px]">{ev.eventType}</span>
                      <span className="text-[11px] text-muted-foreground">{formatRelativeTime(ev.createdAt)}</span>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <code className="text-[10px] text-muted-foreground">{ev.id.substring(0, 12)}…</code>
                      <span className="text-[10px] text-muted-foreground">{formatDateTime(ev.createdAt)}</span>
                      {ev.deliveriesCreated != null && (
                        <Badge variant={ev.deliveriesCreated === 0 ? 'warning' : 'success'} className="text-[9px] px-1 py-0 h-4">
                          {ev.deliveriesCreated} del
                        </Badge>
                      )}
                    </div>
                  </button>
                ))
              )}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-3 py-2 border-t bg-muted/30 text-xs text-muted-foreground">
                <span>{totalElements} events · Page {currentPage + 1}/{totalPages}</span>
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon-sm" className="h-6 w-6" disabled={currentPage === 0} onClick={() => onPageChange(currentPage - 1)}>
                    <ChevronLeft className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon-sm" className="h-6 w-6" disabled={currentPage >= totalPages - 1} onClick={() => onPageChange(currentPage + 1)}>
                    <ChevronRight className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main Page ────────────────────────────────────────────────────────

export default function EventDiffPage() {
  const { t } = useTranslation();
  const { projectId } = useParams<{ projectId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();

  // Events state (shared between both pickers)
  const [allEvents, setAllEvents] = useState<EventResponse[]>([]);
  const [totalElements, setTotalElements] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [eventsPage, setEventsPage] = useState(0);
  const [loadingEvents, setLoadingEvents] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  // Selection
  const [leftId, setLeftId] = useState(searchParams.get('left') || '');
  const [rightId, setRightId] = useState(searchParams.get('right') || '');

  // Diff result
  const [diffResult, setDiffResult] = useState<EventDiffResponse | null>(null);
  const [diffing, setDiffing] = useState(false);
  const [sanitize, setSanitize] = useState(true);

  // Load events with pagination
  useEffect(() => {
    if (projectId) loadEvents(eventsPage);
  }, [projectId, eventsPage]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-compare when both selected
  useEffect(() => {
    if (leftId && rightId && projectId && leftId !== rightId) {
      loadDiff();
    }
  }, [leftId, rightId, sanitize, projectId]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadEvents = async (page: number) => {
    if (!projectId) return;
    try {
      setLoadingEvents(true);
      const data = await eventsApi.listByProject(projectId, { page, size: 20, sort: 'createdAt,desc' });
      setAllEvents(data.content);
      setTotalElements(data.totalElements);
      setTotalPages(data.totalPages);
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

  // Client-side filter events by search query
  const filteredEvents = useMemo(() => {
    if (!searchQuery.trim()) return allEvents;
    const q = searchQuery.toLowerCase();
    return allEvents.filter(ev =>
      ev.eventType.toLowerCase().includes(q) ||
      ev.id.toLowerCase().includes(q)
    );
  }, [allEvents, searchQuery]);

  // Diff summary counts
  const diffSummary = useMemo(() => {
    if (!diffResult) return null;
    const added = diffResult.diffs.filter(d => d.type === 'ADDED').length;
    const removed = diffResult.diffs.filter(d => d.type === 'REMOVED').length;
    const changed = diffResult.diffs.filter(d => d.type === 'CHANGED').length;
    return { added, removed, changed, total: diffResult.diffs.length };
  }, [diffResult]);

  if (loadingEvents && allEvents.length === 0) {
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

      {/* Event Selection */}
      <Card className="mb-6">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">{t('eventDiff.selectEvents')}</CardTitle>
          <CardDescription className="text-xs">
            Choose two events to compare their payloads. Search by event type or ID. Differences will be highlighted automatically.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-[1fr_auto_1fr] items-start">
            <EventPicker
              label={t('eventDiff.leftEvent')}
              events={filteredEvents}
              selectedId={leftId}
              onSelect={setLeftId}
              totalPages={totalPages}
              currentPage={eventsPage}
              onPageChange={setEventsPage}
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
              loading={loadingEvents}
              totalElements={totalElements}
            />
            <div className="flex items-center justify-center pt-7">
              <GitCompare className="h-5 w-5 text-muted-foreground" />
            </div>
            <EventPicker
              label={t('eventDiff.rightEvent')}
              events={filteredEvents}
              selectedId={rightId}
              onSelect={setRightId}
              totalPages={totalPages}
              currentPage={eventsPage}
              onPageChange={setEventsPage}
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
              loading={loadingEvents}
              totalElements={totalElements}
            />
          </div>

          <div className="flex items-center justify-between mt-4">
            <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
              <input
                type="checkbox"
                checked={sanitize}
                onChange={(e) => setSanitize(e.target.checked)}
                className="rounded border-muted-foreground"
              />
              {t('eventDiff.sanitizePii')}
            </label>
            {leftId && rightId && leftId === rightId && (
              <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
                <AlertTriangle className="h-3.5 w-3.5" />
                Same event selected on both sides
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Diff loading indicator */}
      {diffing && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
          <span className="ml-2 text-sm text-muted-foreground">Comparing events...</span>
        </div>
      )}

      {/* Diff Summary Alert */}
      {diffResult && diffSummary && !diffing && (
        <Card className={`mb-6 ${diffSummary.total > 0 ? 'border-amber-300 dark:border-amber-700' : 'border-green-300 dark:border-green-700'}`}>
          <CardContent className="py-4">
            {diffSummary.total === 0 ? (
              <div className="flex items-center gap-3 text-green-700 dark:text-green-400">
                <div className="h-8 w-8 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                  <GitCompare className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-sm font-semibold">No differences found</p>
                  <p className="text-xs text-muted-foreground">Both events have identical payloads</p>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-4">
                <div className="h-8 w-8 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center shrink-0">
                  <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-semibold">{diffSummary.total} {diffSummary.total === 1 ? 'difference' : 'differences'} detected</p>
                  <p className="text-xs text-muted-foreground">Between these two events of type <code className="bg-muted px-1 rounded">{diffResult.eventType}</code></p>
                </div>
                <div className="flex items-center gap-2">
                  {diffSummary.added > 0 && (
                    <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 border-green-300 dark:border-green-700 gap-1">
                      <Plus className="h-3 w-3" /> {diffSummary.added} added
                    </Badge>
                  )}
                  {diffSummary.removed > 0 && (
                    <Badge className="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 border-red-300 dark:border-red-700 gap-1">
                      <Minus className="h-3 w-3" /> {diffSummary.removed} removed
                    </Badge>
                  )}
                  {diffSummary.changed > 0 && (
                    <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border-amber-300 dark:border-amber-700 gap-1">
                      <ArrowLeftRight className="h-3 w-3" /> {diffSummary.changed} changed
                    </Badge>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Diff View */}
      {diffResult && !diffing && (
        <EventDiffView
          leftPayload={diffResult.leftPayload}
          rightPayload={diffResult.rightPayload}
          diffs={diffResult.diffs}
          leftLabel={`${diffResult.eventType} — ${formatDateTime(diffResult.leftCreatedAt)}`}
          rightLabel={`${diffResult.eventType} — ${formatDateTime(diffResult.rightCreatedAt)}`}
        />
      )}

      {/* Empty state */}
      {!diffResult && !diffing && !leftId && !rightId && (
        <div className="text-center py-16">
          <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
            <GitCompare className="h-7 w-7 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-semibold mb-1">Compare Event Payloads</h3>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            Select two events above to compare their payloads side by side. Structural differences like added, removed, or changed fields will be highlighted automatically.
          </p>
        </div>
      )}
    </div>
  );
}
