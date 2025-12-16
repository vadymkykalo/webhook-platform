import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ChevronRight, Send, Eye, RefreshCw, Clock, CheckCircle2, XCircle, AlertCircle } from 'lucide-react';
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
  const navigate = useNavigate();
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

  const filteredDeliveries = searchQuery
    ? deliveries.filter(d => d.id.toLowerCase().includes(searchQuery.toLowerCase()))
    : deliveries;

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
        <span className="text-foreground">Deliveries</span>
      </div>

      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">Deliveries</h1>
        <p className="text-muted-foreground mt-1">
          Track webhook delivery attempts and failures
        </p>
      </div>

      <Card className="mb-6">
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="space-y-2">
              <Label htmlFor="status">Status</Label>
              <Select
                id="status"
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value);
                  setPage(0);
                }}
              >
                {STATUS_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="endpoint">Endpoint</Label>
              <Select
                id="endpoint"
                value={endpointFilter}
                onChange={(e) => {
                  setEndpointFilter(e.target.value);
                  setPage(0);
                }}
              >
                <option value="">All Endpoints</option>
                {endpoints.map(endpoint => (
                  <option key={endpoint.id} value={endpoint.id}>
                    {endpoint.url}
                  </option>
                ))}
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="dateRange">Date Range</Label>
              <Select
                id="dateRange"
                value={dateRange}
                onChange={(e) => setDateRange(e.target.value)}
              >
                {DATE_RANGE_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="search">Search by ID</Label>
              <Input
                id="search"
                placeholder="Enter delivery ID..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <Card>
          <CardContent className="pt-6">
            <div className="space-y-3">
              {[1, 2, 3, 4, 5].map(i => (
                <div key={i} className="h-16 bg-muted animate-pulse rounded" />
              ))}
            </div>
          </CardContent>
        </Card>
      ) : filteredDeliveries.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <div className="rounded-full bg-primary/10 p-4 mb-4">
              <Send className="h-10 w-10 text-primary" />
            </div>
            <h3 className="text-xl font-semibold mb-2">No deliveries yet</h3>
            <p className="text-muted-foreground text-center mb-6 max-w-sm">
              Webhook deliveries will appear here once events are sent to your endpoints
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Created</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Endpoint</TableHead>
                  <TableHead>Attempts</TableHead>
                  <TableHead>Next Retry</TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredDeliveries.map((delivery) => (
                  <TableRow key={delivery.id}>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-medium">
                          {formatRelativeTime(delivery.createdAt)}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {formatExactTime(delivery.createdAt)}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>{getStatusBadge(delivery.status)}</TableCell>
                    <TableCell>
                      <span className="font-mono text-sm">
                        {getEndpointName(delivery.endpointId)}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="font-medium">
                        {delivery.attemptCount} / {delivery.maxAttempts}
                      </span>
                    </TableCell>
                    <TableCell>
                      {delivery.nextRetryAt ? (
                        <span className="text-sm text-muted-foreground">
                          {formatRelativeTime(delivery.nextRetryAt)}
                        </span>
                      ) : (
                        <span className="text-sm text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setSelectedDeliveryId(delivery.id)}
                        title="View details"
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
                Showing {page * pageSize + 1} to {Math.min((page + 1) * pageSize, totalElements)} of {totalElements} deliveries
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

      <DeliveryDetailsSheet
        deliveryId={selectedDeliveryId}
        open={!!selectedDeliveryId}
        onClose={() => setSelectedDeliveryId(null)}
        onRefresh={loadDeliveries}
      />
    </div>
  );
}
