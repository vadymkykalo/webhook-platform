import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { Plus, Key, Loader2, Trash2, Copy, Check, ChevronLeft, ChevronRight, AlertTriangle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { showApiError, showSuccess } from '../lib/toast';
import { formatDateTimeShort, formatRelativeTime } from '../lib/date';
import PageSkeleton, { SkeletonRows } from '../components/PageSkeleton';
import PageHeader from '../components/PageHeader';
import EmptyState, { ErrorState } from '../components/EmptyState';
import StatusBadge from '../components/StatusBadge';
import PermissionGate from '../components/PermissionGate';
import DangerConfirmDialog from '../components/DangerConfirmDialog';
import { apiKeysApi, ApiKeyResponse, ApiKeyScope } from '../api/apiKeys.api';
import { projectsApi } from '../api/projects.api';
import type { ProjectResponse, PageResponse } from '../types/api.types';
import { cn } from '../lib/utils';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Select } from '../components/ui/select';
import { Card, CardContent } from '../components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../components/ui/dialog';
import { usePermissions } from '../auth/usePermissions';

const SCOPES: ApiKeyScope[] = ['READ_WRITE', 'READ_ONLY'];
const PAGE_SIZE = 20;

/** A key is identified by its prefix and nothing else once it has been issued. */
function KeyFingerprint({ prefix }: { prefix: string }) {
  return (
    <span className="font-mono text-[13px] text-muted-foreground">
      {prefix}
      <span aria-hidden>{'•'.repeat(12)}</span>
    </span>
  );
}

