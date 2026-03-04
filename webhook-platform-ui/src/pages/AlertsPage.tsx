import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Bell, Plus, Trash2, Loader2, CheckCircle2, AlertTriangle, AlertCircle, Info, Check, VolumeX, Clock, Mail, Webhook, BellOff, ChevronDown, Search } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { showSuccess, showApiError } from '../lib/toast';
import {
  useAlertRules, useCreateAlertRule, useDeleteAlertRule, useUpdateAlertRule,
  useAlertEvents, useResolveAlert, useResolveAllAlerts, useUnresolvedAlertCount,
} from '../api/queries';
import type { AlertRuleRequest, AlertType, AlertSeverity, AlertChannel } from '../api/alerts.api';
import { formatDateTime, formatRelativeTime } from '../lib/date';
import PageSkeleton from '../components/PageSkeleton';
import EmptyState from '../components/EmptyState';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Select } from '../components/ui/select';
import { Switch } from '../components/ui/switch';
import { Badge } from '../components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { TablePagination } from '../components/ui/table-pagination';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '../components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '../components/ui/alert-dialog';
import { usePermissions } from '../auth/usePermissions';
import PermissionGate from '../components/PermissionGate';

const ALERT_TYPES: { value: AlertType; label: string; hint: string }[] = [
  { value: 'FAILURE_RATE', label: 'Failure Rate', hint: 'Triggers when failure % exceeds threshold in window' },
  { value: 'DLQ_THRESHOLD', label: 'DLQ Threshold', hint: 'Triggers when DLQ count exceeds threshold' },
  { value: 'CONSECUTIVE_FAILURES', label: 'Consecutive Failures', hint: 'Triggers after N consecutive failures for an endpoint' },
  { value: 'LATENCY_THRESHOLD', label: 'Latency Threshold', hint: 'Triggers when avg latency exceeds threshold (ms)' },
];

const SEVERITY_COLORS: Record<string, string> = {
  INFO: 'bg-blue-500/10 text-blue-700 dark:text-blue-400',
  WARNING: 'bg-yellow-500/10 text-yellow-700 dark:text-yellow-400',
  CRITICAL: 'bg-red-500/10 text-red-700 dark:text-red-400',
};

const SEVERITY_ICONS: Record<string, React.ElementType> = {
  INFO: Info,
  WARNING: AlertTriangle,
  CRITICAL: AlertCircle,
};

