import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { AlertTriangle, RefreshCw, Trash2, Loader2, CheckSquare, Square } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { showApiError, showSuccess, showCriticalSuccess } from '../lib/toast';
import { formatDateTime } from '../lib/date';
import PageSkeleton, { SkeletonCards } from '../components/PageSkeleton';
import EmptyState from '../components/EmptyState';
import { projectsApi } from '../api/projects.api';
import { dlqApi, DlqItemResponse, DlqStatsResponse } from '../api/dlq.api';
import { endpointsApi } from '../api/endpoints.api';
import type { ProjectResponse, EndpointResponse } from '../types/api.types';
import { Button } from '../components/ui/button';
import { Card, CardContent } from '../components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Select } from '../components/ui/select';
import { Label } from '../components/ui/label';
import DangerConfirmDialog from '../components/DangerConfirmDialog';
import { usePermissions } from '../auth/usePermissions';
import PermissionGate from '../components/PermissionGate';

export default function DlqPage() {
  const { t } = useTranslation();
  const { projectId } = useParams<{ projectId: string }>();
  const { canManageDlq } = usePermissions();
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
      showApiError(err, 'dlq.toast.loadFailed', { retry: loadData });
    } finally {
      setLoading(false);
    }
  };

  const handleRetrySingle = async (deliveryId: string) => {
    try {
      setRetrying(true);
      await dlqApi.retrySingle(projectId!, deliveryId);
      showSuccess(t('dlq.toast.retried'));
      loadData();
    } catch (err: any) {
      showApiError(err, 'dlq.toast.retryFailed');
    } finally {
      setRetrying(false);
    }
  };

  const handleRetrySelected = async () => {
    if (selectedIds.size === 0) return;
    
    try {
      setRetrying(true);
      const result = await dlqApi.retryBulk(projectId!, Array.from(selectedIds));
      showSuccess(t('dlq.toast.bulkRetried', { count: result.retried }));
      loadData();
    } catch (err: any) {
      showApiError(err, 'dlq.toast.bulkRetryFailed');
    } finally {
      setRetrying(false);
    }
  };

  const handlePurgeAll = async () => {
    try {
      setPurging(true);
      const result = await dlqApi.purgeAll(projectId!);
      showCriticalSuccess(t('dlq.toast.purged', { count: result.purged }));
      setShowPurgeDialog(false);
      loadData();
    } catch (err: any) {
      showApiError(err, 'dlq.toast.purgeFailed');
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
      <PageSkeleton maxWidth="max-w-7xl">
        <SkeletonCards count={3} height="h-20" cols="grid-cols-3" />
        <div className="h-[300px] bg-muted animate-pulse rounded-xl" />
      </PageSkeleton>
    );
  }

  if (!project) {
    return (
      <div className="p-6 lg:p-8 max-w-7xl mx-auto">
        <EmptyState icon={AlertTriangle} title={t('dlq.projectNotFound')} />
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-8">
        <div>
          <h1 className="text-title tracking-tight">{t('dlq.title')}</h1>
          <p className="text-sm text-muted-foreground mt-1" dangerouslySetInnerHTML={{ __html: t('dlq.subtitle', { project: project.name }) }} />
        </div>
        <PermissionGate allowed={canManageDlq}>
          <div className="flex gap-2">
            {selectedIds.size > 0 && (
              <Button onClick={handleRetrySelected} disabled={retrying} size="sm">
                {retrying && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                {t('dlq.retryCount', { count: selectedIds.size })}
              </Button>
            )}
            <Button variant="destructive" size="sm" onClick={() => setShowPurgeDialog(true)} disabled={!stats?.totalItems}>
              <Trash2 className="h-3.5 w-3.5" /> {t('dlq.purgeAll')}
            </Button>
          </div>
        </PermissionGate>
      </div>

      {stats && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
          <Card>
            <CardContent className="p-4">
              <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">{t('dlq.totalItems')}</p>
              <p className="text-2xl font-bold text-destructive mt-1">{stats.totalItems}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">{t('dlq.last24h')}</p>
              <p className="text-2xl font-bold mt-1">{stats.last24Hours}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">{t('dlq.last7d')}</p>
              <p className="text-2xl font-bold mt-1">{stats.last7Days}</p>
            </CardContent>
          </Card>
        </div>
      )}

      <Card className="mb-6">
        <CardContent className="p-4">
          <div className="flex items-end gap-3">
            <div className="space-y-1.5 flex-1">
              <Label htmlFor="endpointFilter" className="text-xs">{t('dlq.filterEndpoint')}</Label>
              <Select id="endpointFilter" value={endpointFilter} onChange={(e) => { setEndpointFilter(e.target.value); setPage(0); }}>
                <option value="">{t('dlq.allEndpoints')}</option>
                {endpoints.map(endpoint => (<option key={endpoint.id} value={endpoint.id}>{endpoint.url}</option>))}
              </Select>
            </div>
            <Button variant="outline" size="icon-sm" onClick={loadData} title={t('analytics.refresh')}>
              <RefreshCw className="h-3.5 w-3.5" />
            </Button>
          </div>
        </CardContent>
      </Card>

      {items.length === 0 ? (
        <EmptyState icon={CheckSquare} title={t('dlq.noItems')} description={t('dlq.noItemsDesc')} docsLink="/docs#deliveries-api" />
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
                  <TableHead className="text-xs">{t('dlq.columns.eventType')}</TableHead>
                  <TableHead className="text-xs">{t('dlq.columns.endpoint')}</TableHead>
                  <TableHead className="text-xs">{t('dlq.columns.attempts')}</TableHead>
                  <TableHead className="text-xs">{t('dlq.columns.lastError')}</TableHead>
                  <TableHead className="text-xs">{t('dlq.columns.failedAt')}</TableHead>
                  {canManageDlq && <TableHead className="w-[60px]"></TableHead>}
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
                    <TableCell><span className="text-[13px] text-destructive truncate max-w-[180px] block">{item.lastError || t('dlq.unknownError')}</span></TableCell>
                    <TableCell><span className="text-[13px] text-muted-foreground">{formatDateTime(item.failedAt)}</span></TableCell>
                    {canManageDlq && (
                      <TableCell>
                        <Button variant="ghost" size="icon-sm" onClick={() => handleRetrySingle(item.deliveryId)} disabled={retrying} title={t('dlq.retry')}>
                          <RefreshCw className="h-3.5 w-3.5" />
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>

          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <span className="text-xs text-muted-foreground">Page {page + 1} of {totalPages}</span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}>{t('common.previous')}</Button>
                <Button variant="outline" size="sm" onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}>{t('common.next')}</Button>
              </div>
            </div>
          )}
        </div>
      )}

      <DangerConfirmDialog
        open={showPurgeDialog}
        onOpenChange={setShowPurgeDialog}
        title={t('dlq.purgeDialog.title')}
        description={t('dlq.purgeDialog.description', { count: stats?.totalItems })}
        confirmName={project?.name || ''}
        impact={[
          t('dlq.purgeDialog.impactItems', { count: stats?.totalItems || 0 }),
          t('dlq.purgeDialog.impactIrreversible'),
        ]}
        onConfirm={handlePurgeAll}
        loading={purging}
        confirmLabel={t('dlq.purgeAll')}
      />
    </div>
  );
}
