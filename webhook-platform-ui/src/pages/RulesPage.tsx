import { useState, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import {
  GitBranch, Plus, Loader2, Trash2, Zap, Search,
  ChevronDown, ChevronUp, BarChart3, Filter, Route, Wand2, Ban,
  Tag, X, Pencil, PlusCircle, FolderPlus,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { showSuccess, showApiError } from '../lib/toast';
import { formatRelativeTime } from '../lib/date';
import PageSkeleton from '../components/PageSkeleton';
import EmptyState from '../components/EmptyState';
import {
  useProject, useRules, useCreateRule, useUpdateRule, useDeleteRule, useToggleRule,
  useEndpoints, useTransformations,
} from '../api/queries';
import type {
  RuleResponse, RuleRequest, RuleActionRequest, ActionType,
  ConditionNode,
} from '../api/rules.api';
import { Button } from '../components/ui/button';
import { Card, CardContent } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Switch } from '../components/ui/switch';
import { Select } from '../components/ui/select';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '../components/ui/alert-dialog';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '../components/ui/dialog';
import { usePermissions } from '../auth/usePermissions';
import PermissionGate from '../components/PermissionGate';
import VerificationGate from '../components/VerificationGate';
import ConditionTreeEditor, { mkGroup, mkPredicate, countPredicates, NO_VALUE_OPS } from '../components/ConditionTreeEditor';

// ─── Constants ──────────────────────────────────────────────────

/** Deep-clone a condition node */
function cloneNode(node: ConditionNode): ConditionNode {
  return JSON.parse(JSON.stringify(node));
}


const ACTION_TYPE_META: Record<ActionType, { icon: React.ElementType; label: string; color: string; bg: string }> = {
  ROUTE: { icon: Route, label: 'Route to endpoint', color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-500/10' },
  TRANSFORM: { icon: Wand2, label: 'Transform payload', color: 'text-purple-600 dark:text-purple-400', bg: 'bg-purple-500/10' },
  DROP: { icon: Ban, label: 'Drop event', color: 'text-red-600 dark:text-red-400', bg: 'bg-red-500/10' },
  TAG: { icon: Tag, label: 'Tag event', color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-500/10' },
};

// ─── Component ──────────────────────────────────────────────────

export default function RulesPage() {
  const { t } = useTranslation();
  const { projectId } = useParams<{ projectId: string }>();
  const { canManageSubscriptions: canManage } = usePermissions();
  const { isLoading: projectLoading } = useProject(projectId);
  const { data: rules = [], isLoading: rulesLoading } = useRules(projectId!);
  const { data: endpoints = [] } = useEndpoints(projectId!);
  const { data: transformations = [] } = useTransformations(projectId!);

  const createMutation = useCreateRule(projectId!);
  const updateMutation = useUpdateRule(projectId!);
  const deleteMutation = useDeleteRule(projectId!);
  const toggleMutation = useToggleRule(projectId!);

  const [showDialog, setShowDialog] = useState(false);
  const [editing, setEditing] = useState<RuleResponse | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [searchFilter, setSearchFilter] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Form state
  const [formName, setFormName] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formEnabled, setFormEnabled] = useState(true);
  const [formPriority, setFormPriority] = useState(0);
  const [formEventTypePattern, setFormEventTypePattern] = useState('');
  const [formConditions, setFormConditions] = useState<ConditionNode | null>(null);
  const [formActions, setFormActions] = useState<RuleActionRequest[]>([]);

  const loading = projectLoading || rulesLoading;

  const filteredRules = useMemo(() => {
    if (!searchFilter) return rules;
    const q = searchFilter.toLowerCase();
    return rules.filter(r =>
      r.name.toLowerCase().includes(q) ||
      (r.description?.toLowerCase().includes(q)) ||
      (r.eventTypePattern?.toLowerCase().includes(q))
    );
  }, [rules, searchFilter]);

  // ─── Form helpers ─────────────────────────────────────────────

  const resetForm = () => {
    setFormName('');
    setFormDescription('');
    setFormEnabled(true);
    setFormPriority(0);
    setFormEventTypePattern('');
    setFormConditions(null);
    setFormActions([]);
  };

  const openCreate = () => {
    setEditing(null);
    resetForm();
    setShowDialog(true);
  };

  const openEdit = (rule: RuleResponse) => {
    setEditing(rule);
    setFormName(rule.name);
    setFormDescription(rule.description || '');
    setFormEnabled(rule.enabled);
    setFormPriority(rule.priority);
    setFormEventTypePattern(rule.eventTypePattern || '');
    setFormConditions(rule.conditions ? cloneNode(rule.conditions) : null);
    setFormActions(rule.actions.map(a => ({
      type: a.type,
      endpointId: a.endpointId || undefined,
      transformationId: a.transformationId || undefined,
      config: a.config,
      sortOrder: a.sortOrder,
    })));
    setShowDialog(true);
  };

  const handleSave = async () => {
    const data: RuleRequest = {
      name: formName,
      description: formDescription || undefined,
      enabled: formEnabled,
      priority: formPriority,
      eventTypePattern: formEventTypePattern || undefined,
      conditions: formConditions,
      actions: formActions.length > 0 ? formActions : undefined,
    };
    try {
      if (editing) {
        await updateMutation.mutateAsync({ id: editing.id, data });
        showSuccess(t('rules.updated'));
      } else {
        await createMutation.mutateAsync(data);
        showSuccess(t('rules.created'));
      }
      setShowDialog(false);
    } catch (err) { showApiError(err, 'rules.saveFailed'); }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await deleteMutation.mutateAsync(deleteId);
      showSuccess(t('rules.deleted'));
      setDeleteId(null);
    } catch (err) { showApiError(err, 'rules.deleteFailed'); }
  };

  const handleToggle = async (rule: RuleResponse) => {
    try {
      await toggleMutation.mutateAsync({ id: rule.id, enabled: !rule.enabled });
      showSuccess(rule.enabled ? t('rules.disabled') : t('rules.enabled'));
    } catch (err) { showApiError(err, 'rules.toggleFailed'); }
  };

  // ─── Condition tree actions ──────────────────────────────────

  const ensureRoot = (): ConditionNode => formConditions ?? mkGroup('AND');

  const addPredicateToRoot = () => {
    const root = ensureRoot();
    if (root.type === 'group') {
      setFormConditions({ ...root, children: [...root.children, mkPredicate()] });
    } else {
      setFormConditions({ type: 'group', op: 'AND', children: [root, mkPredicate()] });
    }
  };

  const addGroupToRoot = () => {
    const root = ensureRoot();
    if (root.type === 'group') {
      setFormConditions({ ...root, children: [...root.children, mkGroup('AND')] });
    } else {
      setFormConditions({ type: 'group', op: 'AND', children: [root, mkGroup('AND')] });
    }
  };

  // ─── Action builder ───────────────────────────────────────────

  const addAction = (type: ActionType) => {
    setFormActions([...formActions, { type, sortOrder: formActions.length }]);
  };

  const updateAction = (idx: number, patch: Partial<RuleActionRequest>) => {
    setFormActions(formActions.map((a, i) => i === idx ? { ...a, ...patch } : a));
  };

  const removeAction = (idx: number) => {
    setFormActions(formActions.filter((_, i) => i !== idx));
  };

  // ─── Render ───────────────────────────────────────────────────

  if (loading) return <PageSkeleton />;

  const enabledCount = rules.filter(r => r.enabled).length;
  const totalExecutions = rules.reduce((s, r) => s + r.totalExecutions, 0);
  const totalMatches = rules.reduce((s, r) => s + r.totalMatches, 0);
  const matchRate = totalExecutions > 0 ? ((totalMatches / totalExecutions) * 100).toFixed(1) : '0';

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-title tracking-tight">{t('rules.title')}</h1>
          <p className="text-sm text-muted-foreground mt-1">{t('rules.subtitle')}</p>
        </div>
        <PermissionGate allowed={canManage}>
          <VerificationGate>
            <Button onClick={openCreate} className="gap-2">
              <Plus className="h-4 w-4" />
              {t('rules.createRule')}
            </Button>
          </VerificationGate>
        </PermissionGate>
      </div>

      {/* Info banner — first time / empty */}
      {rules.length === 0 && (
        <div className="rounded-xl border border-blue-200 dark:border-blue-900/50 bg-blue-50/50 dark:bg-blue-950/20 p-4 flex gap-3">
          <GitBranch className="h-5 w-5 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
          <div className="text-sm text-blue-900 dark:text-blue-200">
            <p className="font-medium mb-1">{t('rules.infoBanner.title')}</p>
            <p className="text-blue-700 dark:text-blue-300 text-xs leading-relaxed">{t('rules.infoBanner.body')}</p>
          </div>
        </div>
      )}

      {/* Stats strip */}
      {rules.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="rounded-xl border bg-card p-4">
            <div className="text-xs font-medium text-muted-foreground mb-1">{t('rules.stats.total')}</div>
            <div className="text-2xl font-bold">{rules.length}</div>
          </div>
          <div className="rounded-xl border bg-card p-4">
            <div className="text-xs font-medium text-muted-foreground mb-1">{t('rules.stats.active')}</div>
            <div className="text-2xl font-bold text-green-600">{enabledCount}</div>
          </div>
          <div className="rounded-xl border bg-card p-4">
            <div className="text-xs font-medium text-muted-foreground mb-1">{t('rules.stats.executions')}</div>
            <div className="text-2xl font-bold">{totalExecutions.toLocaleString()}</div>
          </div>
          <div className="rounded-xl border bg-card p-4">
            <div className="text-xs font-medium text-muted-foreground mb-1">{t('rules.stats.matchRate')}</div>
            <div className="text-2xl font-bold">{matchRate}%</div>
          </div>
        </div>
      )}

      {/* Search */}
      {rules.length > 0 && (
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={t('rules.search')}
            value={searchFilter}
            onChange={(e) => setSearchFilter(e.target.value)}
            className="pl-9"
          />
        </div>
      )}

      {/* Empty state */}
      {rules.length === 0 ? (
        <EmptyState
          icon={GitBranch}
          title={t('rules.empty.title')}
          description={t('rules.empty.description')}
          action={
            <PermissionGate allowed={canManage}>
              <VerificationGate>
                <Button onClick={openCreate} className="gap-2">
                  <Plus className="h-4 w-4" />
                  {t('rules.createRule')}
                </Button>
              </VerificationGate>
            </PermissionGate>
          }
        />
      ) : filteredRules.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Search className="h-8 w-8 mx-auto mb-3 opacity-40" />
          <p>{t('rules.noResults')}</p>
        </div>
      ) : (
        /* Rules list */
        <div className="space-y-3">
          {filteredRules.map((rule) => {
            const expanded = expandedId === rule.id;
            return (
              <Card key={rule.id} className={`transition-all duration-200 ${rule.enabled ? '' : 'opacity-60'} ${expanded ? 'ring-2 ring-primary/20' : 'hover:shadow-md'}`}>
                <CardContent className="p-0">
                  {/* Collapsed row */}
                  <div
                    className="flex items-center gap-4 p-4 cursor-pointer"
                    onClick={() => setExpandedId(expanded ? null : rule.id)}
                  >
                    {/* Status dot */}
                    <div className={`h-2.5 w-2.5 rounded-full shrink-0 ${rule.enabled ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-600'}`} />

                    {/* Name + meta */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold truncate">{rule.name}</span>
                        {rule.priority > 0 && (
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-mono">
                            P{rule.priority}
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground">
                        {rule.eventTypePattern && (
                          <span className="font-mono bg-muted px-1.5 py-0.5 rounded text-[11px]">{rule.eventTypePattern}</span>
                        )}
                        <span>{countPredicates(rule.conditions)} {t('rules.conditions')}</span>
                        <span>{rule.actions.length} {t('rules.actions')}</span>
                      </div>
                    </div>

                    {/* Action badges */}
                    <div className="hidden md:flex items-center gap-1.5">
                      {rule.actions.map((a, i) => {
                        const meta = ACTION_TYPE_META[a.type];
                        const Icon = meta.icon;
                        return (
                          <div key={i} className={`flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium ${meta.bg} ${meta.color}`}>
                            <Icon className="h-3 w-3" />
                            {a.type}
                          </div>
                        );
                      })}
                    </div>

                    {/* Stats */}
                    <div className="hidden sm:flex items-center gap-4 text-xs text-muted-foreground">
                      <div className="flex items-center gap-1" title={t('rules.stats.executions')}>
                        <BarChart3 className="h-3.5 w-3.5" />
                        {rule.totalExecutions.toLocaleString()}
                      </div>
                      <div className="flex items-center gap-1" title={t('rules.stats.matches')}>
                        <Zap className="h-3.5 w-3.5" />
                        {rule.totalMatches.toLocaleString()}
                      </div>
                    </div>

                    {/* Toggle + expand */}
                    <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                      <Switch
                        checked={rule.enabled}
                        onCheckedChange={() => handleToggle(rule)}
                        disabled={!canManage}
                      />
                      {expanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                    </div>
                  </div>

                  {/* Expanded details */}
                  {expanded && (
                    <div className="border-t px-4 pb-4 pt-3 space-y-4 bg-muted/30">
                      {/* Description */}
                      {rule.description && (
                        <p className="text-sm text-muted-foreground">{rule.description}</p>
                      )}

                      {/* Conditions */}
                      {rule.conditions && countPredicates(rule.conditions) > 0 && (
                        <div>
                          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
                            <Filter className="h-3.5 w-3.5" />
                            {t('rules.conditionsLabel')}
                          </div>
                          <ConditionTreeDisplay node={rule.conditions} depth={0} />
                        </div>
                      )}

                      {/* Actions */}
                      {rule.actions.length > 0 && (
                        <div>
                          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
                            <Zap className="h-3.5 w-3.5" />
                            {t('rules.actionsLabel')}
                          </div>
                          <div className="space-y-1.5">
                            {rule.actions.map((a, i) => {
                              const meta = ACTION_TYPE_META[a.type];
                              const Icon = meta.icon;
                              return (
                                <div key={i} className="flex items-center gap-3 bg-background rounded-lg px-3 py-2 border">
                                  <div className={`h-7 w-7 rounded-md flex items-center justify-center ${meta.bg}`}>
                                    <Icon className={`h-3.5 w-3.5 ${meta.color}`} />
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <span className="text-sm font-medium">{meta.label}</span>
                                    {a.endpointUrl && (
                                      <span className="text-xs text-muted-foreground ml-2 font-mono truncate">{a.endpointUrl}</span>
                                    )}
                                    {a.transformationName && (
                                      <span className="text-xs text-muted-foreground ml-2">→ {a.transformationName}</span>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* Meta + actions */}
                      <div className="flex items-center justify-between pt-2">
                        <div className="text-xs text-muted-foreground">
                          {t('rules.createdAt')} {formatRelativeTime(rule.createdAt)}
                          {rule.updatedAt !== rule.createdAt && (
                            <span className="ml-3">{t('rules.updatedAt')} {formatRelativeTime(rule.updatedAt)}</span>
                          )}
                        </div>
                        <PermissionGate allowed={canManage}>
                          <div className="flex items-center gap-2">
                            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => openEdit(rule)}>
                              <Pencil className="h-3.5 w-3.5" />
                              {t('common.edit')}
                            </Button>
                            <Button variant="outline" size="sm" className="gap-1.5 text-destructive hover:text-destructive" onClick={() => setDeleteId(rule.id)}>
                              <Trash2 className="h-3.5 w-3.5" />
                              {t('common.delete')}
                            </Button>
                          </div>
                        </PermissionGate>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* ─── Create/Edit Dialog ──────────────────────────────────── */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <GitBranch className="h-5 w-5 text-primary" />
              {editing ? t('rules.editRule') : t('rules.createRule')}
            </DialogTitle>
            <DialogDescription>{t('rules.dialogDescription')}</DialogDescription>
          </DialogHeader>

          <div className="space-y-6 py-2">
            {/* Basic info */}
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <Label>{t('rules.form.name')} *</Label>
                <Input value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="e.g. Route high-value orders" className="mt-1.5" />
              </div>
              <div className="col-span-2">
                <Label>{t('rules.form.description')}</Label>
                <Input value={formDescription} onChange={(e) => setFormDescription(e.target.value)} placeholder={t('rules.form.descriptionPlaceholder')} className="mt-1.5" />
              </div>
              <div>
                <Label>{t('rules.form.eventTypePattern')}</Label>
                <Input value={formEventTypePattern} onChange={(e) => setFormEventTypePattern(e.target.value)} placeholder="order.* or **" className="mt-1.5 font-mono text-sm" />
                <p className="text-[11px] text-muted-foreground mt-1">{t('rules.form.patternHint')}</p>
              </div>
              <div>
                <Label>{t('rules.form.priority')}</Label>
                <Input type="number" value={formPriority} onChange={(e) => setFormPriority(parseInt(e.target.value) || 0)} className="mt-1.5" />
                <p className="text-[11px] text-muted-foreground mt-1">{t('rules.form.priorityHint')}</p>
              </div>
            </div>

            {/* Enabled switch */}
            <div className="flex items-center gap-3">
              <Switch checked={formEnabled} onCheckedChange={setFormEnabled} />
              <Label className="cursor-pointer" onClick={() => setFormEnabled(!formEnabled)}>
                {formEnabled ? t('rules.form.enabled') : t('rules.form.disabled')}
              </Label>
            </div>

            {/* ─── Conditions Builder ─────────────────────────────── */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Filter className="h-4 w-4 text-muted-foreground" />
                  <Label className="text-sm font-semibold">{t('rules.form.conditions')}</Label>
                </div>
                <div className="flex items-center gap-1.5">
                  <Button variant="outline" size="sm" className="gap-1 text-xs" onClick={addGroupToRoot}>
                    <FolderPlus className="h-3.5 w-3.5" />
                    {t('rules.form.addGroup')}
                  </Button>
                  <Button variant="outline" size="sm" className="gap-1 text-xs" onClick={addPredicateToRoot}>
                    <PlusCircle className="h-3.5 w-3.5" />
                    {t('rules.form.addCondition')}
                  </Button>
                </div>
              </div>

              {!formConditions || (formConditions.type === 'group' && formConditions.children.length === 0) ? (
                <div className="border border-dashed rounded-lg p-4 text-center text-sm text-muted-foreground">
                  {t('rules.form.noConditions')}
                </div>
              ) : (
                <ConditionTreeEditor
                  node={formConditions}
                  path={[]}
                  onChange={(updated) => setFormConditions(updated)}
                  onRemove={() => setFormConditions(null)}
                  depth={0}
                />
              )}
            </div>

            {/* ─── Actions Builder ────────────────────────────────── */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Zap className="h-4 w-4 text-muted-foreground" />
                  <Label className="text-sm font-semibold">{t('rules.form.actions')}</Label>
                </div>
              </div>

              {/* Action type picker */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {(Object.keys(ACTION_TYPE_META) as ActionType[]).map(type => {
                  const meta = ACTION_TYPE_META[type];
                  const Icon = meta.icon;
                  return (
                    <button
                      key={type}
                      onClick={() => addAction(type)}
                      className={`flex items-center gap-2 p-3 rounded-lg border border-dashed hover:border-solid transition-all text-sm font-medium ${meta.bg} ${meta.color} hover:shadow-sm`}
                    >
                      <Icon className="h-4 w-4" />
                      {type}
                    </button>
                  );
                })}
              </div>

              {/* Action list */}
              {formActions.length > 0 && (
                <div className="space-y-2">
                  {formActions.map((action, idx) => {
                    const meta = ACTION_TYPE_META[action.type];
                    const Icon = meta.icon;
                    return (
                      <div key={idx} className="flex items-center gap-3 bg-muted/40 rounded-lg p-3 border">
                        <div className={`h-8 w-8 rounded-md flex items-center justify-center shrink-0 ${meta.bg}`}>
                          <Icon className={`h-4 w-4 ${meta.color}`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-semibold mb-1.5">{meta.label}</div>
                          {action.type === 'ROUTE' && (
                            <Select value={action.endpointId || ''} onChange={(e) => updateAction(idx, { endpointId: e.target.value || undefined })}>
                              <option value="">{t('rules.form.selectEndpoint')}</option>
                              {endpoints.map(ep => <option key={ep.id} value={ep.id}>{ep.description || ep.url}</option>)}
                            </Select>
                          )}
                          {action.type === 'TRANSFORM' && (
                            <Select value={action.transformationId || ''} onChange={(e) => updateAction(idx, { transformationId: e.target.value || undefined })}>
                              <option value="">{t('rules.form.selectTransformation')}</option>
                              {transformations.map(tr => <option key={tr.id} value={tr.id}>{tr.name}</option>)}
                            </Select>
                          )}
                          {action.type === 'TAG' && (
                            <Input
                              placeholder={t('rules.form.tagPlaceholder')}
                              value={action.config?.tag as string || ''}
                              onChange={(e) => updateAction(idx, { config: { ...action.config, tag: e.target.value } })}
                              className="text-xs"
                            />
                          )}
                          {action.type === 'DROP' && (
                            <p className="text-xs text-muted-foreground">{t('rules.form.dropHint')}</p>
                          )}
                        </div>
                        <button onClick={() => removeAction(idx)} className="p-1.5 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors">
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>{t('common.cancel')}</Button>
            <Button
              onClick={handleSave}
              disabled={!formName.trim() || createMutation.isPending || updateMutation.isPending}
            >
              {(createMutation.isPending || updateMutation.isPending) && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              {editing ? t('common.save') : t('rules.createRule')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Delete Confirmation ─────────────────────────────────── */}
      <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('rules.deleteConfirm.title')}</AlertDialogTitle>
            <AlertDialogDescription>{t('rules.deleteConfirm.description')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {deleteMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              {t('common.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─── Condition Tree Display (read-only, expanded card) ──────────

function ConditionTreeDisplay({ node, depth }: { node: ConditionNode; depth: number }) {
  if (node.type === 'predicate') {
    return (
      <div className="flex items-center gap-2 text-sm bg-background rounded-lg px-3 py-2 border">
        <code className="text-primary font-mono text-xs">{node.field}</code>
        <Badge variant="outline" className="text-[10px] font-mono">{node.operator}</Badge>
        {!NO_VALUE_OPS.includes(node.operator) && (
          <code className="text-xs font-mono text-muted-foreground">{JSON.stringify(node.value)}</code>
        )}
      </div>
    );
  }

  // Group
  const opColors: Record<string, string> = {
    AND: 'border-blue-400/40 bg-blue-500/5',
    OR: 'border-amber-400/40 bg-amber-500/5',
    NOT: 'border-red-400/40 bg-red-500/5',
  };

  return (
    <div className={`rounded-lg border-l-2 pl-3 py-1.5 space-y-1.5 ${opColors[node.op] || 'border-gray-300'}`}>
      <Badge variant="outline" className="text-[10px] font-bold">{node.op}</Badge>
      {node.children.map((child, i) => (
        <ConditionTreeDisplay key={i} node={child} depth={depth + 1} />
      ))}
    </div>
  );
}

