import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Send, Eye, RefreshCw, Clock, CheckCircle2, XCircle, AlertCircle, AlertTriangle, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { showApiError, showSuccess } from '../lib/toast';
import { formatRelativeTime, formatDateTime } from '../lib/date';
import { SkeletonRows } from '../components/PageSkeleton';
import EmptyState from '../components/EmptyState';
import { deliveriesApi } from '../api/deliveries.api';
import { projectsApi } from '../api/projects.api';
import { endpointsApi } from '../api/endpoints.api';
import type { DeliveryResponse, ProjectResponse, EndpointResponse } from '../types/api.types';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Select } from '../components/ui/select';
import { Badge } from '../components/ui/badge';
import { Card, CardContent } from '../components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../components/ui/table';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '../components/ui/alert-dialog';
import DeliveryDetailsSheet from './DeliveryDetailsSheet';
import { usePermissions } from '../auth/usePermissions';

const STATUS_OPTIONS = [
  { value: '', label: 'All Statuses' },
  { value: 'SUCCESS', label: 'Success' },
  { value: 'FAILED', label: 'Failed' },
  { value: 'DLQ', label: 'DLQ' },
  { value: 'PENDING', label: 'Pending' },
  { value: 'PROCESSING', label: 'Processing' },
];

const DATE_RANGE_OPTIONS = [
  { value: '24h', label: 'Last 24 hours' },
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
];