export default function AlertsPage() {
  const { t } = useTranslation();
  const { projectId } = useParams<{ projectId: string }>();
  const { canManageEndpoints } = usePermissions();

  const [activeTab, setActiveTab] = useState<'rules' | 'events'>('events');
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [deleteRuleId, setDeleteRuleId] = useState<string | null>(null);
  const [eventsPage, setEventsPage] = useState(0);
  const [eventsPageSize, setEventsPageSize] = useState(20);
  const [expandedEventId, setExpandedEventId] = useState<string | null>(null);
  const [snoozeDropdownId, setSnoozeDropdownId] = useState<string | null>(null);

  // Form state
  const [formName, setFormName] = useState('');
  const [formType, setFormType] = useState<AlertType>('FAILURE_RATE');
  const [formSeverity, setFormSeverity] = useState<AlertSeverity>('WARNING');
  const [formThreshold, setFormThreshold] = useState('10');
  const [formWindow, setFormWindow] = useState('5');
  const [formDescription, setFormDescription] = useState('');
  const [formChannel, setFormChannel] = useState<AlertChannel>('IN_APP');
  const [formWebhookUrl, setFormWebhookUrl] = useState('');
  const [formEmailRecipients, setFormEmailRecipients] = useState('');

  const { data: rules = [], isLoading: rulesLoading } = useAlertRules(projectId);
  const { data: eventsData, isLoading: eventsLoading } = useAlertEvents(projectId, eventsPage, eventsPageSize);
  const { data: unresolvedData } = useUnresolvedAlertCount(projectId);
  const createRule = useCreateAlertRule(projectId!);
  const deleteRule = useDeleteAlertRule(projectId!);
  const updateRule = useUpdateAlertRule(projectId!);
  const resolveAlert = useResolveAlert(projectId!);
  const resolveAll = useResolveAllAlerts(projectId!);

  const unresolvedCount = unresolvedData?.count ?? 0;
  const events = eventsData?.content ?? [];

  const resetForm = () => {
    setFormName('');
    setFormType('FAILURE_RATE');
    setFormSeverity('WARNING');
    setFormThreshold('10');
    setFormWindow('5');
    setFormDescription('');
    setFormChannel('IN_APP');
    setFormWebhookUrl('');
    setFormEmailRecipients('');
  };

  const handleCreate = async () => {
    const data: AlertRuleRequest = {
      name: formName,
      alertType: formType,
      severity: formSeverity,
      thresholdValue: parseFloat(formThreshold),
      windowMinutes: parseInt(formWindow),
      description: formDescription || undefined,
      channel: formChannel,
      webhookUrl: formChannel === 'WEBHOOK' ? formWebhookUrl : undefined,
      emailRecipients: formChannel === 'EMAIL' ? formEmailRecipients : undefined,
    };
    try {
      await createRule.mutateAsync(data);
      showSuccess(t('alerts.toast.ruleCreated', 'Alert rule created'));
      setShowCreateDialog(false);
      resetForm();
    } catch (err: any) {
      showApiError(err, 'alerts.toast.createFailed');
    }
  };

  const handleDelete = async () => {
    if (!deleteRuleId) return;
    try {
      await deleteRule.mutateAsync(deleteRuleId);
      showSuccess(t('alerts.toast.ruleDeleted', 'Alert rule deleted'));
    } catch (err: any) {
      showApiError(err, 'alerts.toast.deleteFailed');
    } finally {
      setDeleteRuleId(null);
    }
  };

  const handleToggleRule = async (ruleId: string, enabled: boolean) => {
    try {
      await updateRule.mutateAsync({ ruleId, data: { enabled } });
    } catch (err: any) {
      showApiError(err, 'alerts.toast.updateFailed');
    }
  };

  const handleMuteRule = async (ruleId: string, muted: boolean) => {
    try {
      await updateRule.mutateAsync({ ruleId, data: { muted } });
      showSuccess(muted ? t('alerts.toast.muted', 'Rule muted') : t('alerts.toast.unmuted', 'Rule unmuted'));
    } catch (err: any) {
      showApiError(err, 'alerts.toast.updateFailed');
    }
  };

  const handleSnoozeRule = async (ruleId: string, hours: number) => {
    const snoozedUntil = new Date(Date.now() + hours * 3600000).toISOString();
    try {
      await updateRule.mutateAsync({ ruleId, data: { snoozedUntil } });
      showSuccess(t('alerts.toast.snoozed', { hours, defaultValue: 'Snoozed for {{hours}}h' }));
    } catch (err: any) {
      showApiError(err, 'alerts.toast.updateFailed');
    }
  };

  const handleResolve = async (eventId: string) => {
    try {
      await resolveAlert.mutateAsync(eventId);
    } catch (err: any) {
      showApiError(err, 'alerts.toast.resolveFailed');
    }
  };

  const handleResolveAll = async () => {
    try {
      const result = await resolveAll.mutateAsync();
      showSuccess(t('alerts.toast.allResolved', { count: result.resolved, defaultValue: '{{count}} alerts resolved' }));
    } catch (err: any) {
      showApiError(err, 'alerts.toast.resolveFailed');
    }
  };

  if (rulesLoading && eventsLoading) return <PageSkeleton maxWidth="max-w-7xl" />;

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <Bell className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{t('alerts.title', 'Alerts')}</h1>
            <p className="text-sm text-muted-foreground">{t('alerts.subtitle', 'Monitor delivery health and get notified of issues')}</p>
          </div>
          {unresolvedCount > 0 && (
            <Badge variant="destructive" className="ml-2">{unresolvedCount} {t('alerts.unresolved', 'unresolved')}</Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          {activeTab === 'events' && unresolvedCount > 0 && (
            <PermissionGate allowed={canManageEndpoints}>
              <Button variant="outline" size="sm" onClick={handleResolveAll} disabled={resolveAll.isPending}>
                <Check className="h-4 w-4 mr-1" /> {t('alerts.resolveAll', 'Resolve All')}
              </Button>
            </PermissionGate>
          )}
          <PermissionGate allowed={canManageEndpoints}>
            <Button onClick={() => setShowCreateDialog(true)}>
              <Plus className="h-4 w-4" /> {t('alerts.createRule', 'Create Rule')}
            </Button>
          </PermissionGate>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b">
        <div className="flex gap-6">
          <button
            className={`pb-2 text-sm font-medium border-b-2 transition-colors ${activeTab === 'events' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
            onClick={() => setActiveTab('events')}
          >
            {t('alerts.tabs.events', 'Alert History')}
            {unresolvedCount > 0 && <span className="ml-2 text-xs bg-destructive/10 text-destructive px-1.5 py-0.5 rounded-full">{unresolvedCount}</span>}
          </button>
          <button
            className={`pb-2 text-sm font-medium border-b-2 transition-colors ${activeTab === 'rules' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
            onClick={() => setActiveTab('rules')}
          >
            {t('alerts.tabs.rules', 'Alert Rules')} <span className="text-xs text-muted-foreground ml-1">({rules.length})</span>
          </button>
        </div>
      </div>

      {/* Events tab */}
      {activeTab === 'events' && (
        events.length === 0 ? (
          <EmptyState icon={Bell} title={t('alerts.noEvents', 'No alerts fired')} description={t('alerts.noEventsDesc', 'Alert rules will fire events here when conditions are met')} />
        ) : (
          <div className="animate-fade-in">
            <Card className="overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[40px]"></TableHead>
                    <TableHead>{t('alerts.columns.title', 'Alert')}</TableHead>
                    <TableHead className="w-[100px]">{t('alerts.columns.severity', 'Severity')}</TableHead>
                    <TableHead>{t('alerts.columns.value', 'Value')}</TableHead>
                    <TableHead className="w-[160px]">{t('alerts.columns.time', 'Time')}</TableHead>
                    <TableHead className="w-[80px]">{t('alerts.columns.status', 'Status')}</TableHead>
                    <TableHead className="w-[60px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {events.map((event) => {
                    const SevIcon = SEVERITY_ICONS[event.severity] || Info;
                    const isExpanded = expandedEventId === event.id;
                    const rule = rules.find(r => r.id === event.alertRuleId);
                    const investigateUrl = projectId
                      ? `/admin/projects/${projectId}/deliveries?status=FAILED${rule?.endpointId ? `&endpointId=${rule.endpointId}` : ''}`
                      : null;
                    return (
                      <>
                        <TableRow
                          key={event.id}
                          className={`cursor-pointer ${event.resolved ? 'opacity-60' : ''} ${isExpanded ? 'bg-muted/30' : ''}`}
                          onClick={() => setExpandedEventId(isExpanded ? null : event.id)}
                        >
                          <TableCell>
                            <SevIcon className={`h-4 w-4 ${event.severity === 'CRITICAL' ? 'text-red-500' : event.severity === 'WARNING' ? 'text-yellow-500' : 'text-blue-500'}`} />
                          </TableCell>
                          <TableCell>
                            <div>
                              <p className="text-sm font-medium">{event.title}</p>
                              {event.message && !isExpanded && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{event.message}</p>}
                            </div>
                          </TableCell>
                          <TableCell>
                            <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${SEVERITY_COLORS[event.severity] || ''}`}>
                              {event.severity}
                            </span>
                          </TableCell>
                          <TableCell className="font-mono text-xs">
                            {event.currentValue != null && event.thresholdValue != null
                              ? `${event.currentValue.toFixed(1)} / ${event.thresholdValue.toFixed(1)}`
                              : '—'}
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-col">
                              <span className="text-sm">{formatRelativeTime(event.createdAt)}</span>
                              <span className="text-[11px] text-muted-foreground">{formatDateTime(event.createdAt)}</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            {event.resolved ? (
                              <Badge variant="outline" className="text-green-600"><CheckCircle2 className="h-3 w-3 mr-1" />{t('alerts.resolved', 'Resolved')}</Badge>
                            ) : (
                              <Badge variant="destructive">{t('alerts.active', 'Active')}</Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            <ChevronDown className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                          </TableCell>
                        </TableRow>
                        {isExpanded && (
                          <TableRow key={`${event.id}-detail`} className="bg-muted/20 hover:bg-muted/20">
                            <TableCell colSpan={7} className="py-3">
                              <div className="space-y-3 pl-8">
                                {event.message && (
                                  <p className="text-sm text-muted-foreground">{event.message}</p>
                                )}
                                {rule && (
                                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                    <span>{t('alerts.triggeredBy', 'Triggered by rule:')}</span>
                                    <Badge variant="secondary" className="text-[11px]">{rule.name}</Badge>
                                    <span>({rule.alertType.replace(/_/g, ' ')})</span>
                                    {rule.endpointId && <span className="font-mono">endpoint: {rule.endpointId.slice(0, 8)}…</span>}
                                  </div>
                                )}
                                {event.resolvedAt && (
                                  <p className="text-xs text-muted-foreground">
                                    {t('alerts.resolvedAt', 'Resolved')}: {formatDateTime(event.resolvedAt)}
                                  </p>
                                )}
                                <div className="flex items-center gap-2">
                                  {investigateUrl && (
                                    <Link to={investigateUrl}>
                                      <Button variant="outline" size="sm">
                                        <Search className="h-3.5 w-3.5 mr-1.5" />
                                        {t('alerts.investigate', 'Investigate Deliveries')}
                                      </Button>
                                    </Link>
                                  )}
                                  {!event.resolved && canManageEndpoints && (
                                    <Button variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); handleResolve(event.id); }}>
                                      <Check className="h-3.5 w-3.5 mr-1.5" />
                                      {t('alerts.resolve', 'Resolve')}
                                    </Button>
                                  )}
                                </div>
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                      </>
                    );
                  })}
                </TableBody>
              </Table>
            </Card>
            <TablePagination
              page={eventsPage}
              pageSize={eventsPageSize}
              totalElements={eventsData?.totalElements ?? 0}
              totalPages={eventsData?.totalPages ?? 0}
              onPageChange={setEventsPage}
              onPageSizeChange={setEventsPageSize}
            />
          </div>
        )
      )}

      {/* Rules tab */}
      {activeTab === 'rules' && (
        rules.length === 0 ? (
          <EmptyState icon={Bell} title={t('alerts.noRules', 'No alert rules')} description={t('alerts.noRulesDesc', 'Create your first alert rule to monitor delivery health')}
            action={<PermissionGate allowed={canManageEndpoints}><Button onClick={() => setShowCreateDialog(true)}><Plus className="h-4 w-4" /> {t('alerts.createRule', 'Create Rule')}</Button></PermissionGate>} />
        ) : (
          <div className="grid gap-4 md:grid-cols-2 animate-fade-in">
            {rules.map((rule) => (
              <Card key={rule.id}>
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="space-y-1">
                      <CardTitle className="text-base">{rule.name}</CardTitle>
                      {rule.description && <p className="text-xs text-muted-foreground">{rule.description}</p>}
                    </div>
                    <Switch checked={rule.enabled} onCheckedChange={(v) => handleToggleRule(rule.id, v)} />
                  </div>
                </CardHeader>
                <CardContent className="pt-0 space-y-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="secondary">{rule.alertType.replace(/_/g, ' ')}</Badge>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium ${SEVERITY_COLORS[rule.severity] || ''}`}>{rule.severity}</span>
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] bg-muted">
                      {rule.channel === 'EMAIL' ? <Mail className="h-3 w-3" /> : rule.channel === 'WEBHOOK' ? <Webhook className="h-3 w-3" /> : <Bell className="h-3 w-3" />}
                      {rule.channel.replace(/_/g, ' ')}
                    </span>
                    {rule.muted && <Badge variant="outline" className="text-muted-foreground"><VolumeX className="h-3 w-3 mr-1" />Muted</Badge>}
                    {rule.snoozedUntil && new Date(rule.snoozedUntil) > new Date() && (
                      <Badge variant="outline" className="text-orange-600"><BellOff className="h-3 w-3 mr-1" />Snoozed</Badge>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                    <div>Threshold: <span className="font-mono text-foreground">{rule.thresholdValue}</span></div>
                    <div>Window: <span className="font-mono text-foreground">{rule.windowMinutes}m</span></div>
                  </div>
                  {rule.channel === 'WEBHOOK' && rule.webhookUrl && (
                    <div className="text-[11px] text-muted-foreground truncate">→ {rule.webhookUrl}</div>
                  )}
                  {rule.channel === 'EMAIL' && rule.emailRecipients && (
                    <div className="text-[11px] text-muted-foreground truncate">→ {rule.emailRecipients}</div>
                  )}
                  <div className="flex items-center justify-between pt-2 border-t">
                    <span className="text-[11px] text-muted-foreground">{formatRelativeTime(rule.createdAt)}</span>
                    <div className="flex items-center gap-1">
                      {canManageEndpoints && (<>
                        <Button variant="ghost" size="icon-sm" onClick={() => handleMuteRule(rule.id, !rule.muted)} title={rule.muted ? 'Unmute' : 'Mute'}>
                          <VolumeX className={`h-3.5 w-3.5 ${rule.muted ? 'text-muted-foreground' : ''}`} />
                        </Button>
                        <div className="relative">
                          <Button variant="ghost" size="icon-sm" onClick={() => setSnoozeDropdownId(snoozeDropdownId === rule.id ? null : rule.id)} title={t('alerts.snooze', 'Snooze')}>
                            <Clock className="h-3.5 w-3.5" />
                          </Button>
                          {snoozeDropdownId === rule.id && (
                            <div className="absolute right-0 top-full mt-1 z-10 bg-popover border rounded-md shadow-md py-1 min-w-[120px]">
                              {[1, 4, 8, 24].map((h) => (
                                <button
                                  key={h}
                                  className="w-full text-left px-3 py-1.5 text-xs hover:bg-muted transition-colors"
                                  onClick={() => { handleSnoozeRule(rule.id, h); setSnoozeDropdownId(null); }}
                                >
                                  {t('alerts.snoozeFor', { hours: h, defaultValue: 'Snooze {{hours}}h' })}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                        <Button variant="ghost" size="icon-sm" className="text-destructive" onClick={() => setDeleteRuleId(rule.id)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </>)}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )
      )}

      {/* Create dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('alerts.createDialog.title', 'Create Alert Rule')}</DialogTitle>
            <DialogDescription>{t('alerts.createDialog.description', 'Define conditions that trigger alerts')}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>{t('alerts.form.name', 'Name')}</Label>
              <Input value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="e.g. High failure rate" />
            </div>
            <div className="space-y-2">
              <Label>{t('alerts.form.type', 'Alert Type')}</Label>
              <Select value={formType} onChange={(e) => setFormType(e.target.value as AlertType)}>
                {ALERT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </Select>
              <p className="text-xs text-muted-foreground">{ALERT_TYPES.find((a) => a.value === formType)?.hint}</p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t('alerts.form.threshold', 'Threshold')}</Label>
                <Input type="number" value={formThreshold} onChange={(e) => setFormThreshold(e.target.value)} min="0" step="0.1" />
              </div>
              <div className="space-y-2">
                <Label>{t('alerts.form.window', 'Window (min)')}</Label>
                <Input type="number" value={formWindow} onChange={(e) => setFormWindow(e.target.value)} min="1" max="1440" />
              </div>
            </div>
            <div className="space-y-2">
              <Label>{t('alerts.form.severity', 'Severity')}</Label>
              <Select value={formSeverity} onChange={(e) => setFormSeverity(e.target.value as AlertSeverity)}>
                <option value="INFO">Info</option>
                <option value="WARNING">Warning</option>
                <option value="CRITICAL">Critical</option>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t('alerts.form.description', 'Description (optional)')}</Label>
              <Input value={formDescription} onChange={(e) => setFormDescription(e.target.value)} placeholder="Optional description" />
            </div>
            <div className="space-y-2">
              <Label>{t('alerts.form.channel', 'Notification Channel')}</Label>
              <Select value={formChannel} onChange={(e) => setFormChannel(e.target.value as AlertChannel)}>
                <option value="IN_APP">In-App</option>
                <option value="EMAIL">Email</option>
                <option value="WEBHOOK">Webhook</option>
              </Select>
            </div>
            {formChannel === 'WEBHOOK' && (
              <div className="space-y-2">
                <Label>{t('alerts.form.webhookUrl', 'Webhook URL')}</Label>
                <Input value={formWebhookUrl} onChange={(e) => setFormWebhookUrl(e.target.value)} placeholder="https://hooks.slack.com/..." />
              </div>
            )}
            {formChannel === 'EMAIL' && (
              <div className="space-y-2">
                <Label>{t('alerts.form.emailRecipients', 'Email Recipients')}</Label>
                <Input value={formEmailRecipients} onChange={(e) => setFormEmailRecipients(e.target.value)} placeholder="ops@company.com, dev@company.com" />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>{t('common.cancel', 'Cancel')}</Button>
            <Button onClick={handleCreate} disabled={!formName || !formThreshold || createRule.isPending}>
              {createRule.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
              {t('alerts.createDialog.submit', 'Create Rule')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={!!deleteRuleId} onOpenChange={() => setDeleteRuleId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('alerts.deleteDialog.title', 'Delete alert rule?')}</AlertDialogTitle>
            <AlertDialogDescription>{t('alerts.deleteDialog.description', 'This will permanently delete the rule and stop monitoring. Existing alert events will remain.')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel', 'Cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {t('common.delete', 'Delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
