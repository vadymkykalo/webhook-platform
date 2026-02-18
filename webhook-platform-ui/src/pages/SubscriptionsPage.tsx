import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Link as LinkIcon, Plus, Loader2, Trash2, Settings, ListOrdered } from 'lucide-react';
import { toast } from 'sonner';
import { projectsApi } from '../api/projects.api';
import { subscriptionsApi, SubscriptionResponse } from '../api/subscriptions.api';
import { endpointsApi } from '../api/endpoints.api';
import type { ProjectResponse, EndpointResponse } from '../types/api.types';
import { Button } from '../components/ui/button';
import { Card, CardContent } from '../components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Badge } from '../components/ui/badge';
import { Select } from '../components/ui/select';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Switch } from '../components/ui/switch';
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
import CreateSubscriptionModal from '../components/CreateSubscriptionModal';

export default function SubscriptionsPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const [project, setProject] = useState<ProjectResponse | null>(null);
  const [subscriptions, setSubscriptions] = useState<SubscriptionResponse[]>([]);
  const [endpoints, setEndpoints] = useState<EndpointResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingSubscription, setEditingSubscription] = useState<SubscriptionResponse | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  
  const [eventTypeFilter, setEventTypeFilter] = useState('');
  const [endpointFilter, setEndpointFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  useEffect(() => {
    if (projectId) {
      loadData();
    }
  }, [projectId]);

  const loadData = async () => {
    if (!projectId) return;
    
    try {
      setLoading(true);
      const [projectData, subscriptionsData, endpointsData] = await Promise.all([
        projectsApi.get(projectId),
        subscriptionsApi.list(projectId),
        endpointsApi.list(projectId),
      ]);
      setProject(projectData);
      setSubscriptions(subscriptionsData);
      setEndpoints(endpointsData);
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const handleToggleEnabled = async (subscription: SubscriptionResponse) => {
    try {
      await subscriptionsApi.patch(projectId!, subscription.id, {
        enabled: !subscription.enabled,
      });
      toast.success(`Subscription ${!subscription.enabled ? 'enabled' : 'disabled'}`);
      loadData();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to update subscription');
    }
  };

  const handleToggleOrdering = async (subscription: SubscriptionResponse) => {
    try {
      await subscriptionsApi.patch(projectId!, subscription.id, {
        orderingEnabled: !subscription.orderingEnabled,
      });
      toast.success(`FIFO ordering ${!subscription.orderingEnabled ? 'enabled' : 'disabled'}`);
      loadData();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to update subscription');
    }
  };

  const handleDelete = async () => {
    if (!deleteId || !projectId) return;

    setDeletingId(deleteId);
    try {
      await subscriptionsApi.delete(projectId, deleteId);
      toast.success('Subscription deleted successfully');
      setDeleteId(null);
      loadData();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to delete subscription');
    } finally {
      setDeletingId(null);
    }
  };

  const handleEdit = (subscription: SubscriptionResponse) => {
    setEditingSubscription(subscription);
    setShowCreateModal(true);
  };

  const handleCloseModal = () => {
    setShowCreateModal(false);
    setEditingSubscription(null);
  };

  const getEndpointName = (endpointId: string) => {
    const endpoint = endpoints.find(e => e.id === endpointId);
    return endpoint ? (endpoint.url || 'Unnamed endpoint') : 'Unknown endpoint';
  };

  const filteredSubscriptions = subscriptions.filter(sub => {
    if (eventTypeFilter && !sub.eventType.toLowerCase().includes(eventTypeFilter.toLowerCase())) {
      return false;
    }
    if (endpointFilter && sub.endpointId !== endpointFilter) {
      return false;
    }
    if (statusFilter === 'enabled' && !sub.enabled) {
      return false;
    }
    if (statusFilter === 'disabled' && sub.enabled) {
      return false;
    }
    return true;
  });

  if (loading) {
    return (
      <div className="p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <div className="h-7 w-36 bg-muted animate-pulse rounded-lg" />
            <div className="h-4 w-56 bg-muted animate-pulse rounded" />
          </div>
          <div className="h-10 w-40 bg-muted animate-pulse rounded-lg" />
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
            <LinkIcon className="h-7 w-7 text-muted-foreground" />
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
          <h1 className="text-title tracking-tight">Subscriptions</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Route event types to endpoints for <span className="font-medium text-foreground">{project.name}</span>
          </p>
        </div>
        <Button onClick={() => setShowCreateModal(true)}>
          <Plus className="h-4 w-4" /> Create Subscription
        </Button>
      </div>

      <Card className="mb-6">
        <CardContent className="p-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="eventTypeFilter" className="text-xs">Event Type</Label>
              <Input id="eventTypeFilter" placeholder="Filter by event type..." value={eventTypeFilter} onChange={(e) => setEventTypeFilter(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="endpointFilter" className="text-xs">Endpoint</Label>
              <Select id="endpointFilter" value={endpointFilter} onChange={(e) => setEndpointFilter(e.target.value)}>
                <option value="">All endpoints</option>
                {endpoints.map(endpoint => (<option key={endpoint.id} value={endpoint.id}>{endpoint.url}</option>))}
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="statusFilter" className="text-xs">Status</Label>
              <Select id="statusFilter" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                <option value="">All statuses</option>
                <option value="enabled">Enabled</option>
                <option value="disabled">Disabled</option>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {filteredSubscriptions.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 border border-dashed rounded-xl">
          <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-6">
            <LinkIcon className="h-8 w-8 text-primary" />
          </div>
          <h3 className="text-lg font-semibold mb-2">
            {subscriptions.length === 0 ? 'No subscriptions yet' : 'No matching subscriptions'}
          </h3>
          <p className="text-sm text-muted-foreground text-center mb-6 max-w-sm">
            {subscriptions.length === 0
              ? 'Create a subscription to route events to your endpoints'
              : 'Try adjusting your filters'}
          </p>
          {subscriptions.length === 0 && (
            <Button onClick={() => setShowCreateModal(true)}>
              <Plus className="h-4 w-4" /> Create Subscription
            </Button>
          )}
        </div>
      ) : (
        <Card className="overflow-hidden animate-fade-in">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">Event Type</TableHead>
                <TableHead className="text-xs">Endpoint</TableHead>
                <TableHead className="text-xs">Status</TableHead>
                <TableHead className="text-xs">Ordering</TableHead>
                <TableHead className="text-xs">Created</TableHead>
                <TableHead className="w-[80px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredSubscriptions.map((subscription) => (
                <TableRow key={subscription.id} className="hover:bg-muted/30">
                  <TableCell>
                    <code className="text-[13px] font-mono font-medium">{subscription.eventType}</code>
                  </TableCell>
                  <TableCell>
                    <span className="font-mono text-[13px] truncate max-w-[200px] block">{getEndpointName(subscription.endpointId)}</span>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Switch checked={subscription.enabled} onCheckedChange={() => handleToggleEnabled(subscription)} />
                      <Badge variant={subscription.enabled ? 'success' : 'secondary'}>{subscription.enabled ? 'On' : 'Off'}</Badge>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Switch checked={subscription.orderingEnabled} onCheckedChange={() => handleToggleOrdering(subscription)} />
                      {subscription.orderingEnabled && (
                        <Badge variant="outline" className="gap-1 text-[10px]"><ListOrdered className="h-3 w-3" />FIFO</Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className="text-[13px] text-muted-foreground">{new Date(subscription.createdAt).toLocaleDateString()}</span>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon-sm" onClick={() => handleEdit(subscription)} title="Edit">
                        <Settings className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon-sm" onClick={() => setDeleteId(subscription.id)} title="Delete" className="text-muted-foreground hover:text-destructive">
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      <CreateSubscriptionModal
        projectId={projectId!}
        endpoints={endpoints}
        subscription={editingSubscription}
        open={showCreateModal}
        onClose={handleCloseModal}
        onSuccess={loadData}
      />

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Subscription?</AlertDialogTitle>
            <AlertDialogDescription>
              This subscription will be permanently deleted. Events of this type will no longer be
              delivered to the endpoint.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={!!deletingId}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={!!deletingId} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {deletingId && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {deletingId ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
