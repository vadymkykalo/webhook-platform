import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ChevronRight, AlertTriangle, RefreshCw, Trash2, Loader2, CheckSquare, Square } from 'lucide-react';
import { toast } from 'sonner';
import { projectsApi } from '../api/projects.api';
import { dlqApi, DlqItemResponse, DlqStatsResponse } from '../api/dlq.api';
import { endpointsApi } from '../api/endpoints.api';
import type { ProjectResponse, EndpointResponse } from '../types/api.types';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Badge } from '../components/ui/badge';
import { Select } from '../components/ui/select';
import { Label } from '../components/ui/label';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../components/ui/alert-dialog';

export default function DlqPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const [project, setProject] = useState<ProjectResponse | null>(null);
  const [items, setItems] = useState<DlqItemResponse[]>([]);
  const [stats, setStats] = useState<DlqStatsResponse | null>(null);
  const [endpoints, setEndpoints] = useState<EndpointResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [endpointFilter, setEndpointFilter] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [retrying, setRetrying] = useState(false);
  const [showPurgeDialog, setShowPurgeDialog] = useState(false);
  const [purging, setPurging] = useState(false);

  useEffect(() => {
    if (projectId) {
      loadData();
    }
  }, [projectId, page, endpointFilter]);

  const loadData = async () => {
    if (!projectId) return;
    
    try {
      setLoading(true);
      const [projectData, dlqData, statsData, endpointsData] = await Promise.all([
        projectsApi.get(projectId),
        dlqApi.list(projectId, page, 20, endpointFilter || undefined),
        dlqApi.getStats(projectId),
        endpointsApi.list(projectId),
      ]);
      setProject(projectData);
      setItems(dlqData.content);
      setTotalPages(dlqData.totalPages);
      setStats(statsData);
      setEndpoints(endpointsData);
      setSelectedIds(new Set());
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to load DLQ data');
    } finally {
      setLoading(false);
    }
  };

  const handleRetrySingle = async (deliveryId: string) => {
    try {
      setRetrying(true);
      await dlqApi.retrySingle(projectId!, deliveryId);
      toast.success('Delivery queued for retry');
      loadData();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to retry delivery');
    } finally {
      setRetrying(false);
    }
  };

  const handleRetrySelected = async () => {
    if (selectedIds.size === 0) return;
    
    try {
      setRetrying(true);
      const result = await dlqApi.retryBulk(projectId!, Array.from(selectedIds));
      toast.success(`${result.retried} deliveries queued for retry`);
      loadData();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to retry deliveries');
    } finally {
      setRetrying(false);
    }
  };

  const handlePurgeAll = async () => {
    try {
      setPurging(true);
      const result = await dlqApi.purgeAll(projectId!);
      toast.success(`${result.purged} items purged from DLQ`);
      setShowPurgeDialog(false);
      loadData();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to purge DLQ');
    } finally {
      setPurging(false);
    }
  };

  const toggleSelect = (id: string) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedIds(newSet);
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === items.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(items.map(i => i.deliveryId)));
    }
  };

  if (loading && !project) {
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
        <button onClick={() => navigate('/projects')} className="hover:text-foreground transition-colors">
          Projects
        </button>
        <ChevronRight className="h-4 w-4 mx-2" />
        <span className="text-foreground font-medium">{project.name}</span>
        <ChevronRight className="h-4 w-4 mx-2" />
        <span className="text-foreground">Dead Letter Queue</span>
      </div>

      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <AlertTriangle className="h-8 w-8 text-destructive" />
            Dead Letter Queue
          </h1>
          <p className="text-muted-foreground mt-1">
            Failed deliveries that exceeded max retry attempts
          </p>
        </div>
        <div className="flex gap-2">
          {selectedIds.size > 0 && (
            <Button onClick={handleRetrySelected} disabled={retrying}>
              {retrying && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Retry Selected ({selectedIds.size})
            </Button>
          )}
          <Button variant="destructive" onClick={() => setShowPurgeDialog(true)} disabled={!stats?.totalItems}>
            <Trash2 className="mr-2 h-4 w-4" />
            Purge All
          </Button>
        </div>
      </div>

      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total Items</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-destructive">{stats.totalItems}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Last 24 Hours</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.last24Hours}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Last 7 Days</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.last7Days}</div>
            </CardContent>
          </Card>
        </div>
      )}

      <Card className="mb-6">
        <CardContent className="pt-6">
          <div className="flex items-center gap-4">
            <div className="space-y-2 flex-1">
              <Label htmlFor="endpointFilter">Filter by Endpoint</Label>
              <Select
                id="endpointFilter"
                value={endpointFilter}
                onChange={(e) => { setEndpointFilter(e.target.value); setPage(0); }}
              >
                <option value="">All endpoints</option>
                {endpoints.map(endpoint => (
                  <option key={endpoint.id} value={endpoint.id}>
                    {endpoint.url}
                  </option>
                ))}
              </Select>
            </div>
            <Button variant="outline" onClick={loadData} className="mt-6">
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      {items.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <div className="rounded-full bg-green-100 p-4 mb-4">
              <CheckSquare className="h-10 w-10 text-green-600" />
            </div>
            <h3 className="text-xl font-semibold mb-2">No items in DLQ</h3>
            <p className="text-muted-foreground text-center">
              All deliveries are being processed successfully
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">
                    <button onClick={toggleSelectAll} className="p-1">
                      {selectedIds.size === items.length ? (
                        <CheckSquare className="h-4 w-4" />
                      ) : (
                        <Square className="h-4 w-4" />
                      )}
                    </button>
                  </TableHead>
                  <TableHead>Event Type</TableHead>
                  <TableHead>Endpoint</TableHead>
                  <TableHead>Attempts</TableHead>
                  <TableHead>Last Error</TableHead>
                  <TableHead>Failed At</TableHead>
                  <TableHead className="w-[100px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => (
                  <TableRow key={item.deliveryId}>
                    <TableCell>
                      <button onClick={() => toggleSelect(item.deliveryId)} className="p-1">
                        {selectedIds.has(item.deliveryId) ? (
                          <CheckSquare className="h-4 w-4 text-primary" />
                        ) : (
                          <Square className="h-4 w-4" />
                        )}
                      </button>
                    </TableCell>
                    <TableCell>
                      <code className="text-sm font-mono">{item.eventType}</code>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm truncate max-w-[200px] block">
                        {item.endpointUrl}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">
                        {item.attemptCount}/{item.maxAttempts}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm text-destructive truncate max-w-[200px] block">
                        {item.lastError || 'Unknown error'}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm text-muted-foreground">
                        {new Date(item.failedAt).toLocaleString()}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRetrySingle(item.deliveryId)}
                        disabled={retrying}
                      >
                        <RefreshCw className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>

          {totalPages > 1 && (
            <div className="flex justify-center gap-2 mt-4">
              <Button
                variant="outline"
                onClick={() => setPage(p => Math.max(0, p - 1))}
                disabled={page === 0}
              >
                Previous
              </Button>
              <span className="flex items-center px-4">
                Page {page + 1} of {totalPages}
              </span>
              <Button
                variant="outline"
                onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
              >
                Next
              </Button>
            </div>
          )}
        </>
      )}

      <AlertDialog open={showPurgeDialog} onOpenChange={setShowPurgeDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Purge All DLQ Items?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete all {stats?.totalItems} items from the Dead Letter Queue.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={purging}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handlePurgeAll}
              disabled={purging}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {purging && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {purging ? 'Purging...' : 'Purge All'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
