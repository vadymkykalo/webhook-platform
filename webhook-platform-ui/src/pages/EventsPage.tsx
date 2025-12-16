import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ChevronRight, Radio, Plus, Eye, Copy } from 'lucide-react';
import { toast } from 'sonner';
import { projectsApi } from '../api/projects.api';
import { eventsApi, EventResponse } from '../api/events.api';
import type { ProjectResponse } from '../types/api.types';
import { Button } from '../components/ui/button';
import { Card, CardContent } from '../components/ui/card';
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
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        <div className="space-y-4">
          <div className="h-8 w-96 bg-muted animate-pulse rounded" />
          <div className="h-4 w-64 bg-muted animate-pulse rounded" />
        </div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        <div className="text-center py-16">
          <p className="text-muted-foreground">Project not found</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl">
      <div className="flex items-center text-sm text-muted-foreground mb-6">
        <button
          onClick={() => navigate('/projects')}
          className="hover:text-foreground transition-colors"
        >
          Projects
        </button>
        <ChevronRight className="h-4 w-4 mx-2" />
        <span className="text-foreground font-medium">{project.name}</span>
        <ChevronRight className="h-4 w-4 mx-2" />
        <span className="text-foreground">Events</span>
      </div>

      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Events</h1>
          <p className="text-muted-foreground mt-1">
            Send webhook events to this project
          </p>
        </div>
        <Button onClick={() => setShowSendModal(true)} size="lg">
          <Plus className="mr-2 h-4 w-4" />
          Send Test Event
        </Button>
      </div>

      {events.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <div className="rounded-full bg-primary/10 p-4 mb-4">
              <Radio className="h-10 w-10 text-primary" />
            </div>
            <h3 className="text-xl font-semibold mb-2">No events yet</h3>
            <p className="text-muted-foreground text-center mb-6 max-w-sm">
              Send your first webhook event to start processing deliveries
            </p>
            <Button onClick={() => setShowSendModal(true)} size="lg">
              <Plus className="mr-2 h-4 w-4" />
              Send Test Event
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Created</TableHead>
                  <TableHead>Event Type</TableHead>
                  <TableHead>Event ID</TableHead>
                  <TableHead>Deliveries</TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {events.map((event) => (
                  <TableRow key={event.id}>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-medium">
                          {formatRelativeTime(event.createdAt)}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {formatExactTime(event.createdAt)}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="font-mono text-sm font-medium">
                        {event.eventType}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <code className="text-sm font-mono">
                          {event.id.substring(0, 8)}...
                        </code>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => handleCopyId(event.id)}
                        >
                          <Copy className="h-3 w-3" />
                        </Button>
                      </div>
                    </TableCell>
                    <TableCell>
                      {event.deliveriesCreated !== undefined && (
                        <span className="text-sm font-medium">
                          {event.deliveriesCreated}
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => navigate(`/projects/${projectId}/deliveries`)}
                        title="View deliveries"
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>

          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <p className="text-sm text-muted-foreground">
                Showing {page * pageSize + 1} to {Math.min((page + 1) * pageSize, totalElements)} of {totalElements} events
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(p => Math.max(0, p - 1))}
                  disabled={page === 0}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                  disabled={page >= totalPages - 1}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </>
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
