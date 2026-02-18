import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Radio, Plus, Eye, Copy } from 'lucide-react';
import { toast } from 'sonner';
import { projectsApi } from '../api/projects.api';
import { eventsApi, EventResponse } from '../api/events.api';
import type { ProjectResponse } from '../types/api.types';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import SendTestEventModal from '../components/SendTestEventModal';

export default function EventsPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const [project, setProject] = useState<ProjectResponse | null>(null);
  const [events, setEvents] = useState<EventResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalElements, setTotalElements] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [page, setPage] = useState(0);
  const [pageSize] = useState(20);
  const [showSendModal, setShowSendModal] = useState(false);

  useEffect(() => {
    if (projectId) {
      loadData();
    }
  }, [projectId, page]);

  const loadData = async () => {
    if (!projectId) return;
    
    try {
      setLoading(true);
      const [projectData, eventsData] = await Promise.all([
        projectsApi.get(projectId),
        eventsApi.listByProject(projectId, { page, size: pageSize }),
      ]);
      setProject(projectData);
      setEvents(eventsData.content);
      setTotalElements(eventsData.totalElements);
      setTotalPages(eventsData.totalPages);
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const handleCopyId = (id: string) => {
    navigator.clipboard.writeText(id);
    toast.success('Event ID copied to clipboard');
  };

  const formatRelativeTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHour = Math.floor(diffMin / 60);
    const diffDay = Math.floor(diffHour / 24);

    if (diffSec < 60) return 'just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    if (diffHour < 24) return `${diffHour}h ago`;
    if (diffDay < 7) return `${diffDay}d ago`;
    
    return date.toLocaleDateString();
  };

  const formatExactTime = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  if (loading) {
    return (
      <div className="p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <div className="h-7 w-24 bg-muted animate-pulse rounded-lg" />
            <div className="h-4 w-56 bg-muted animate-pulse rounded" />
          </div>
          <div className="h-10 w-36 bg-muted animate-pulse rounded-lg" />
        </div>
        <div className="h-[400px] bg-muted animate-pulse rounded-xl" />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="p-6 lg:p-8 max-w-7xl mx-auto">
        <div className="flex flex-col items-center justify-center py-20">
          <div className="h-14 w-14 rounded-2xl bg-muted flex items-center justify-center mb-4">
            <Radio className="h-7 w-7 text-muted-foreground" />
          </div>
          <p className="text-muted-foreground">Project not found</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-8">
        <div>
          <h1 className="text-title tracking-tight">Events</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Webhook events for <span className="font-medium text-foreground">{project.name}</span>
          </p>
        </div>
        <Button onClick={() => setShowSendModal(true)}>
          <Plus className="h-4 w-4" /> Send Test Event
        </Button>
      </div>

      {events.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 border border-dashed rounded-xl">
          <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-6">
            <Radio className="h-8 w-8 text-primary" />
          </div>
          <h3 className="text-lg font-semibold mb-2">No events yet</h3>
          <p className="text-sm text-muted-foreground text-center mb-6 max-w-sm">
            Send your first webhook event to start processing deliveries
          </p>
          <Button onClick={() => setShowSendModal(true)}>
            <Plus className="h-4 w-4" /> Send Test Event
          </Button>
        </div>
      ) : (
        <div className="animate-fade-in">
          <Card className="overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Created</TableHead>
                  <TableHead className="text-xs">Event Type</TableHead>
                  <TableHead className="text-xs">Event ID</TableHead>
                  <TableHead className="text-xs">Deliveries</TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {events.map((event) => (
                  <TableRow key={event.id} className="hover:bg-muted/30">
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="text-sm font-medium">{formatRelativeTime(event.createdAt)}</span>
                        <span className="text-[11px] text-muted-foreground">{formatExactTime(event.createdAt)}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="font-mono text-[13px] font-medium">{event.eventType}</span>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <code className="text-[13px] font-mono text-muted-foreground">{event.id.substring(0, 8)}...</code>
                        <Button variant="ghost" size="icon-sm" className="h-6 w-6" onClick={() => handleCopyId(event.id)}>
                          <Copy className="h-3 w-3" />
                        </Button>
                      </div>
                    </TableCell>
                    <TableCell>
                      {event.deliveriesCreated !== undefined && (
                        <span className="inline-flex items-center justify-center h-6 min-w-[24px] px-1.5 rounded-full bg-muted text-xs font-medium">
                          {event.deliveriesCreated}
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon-sm" onClick={() => navigate(`/projects/${projectId}/deliveries`)} title="View deliveries">
                        <Eye className="h-3.5 w-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>

          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <p className="text-xs text-muted-foreground">
                Showing {page * pageSize + 1}–{Math.min((page + 1) * pageSize, totalElements)} of {totalElements}
              </p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}>Previous</Button>
                <Button variant="outline" size="sm" onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}>Next</Button>
              </div>
            </div>
          )}
        </div>
      )}

      <SendTestEventModal
        projectId={projectId!}
        open={showSendModal}
        onClose={() => setShowSendModal(false)}
        onSuccess={loadData}
      />
    </div>
  );
}
