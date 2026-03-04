import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Radio, Plus, Copy, Share2, Loader2, Send, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { showSuccess, showApiError } from '../lib/toast';
import { useEvents } from '../api/queries';
import { formatRelativeTime, formatDateTime } from '../lib/date';
import PageSkeleton from '../components/PageSkeleton';
import EmptyState from '../components/EmptyState';
import { projectsApi } from '../api/projects.api';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { SortableTableHead, useSort } from '../components/ui/sortable-table-head';
import { TablePagination } from '../components/ui/table-pagination';
import SendTestEventModal from '../components/SendTestEventModal';
import EventDetailsSheet from '../components/EventDetailsSheet';
import { usePermissions } from '../auth/usePermissions';
import PermissionGate from '../components/PermissionGate';
import VerificationGate from '../components/VerificationGate';
import { debugLinksApi } from '../api/debugLinks.api';

export default function EventsPage() {
  const { t } = useTranslation();
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(20);
  const { sort, toggle: toggleSort, param: sortParam } = useSort('createdAt', 'desc');
  const [showSendModal, setShowSendModal] = useState(false);
  const { canSendEvents, canCreateDebugLinks } = usePermissions();
  const [sharingEventId, setSharingEventId] = useState<string | null>(null);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);

  const { data: project } = useQuery({
    queryKey: ['projects', projectId],
    queryFn: () => projectsApi.get(projectId!),
    enabled: !!projectId,
  });

  const { data: eventsData, isLoading: loading } = useEvents(projectId, page, pageSize, sortParam);
  const events = eventsData?.content ?? [];
  const totalElements = eventsData?.totalElements ?? 0;
  const totalPages = eventsData?.totalPages ?? 0;

  const handleCopyId = (id: string) => {
    navigator.clipboard.writeText(id);
    showSuccess(t('events.toast.idCopied'));
  };

  const handleShareDebugLink = async (eventId: string) => {
    if (!projectId) return;
    try {
      setSharingEventId(eventId);
      const link = await debugLinksApi.create(projectId, eventId);
      await navigator.clipboard.writeText(link.shareUrl);
      showSuccess(t('debugLinks.copied'));
    } catch (err: any) {
      showApiError(err, 'debugLinks.createFailed');
    } finally {
      setSharingEventId(null);
    }
  };


  if (loading) {
    return <PageSkeleton maxWidth="max-w-7xl" />;
  }

  if (!project) {
    return (
      <div className="p-6 lg:p-8 max-w-7xl mx-auto">
        <EmptyState icon={Radio} title={t('common.error')} />
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-8">
        <div>
          <h1 className="text-title tracking-tight">{t('events.title')}</h1>
          <p className="text-sm text-muted-foreground mt-1" dangerouslySetInnerHTML={{ __html: t('events.subtitle', { project: project.name }) }} />
        </div>
        <PermissionGate allowed={canSendEvents}>
          <VerificationGate>
            <Button onClick={() => setShowSendModal(true)}>
              <Plus className="h-4 w-4" /> {t('events.sendTest')}
            </Button>
          </VerificationGate>
        </PermissionGate>
      </div>

      {events.length === 0 ? (
        <EmptyState
          icon={Radio}
          title={t('events.noEvents')}
          description={t('events.noEventsDesc')}
          action={
            <PermissionGate allowed={canSendEvents}>
              <VerificationGate>
                <Button onClick={() => setShowSendModal(true)}>
                  <Plus className="h-4 w-4" /> {t('events.sendTest')}
                </Button>
              </VerificationGate>
            </PermissionGate>
          }
          docsLink="/docs#events-api"
        />
      ) : (
        <div className="animate-fade-in">
          <Card className="overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <SortableTableHead field="eventType" sort={sort} onSort={toggleSort}>{t('events.eventType')}</SortableTableHead>
                  <TableHead className="text-xs">{t('events.eventId')}</TableHead>
                  <TableHead className="text-xs">{t('events.deliveriesCount')}</TableHead>
                  <SortableTableHead field="createdAt" sort={sort} onSort={toggleSort}>{t('events.created')}</SortableTableHead>
                  <TableHead className="w-[80px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {events.map((event) => (
                  <TableRow key={event.id} className="hover:bg-muted/30 cursor-pointer" onClick={() => setSelectedEventId(event.id)}>
                    <TableCell>
                      <span className="font-mono text-sm font-semibold">{event.eventType}</span>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5 group">
                        <code className="text-[13px] font-mono text-muted-foreground">{event.id.substring(0, 8)}...</code>
                        <Button variant="ghost" size="icon-sm" className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => { e.stopPropagation(); handleCopyId(event.id); }}>
                          <Copy className="h-3 w-3" />
                        </Button>
                      </div>
                    </TableCell>
                    <TableCell>
                      {event.deliveriesCreated != null && (
                        <div className="flex items-center gap-1.5">
                          {event.deliveriesCreated === 0 ? (
                            <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                          ) : (
                            <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                          )}
                          <span className={`text-sm font-medium ${event.deliveriesCreated === 0 ? 'text-amber-600 dark:text-amber-400' : ''}`}>
                            {event.deliveriesCreated}
                          </span>
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="text-sm">{formatRelativeTime(event.createdAt)}</span>
                        <span className="text-[11px] text-muted-foreground">{formatDateTime(event.createdAt)}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        {canCreateDebugLinks && (
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={(e) => { e.stopPropagation(); handleShareDebugLink(event.id); }}
                            disabled={sharingEventId === event.id}
                            title={t('debugLinks.share')}
                          >
                            {sharingEventId === event.id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Share2 className="h-3.5 w-3.5" />
                            )}
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => navigate(`/admin/projects/${projectId}/deliveries?eventId=${event.id}`)}
                          title={t('events.viewDeliveries')}
                        >
                          <Send className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>

          <TablePagination
            page={page}
            pageSize={pageSize}
            totalElements={totalElements}
            totalPages={totalPages}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
          />
        </div>
      )}

      <EventDetailsSheet
        projectId={projectId!}
        eventId={selectedEventId}
        onClose={() => setSelectedEventId(null)}
        onViewDeliveries={(id) => {
          setSelectedEventId(null);
          navigate(`/admin/projects/${projectId}/deliveries?eventId=${id}`);
        }}
      />

      <SendTestEventModal
        projectId={projectId!}
        open={showSendModal}
        onClose={() => setShowSendModal(false)}
        onSuccess={() => queryClient.invalidateQueries({ queryKey: ['events', projectId] })}
      />
    </div>
  );
}
