import { useState, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { Repeat2, Plus, Loader2, Trash2, Settings, Copy, Wand2, CheckCircle2, XCircle, ArrowRight, Info, ArrowDown, Link2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { showSuccess, showApiError } from '../lib/toast';
import { formatDate } from '../lib/date';
import PageSkeleton from '../components/PageSkeleton';
import EmptyState from '../components/EmptyState';
import {
  useProject,
  useTransformations,
  useCreateTransformation,
  useUpdateTransformation,
  useDeleteTransformation,
} from '../api/queries';
import { Button } from '../components/ui/button';
import { Card, CardContent } from '../components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Badge } from '../components/ui/badge';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Switch } from '../components/ui/switch';
import JsonEditor from '../components/JsonEditor';
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../components/ui/dialog';
import { usePermissions } from '../auth/usePermissions';
import PermissionGate from '../components/PermissionGate';
import VerificationGate from '../components/VerificationGate';
import type { TransformationResponse, TransformationRequest } from '../types/api.types';

const sampleInput = {
  id: "evt_abc123",
  type: "order.created",
  data: { orderId: "ord_456", amount: 99.99, currency: "USD" },
  createdAt: "2026-03-04T11:00:00Z"
};

export default function TransformationsPage() {
  const { t } = useTranslation();
  const { projectId } = useParams<{ projectId: string }>();
  const { canManageSubscriptions: canManage } = usePermissions();
  const { data: project, isLoading: projectLoading } = useProject(projectId);
  const { data: transformations = [], isLoading: listLoading } = useTransformations(projectId!);
  const createMutation = useCreateTransformation(projectId!);
  const updateMutation = useUpdateTransformation(projectId!);
  const deleteMutation = useDeleteTransformation(projectId!);

  const [showDialog, setShowDialog] = useState(false);
  const [editing, setEditing] = useState<TransformationResponse | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [searchFilter, setSearchFilter] = useState('');

  // Form state
  const [formName, setFormName] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formTemplate, setFormTemplate] = useState('');
  const [formEnabled, setFormEnabled] = useState(true);
  const [formTouched, setFormTouched] = useState(false);

  const isValidJson = (s: string) => { try { JSON.parse(s); return true; } catch { return false; } };
  const formatJson = (s: string) => { try { return JSON.stringify(JSON.parse(s), null, 2); } catch { return s; } };
  const countExpressions = (s: string) => (s.match(/\$\{[^}]*\}/g) || []).length;
  const templateHasContent = formTemplate.trim().length > 0;
  const templateIsJson = templateHasContent && isValidJson(formTemplate);
  const exprCount = countExpressions(formTemplate);

  const livePreview = useMemo(() => {
    if (!templateHasContent || !templateIsJson) return null;
    try {
      let result = formTemplate;
      const exprRegex = /\$\{([^}]+)\}/g;
      let match;
      while ((match = exprRegex.exec(formTemplate)) !== null) {
        const path = match[1]; // e.g. $.type or $.data.amount
        const parts = path.replace(/^\$\.?/, '').split('.');
        let value: any = sampleInput;
        for (const p of parts) {
          if (value && typeof value === 'object' && p in value) value = value[p];
          else { value = `<${path}>`; break; }
        }
        result = result.replace(match[0], typeof value === 'object' ? JSON.stringify(value) : String(value));
      }
      return JSON.stringify(JSON.parse(result), null, 2);
    } catch {
      return null;
    }
  }, [formTemplate, templateHasContent, templateIsJson]);

  const loading = projectLoading || listLoading;

  const openCreate = () => {
    setEditing(null);
    setFormName('');
    setFormDescription('');
    setFormTemplate('{\n  "event_type": "${$.type}",\n  "data": "${$.data}"\n}');
    setFormEnabled(true);
    setFormTouched(false);
    setShowDialog(true);
  };

  const openEdit = (item: TransformationResponse) => {
    setEditing(item);
    setFormName(item.name);
    setFormDescription(item.description || '');
    try {
      setFormTemplate(JSON.stringify(JSON.parse(item.template), null, 2));
    } catch {
      setFormTemplate(item.template);
    }
    setFormEnabled(item.enabled);
    setFormTouched(false);
    setShowDialog(true);
  };

  const handleSave = () => {
    setFormTouched(true);
    if (!formName.trim() || !formTemplate.trim() || !isValidJson(formTemplate)) return;

    const data: TransformationRequest = {
      name: formName.trim(),
      description: formDescription.trim() || undefined,
      template: formTemplate.trim(),
      enabled: formEnabled,
    };

    if (editing) {
      updateMutation.mutate(
        { id: editing.id, data },
        {
          onSuccess: () => {
            showSuccess(t('transformations.toast.updated'));
            setShowDialog(false);
          },
          onError: (err) => showApiError(err, t('transformations.toast.updateFailed')),
        },
      );
    } else {
      createMutation.mutate(data, {
        onSuccess: () => {
          showSuccess(t('transformations.toast.created'));
          setShowDialog(false);
        },
        onError: (err) => showApiError(err, t('transformations.toast.createFailed')),
      });
    }
  };

  const handleDelete = () => {
    if (!deleteId) return;
    deleteMutation.mutate(deleteId, {
      onSuccess: () => {
        showSuccess(t('transformations.toast.deleted'));
        setDeleteId(null);
      },
      onError: (err) => showApiError(err, t('transformations.toast.deleteFailed')),
    });
  };

  const handleDuplicate = (item: TransformationResponse) => {
    setEditing(null);
    setFormName(item.name + ' (copy)');
    setFormDescription(item.description || '');
    try {
      setFormTemplate(JSON.stringify(JSON.parse(item.template), null, 2));
    } catch {
      setFormTemplate(item.template);
    }
    setFormEnabled(true);
    setFormTouched(false);
    setShowDialog(true);
  };

  const filtered = transformations.filter((t) => {
    if (!searchFilter) return true;
    const q = searchFilter.toLowerCase();
    return t.name.toLowerCase().includes(q) || (t.description || '').toLowerCase().includes(q);
  });

  const saving = createMutation.isPending || updateMutation.isPending;

  if (loading) return <PageSkeleton maxWidth="max-w-7xl" />;

  if (!project) {
    return (
      <div className="p-6 lg:p-8 max-w-7xl mx-auto">
        <EmptyState icon={Repeat2} title={t('transformations.projectNotFound')} />
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-8">
        <div>
          <h1 className="text-title tracking-tight">{t('transformations.title')}</h1>
          <p className="text-sm text-muted-foreground mt-1">{t('transformations.subtitle')}</p>
        </div>
        <PermissionGate allowed={canManage}>
          <VerificationGate>
            <Button onClick={openCreate}>
              <Plus className="h-4 w-4" /> {t('transformations.create')}
            </Button>
          </VerificationGate>
        </PermissionGate>
      </div>

      {/* Search */}
      {transformations.length > 0 && (
        <Card className="mb-6">
          <CardContent className="p-4">
            <div className="max-w-sm space-y-1.5">
              <Label htmlFor="searchFilter" className="text-xs">{t('transformations.search')}</Label>
              <Input
                id="searchFilter"
                placeholder={t('transformations.searchPlaceholder')}
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* List */}
      {filtered.length === 0 ? (
        <EmptyState
          icon={Repeat2}
          title={transformations.length === 0 ? t('transformations.empty') : t('transformations.noMatching')}
          description={transformations.length === 0 ? t('transformations.emptyDesc') : t('transformations.noMatchingDesc')}
          action={
            transformations.length === 0 ? (
              <PermissionGate allowed={canManage}>
                <VerificationGate>
                  <Button onClick={openCreate}>
                    <Plus className="h-4 w-4" /> {t('transformations.createFirst')}
                  </Button>
                </VerificationGate>
              </PermissionGate>
            ) : undefined
          }
        />
      ) : (
        <Card className="overflow-hidden animate-fade-in">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">{t('transformations.name')}</TableHead>
                <TableHead className="text-xs">{t('transformations.description')}</TableHead>
                <TableHead className="text-xs">{t('transformations.version')}</TableHead>
                <TableHead className="text-xs">{t('transformations.status')}</TableHead>
                <TableHead className="text-xs">{t('transformations.usedBy', 'Used by')}</TableHead>
                <TableHead className="text-xs">{t('transformations.updated')}</TableHead>
                {canManage && <TableHead className="w-[100px]"></TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((item) => (
                <TableRow key={item.id} className="hover:bg-muted/30">
                  <TableCell>
                    <span className="font-medium text-[13px]">{item.name}</span>
                  </TableCell>
                  <TableCell>
                    <span className="text-[13px] text-muted-foreground truncate max-w-[250px] block">
                      {item.description || '—'}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-[10px]">v{item.version}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={item.enabled ? 'success' : 'secondary'}>
                      {item.enabled ? t('common.enabled') : t('common.disabled')}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {(item.subscriptionCount > 0 || item.destinationCount > 0) ? (
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Link2 className="h-3 w-3" />
                        <span>
                          {item.subscriptionCount > 0 && `${item.subscriptionCount} sub${item.subscriptionCount > 1 ? 's' : ''}`}
                          {item.subscriptionCount > 0 && item.destinationCount > 0 && ', '}
                          {item.destinationCount > 0 && `${item.destinationCount} dest${item.destinationCount > 1 ? 's' : ''}`}
                        </span>
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <span className="text-[13px] text-muted-foreground">{formatDate(item.updatedAt)}</span>
                  </TableCell>
                  {canManage && (
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon-sm" onClick={() => openEdit(item)} title={t('common.edit')}>
                          <Settings className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon-sm" onClick={() => handleDuplicate(item)} title={t('transformations.duplicate')}>
                          <Copy className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => setDeleteId(item.id)}
                          title={t('common.delete')}
                          className="text-muted-foreground hover:text-destructive"
                        >
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

      {/* Create / Edit Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Repeat2 className="h-5 w-5 text-primary" />
              {editing ? t('transformations.editTitle') : t('transformations.createTitle')}
            </DialogTitle>
            <DialogDescription>
              {editing ? t('transformations.editDesc') : t('transformations.createDesc')}
            </DialogDescription>
          </DialogHeader>

          {/* How it works */}
          <div className="bg-muted/40 border rounded-lg p-4 space-y-3">
            <p className="text-xs font-semibold flex items-center gap-1.5">
              <Info className="h-3.5 w-3.5 text-primary" />
              How Transformations Work
            </p>
            <div className="flex items-center gap-3 text-xs">
              <div className="flex-1 bg-background border rounded-md p-2.5 text-center">
                <p className="font-semibold text-foreground">Incoming Event</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">Original payload from your API</p>
              </div>
              <ArrowRight className="h-4 w-4 text-primary shrink-0" />
              <div className="flex-1 bg-primary/10 border border-primary/20 rounded-md p-2.5 text-center">
                <p className="font-semibold text-primary">Template</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">Your transformation reshapes the data</p>
              </div>
              <ArrowRight className="h-4 w-4 text-primary shrink-0" />
              <div className="flex-1 bg-background border rounded-md p-2.5 text-center">
                <p className="font-semibold text-foreground">Delivered Payload</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">What your endpoint receives</p>
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Use <code className="bg-muted px-1 rounded">${'{'}$.field{'}'}</code> to reference fields from the original event.
              Assign this transformation to a subscription to apply it automatically.
            </p>
          </div>

          <div className="space-y-4 py-2">
            {/* Name + Description row */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="tf-name">{t('transformations.name')} <span className="text-destructive">*</span></Label>
                <Input
                  id="tf-name"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder={t('transformations.namePlaceholder')}
                  className={formTouched && !formName.trim() ? 'border-destructive' : ''}
                />
                {formTouched && !formName.trim() ? (
                  <p className="text-xs text-destructive flex items-center gap-1"><XCircle className="h-3 w-3" /> {t('transformations.validation.nameRequired')}</p>
                ) : (
                  <p className="text-[11px] text-muted-foreground">A short name to identify this transformation (e.g. "Slack Format", "Stripe Normalize")</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="tf-desc">{t('transformations.description')} <span className="text-muted-foreground text-xs font-normal">(optional)</span></Label>
                <Input
                  id="tf-desc"
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  placeholder={t('transformations.descriptionPlaceholder')}
                />
                <p className="text-[11px] text-muted-foreground">Describe what this transformation does and when to use it</p>
              </div>
            </div>

            {/* Template + Live Preview side by side */}
            <div className="grid grid-cols-2 gap-4">
              {/* Left: Template editor */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="tf-template">{t('transformations.template')} <span className="text-destructive">*</span></Label>
                  <div className="flex items-center gap-1">
                    {templateHasContent && (
                      <Button type="button" variant="ghost" size="sm" className="h-6 text-[11px] px-2" onClick={() => setFormTemplate(formatJson(formTemplate))}>
                        <Wand2 className="h-3 w-3 mr-1" /> {t('transformations.format')}
                      </Button>
                    )}
                  </div>
                </div>
                <JsonEditor
                  value={formTemplate}
                  onChange={setFormTemplate}
                  placeholder='{\n  "event": "${$.type}",\n  "order_id": "${$.data.orderId}",\n  "amount": "${$.data.amount}"\n}'
                  minHeight="220px"
                  maxHeight="300px"
                  className={templateHasContent && !templateIsJson ? 'ring-1 ring-destructive rounded-md' : templateHasContent && templateIsJson ? 'ring-1 ring-green-500/50 rounded-md' : ''}
                />
                <div className="flex items-center justify-between">
                  <div>
                    {templateHasContent && !templateIsJson && (
                      <p className="text-xs text-destructive flex items-center gap-1"><XCircle className="h-3 w-3" /> {t('transformations.validation.invalidJson')}</p>
                    )}
                    {templateHasContent && templateIsJson && (
                      <p className="text-xs text-green-600 flex items-center gap-1"><CheckCircle2 className="h-3 w-3" /> {t('transformations.validation.validJson')}</p>
                    )}
                    {formTouched && !templateHasContent && (
                      <p className="text-xs text-destructive flex items-center gap-1"><XCircle className="h-3 w-3" /> {t('transformations.validation.templateRequired')}</p>
                    )}
                  </div>
                  {templateHasContent && templateIsJson && exprCount > 0 && (
                    <p className="text-xs text-muted-foreground">
                      {exprCount} {'${...}'} {exprCount === 1 ? t('transformations.validation.expression') : t('transformations.validation.expressions')}
                    </p>
                  )}
                </div>
                <div className="text-[11px] text-muted-foreground space-y-1">
                  <p className="font-medium">Available expressions:</p>
                  <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
                    <code className="bg-muted px-1 rounded">${'{'}$.id{'}'}</code>
                    <span>Event ID</span>
                    <code className="bg-muted px-1 rounded">${'{'}$.type{'}'}</code>
                    <span>Event type</span>
                    <code className="bg-muted px-1 rounded">${'{'}$.data{'}'}</code>
                    <span>Full payload object</span>
                    <code className="bg-muted px-1 rounded">${'{'}$.data.field{'}'}</code>
                    <span>Nested field</span>
                    <code className="bg-muted px-1 rounded">${'{'}$.createdAt{'}'}</code>
                    <span>Timestamp</span>
                  </div>
                </div>
              </div>

              {/* Right: Live Preview */}
              <div className="space-y-1.5">
                <Label className="text-xs">Live Preview</Label>

                <div className="space-y-2">
                  <div className="space-y-1">
                    <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Sample Input Event</p>
                    <pre className="bg-muted/50 border rounded-md p-2.5 text-[11px] font-mono overflow-x-auto max-h-[120px] text-muted-foreground">
                      {JSON.stringify(sampleInput, null, 2)}
                    </pre>
                  </div>

                  <div className="flex justify-center">
                    <ArrowDown className="h-4 w-4 text-primary" />
                  </div>

                  <div className="space-y-1">
                    <p className="text-[10px] uppercase tracking-wider font-semibold text-green-600 dark:text-green-400">Output (what endpoint receives)</p>
                    {livePreview ? (
                      <pre className="bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800 rounded-md p-2.5 text-[11px] font-mono overflow-x-auto max-h-[160px] text-green-800 dark:text-green-300">
                        {livePreview}
                      </pre>
                    ) : templateHasContent && !templateIsJson ? (
                      <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-md p-3 text-xs text-red-600 dark:text-red-400 flex items-center gap-2">
                        <XCircle className="h-4 w-4 shrink-0" />
                        Fix the template JSON to see the preview
                      </div>
                    ) : (
                      <div className="bg-muted/30 border border-dashed rounded-md p-6 text-xs text-muted-foreground text-center">
                        Write a template to see the live output preview
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Enabled */}
            <div className="flex items-center justify-between p-3 bg-muted/40 rounded-lg border">
              <div className="flex items-center gap-3">
                <Switch id="tf-enabled" checked={formEnabled} onCheckedChange={setFormEnabled} />
                <div>
                  <Label htmlFor="tf-enabled" className="cursor-pointer">{t('common.enabled')}</Label>
                  <p className="text-[11px] text-muted-foreground">
                    {formEnabled
                      ? 'This transformation can be assigned to subscriptions'
                      : 'Disabled — won\'t be available for new subscriptions'}
                  </p>
                </div>
              </div>
            </div>

            {/* How to use hint */}
            <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3 flex items-start gap-2.5">
              <Info className="h-4 w-4 text-blue-600 dark:text-blue-400 mt-0.5 shrink-0" />
              <div className="text-xs space-y-1">
                <p className="font-medium text-blue-900 dark:text-blue-200">How to apply this transformation</p>
                <p className="text-blue-700 dark:text-blue-300">
                  After saving, go to <strong>Subscriptions</strong> → edit or create a subscription → under <strong>Advanced Settings</strong>,
                  select this transformation from the dropdown. Every delivery for that subscription will use this template instead of the original payload.
                </p>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)} disabled={saving}>
              {t('common.cancel')}
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editing ? t('common.save') : t('common.create')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('transformations.deleteDialog.title')}</AlertDialogTitle>
            <AlertDialogDescription>{t('transformations.deleteDialog.description')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleteMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {deleteMutation.isPending ? t('common.deleting') : t('common.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
