import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { AlertTriangle, RefreshCw, Trash2, Loader2, CheckSquare, Square } from 'lucide-react';
import { toast } from 'sonner';
import { projectsApi } from '../api/projects.api';
import { dlqApi, DlqItemResponse, DlqStatsResponse } from '../api/dlq.api';
import { endpointsApi } from '../api/endpoints.api';
import type { ProjectResponse, EndpointResponse } from '../types/api.types';
import { Button } from '../components/ui/button';
import { Card, CardContent } from '../components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
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
      <div className="p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <div className="h-7 w-44 bg-muted animate-pulse rounded-lg" />
            <div className="h-4 w-56 bg-muted animate-pulse rounded" />
          </div>
          <div className="h-10 w-28 bg-muted animate-pulse rounded-lg" />
        </div>
        <div className="grid grid-cols-3 gap-4">
          {[1,2,3].map(i => <div key={i} className="h-20 bg-muted animate-pulse rounded-xl" />)}
        </div>
        <div className="h-[300px] bg-muted animate-pulse rounded-xl" />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="p-6 lg:p-8 max-w-7xl mx-auto">
        <div className="flex flex-col items-center justify-center py-20">
          <div className="h-14 w-14 rounded-2xl bg-muted flex items-center justify-center mb-4">
            <AlertTriangle className="h-7 w-7 text-muted-foreground" />
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
          <h1 className="text-title tracking-tight">Dead Letter Queue</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Failed deliveries for <span className="font-medium text-foreground">{project.name}</span>
          </p>
        </div>
        <div className="flex gap-2">
          {selectedIds.size > 0 && (
            <Button onClick={handleRetrySelected} disabled={retrying} size="sm">
              {retrying && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Retry ({selectedIds.size})
            </Button>
          )}
          <Button variant="destructive" size="sm" onClick={() => setShowPurgeDialog(true)} disabled={!stats?.totalItems}>
            <Trash2 className="h-3.5 w-3.5" /> Purge All
          </Button>
        </div>
      </div>

      {stats && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
          <Card>
            <CardContent className="p-4">
              <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Total Items</p>
              <p className="text-2xl font-bold text-destructive mt-1">{stats.totalItems}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Last 24 Hours</p>
              <p className="text-2xl font-bold mt-1">{stats.last24Hours}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Last 7 Days</p>
              <p className="text-2xl font-bold mt-1">{stats.last7Days}</p>
            </CardContent>
          </Card>
        </div>
      )}

      <Card className="mb-6">
        <CardContent className="p-4">
          <div className="flex items-end gap-3">
            <div className="space-y-1.5 flex-1">
              <Label htmlFor="endpointFilter" className="text-xs">Filter by Endpoint</Label>
              <Select id="endpointFilter" value={endpointFilter} onChange={(e) => { setEndpointFilter(e.target.value); setPage(0); }}>
                <option value="">All endpoints</option>
                {endpoints.map(endpoint => (<option key={endpoint.id} value={endpoint.id}>{endpoint.url}</option>))}
              </Select>
            </div>
            <Button variant="outline" size="icon-sm" onClick={loadData} title="Refresh">
              <RefreshCw className="h-3.5 w-3.5" />
            </Button>
          </div>
        </CardContent>
      </Card>

      {items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 border border-dashed rounded-xl">
          <div className="h-16 w-16 rounded-2xl bg-success/10 flex items-center justify-center mb-6">
            <CheckSquare className="h-8 w-8 text-success" />
          </div>
          <h3 className="text-lg font-semibold mb-2">No items in DLQ</h3>
          <p className="text-sm text-muted-foreground text-center">
            All deliveries are being processed successfully
          </p>
        </div>
      ) : (
        <div className="animate-fade-in">
          <Card className="overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <button onClick={toggleSelectAll} className="p-1">
                      {selectedIds.size === items.length ? <CheckSquare className="h-4 w-4 text-primary" /> : <Square className="h-4 w-4 text-muted-foreground" />}
                    </button>
                  </TableHead>
                  <TableHead className="text-xs">Event Type</TableHead>
                  <TableHead className="text-xs">Endpoint</TableHead>
                  <TableHead className="text-xs">Attempts</TableHead>
                  <TableHead className="text-xs">Last Error</TableHead>
                  <TableHead className="text-xs">Failed At</TableHead>
                  <TableHead className="w-[60px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => (
                  <TableRow key={item.deliveryId} className="hover:bg-muted/30">
                    <TableCell>
                      <button onClick={() => toggleSelect(item.deliveryId)} className="p-1">
                        {selectedIds.has(item.deliveryId) ? <CheckSquare className="h-4 w-4 text-primary" /> : <Square className="h-4 w-4 text-muted-foreground" />}
                      </button>
                    </TableCell>
                    <TableCell><code className="text-[13px] font-mono">{item.eventType}</code></TableCell>
                    <TableCell><span className="font-mono text-[13px] truncate max-w-[180px] block">{item.endpointUrl}</span></TableCell>
                    <TableCell><span className="text-sm font-medium">{item.attemptCount}<span className="text-muted-foreground">/{item.maxAttempts}</span></span></TableCell>
                    <TableCell><span className="text-[13px] text-destructive truncate max-w-[180px] block">{item.lastError || 'Unknown error'}</span></TableCell>
                    <TableCell><span className="text-[13px] text-muted-foreground">{new Date(item.failedAt).toLocaleString()}</span></TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon-sm" onClick={() => handleRetrySingle(item.deliveryId)} disabled={retrying} title="Retry">
                        <RefreshCw className="h-3.5 w-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>

          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <span className="text-xs text-muted-foreground">Page {page + 1} of {totalPages}</span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}>Previous</Button>
                <Button variant="outline" size="sm" onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}>Next</Button>
              </div>
            </div>
          )}
        </div>
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
