import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Send, Eye, RefreshCw, Clock, CheckCircle2, XCircle, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
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
import DeliveryDetailsSheet from './DeliveryDetailsSheet';

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
      toast.error(err.response?.data?.message || 'Failed to load project data');
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
      toast.error(err.response?.data?.message || 'Failed to load deliveries');
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

  const getEndpointName = (endpointId: string) => {
    const endpoint = endpoints.find(e => e.id === endpointId);
    return endpoint?.url || endpointId.substring(0, 8);
  };

  const handleBulkReplay = async () => {
    if (!projectId) return;
    
    const hasFilters = statusFilter || endpointFilter;
    const failedOrDlqSelected = statusFilter === 'FAILED' || statusFilter === 'DLQ';
    
    if (!hasFilters && !failedOrDlqSelected) {
      toast.error('Please select a status filter (FAILED or DLQ) before bulk replay');
      return;
    }
    
    setBulkReplaying(true);
    try {
      const response = await deliveriesApi.bulkReplay({
        projectId,
        status: statusFilter || undefined,
        endpointId: endpointFilter || undefined,
      });
      
      toast.success(response.message);
      loadDeliveries();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to bulk replay deliveries');
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
        <div className="flex flex-col items-center justify-center py-20">
          <div className="h-14 w-14 rounded-2xl bg-muted flex items-center justify-center mb-4">
            <Send className="h-7 w-7 text-muted-foreground" />
          </div>
          <p className="text-muted-foreground">Project not found</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className="text-title tracking-tight">Deliveries</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Track webhook delivery attempts for <span className="font-medium text-foreground">{project.name}</span>
        </p>
      </div>

      <Card className="mb-6">
        <CardContent className="p-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="status" className="text-xs">Status</Label>
              <Select id="status" value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(0); }}>
                {STATUS_OPTIONS.map(opt => (<option key={opt.value} value={opt.value}>{opt.label}</option>))}
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="endpoint" className="text-xs">Endpoint</Label>
              <Select id="endpoint" value={endpointFilter} onChange={(e) => { setEndpointFilter(e.target.value); setPage(0); }}>
                <option value="">All Endpoints</option>
                {endpoints.map(endpoint => (<option key={endpoint.id} value={endpoint.id}>{endpoint.url}</option>))}
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="dateRange" className="text-xs">Date Range</Label>
              <Select id="dateRange" value={dateRange} onChange={(e) => setDateRange(e.target.value)}>
                {DATE_RANGE_OPTIONS.map(opt => (<option key={opt.value} value={opt.value}>{opt.label}</option>))}
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="search" className="text-xs">Search by ID</Label>
              <Input id="search" placeholder="Enter delivery ID..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
            </div>
          </div>
          {(statusFilter === 'FAILED' || statusFilter === 'DLQ') && totalElements > 0 && (
            <div className="flex justify-end mt-3">
              <Button onClick={handleBulkReplay} disabled={bulkReplaying} variant="outline" size="sm">
                {bulkReplaying && <RefreshCw className="h-3.5 w-3.5 animate-spin" />}
                {bulkReplaying ? 'Replaying...' : `Replay All ${statusFilter}`}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map(i => (
            <div key={i} className="h-16 bg-muted animate-pulse rounded-xl" />
          ))}
        </div>
      ) : filteredDeliveries.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 border border-dashed rounded-xl">
          <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-6">
            <Send className="h-8 w-8 text-primary" />
          </div>
          <h3 className="text-lg font-semibold mb-2">No deliveries found</h3>
          <p className="text-sm text-muted-foreground text-center max-w-sm">
            Deliveries will appear here once events are sent to your endpoints
          </p>
        </div>
      ) : (
        <div className="animate-fade-in">
          <Card className="overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Created</TableHead>
                  <TableHead className="text-xs">Status</TableHead>
                  <TableHead className="text-xs">Endpoint</TableHead>
                  <TableHead className="text-xs">Attempts</TableHead>
                  <TableHead className="text-xs">Next Retry</TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredDeliveries.map((delivery) => (
                  <TableRow key={delivery.id} className="hover:bg-muted/30 cursor-pointer" onClick={() => setSelectedDeliveryId(delivery.id)}>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="text-sm font-medium">{formatRelativeTime(delivery.createdAt)}</span>
                        <span className="text-[11px] text-muted-foreground">{formatExactTime(delivery.createdAt)}</span>
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
                      <Button variant="ghost" size="icon-sm" onClick={(e) => { e.stopPropagation(); setSelectedDeliveryId(delivery.id); }} title="View details">
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

      <DeliveryDetailsSheet
        deliveryId={selectedDeliveryId}
        open={!!selectedDeliveryId}
        onClose={() => setSelectedDeliveryId(null)}
        onRefresh={loadDeliveries}
      />
    </div>
  );
}
