import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Plus, Key, Calendar, Loader2, Trash2, Copy, Eye, EyeOff, ChevronLeft, ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { showApiError, showSuccess } from '../lib/toast';
import { formatDateTimeShort, formatRelativeTime } from '../lib/date';
import PageSkeleton, { SkeletonRows } from '../components/PageSkeleton';
import EmptyState from '../components/EmptyState';
import { apiKeysApi, ApiKeyResponse } from '../api/apiKeys.api';
import { projectsApi } from '../api/projects.api';
import type { ProjectResponse, PageResponse } from '../types/api.types';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Card, CardContent } from '../components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../components/ui/dialog';
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
import { usePermissions } from '../auth/usePermissions';

export default function ApiKeysPage() {
  const { t } = useTranslation();
  const { projectId } = useParams<{ projectId: string }>();
  const { canManageApiKeys } = usePermissions();
  const [project, setProject] = useState<ProjectResponse | null>(null);
  const [apiKeys, setApiKeys] = useState<ApiKeyResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);
  const [revokeId, setRevokeId] = useState<string | null>(null);
  const [revoking, setRevoking] = useState(false);
  const [newApiKey, setNewApiKey] = useState<ApiKeyResponse | null>(null);
  const [showKey, setShowKey] = useState(false);
  const [currentPage, setCurrentPage] = useState(0);
  const [pageInfo, setPageInfo] = useState<PageResponse<ApiKeyResponse> | null>(null);
  const PAGE_SIZE = 20;

  useEffect(() => {
    if (projectId) {
      loadData();
    }
  }, [projectId, currentPage]);

  const loadData = async () => {
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
    } catch (err: any) {
      showApiError(err, 'apiKeys.toast.loadFailed', { retry: loadData });
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectId) return;
    
    setCreating(true);
    try {
      const response = await apiKeysApi.create(projectId, { name });
      setShowCreateDialog(false);
      setName('');
      setNewApiKey(response);
      showSuccess(t('apiKeys.toast.created'));
      loadData();
    } catch (err: any) {
      showApiError(err, 'apiKeys.toast.createFailed');
    } finally {
      setCreating(false);
    }
  };

  const handleRevoke = async () => {
    if (!revokeId || !projectId) return;
    
    setRevoking(true);
    try {
      await apiKeysApi.revoke(projectId, revokeId);
      showSuccess(t('apiKeys.toast.revoked'));
      setRevokeId(null);
      loadData();
    } catch (err: any) {
      showApiError(err, 'apiKeys.toast.revokeFailed');
    } finally {
      setRevoking(false);
    }
  };

  const handleCopyKey = (key: string) => {
    navigator.clipboard.writeText(key);
    showSuccess(t('apiKeys.toast.copied'));
  };

  const closeKeyDialog = () => {
    setNewApiKey(null);
    setShowKey(false);
  };

  const formatRelativeTimeOrNever = (dateString: string | null) => {
    if (!dateString) return t('apiKeys.never');
    return formatRelativeTime(dateString);
  };

  if (loading) {
    return (
      <PageSkeleton>
        <SkeletonRows count={3} height="h-24" />
      </PageSkeleton>
    );
  }

  if (!project) {
    return (
      <div className="p-6 lg:p-8 max-w-6xl mx-auto">
        <EmptyState icon={Key} title={t('apiKeys.projectNotFound')} />
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 max-w-6xl mx-auto">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-8">
        <div>
          <h1 className="text-title tracking-tight">{t('apiKeys.title')}</h1>
          <p className="text-sm text-muted-foreground mt-1" dangerouslySetInnerHTML={{ __html: t('apiKeys.subtitle', { project: project.name }) }} />
        </div>
        {canManageApiKeys && (
          <Button onClick={() => setShowCreateDialog(true)}>
            <Plus className="h-4 w-4" /> {t('apiKeys.createKey')}
          </Button>
        )}
      </div>

      {apiKeys.length === 0 ? (
        <EmptyState
          icon={Key}
          title={t('apiKeys.noKeys')}
          description={canManageApiKeys ? t('apiKeys.noKeysDesc') : t('apiKeys.noKeysDescViewer')}
          action={canManageApiKeys ? (
            <Button onClick={() => setShowCreateDialog(true)}>
              <Plus className="h-4 w-4" /> {t('apiKeys.createKey')}
            </Button>
          ) : undefined}
        />
      ) : (
        <div className="space-y-3 animate-fade-in">
          {apiKeys.map((apiKey) => (
            <Card key={apiKey.id}>
              <CardContent className="p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <Key className="h-4 w-4 text-primary" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold">{apiKey.name}</p>
                      <code className="text-[13px] font-mono text-muted-foreground">{apiKey.keyPrefix}...</code>
                      <div className="flex items-center gap-3 mt-2 text-[11px] text-muted-foreground">
                        <span className="flex items-center gap-1"><Calendar className="h-3 w-3" /> {formatDateTimeShort(apiKey.createdAt)}</span>
                        <span>{t('apiKeys.lastUsed')}: {formatRelativeTimeOrNever(apiKey.lastUsedAt)}</span>
                      </div>
                    </div>
                  </div>
                  {canManageApiKeys && (
                    <Button variant="ghost" size="icon-sm" onClick={() => setRevokeId(apiKey.id)} title={t('apiKeys.revoke')} className="text-muted-foreground hover:text-destructive flex-shrink-0">
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}

          {pageInfo && pageInfo.totalPages > 1 && (
            <div className="flex items-center justify-between pt-4">
              <p className="text-sm text-muted-foreground">
                {t('common.showing', { from: currentPage * PAGE_SIZE + 1, to: Math.min((currentPage + 1) * PAGE_SIZE, pageInfo.totalElements), total: pageInfo.totalElements })}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(p => p - 1)}
                  disabled={pageInfo.first}
                >
                  <ChevronLeft className="h-4 w-4" /> {t('common.previous')}
                </Button>
                <span className="text-sm text-muted-foreground px-2">
                  {currentPage + 1} / {pageInfo.totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(p => p + 1)}
                  disabled={pageInfo.last}
                >
                  {t('common.next')} <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('apiKeys.createDialog.title')}</DialogTitle>
            <DialogDescription>
              {t('apiKeys.createDialog.description')}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreate}>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="name">{t('apiKeys.createDialog.name')}</Label>
                <Input
                  id="name"
                  placeholder={t('apiKeys.createDialog.namePlaceholder')}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  disabled={creating}
                  autoFocus
                />
                <p className="text-xs text-muted-foreground">
                  {t('apiKeys.createDialog.nameHint')}
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowCreateDialog(false)}
                disabled={creating}
              >
                {t('common.cancel')}
              </Button>
              <Button type="submit" disabled={creating}>
                {creating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {creating ? t('apiKeys.createDialog.submitting') : t('apiKeys.createDialog.submit')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!revokeId} onOpenChange={(open) => !open && setRevokeId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('apiKeys.revokeDialog.title')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('apiKeys.revokeDialog.description')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={revoking}>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRevoke}
              disabled={revoking}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {revoking && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {revoking ? t('apiKeys.revoking') : t('apiKeys.revoke')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={!!newApiKey} onOpenChange={closeKeyDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('apiKeys.keyDialog.title')}</DialogTitle>
            <DialogDescription>
              {t('apiKeys.keyDialog.description')}
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>{t('apiKeys.keyDialog.label')}</Label>
                <div className="flex items-center gap-2">
                  <Input
                    value={newApiKey?.key || ''}
                    type={showKey ? 'text' : 'password'}
                    readOnly
                    className="font-mono text-sm"
                  />
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => setShowKey(!showKey)}
                    title={showKey ? t('apiKeys.keyDialog.hideKey') : t('apiKeys.keyDialog.showKey')}
                  >
                    {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => newApiKey?.key && handleCopyKey(newApiKey.key)}
                    title={t('apiKeys.keyDialog.copyKey')}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
                <p className="text-sm text-muted-foreground">
                  {t('apiKeys.keyDialog.hint')}
                </p>
              </div>
              <div className="bg-muted p-3 rounded-lg">
                <p className="text-xs font-mono">
                  curl -X POST https://your-domain.com/api/v1/events \<br />
                  &nbsp;&nbsp;-H "X-API-Key: {newApiKey?.key || 'YOUR_KEY'}" \<br />
                  &nbsp;&nbsp;-H "Content-Type: application/json" \<br />
                  &nbsp;&nbsp;-d '{`{"type":"user.created","data":{"userId":"123"}}`}'
                </p>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={closeKeyDialog}>{t('apiKeys.keyDialog.done')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