export default function DeliveriesPage() {
  const { t } = useTranslation();
  const { projectId } = useParams<{ projectId: string }>();
  const [project, setProject] = useState<ProjectResponse | null>(null);
  const [endpoints, setEndpoints] = useState<EndpointResponse[]>([]);
  const [deliveries, setDeliveries] = useState<DeliveryResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalElements, setTotalElements] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  
  const [statusFilter, setStatusFilter] = useState('');
  const [endpointFilter, setEndpointFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [dateRange, setDateRange] = useState('24h');
  const [page, setPage] = useState(0);
  const [pageSize] = useState(20);
  
  const [selectedDeliveryId, setSelectedDeliveryId] = useState<string | null>(null);
  const [bulkReplaying, setBulkReplaying] = useState(false);
  const [showBulkReplayDialog, setShowBulkReplayDialog] = useState(false);
  const { canReplayDeliveries } = usePermissions();

  useEffect(() => {
    if (projectId) {
      loadInitialData();
    }
  }, [projectId]);

  useEffect(() => {
    if (projectId) {
      loadDeliveries();
    }
  }, [projectId, statusFilter, endpointFilter, dateRange, page]);

  const loadInitialData = async () => {
    if (!projectId) return;
    
    try {
      const [projectData, endpointsData] = await Promise.all([
        projectsApi.get(projectId),
        endpointsApi.list(projectId),
      ]);
      setProject(projectData);
      setEndpoints(endpointsData);
    } catch (err: any) {
      showApiError(err, 'endpoints.toast.loadFailed', { retry: loadInitialData });
    }
  };

  const loadDeliveries = async () => {
    if (!projectId) return;
    
    try {
      setLoading(true);
      
      // Calculate date range for fromDate/toDate
      let fromDate: string | undefined;
      let toDate: string | undefined;
      
      if (dateRange) {
        const now = new Date();
        toDate = now.toISOString();
        
        switch (dateRange) {
          case '24h':
            fromDate = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
            break;
          case '7d':
            fromDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
            break;
          case '30d':
            fromDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
            break;
        }
      }
      
      const response = await deliveriesApi.listByProject(projectId, {
        page,
        size: pageSize,
        status: statusFilter || undefined,
        endpointId: endpointFilter || undefined,
        fromDate,
        toDate,
      });
      
      setDeliveries(response.content);
      setTotalElements(response.totalElements);
      setTotalPages(response.totalPages);
    } catch (err: any) {
      showApiError(err, 'endpoints.toast.loadFailed', { retry: loadDeliveries });
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status: DeliveryResponse['status']) => {
    const variants: Record<typeof status, { variant: any; icon: any }> = {
      SUCCESS: { variant: 'success', icon: CheckCircle2 },
      FAILED: { variant: 'destructive', icon: XCircle },
      DLQ: { variant: 'destructive', icon: AlertCircle },
      PENDING: { variant: 'secondary', icon: Clock },
      PROCESSING: { variant: 'info', icon: RefreshCw },
    };
    
    const config = variants[status];
    const Icon = config.icon;
    
    return (
      <Badge variant={config.variant} className="gap-1">
        <Icon className="h-3 w-3" />
        {status}
      </Badge>
    );
  };


  const getEndpointName = (endpointId: string) => {
    const endpoint = endpoints.find(e => e.id === endpointId);
    return endpoint?.url || endpointId.substring(0, 8);
  };

  const handleBulkReplay = async () => {
    if (!projectId) return;
    
    const hasFilters = statusFilter || endpointFilter;
    const failedOrDlqSelected = statusFilter === 'FAILED' || statusFilter === 'DLQ';
    
    if (!hasFilters && !failedOrDlqSelected) {
      showApiError(new Error('Filter required'), 'deliveries.replayError');
      return;
    }
    
    setBulkReplaying(true);
    try {
      const response = await deliveriesApi.bulkReplay({
        projectId,
        status: statusFilter || undefined,
        endpointId: endpointFilter || undefined,
      });
      
      showSuccess(response.message);
      loadDeliveries();
    } catch (err: any) {
      showApiError(err, 'deliveries.toast.replayFailed');
    } finally {
      setBulkReplaying(false);
    }
  };

  const filteredDeliveries = searchQuery
    ? deliveries.filter(d => d.id.toLowerCase().includes(searchQuery.toLowerCase()))
    : deliveries;

  if (!project) {
    return (
      <div className="p-6 lg:p-8 max-w-7xl mx-auto">
        <EmptyState icon={Send} title={t('deliveries.projectNotFound')} />
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className="text-title tracking-tight">{t('deliveries.title')}</h1>
        <p className="text-sm text-muted-foreground mt-1" dangerouslySetInnerHTML={{ __html: t('deliveries.subtitle', { project: project.name }) }} />
      </div>

      <Card className="mb-6">
        <CardContent className="p-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="status" className="text-xs">{t('deliveries.filters.status')}</Label>
              <Select id="status" value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(0); }}>
                {STATUS_OPTIONS.map(opt => (<option key={opt.value} value={opt.value}>{opt.label}</option>))}
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="endpoint" className="text-xs">{t('deliveries.filters.endpoint')}</Label>
              <Select id="endpoint" value={endpointFilter} onChange={(e) => { setEndpointFilter(e.target.value); setPage(0); }}>
                <option value="">{t('deliveries.filters.allEndpoints')}</option>
                {endpoints.map(endpoint => (<option key={endpoint.id} value={endpoint.id}>{endpoint.url}</option>))}
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="dateRange" className="text-xs">{t('deliveries.filters.dateRange')}</Label>
              <Select id="dateRange" value={dateRange} onChange={(e) => setDateRange(e.target.value)}>
                {DATE_RANGE_OPTIONS.map(opt => (<option key={opt.value} value={opt.value}>{opt.label}</option>))}
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="search" className="text-xs">{t('deliveries.filters.searchById')}</Label>
              <Input id="search" placeholder={t('deliveries.filters.searchPlaceholder')} value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
            </div>
          </div>
          {canReplayDeliveries && (statusFilter === 'FAILED' || statusFilter === 'DLQ') && totalElements > 0 && (
            <div className="flex justify-end mt-3">
              <Button onClick={() => setShowBulkReplayDialog(true)} disabled={bulkReplaying} variant="outline" size="sm">
                {bulkReplaying && <RefreshCw className="h-3.5 w-3.5 animate-spin" />}
                {bulkReplaying ? t('deliveries.replaying') : t('deliveries.bulkReplay', { status: statusFilter })}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {loading ? (
        <SkeletonRows count={5} />
      ) : filteredDeliveries.length === 0 ? (
        <EmptyState icon={Send} title={t('deliveries.noDeliveries')} description={t('deliveries.noDeliveriesDesc')} />
      ) : (
        <div className="animate-fade-in">
          <Card className="overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">{t('deliveries.columns.created')}</TableHead>
                  <TableHead className="text-xs">{t('deliveries.columns.status')}</TableHead>
                  <TableHead className="text-xs">{t('deliveries.columns.endpoint')}</TableHead>
                  <TableHead className="text-xs">{t('deliveries.columns.attempts')}</TableHead>
                  <TableHead className="text-xs">{t('deliveries.columns.nextRetry')}</TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredDeliveries.map((delivery) => (
                  <TableRow key={delivery.id} className="hover:bg-muted/30 cursor-pointer" onClick={() => setSelectedDeliveryId(delivery.id)}>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="text-sm font-medium">{formatRelativeTime(delivery.createdAt)}</span>
                        <span className="text-[11px] text-muted-foreground">{formatDateTime(delivery.createdAt)}</span>
                      </div>
                    </TableCell>
                    <TableCell>{getStatusBadge(delivery.status)}</TableCell>
                    <TableCell>
                      <span className="font-mono text-[13px] truncate max-w-[200px] block">{getEndpointName(delivery.endpointId)}</span>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm font-medium">{delivery.attemptCount}<span className="text-muted-foreground">/{delivery.maxAttempts}</span></span>
                    </TableCell>
                    <TableCell>
                      <span className="text-[13px] text-muted-foreground">{delivery.nextRetryAt ? formatRelativeTime(delivery.nextRetryAt) : '—'}</span>
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon-sm" onClick={(e) => { e.stopPropagation(); setSelectedDeliveryId(delivery.id); }} title={t('common.viewAll')}>
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
                {t('common.showing', { from: page * pageSize + 1, to: Math.min((page + 1) * pageSize, totalElements), total: totalElements })}
              </p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}>{t('common.previous')}</Button>
                <Button variant="outline" size="sm" onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}>{t('common.next')}</Button>
              </div>
            </div>
          )}
        </div>
      )}

      <DeliveryDetailsSheet
        deliveryId={selectedDeliveryId}
        open={!!selectedDeliveryId}
        onClose={() => setSelectedDeliveryId(null)}
        onRefresh={loadDeliveries}
      />

      {/* Bulk Replay Confirmation */}
      <AlertDialog open={showBulkReplayDialog} onOpenChange={setShowBulkReplayDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('deliveries.bulkReplayDialog.title')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('deliveries.bulkReplayDialog.description', { status: statusFilter, count: totalElements })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex items-start gap-2 p-3 bg-warning/10 border border-warning/20 rounded-lg mx-1">
            <AlertTriangle className="h-4 w-4 text-warning flex-shrink-0 mt-0.5" />
            <p className="text-sm text-warning">{t('deliveries.bulkReplayDialog.warning')}</p>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={bulkReplaying}>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={() => { handleBulkReplay(); setShowBulkReplayDialog(false); }} disabled={bulkReplaying}>
              {bulkReplaying && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {bulkReplaying ? t('deliveries.replaying') : t('deliveries.bulkReplayDialog.confirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
