import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { Repeat2, Plus, Loader2, Trash2, Settings, Copy, Wand2, CheckCircle2, XCircle, AlertTriangle } from 'lucide-react';
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
import { Textarea } from '../components/ui/textarea';
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
import type { TransformationResponse, TransformationRequest } from '../types/api.types';

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
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4" /> {t('transformations.create')}
          </Button>
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
                <Button onClick={openCreate}>
                  <Plus className="h-4 w-4" /> {t('transformations.createFirst')}
                </Button>
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
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {editing ? t('transformations.editTitle') : t('transformations.createTitle')}
            </DialogTitle>
            <DialogDescription>
              {editing ? t('transformations.editDesc') : t('transformations.createDesc')}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {/* Name */}
            <div className="space-y-1.5">
              <Label htmlFor="tf-name">{t('transformations.name')} <span className="text-destructive">*</span></Label>
              <Input
                id="tf-name"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder={t('transformations.namePlaceholder')}
                className={formTouched && !formName.trim() ? 'border-destructive' : ''}
              />
              {formTouched && !formName.trim() && (
                <p className="text-xs text-destructive flex items-center gap-1"><XCircle className="h-3 w-3" /> {t('transformations.validation.nameRequired')}</p>
              )}
            </div>
            {/* Description */}
            <div className="space-y-1.5">
              <Label htmlFor="tf-desc">{t('transformations.description')}</Label>
              <Input
                id="tf-desc"
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                placeholder={t('transformations.descriptionPlaceholder')}
              />
            </div>
            {/* Template */}
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
              <Textarea
                id="tf-template"
                value={formTemplate}
                onChange={(e) => setFormTemplate(e.target.value)}
                placeholder='{"event_type": "${$.type}", "data": "${$.data}"}'
                rows={10}
                className={`font-mono text-xs ${templateHasContent && !templateIsJson ? 'border-destructive' : templateHasContent && templateIsJson ? 'border-green-500/50' : ''}`}
              />
              {/* Feedback row */}
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
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3" /> {exprCount} {'${...}'} {exprCount === 1 ? t('transformations.validation.expression') : t('transformations.validation.expressions')}
                  </p>
                )}
              </div>
              <p className="text-xs text-muted-foreground">{t('transformations.templateHint')}</p>
            </div>
            {/* Enabled */}
            <div className="flex items-center gap-2">
              <Switch id="tf-enabled" checked={formEnabled} onCheckedChange={setFormEnabled} />
              <Label htmlFor="tf-enabled">{t('common.enabled')}</Label>
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
