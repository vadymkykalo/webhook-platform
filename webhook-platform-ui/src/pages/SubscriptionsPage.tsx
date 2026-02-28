import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { Link as LinkIcon, Plus, Loader2, Trash2, Settings, ListOrdered } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { SubscriptionResponse } from '../api/subscriptions.api';
import { useProject, useSubscriptions, useEndpoints, usePatchSubscription, useDeleteSubscription, queryKeys } from '../api/queries';
import { useQueryClient } from '@tanstack/react-query';
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
import { usePermissions } from '../auth/usePermissions';

export default function SubscriptionsPage() {
  const { t } = useTranslation();
  const { projectId } = useParams<{ projectId: string }>();
  const { canManageSubscriptions } = usePermissions();
  const { data: project, isLoading: projectLoading } = useProject(projectId);
  const { data: subscriptions = [], isLoading: subsLoading } = useSubscriptions(projectId);
  const { data: endpoints = [], isLoading: endpointsLoading } = useEndpoints(projectId);
  const patchMutation = usePatchSubscription(projectId!);
  const deleteMutation = useDeleteSubscription(projectId!);
  const qc = useQueryClient();

  const loading = projectLoading || subsLoading || endpointsLoading;

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingSubscription, setEditingSubscription] = useState<SubscriptionResponse | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  
  const [eventTypeFilter, setEventTypeFilter] = useState('');
  const [endpointFilter, setEndpointFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const handleToggleEnabled = (subscription: SubscriptionResponse) => {
    patchMutation.mutate(
      { id: subscription.id, data: { enabled: !subscription.enabled } },
      { onSuccess: () => toast.success(!subscription.enabled ? t('subscriptions.toast.enabled') : t('subscriptions.toast.disabled')) }
    );
  };

  const handleToggleOrdering = (subscription: SubscriptionResponse) => {
    patchMutation.mutate(
      { id: subscription.id, data: { orderingEnabled: !subscription.orderingEnabled } },
      { onSuccess: () => toast.success(!subscription.orderingEnabled ? t('subscriptions.toast.fifoEnabled') : t('subscriptions.toast.fifoDisabled')) }
    );
  };

  const handleDelete = () => {
    if (!deleteId || !projectId) return;
    deleteMutation.mutate(deleteId, {
      onSuccess: () => { toast.success(t('subscriptions.toast.deleted')); setDeleteId(null); },
    });
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
    return endpoint ? (endpoint.url || t('subscriptions.unnamed')) : t('subscriptions.unknown');
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
          <p className="text-muted-foreground">{t('subscriptions.projectNotFound')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-8">
        <div>
          <h1 className="text-title tracking-tight">{t('subscriptions.title')}</h1>
          <p className="text-sm text-muted-foreground mt-1" dangerouslySetInnerHTML={{ __html: t('subscriptions.subtitle', { project: project.name }) }} />
        </div>
        {canManageSubscriptions && (
          <Button onClick={() => setShowCreateModal(true)}>
            <Plus className="h-4 w-4" /> {t('subscriptions.newSubscription')}
          </Button>
        )}
      </div>

      <Card className="mb-6">
        <CardContent className="p-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="eventTypeFilter" className="text-xs">{t('subscriptions.eventType')}</Label>
              <Input id="eventTypeFilter" placeholder={t('subscriptions.filterEventType')} value={eventTypeFilter} onChange={(e) => setEventTypeFilter(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="endpointFilter" className="text-xs">{t('subscriptions.endpoint')}</Label>
              <Select id="endpointFilter" value={endpointFilter} onChange={(e) => setEndpointFilter(e.target.value)}>
                <option value="">{t('subscriptions.allEndpoints')}</option>
                {endpoints.map(endpoint => (<option key={endpoint.id} value={endpoint.id}>{endpoint.url}</option>))}
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="statusFilter" className="text-xs">{t('subscriptions.status')}</Label>
              <Select id="statusFilter" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                <option value="">{t('subscriptions.allStatuses')}</option>
                <option value="enabled">{t('common.enabled')}</option>
                <option value="disabled">{t('common.disabled')}</option>
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
            {subscriptions.length === 0 ? t('subscriptions.noSubscriptions') : t('subscriptions.noMatching')}
          </h3>
          <p className="text-sm text-muted-foreground text-center mb-6 max-w-sm">
            {subscriptions.length === 0
              ? t('subscriptions.noSubscriptionsDesc')
              : t('subscriptions.noMatchingDesc')}
          </p>
          {subscriptions.length === 0 && canManageSubscriptions && (
            <Button onClick={() => setShowCreateModal(true)}>
              <Plus className="h-4 w-4" /> {t('subscriptions.createFirst')}
            </Button>
          )}
        </div>
      ) : (
        <Card className="overflow-hidden animate-fade-in">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">{t('subscriptions.eventType')}</TableHead>
                <TableHead className="text-xs">{t('subscriptions.endpoint')}</TableHead>
                <TableHead className="text-xs">{t('subscriptions.status')}</TableHead>
                <TableHead className="text-xs">{t('subscriptions.ordering')}</TableHead>
                <TableHead className="text-xs">{t('subscriptions.created')}</TableHead>
                {canManageSubscriptions && <TableHead className="w-[80px]"></TableHead>}
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
                      <Switch checked={subscription.enabled} onCheckedChange={() => handleToggleEnabled(subscription)} disabled={!canManageSubscriptions} />
                      <Badge variant={subscription.enabled ? 'success' : 'secondary'}>{subscription.enabled ? t('common.on') : t('common.off')}</Badge>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Switch checked={subscription.orderingEnabled} onCheckedChange={() => handleToggleOrdering(subscription)} disabled={!canManageSubscriptions} />
                      {subscription.orderingEnabled && (
                        <Badge variant="outline" className="gap-1 text-[10px]"><ListOrdered className="h-3 w-3" />FIFO</Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className="text-[13px] text-muted-foreground">{new Date(subscription.createdAt).toLocaleDateString()}</span>
                  </TableCell>
                  {canManageSubscriptions && (
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon-sm" onClick={() => handleEdit(subscription)} title={t('common.edit')}>
                          <Settings className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon-sm" onClick={() => setDeleteId(subscription.id)} title={t('common.delete')} className="text-muted-foreground hover:text-destructive">
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  )}
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
        onSuccess={() => qc.invalidateQueries({ queryKey: queryKeys.subscriptions.list(projectId!) })}
      />

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('subscriptions.deleteDialog.title')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('subscriptions.deleteDialog.description')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={deleteMutation.isPending} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {deleteMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {deleteMutation.isPending ? t('common.deleting') : t('common.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
