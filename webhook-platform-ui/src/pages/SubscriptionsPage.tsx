import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { Link as LinkIcon, Plus, Loader2, Trash2, Settings, ListOrdered, Power, PowerOff, ArrowRightLeft, FileJson2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { showSuccess, showApiError } from '../lib/toast';
import { formatDate } from '../lib/date';
import PageSkeleton from '../components/PageSkeleton';
import EmptyState from '../components/EmptyState';
import { subscriptionsApi, SubscriptionResponse } from '../api/subscriptions.api';
import { useProject, useSubscriptions, useEndpoints, useEventTypes, usePatchSubscription, useDeleteSubscription, queryKeys } from '../api/queries';
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
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '../components/ui/dialog';
import CreateSubscriptionModal from '../components/CreateSubscriptionModal';
import { usePermissions } from '../auth/usePermissions';
import PermissionGate from '../components/PermissionGate';
import VerificationGate from '../components/VerificationGate';

export default function SubscriptionsPage() {
  const { t } = useTranslation();
  const { projectId } = useParams<{ projectId: string }>();
  const { canManageSubscriptions } = usePermissions();
  const { data: project, isLoading: projectLoading } = useProject(projectId);
  const { data: subscriptions = [], isLoading: subsLoading } = useSubscriptions(projectId);
  const { data: endpoints = [], isLoading: endpointsLoading } = useEndpoints(projectId);
  const { data: catalogTypes = [] } = useEventTypes(projectId);
  const patchMutation = usePatchSubscription(projectId!);
  const deleteMutation = useDeleteSubscription(projectId!);
  const qc = useQueryClient();

  // Build a lookup: eventType name → catalog entry (for schema badges)
  const schemaByName = new Map(catalogTypes.map(et => [et.name, et]));

  const loading = projectLoading || subsLoading || endpointsLoading;

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingSubscription, setEditingSubscription] = useState<SubscriptionResponse | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  
  const [eventTypeFilter, setEventTypeFilter] = useState('');
  const [endpointFilter, setEndpointFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  // Bulk operations
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkProcessing, setBulkProcessing] = useState(false);
  const [showRebindDialog, setShowRebindDialog] = useState(false);
  const [rebindEndpointId, setRebindEndpointId] = useState('');

  const handleToggleEnabled = (subscription: SubscriptionResponse) => {
    patchMutation.mutate(
      { id: subscription.id, data: { enabled: !subscription.enabled } },
      { onSuccess: () => showSuccess(!subscription.enabled ? t('subscriptions.toast.enabled') : t('subscriptions.toast.disabled')) }
    );
  };

  const handleToggleOrdering = (subscription: SubscriptionResponse) => {
    patchMutation.mutate(
      { id: subscription.id, data: { orderingEnabled: !subscription.orderingEnabled } },
      { onSuccess: () => showSuccess(!subscription.orderingEnabled ? t('subscriptions.toast.fifoEnabled') : t('subscriptions.toast.fifoDisabled')) }
    );
  };

  const handleDelete = () => {
    if (!deleteId || !projectId) return;
    deleteMutation.mutate(deleteId, {
      onSuccess: () => { showSuccess(t('subscriptions.toast.deleted')); setDeleteId(null); },
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

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleBulkEnable = async (enable: boolean) => {
    if (!projectId) return;
    setBulkProcessing(true);
    try {
      const ids = Array.from(selectedIds);
      await Promise.all(ids.map(id => subscriptionsApi.patch(projectId, id, { enabled: enable })));
      showSuccess(t('subscriptions.bulk.done', { count: ids.length }));
      setSelectedIds(new Set());
      qc.invalidateQueries({ queryKey: queryKeys.subscriptions.list(projectId) });
    } catch (err: any) {
      showApiError(err, 'toast.errors.server');
    } finally {
      setBulkProcessing(false);
    }
  };

  const handleBulkRebind = async () => {
    if (!projectId || !rebindEndpointId) return;
    setBulkProcessing(true);
    try {
      const ids = Array.from(selectedIds);
      await Promise.all(ids.map(id => {
        const sub = subscriptions.find(s => s.id === id);
        if (!sub) return Promise.resolve();
        return subscriptionsApi.update(projectId, id, {
          endpointId: rebindEndpointId,
          eventType: sub.eventType,
          enabled: sub.enabled,
          orderingEnabled: sub.orderingEnabled,
          maxAttempts: sub.maxAttempts,
          timeoutSeconds: sub.timeoutSeconds,
          retryDelays: sub.retryDelays,
          payloadTemplate: sub.payloadTemplate || undefined,
          customHeaders: sub.customHeaders || undefined,
          transformationId: sub.transformationId,
        });
      }));
      showSuccess(t('subscriptions.bulk.rebound', { count: ids.length }));
      setSelectedIds(new Set());
      setShowRebindDialog(false);
      setRebindEndpointId('');
      qc.invalidateQueries({ queryKey: queryKeys.subscriptions.list(projectId) });
    } catch (err: any) {
      showApiError(err, 'toast.errors.server');
    } finally {
      setBulkProcessing(false);
    }
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
    return <PageSkeleton maxWidth="max-w-7xl" />;
  }

  if (!project) {
    return (
      <div className="p-6 lg:p-8 max-w-7xl mx-auto">
        <EmptyState icon={LinkIcon} title={t('subscriptions.projectNotFound')} />
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
        <PermissionGate allowed={canManageSubscriptions}>
          <VerificationGate>
            <Button onClick={() => setShowCreateModal(true)}>
              <Plus className="h-4 w-4" /> {t('subscriptions.newSubscription')}
            </Button>
          </VerificationGate>
        </PermissionGate>
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

      {/* Bulk action bar */}
      {selectedIds.size > 0 && canManageSubscriptions && (
        <Card className="mb-4 border-primary/30 bg-primary/5 animate-fade-in">
          <CardContent className="p-3 flex flex-wrap items-center gap-3">
            <span className="text-sm font-medium">
              {t('subscriptions.bulk.selected', { count: selectedIds.size })}
            </span>
            <div className="flex items-center gap-2 ml-auto">
              <VerificationGate>
                <Button size="sm" variant="outline" onClick={() => handleBulkEnable(true)} disabled={bulkProcessing}>
                  {bulkProcessing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Power className="h-3.5 w-3.5" />}
                  {t('subscriptions.bulk.enableAll')}
                </Button>
              </VerificationGate>
              <VerificationGate>
                <Button size="sm" variant="outline" onClick={() => handleBulkEnable(false)} disabled={bulkProcessing}>
                  {bulkProcessing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <PowerOff className="h-3.5 w-3.5" />}
                  {t('subscriptions.bulk.disableAll')}
                </Button>
              </VerificationGate>
              <VerificationGate>
                <Button size="sm" variant="outline" onClick={() => setShowRebindDialog(true)} disabled={bulkProcessing}>
                  <ArrowRightLeft className="h-3.5 w-3.5" />
                  {t('subscriptions.bulk.rebind')}
                </Button>
              </VerificationGate>
              <Button size="sm" variant="ghost" onClick={() => setSelectedIds(new Set())}>
                {t('common.cancel')}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {filteredSubscriptions.length === 0 ? (
        <div className="space-y-4">
          <EmptyState
            icon={LinkIcon}
            title={subscriptions.length === 0 ? t('subscriptions.noSubscriptions') : t('subscriptions.noMatching')}
            description={subscriptions.length === 0 ? t('subscriptions.noSubscriptionsDesc') : t('subscriptions.noMatchingDesc')}
            action={subscriptions.length === 0 ? (
              <PermissionGate allowed={canManageSubscriptions}>
                <VerificationGate>
                  <Button onClick={() => setShowCreateModal(true)}>
                    <Plus className="h-4 w-4" /> {t('subscriptions.createFirst')}
                  </Button>
                </VerificationGate>
              </PermissionGate>
            ) : undefined}
            docsLink="/docs#subscriptions-api"
          />
          {subscriptions.length === 0 && catalogTypes.length === 0 && endpoints.length > 0 && (
            <p className="text-xs text-center text-muted-foreground">
              {t('subscriptions.noEventTypesHint')}
            </p>
          )}
        </div>
      ) : (
        <Card className="overflow-hidden animate-fade-in">
          <Table>
            <TableHeader>
              <TableRow>
                {canManageSubscriptions && (
                  <TableHead className="w-[40px]">
                    <input
                      type="checkbox"
                      className="rounded border-muted-foreground/40 h-4 w-4 accent-primary cursor-pointer"
                      checked={selectedIds.size === filteredSubscriptions.length && filteredSubscriptions.length > 0}
                      onChange={() => {
                        if (selectedIds.size === filteredSubscriptions.length) {
                          setSelectedIds(new Set());
                        } else {
                          setSelectedIds(new Set(filteredSubscriptions.map(s => s.id)));
                        }
                      }}
                    />
                  </TableHead>
                )}
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
                <TableRow key={subscription.id} className={`hover:bg-muted/30 ${selectedIds.has(subscription.id) ? 'bg-primary/5' : ''}`}>
                  {canManageSubscriptions && (
                    <TableCell>
                      <input
                        type="checkbox"
                        className="rounded border-muted-foreground/40 h-4 w-4 accent-primary cursor-pointer"
                        checked={selectedIds.has(subscription.id)}
                        onChange={() => toggleSelect(subscription.id)}
                      />
                    </TableCell>
                  )}
                  <TableCell>
                    <div className="flex items-center gap-1.5">
                      <code className="text-[13px] font-mono font-medium">{subscription.eventType}</code>
                      {(() => {
                        const schema = schemaByName.get(subscription.eventType);
                        if (!schema) return null;
                        return (
                          <span className="inline-flex items-center gap-0.5 text-[10px] text-primary" title={`Schema v${schema.latestVersion ?? '?'} — ${schema.activeVersionStatus ?? 'DRAFT'}`}>
                            <FileJson2 className="h-3 w-3" />
                            {schema.latestVersion != null && <span>v{schema.latestVersion}</span>}
                          </span>
                        );
                      })()}
                    </div>
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
                    <span className="text-[13px] text-muted-foreground">{formatDate(subscription.createdAt)}</span>
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

      {/* Bulk rebind endpoint dialog */}
      <Dialog open={showRebindDialog} onOpenChange={(open) => { if (!open) { setShowRebindDialog(false); setRebindEndpointId(''); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t('subscriptions.bulk.rebindTitle')}</DialogTitle>
            <DialogDescription>
              {t('subscriptions.bulk.rebindDesc', { count: selectedIds.size })}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="rebindEndpoint" className="text-xs">{t('subscriptions.endpoint')}</Label>
              <Select
                id="rebindEndpoint"
                value={rebindEndpointId}
                onChange={(e) => setRebindEndpointId(e.target.value)}
              >
                <option value="">{t('subscriptions.bulk.selectEndpoint')}</option>
                {endpoints.map(ep => (
                  <option key={ep.id} value={ep.id}>{ep.url}</option>
                ))}
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowRebindDialog(false); setRebindEndpointId(''); }} disabled={bulkProcessing}>
              {t('common.cancel')}
            </Button>
            <Button onClick={handleBulkRebind} disabled={bulkProcessing || !rebindEndpointId}>
              {bulkProcessing && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              {t('subscriptions.bulk.rebindConfirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