export default function ApiKeysPage() {
  const { t } = useTranslation();
  const { projectId } = useParams<{ projectId: string }>();
  const { canManageApiKeys } = usePermissions();

  const [project, setProject] = useState<ProjectResponse | null>(null);
  const [apiKeys, setApiKeys] = useState<ApiKeyResponse[]>([]);
  const [pageInfo, setPageInfo] = useState<PageResponse<ApiKeyResponse> | null>(null);
  const [currentPage, setCurrentPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<unknown>(null);

  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [name, setName] = useState('');
  const [scope, setScope] = useState<ApiKeyScope>('READ_WRITE');
  const [expiresIn, setExpiresIn] = useState('');
  const [creating, setCreating] = useState(false);

  const [revoking, setRevoking] = useState<ApiKeyResponse | null>(null);
  const [revokePending, setRevokePending] = useState(false);
  const [newApiKey, setNewApiKey] = useState<ApiKeyResponse | null>(null);
  const [copied, setCopied] = useState(false);

  const loadData = useCallback(async () => {
    if (!projectId) return;
    try {
      setLoading(true);
      const [projectData, apiKeysData] = await Promise.all([
        projectsApi.get(projectId),
        apiKeysApi.listPaged(projectId, currentPage, PAGE_SIZE),
      ]);
      setProject(projectData);
      setApiKeys(apiKeysData.content);
      setPageInfo(apiKeysData);
      setLoadError(null);
    } catch (err: any) {
      setLoadError(err);
    } finally {
      setLoading(false);
    }
  }, [projectId, currentPage]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectId) return;
    setCreating(true);
    try {
      let expiresAt: string | undefined;
      if (expiresIn) {
        const d = new Date();
        d.setDate(d.getDate() + parseInt(expiresIn));
        expiresAt = d.toISOString();
      }
      const response = await apiKeysApi.create(projectId, { name, scope, expiresAt });
      setShowCreateDialog(false);
      setName('');
      setScope('READ_WRITE');
      setExpiresIn('');
      setCopied(false);
      setNewApiKey(response);
      loadData();
    } catch (err: any) {
      showApiError(err, 'apiKeys.toast.createFailed');
    } finally {
      setCreating(false);
    }
  };

  const handleRevoke = async () => {
    if (!revoking || !projectId) return;
    setRevokePending(true);
    try {
      await apiKeysApi.revoke(projectId, revoking.id);
      showSuccess(t('apiKeys.toast.revoked'));
      setRevoking(null);
      loadData();
    } catch (err: any) {
      showApiError(err, 'apiKeys.toast.revokeFailed');
    } finally {
      setRevokePending(false);
    }
  };

  const handleCopyKey = () => {
    if (!newApiKey?.key) return;
    navigator.clipboard.writeText(newApiKey.key);
    setCopied(true);
    showSuccess(t('apiKeys.toast.copied'));
  };

  if (loading) {
    return (
      <PageSkeleton>
        <SkeletonRows count={3} height="h-24" />
      </PageSkeleton>
    );
  }

  if (loadError || !project) {
    return (
      <div className="p-4 lg:p-6">
        <ErrorState error={loadError} fallbackKey="apiKeys.toast.loadFailed" onRetry={loadData} />
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-6">
      <PageHeader
        eyebrow={project.name}
        title={t('apiKeys.title')}
        description={t('apiKeys.subtitlePlain')}
        actions={
          <PermissionGate allowed={canManageApiKeys}>
            <Button onClick={() => setShowCreateDialog(true)}>
              <Plus className="h-4 w-4" aria-hidden /> {t('apiKeys.createKey')}
            </Button>
          </PermissionGate>
        }
      />

      {apiKeys.length === 0 ? (
        <EmptyState
          icon={Key}
          title={t('apiKeys.noKeys')}
          description={canManageApiKeys ? t('apiKeys.noKeysDesc') : t('apiKeys.noKeysDescViewer')}
          action={canManageApiKeys ? (
            <Button onClick={() => setShowCreateDialog(true)}>
              <Plus className="h-4 w-4" aria-hidden /> {t('apiKeys.createKey')}
            </Button>
          ) : undefined}
        />
      ) : (
        <div className="animate-fade-in space-y-3">
          {apiKeys.map((apiKey) => {
            const expired = !!apiKey.expiresAt && new Date(apiKey.expiresAt) < new Date();
            return (
              <Card key={apiKey.id}>
                <CardContent className="flex flex-wrap items-start justify-between gap-4 p-4 lg:p-5">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-medium">{apiKey.name}</p>
                      <StatusBadge
                        kind={expired ? 'halt' : 'ok'}
                        label={t(expired ? 'apiKeys.expired' : 'apiKeys.activeKey')}
                      />
                      <span className="rounded-md border border-rail px-2 py-0.5 font-mono text-[11px] text-muted-foreground">
                        {t(apiKey.scope === 'READ_ONLY' ? 'apiKeys.scopeReadOnly' : 'apiKeys.scopeReadWrite')}
                      </span>
                    </div>
                    <div className="mt-1.5">
                      <KeyFingerprint prefix={apiKey.keyPrefix} />
                    </div>
                    <dl className="mt-2.5 flex flex-wrap gap-x-5 gap-y-1 text-[11px]">
                      <div className="flex gap-1.5">
                        <dt className="mono-label">{t('apiKeys.created')}</dt>
                        <dd className="text-muted-foreground">{formatDateTimeShort(apiKey.createdAt)}</dd>
                      </div>
                      <div className="flex gap-1.5">
                        <dt className="mono-label">{t('apiKeys.lastUsed')}</dt>
                        <dd className="text-muted-foreground">
                          {apiKey.lastUsedAt ? formatRelativeTime(apiKey.lastUsedAt) : t('apiKeys.never')}
                        </dd>
                      </div>
                      <div className="flex gap-1.5">
                        <dt className="mono-label">{t('apiKeys.expires')}</dt>
                        <dd className={cn('text-muted-foreground', expired && 'text-halt')}>
                          {apiKey.expiresAt ? formatDateTimeShort(apiKey.expiresAt) : t('apiKeys.createDialog.noExpiration')}
                        </dd>
                      </div>
                    </dl>
                  </div>
                  {canManageApiKeys && (
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => setRevoking(apiKey)}
                      title={t('apiKeys.revoke')}
                      aria-label={t('apiKeys.revokeNamed', { name: apiKey.name })}
                      className="flex-shrink-0 text-muted-foreground hover:text-halt"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </CardContent>
              </Card>
            );
          })}

          {pageInfo && pageInfo.totalPages > 1 && (
            <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
              <p className="text-sm text-muted-foreground">
                {t('common.showing', {
                  from: currentPage * PAGE_SIZE + 1,
                  to: Math.min((currentPage + 1) * PAGE_SIZE, pageInfo.totalElements),
                  total: pageInfo.totalElements,
                })}
              </p>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => setCurrentPage((p) => p - 1)} disabled={pageInfo.first}>
                  <ChevronLeft className="h-4 w-4" aria-hidden /> {t('common.previous')}
                </Button>
                <span className="px-1 font-mono text-xs text-muted-foreground">
                  {currentPage + 1} / {pageInfo.totalPages}
                </span>
                <Button variant="outline" size="sm" onClick={() => setCurrentPage((p) => p + 1)} disabled={pageInfo.last}>
                  {t('common.next')} <ChevronRight className="h-4 w-4" aria-hidden />
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Create */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t('apiKeys.createDialog.title')}</DialogTitle>
            <DialogDescription>{t('apiKeys.createDialog.description')}</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreate}>
            <div className="space-y-5 py-4">
              <div className="space-y-2">
                <Label htmlFor="key-name">{t('apiKeys.createDialog.name')}</Label>
                <Input
                  id="key-name"
                  placeholder={t('apiKeys.createDialog.namePlaceholder')}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  disabled={creating}
                  autoFocus
                />
                <p className="text-xs text-muted-foreground">{t('apiKeys.createDialog.nameHint')}</p>
              </div>

              <div className="space-y-2">
                <span className="text-sm font-medium leading-none">{t('apiKeys.createDialog.scope')}</span>
                <div role="radiogroup" aria-label={t('apiKeys.createDialog.scope')} className="grid gap-2.5 sm:grid-cols-2">
                  {SCOPES.map((s) => (
                    <button
                      key={s}
                      type="button"
                      role="radio"
                      aria-checked={scope === s}
                      disabled={creating}
                      onClick={() => setScope(s)}
                      className={cn(
                        'rounded-lg border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                        scope === s ? 'border-primary bg-accent/40' : 'border-rail bg-card hover:border-primary/40'
                      )}
                    >
                      <span className="flex items-center gap-2 text-sm font-medium">
                        {t(s === 'READ_ONLY' ? 'apiKeys.scopeReadOnly' : 'apiKeys.scopeReadWrite')}
                        {scope === s && <Check className="ml-auto h-4 w-4 text-primary" aria-hidden />}
                      </span>
                      <span className="mt-1 block text-xs leading-snug text-muted-foreground">
                        {t(s === 'READ_ONLY' ? 'apiKeys.createDialog.scopeReadOnlyHint' : 'apiKeys.createDialog.scopeReadWriteHint')}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="key-expiry">{t('apiKeys.createDialog.expiration')}</Label>
                <Select id="key-expiry" value={expiresIn} onChange={(e) => setExpiresIn(e.target.value)} disabled={creating}>
                  <option value="">{t('apiKeys.createDialog.noExpiration')}</option>
                  <option value="7">{t('apiKeys.createDialog.expires7d')}</option>
                  <option value="30">{t('apiKeys.createDialog.expires30d')}</option>
                  <option value="90">{t('apiKeys.createDialog.expires90d')}</option>
                  <option value="365">{t('apiKeys.createDialog.expires1y')}</option>
                </Select>
                <p className="text-xs text-muted-foreground">{t('apiKeys.createDialog.expirationHint')}</p>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowCreateDialog(false)} disabled={creating}>
                {t('common.cancel')}
              </Button>
              <Button type="submit" disabled={creating}>
                {creating && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
                {creating ? t('apiKeys.createDialog.submitting') : t('apiKeys.createDialog.submit')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Revoke */}
      <DangerConfirmDialog
        open={!!revoking}
        onOpenChange={(open) => !open && setRevoking(null)}
        title={t('apiKeys.revokeDialog.title')}
        description={t('apiKeys.revokeDialog.description')}
        confirmName={revoking?.name ?? ''}
        impact={[
          t('apiKeys.revokeDialog.impactImmediate'),
          t('apiKeys.revokeDialog.impactCallers'),
          t('apiKeys.revokeDialog.impactPermanent'),
        ]}
        onConfirm={handleRevoke}
        loading={revokePending}
        confirmLabel={t('apiKeys.revoke')}
      />

      {/* The one and only sighting of the secret. */}
      <Dialog open={!!newApiKey} onOpenChange={(open) => { if (!open) { setNewApiKey(null); setCopied(false); } }}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t('apiKeys.keyDialog.title', { name: newApiKey?.name ?? '' })}</DialogTitle>
            <DialogDescription>{t('apiKeys.keyDialog.description')}</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <p className="flex items-start gap-2.5 rounded-lg border border-retry/40 bg-retry-soft p-3.5 text-sm font-medium text-retry">
              <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" aria-hidden />
              {t('apiKeys.keyDialog.onlyChance')}
            </p>

            <div className="space-y-2">
              <Label htmlFor="new-key">{t('apiKeys.keyDialog.label')}</Label>
              <div className="rounded-lg border border-rail bg-secondary/60 p-3">
                <code id="new-key" className="block break-all font-mono text-[13px] leading-relaxed">
                  {newApiKey?.key}
                </code>
              </div>
              <Button
                type="button"
                onClick={handleCopyKey}
                variant={copied ? 'success' : 'default'}
                className="w-full"
              >
                {copied ? <Check className="h-4 w-4" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}
                {t(copied ? 'apiKeys.keyDialog.copied' : 'apiKeys.keyDialog.copyKey')}
              </Button>
            </div>

            <div className="space-y-1.5">
              <p className="mono-label">{t('apiKeys.keyDialog.howToUse')}</p>
              <pre className="overflow-x-auto rounded-lg border border-rail bg-secondary/60 p-3 font-mono text-[11px] leading-relaxed text-muted-foreground">
{`curl -X POST https://your-domain.com/api/v1/events \\
  -H "X-API-Key: $HOOKFLOW_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"type":"user.created","data":{"userId":"123"}}'`}
              </pre>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant={copied ? 'default' : 'outline'}
              onClick={() => { setNewApiKey(null); setCopied(false); }}
            >
              {t('apiKeys.keyDialog.done')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
