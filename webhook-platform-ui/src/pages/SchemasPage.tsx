import { useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  FileJson2, Plus, Trash2, Loader2, ChevronRight, AlertTriangle,
  CheckCircle2, Clock, ArrowUpCircle, ArrowDownCircle, Search, Info,
  GitCompareArrows, Shield, ShieldAlert, ShieldCheck, Copy, Check,
  History
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import {
  useProject, useUpdateProject,
  useEventTypes, useCreateEventType, useDeleteEventType,
  useSchemaVersions, useCreateSchemaVersion, usePromoteSchema,
  useDeprecateSchema, useSchemaChanges, useProjectSchemaChanges
} from '../api/queries';
import { showApiError, showSuccess } from '../lib/toast';
import { formatDate } from '../lib/date';
import { cn } from '../lib/utils';
import type { EventTypeCatalogResponse, EventSchemaVersionResponse, SchemaChangeResponse } from '../api/schemas.api';

export default function SchemasPage() {
  const { t } = useTranslation();
  const { projectId } = useParams<{ projectId: string }>();
  const [selectedEventType, setSelectedEventType] = useState<EventTypeCatalogResponse | null>(null);
  const [search, setSearch] = useState('');

  if (!projectId) return null;

  return (
    <div className="p-6 lg:p-8">
      <div className="mb-6">
        <h1 className="text-title tracking-tight">{t('schemas.title')}</h1>
        <p className="text-sm text-muted-foreground mt-1">{t('schemas.subtitle')}</p>
      </div>

      <ValidationSettingsCard projectId={projectId} />

      <RecentChangesBoard projectId={projectId} />

      <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-6">
        <EventTypeCatalogPanel
          projectId={projectId}
          search={search}
          onSearchChange={setSearch}
          selected={selectedEventType}
          onSelect={setSelectedEventType}
        />
        <div>
          {selectedEventType ? (
            <EventTypeDetail
              projectId={projectId}
              eventType={selectedEventType}
              onDeleted={() => setSelectedEventType(null)}
            />
          ) : (
            <EmptyDetail />
          )}
        </div>
      </div>
    </div>
  );
}

// ── Left Panel: Event Type Catalog ──

function EventTypeCatalogPanel({
  projectId, search, onSearchChange, selected, onSelect
}: {
  projectId: string;
  search: string;
  onSearchChange: (v: string) => void;
  selected: EventTypeCatalogResponse | null;
  onSelect: (et: EventTypeCatalogResponse | null) => void;
}) {
  const { t } = useTranslation();
  const { data: eventTypes, isLoading } = useEventTypes(projectId);
  const createMutation = useCreateEventType(projectId);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');

  const filtered = (eventTypes || []).filter(et =>
    et.name.toLowerCase().includes(search.toLowerCase())
  );

  const handleCreate = async () => {
    if (!newName.trim()) return;
    try {
      const created = await createMutation.mutateAsync({ name: newName.trim(), description: newDesc.trim() || undefined });
      setNewName('');
      setNewDesc('');
      setShowCreate(false);
      onSelect(created);
      showSuccess(t('schemas.eventTypeCreated'));
    } catch (err: any) {
      showApiError(err, 'schemas.createFailed');
    }
  };

  return (
    <Card className="h-fit">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileJson2 className="h-5 w-5 text-primary" />
            <CardTitle className="text-base">{t('schemas.eventTypes')}</CardTitle>
          </div>
          <Button size="sm" variant="outline" onClick={() => setShowCreate(!showCreate)}>
            <Plus className="h-3.5 w-3.5 mr-1" />
            {t('schemas.addType')}
          </Button>
        </div>
      </CardHeader>

      {showCreate && (
        <div className="px-6 pb-4">
          <div className="p-3 border rounded-lg bg-muted/30 space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">{t('schemas.eventTypeName')}</Label>
              <Input
                value={newName}
                onChange={e => setNewName(e.target.value)}
                placeholder="order.created"
                className="h-8 text-sm"
              />
              <p className="text-[11px] text-muted-foreground">{t('schemas.eventTypeNameHint')}</p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">{t('schemas.description')}</Label>
              <Input
                value={newDesc}
                onChange={e => setNewDesc(e.target.value)}
                placeholder={t('schemas.descriptionPlaceholder')}
                className="h-8 text-sm"
              />
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={handleCreate} disabled={!newName.trim() || createMutation.isPending}>
                {createMutation.isPending && <Loader2 className="h-3 w-3 animate-spin mr-1" />}
                {t('common.create')}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => { setShowCreate(false); setNewName(''); setNewDesc(''); }}>
                {t('common.cancel')}
              </Button>
            </div>
          </div>
        </div>
      )}

      <div className="px-6 pb-3">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={e => onSearchChange(e.target.value)}
            placeholder={t('schemas.searchTypes')}
            className="h-8 text-sm pl-8"
          />
        </div>
      </div>

      <CardContent className="pt-0 max-h-[600px] overflow-y-auto">
        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-8">
            <FileJson2 className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">
              {search ? t('schemas.noSearchResults') : t('schemas.noEventTypes')}
            </p>
            {!search && (
              <p className="text-xs text-muted-foreground/70 mt-1">{t('schemas.noEventTypesHint')}</p>
            )}
          </div>
        ) : (
          <div className="space-y-1">
            {filtered.map(et => (
              <button
                key={et.id}
                onClick={() => onSelect(et)}
                className={cn(
                  "w-full text-left px-3 py-2.5 rounded-lg transition-all text-sm group",
                  selected?.id === et.id
                    ? "bg-primary/10 border border-primary/20"
                    : "hover:bg-accent border border-transparent"
                )}
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono font-medium text-[13px] truncate">{et.name}</span>
                  <ChevronRight className={cn(
                    "h-3.5 w-3.5 text-muted-foreground flex-shrink-0 transition-transform",
                    selected?.id === et.id && "text-primary rotate-90"
                  )} />
                </div>
                <div className="flex items-center gap-2 mt-1">
                  {et.latestVersion != null && (
                    <span className="text-[11px] text-muted-foreground">v{et.latestVersion}</span>
                  )}
                  {et.activeVersionStatus === 'ACTIVE' && (
                    <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-green-700 dark:text-green-400 bg-green-100 dark:bg-green-900/30 px-1.5 py-0.5 rounded-full">
                      <CheckCircle2 className="h-2.5 w-2.5" />
                      Active
                    </span>
                  )}
                  {et.hasBreakingChanges && (
                    <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/30 px-1.5 py-0.5 rounded-full">
                      <AlertTriangle className="h-2.5 w-2.5" />
                      Breaking
                    </span>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Right Panel: Event Type Detail ──

function EventTypeDetail({
  projectId, eventType, onDeleted
}: {
  projectId: string;
  eventType: EventTypeCatalogResponse;
  onDeleted: () => void;
}) {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<'versions' | 'changes'>('versions');
  const deleteMutation = useDeleteEventType(projectId);

  const handleDelete = async () => {
    if (!confirm(t('schemas.confirmDelete', { name: eventType.name }))) return;
    try {
      await deleteMutation.mutateAsync(eventType.id);
      onDeleted();
      showSuccess(t('schemas.eventTypeDeleted'));
    } catch (err: any) {
      showApiError(err, 'schemas.deleteFailed');
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between">
            <div>
              <CardTitle className="font-mono text-lg">{eventType.name}</CardTitle>
              {eventType.description && (
                <CardDescription className="mt-1">{eventType.description}</CardDescription>
              )}
            </div>
            <Button
              size="sm"
              variant="ghost"
              className="text-destructive hover:text-destructive hover:bg-destructive/10"
              onClick={handleDelete}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
            </Button>
          </div>
          <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
            <span>{t('schemas.created')}: {formatDate(eventType.createdAt)}</span>
            {eventType.latestVersion != null && (
              <span>{t('schemas.latestVersion')}: v{eventType.latestVersion}</span>
            )}
          </div>
        </CardHeader>
      </Card>

      {/* Tabs */}
      <div className="flex gap-1 border-b">
        <button
          onClick={() => setActiveTab('versions')}
          className={cn(
            "px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px",
            activeTab === 'versions'
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          )}
        >
          <Shield className="h-3.5 w-3.5 inline mr-1.5" />
          {t('schemas.versions')}
        </button>
        <button
          onClick={() => setActiveTab('changes')}
          className={cn(
            "px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px",
            activeTab === 'changes'
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          )}
        >
          <GitCompareArrows className="h-3.5 w-3.5 inline mr-1.5" />
          {t('schemas.changeHistory')}
        </button>
      </div>

      {activeTab === 'versions' ? (
        <VersionsTab projectId={projectId} eventType={eventType} />
      ) : (
        <ChangesTab projectId={projectId} eventType={eventType} />
      )}
    </div>
  );
}

// ── Versions Tab ──

function VersionsTab({ projectId, eventType }: { projectId: string; eventType: EventTypeCatalogResponse }) {
  const { t } = useTranslation();
  const { data: versions, isLoading } = useSchemaVersions(projectId, eventType.id);
  const createMutation = useCreateSchemaVersion(projectId, eventType.id);
  const promoteMutation = usePromoteSchema(projectId, eventType.id);
  const deprecateMutation = useDeprecateSchema(projectId, eventType.id);
  const [showUpload, setShowUpload] = useState(false);
  const [schemaInput, setSchemaInput] = useState('');
  const [versionDesc, setVersionDesc] = useState('');
  const [expandedVersion, setExpandedVersion] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleUpload = async () => {
    try {
      JSON.parse(schemaInput);
    } catch {
      showApiError({ response: { data: { message: t('schemas.invalidJson') } } }, 'schemas.invalidJson');
      return;
    }
    try {
      await createMutation.mutateAsync({
        schemaJson: schemaInput,
        description: versionDesc.trim() || undefined,
      });
      setSchemaInput('');
      setVersionDesc('');
      setShowUpload(false);
      showSuccess(t('schemas.versionCreated'));
    } catch (err: any) {
      showApiError(err, 'schemas.createVersionFailed');
    }
  };

  const handlePromote = async (versionId: string) => {
    try {
      await promoteMutation.mutateAsync(versionId);
      showSuccess(t('schemas.versionPromoted'));
    } catch (err: any) {
      showApiError(err, 'schemas.promoteFailed');
    }
  };

  const handleDeprecate = async (versionId: string) => {
    try {
      await deprecateMutation.mutateAsync(versionId);
      showSuccess(t('schemas.versionDeprecated'));
    } catch (err: any) {
      showApiError(err, 'schemas.deprecateFailed');
    }
  };

  const copySchema = (schema: string, id: string) => {
    navigator.clipboard.writeText(schema);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const statusConfig: Record<string, { icon: React.ElementType; color: string; bg: string }> = {
    ACTIVE: { icon: ShieldCheck, color: 'text-green-700 dark:text-green-400', bg: 'bg-green-100 dark:bg-green-900/30' },
    DRAFT: { icon: Clock, color: 'text-blue-700 dark:text-blue-400', bg: 'bg-blue-100 dark:bg-blue-900/30' },
    DEPRECATED: { icon: ShieldAlert, color: 'text-gray-600 dark:text-gray-400', bg: 'bg-gray-100 dark:bg-gray-800/50' },
  };

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setShowUpload(!showUpload)}>
          <Plus className="h-3.5 w-3.5 mr-1" />
          {t('schemas.uploadSchema')}
        </Button>
      </div>

      {showUpload && (
        <Card>
          <CardContent className="pt-4 space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">{t('schemas.jsonSchema')}</Label>
              <textarea
                value={schemaInput}
                onChange={e => setSchemaInput(e.target.value)}
                placeholder={`{\n  "type": "object",\n  "properties": {\n    "id": { "type": "string" },\n    "amount": { "type": "number" }\n  },\n  "required": ["id", "amount"]\n}`}
                className="w-full h-48 rounded-lg border bg-muted/30 px-3 py-2 text-sm font-mono resize-y focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">{t('schemas.versionNote')}</Label>
              <Input
                value={versionDesc}
                onChange={e => setVersionDesc(e.target.value)}
                placeholder={t('schemas.versionNotePlaceholder')}
                className="h-8 text-sm"
              />
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" onClick={handleUpload} disabled={!schemaInput.trim() || createMutation.isPending}>
                {createMutation.isPending && <Loader2 className="h-3 w-3 animate-spin mr-1" />}
                {t('schemas.uploadVersion')}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => { setShowUpload(false); setSchemaInput(''); setVersionDesc(''); }}>
                {t('common.cancel')}
              </Button>
              <div className="flex-1" />
              <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <Info className="h-3 w-3" />
                {t('schemas.uploadHint')}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : !versions?.length ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Shield className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">{t('schemas.noVersions')}</p>
            <p className="text-xs text-muted-foreground/70 mt-1">{t('schemas.noVersionsHint')}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {versions.map((v: EventSchemaVersionResponse) => {
            const sc = statusConfig[v.status] || statusConfig.DRAFT;
            const Icon = sc.icon;
            const isExpanded = expandedVersion === v.id;

            return (
              <Card key={v.id} className={cn(v.status === 'ACTIVE' && 'border-green-200 dark:border-green-800/40')}>
                <div
                  className="px-4 py-3 cursor-pointer hover:bg-accent/30 transition-colors"
                  onClick={() => setExpandedVersion(isExpanded ? null : v.id)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-mono font-semibold">v{v.version}</span>
                      <span className={cn('inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full', sc.color, sc.bg)}>
                        <Icon className="h-3 w-3" />
                        {v.status}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      {v.status === 'DRAFT' && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs text-green-700 border-green-200 hover:bg-green-50 dark:text-green-400 dark:border-green-800 dark:hover:bg-green-900/30"
                          onClick={e => { e.stopPropagation(); handlePromote(v.id); }}
                          disabled={promoteMutation.isPending}
                        >
                          <ArrowUpCircle className="h-3 w-3 mr-1" />
                          {t('schemas.promote')}
                        </Button>
                      )}
                      {v.status === 'ACTIVE' && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs"
                          onClick={e => { e.stopPropagation(); handleDeprecate(v.id); }}
                          disabled={deprecateMutation.isPending}
                        >
                          <ArrowDownCircle className="h-3 w-3 mr-1" />
                          {t('schemas.deprecate')}
                        </Button>
                      )}
                      <ChevronRight className={cn("h-4 w-4 text-muted-foreground transition-transform", isExpanded && "rotate-90")} />
                    </div>
                  </div>
                  <div className="flex items-center gap-4 mt-1 text-[11px] text-muted-foreground">
                    <span>{formatDate(v.createdAt)}</span>
                    <span className="font-mono">fp: {v.fingerprint.slice(0, 12)}…</span>
                    {v.description && <span className="truncate max-w-[200px]">{v.description}</span>}
                  </div>
                </div>

                {isExpanded && (
                  <div className="border-t">
                    <div className="p-4">
                      <div className="flex items-center justify-between mb-2">
                        <Label className="text-xs font-medium">{t('schemas.jsonSchema')}</Label>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 text-xs"
                          onClick={() => copySchema(v.schemaJson, v.id)}
                        >
                          {copiedId === v.id ? <Check className="h-3 w-3 mr-1 text-green-600" /> : <Copy className="h-3 w-3 mr-1" />}
                          {copiedId === v.id ? t('common.copied') : t('schemas.copySchema')}
                        </Button>
                      </div>
                      <pre className="bg-muted/50 border rounded-lg p-3 text-xs font-mono overflow-x-auto max-h-64 whitespace-pre-wrap">
                        {formatJson(v.schemaJson)}
                      </pre>
                    </div>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Changes Tab ──

function ChangesTab({ projectId, eventType }: { projectId: string; eventType: EventTypeCatalogResponse }) {
  const { t } = useTranslation();
  const { data: changes, isLoading } = useSchemaChanges(projectId, eventType.id);

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!changes?.length) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <GitCompareArrows className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">{t('schemas.noChanges')}</p>
          <p className="text-xs text-muted-foreground/70 mt-1">{t('schemas.noChangesHint')}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-2">
      {changes.map((c: SchemaChangeResponse) => {
        const summary = parseChangeSummary(c.changeSummary);
        return (
          <Card key={c.id} className={cn(c.breaking && 'border-amber-200 dark:border-amber-800/40')}>
            <CardContent className="py-3 px-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-mono font-medium">
                    {c.fromVersion != null ? `v${c.fromVersion}` : '—'} → v{c.toVersion}
                  </span>
                  {c.breaking && (
                    <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/30 px-1.5 py-0.5 rounded-full">
                      <AlertTriangle className="h-2.5 w-2.5" />
                      {t('schemas.breakingChange')}
                    </span>
                  )}
                </div>
                <span className="text-[11px] text-muted-foreground">{formatDate(c.createdAt)}</span>
              </div>

              <div className="space-y-1.5">
                {summary.added.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {summary.added.map((f: any, i: number) => (
                      <span key={i} className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-800/40">
                        <Plus className="h-2.5 w-2.5" />
                        <span className="font-mono">{f.path}</span>
                        <span className="text-green-600 dark:text-green-500">({f.type})</span>
                        {f.required && <span className="text-amber-600 dark:text-amber-400 font-medium">req</span>}
                      </span>
                    ))}
                  </div>
                )}
                {summary.removed.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {summary.removed.map((f: any, i: number) => (
                      <span key={i} className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800/40">
                        <Trash2 className="h-2.5 w-2.5" />
                        <span className="font-mono">{f.path}</span>
                      </span>
                    ))}
                  </div>
                )}
                {summary.changed.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {summary.changed.map((f: any, i: number) => (
                      <span key={i} className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800/40">
                        <GitCompareArrows className="h-2.5 w-2.5" />
                        <span className="font-mono">{f.path}</span>
                        <span>{f.oldType} → {f.type}</span>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

// ── Recent Changes Board ──

function RecentChangesBoard({ projectId }: { projectId: string }) {
  const { t } = useTranslation();
  const { data: changes, isLoading } = useProjectSchemaChanges(projectId);
  const [expanded, setExpanded] = useState(false);

  if (isLoading || !changes?.length) return null;

  const breakingCount = changes.filter(c => c.breaking).length;
  const shown = expanded ? changes : changes.slice(0, 5);

  return (
    <Card className="mb-6">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <History className="h-4.5 w-4.5 text-primary" />
            <CardTitle className="text-base">{t('schemas.board.title')}</CardTitle>
            <span className="text-xs text-muted-foreground ml-1">
              ({changes.length})
            </span>
            {breakingCount > 0 && (
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-700 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/30 px-2 py-0.5 rounded-full">
                <AlertTriangle className="h-2.5 w-2.5" />
                {breakingCount} {t('schemas.board.breakingCount')}
              </span>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="relative">
          {/* Timeline line */}
          <div className="absolute left-[11px] top-1 bottom-1 w-px bg-border" />

          <div className="space-y-0">
            {shown.map((c) => {
              const summary = parseChangeSummary(c.changeSummary);
              const addedCount = summary.added.length;
              const removedCount = summary.removed.length;
              const changedCount = summary.changed.length;

              return (
                <div key={c.id} className="relative flex gap-3 py-2 group">
                  {/* Timeline dot */}
                  <div className={cn(
                    "relative z-10 mt-1.5 h-[9px] w-[9px] rounded-full border-2 flex-shrink-0",
                    c.breaking
                      ? "border-amber-500 bg-amber-200 dark:bg-amber-800"
                      : "border-primary/50 bg-background"
                  )} />

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[12px] font-mono font-semibold text-foreground">
                        {c.eventTypeName || 'unknown'}
                      </span>
                      <span className="text-[11px] text-muted-foreground font-mono">
                        {c.fromVersion != null ? `v${c.fromVersion}` : '—'} → v{c.toVersion}
                      </span>
                      {c.breaking && (
                        <span className="inline-flex items-center gap-0.5 text-[9px] font-bold text-amber-700 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/30 px-1.5 py-0.5 rounded">
                          BREAKING
                        </span>
                      )}
                      <span className="text-[10px] text-muted-foreground/60 ml-auto flex-shrink-0">
                        {formatDate(c.createdAt)}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 mt-0.5">
                      {addedCount > 0 && (
                        <span className="text-[10px] text-green-700 dark:text-green-400">
                          +{addedCount} {t('schemas.board.added')}
                        </span>
                      )}
                      {removedCount > 0 && (
                        <span className="text-[10px] text-red-700 dark:text-red-400">
                          −{removedCount} {t('schemas.board.removed')}
                        </span>
                      )}
                      {changedCount > 0 && (
                        <span className="text-[10px] text-amber-700 dark:text-amber-400">
                          ~{changedCount} {t('schemas.board.changed')}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {changes.length > 5 && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="mt-2 text-xs text-primary hover:underline"
          >
            {expanded ? t('schemas.board.showLess') : t('schemas.board.showAll', { count: changes.length })}
          </button>
        )}
      </CardContent>
    </Card>
  );
}

// ── Validation Settings Card ──

function ValidationSettingsCard({ projectId }: { projectId: string }) {
  const { t } = useTranslation();
  const { data: project } = useProject(projectId);
  const updateMutation = useUpdateProject(projectId);

  if (!project) return null;

  const handleToggle = async () => {
    try {
      await updateMutation.mutateAsync({
        name: project.name,
        description: project.description,
        schemaValidationEnabled: !project.schemaValidationEnabled,
        schemaValidationPolicy: project.schemaValidationPolicy,
      });
      showSuccess(t('schemas.validation.saved'));
    } catch (err: any) {
      showApiError(err, 'schemas.validation.saved');
    }
  };

  const handlePolicyChange = async (policy: string) => {
    try {
      await updateMutation.mutateAsync({
        name: project.name,
        description: project.description,
        schemaValidationEnabled: project.schemaValidationEnabled,
        schemaValidationPolicy: policy,
      });
      showSuccess(t('schemas.validation.saved'));
    } catch (err: any) {
      showApiError(err, 'schemas.validation.saved');
    }
  };

  return (
    <Card className="mb-6">
      <CardContent className="py-4 px-5">
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className={cn(
              "h-9 w-9 rounded-lg flex items-center justify-center flex-shrink-0",
              project.schemaValidationEnabled
                ? "bg-green-100 dark:bg-green-900/30"
                : "bg-muted"
            )}>
              <ShieldCheck className={cn(
                "h-4.5 w-4.5",
                project.schemaValidationEnabled
                  ? "text-green-700 dark:text-green-400"
                  : "text-muted-foreground"
              )} />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium">{t('schemas.validation.title')}</p>
              <p className="text-xs text-muted-foreground truncate">{t('schemas.validation.enabledHint')}</p>
            </div>
          </div>

          <div className="flex items-center gap-3 flex-shrink-0">
            {project.schemaValidationEnabled && (
              <div className="flex gap-1 rounded-lg border p-0.5">
                <button
                  onClick={() => handlePolicyChange('WARN')}
                  disabled={updateMutation.isPending}
                  className={cn(
                    "px-3 py-1 text-xs font-medium rounded-md transition-colors",
                    project.schemaValidationPolicy === 'WARN'
                      ? "bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  Warn
                </button>
                <button
                  onClick={() => handlePolicyChange('BLOCK')}
                  disabled={updateMutation.isPending}
                  className={cn(
                    "px-3 py-1 text-xs font-medium rounded-md transition-colors",
                    project.schemaValidationPolicy === 'BLOCK'
                      ? "bg-red-100 dark:bg-red-900/40 text-red-800 dark:text-red-300"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  Block
                </button>
              </div>
            )}

            <button
              onClick={handleToggle}
              disabled={updateMutation.isPending}
              className={cn(
                "relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
                project.schemaValidationEnabled ? "bg-green-600" : "bg-muted-foreground/30"
              )}
            >
              <span className={cn(
                "inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform",
                project.schemaValidationEnabled ? "translate-x-6" : "translate-x-1"
              )} />
            </button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Empty state ──

function EmptyDetail() {
  const { t } = useTranslation();
  return (
    <Card className="h-[400px] flex items-center justify-center">
      <div className="text-center">
        <FileJson2 className="h-12 w-12 text-muted-foreground/20 mx-auto mb-4" />
        <p className="text-sm text-muted-foreground">{t('schemas.selectEventType')}</p>
        <p className="text-xs text-muted-foreground/70 mt-1">{t('schemas.selectEventTypeHint')}</p>
      </div>
    </Card>
  );
}

// ── Helpers ──

function formatJson(json: string): string {
  try {
    return JSON.stringify(JSON.parse(json), null, 2);
  } catch {
    return json;
  }
}

function parseChangeSummary(summary: string): { added: any[]; removed: any[]; changed: any[]; breaking: boolean } {
  try {
    const parsed = typeof summary === 'string' ? JSON.parse(summary) : summary;
    return {
      added: parsed.added || [],
      removed: parsed.removed || [],
      changed: parsed.changed || [],
      breaking: parsed.breaking || false,
    };
  } catch {
    return { added: [], removed: [], changed: [], breaking: false };
  }
}
