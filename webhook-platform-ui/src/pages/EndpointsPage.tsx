import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Plus, Webhook, Calendar, Loader2, Trash2, Power, PowerOff, RefreshCw, Copy, Zap, ShieldCheck, CheckCircle, AlertCircle, Clock, ShieldOff, ChevronLeft, ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { showApiError, showSuccess, showCriticalSuccess } from '../lib/toast';
import { formatDate } from '../lib/date';
import PageSkeleton, { SkeletonRows } from '../components/PageSkeleton';
import EmptyState from '../components/EmptyState';
import { endpointsApi } from '../api/endpoints.api';
import { projectsApi } from '../api/projects.api';
import type { EndpointResponse, ProjectResponse, PageResponse } from '../types/api.types';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
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
import MtlsConfigModal from '../components/MtlsConfigModal';
import { usePermissions } from '../auth/usePermissions';
import PermissionGate from '../components/PermissionGate';

export default function EndpointsPage() {
  const { t } = useTranslation();
  const { projectId } = useParams<{ projectId: string }>();
  const { canManageEndpoints } = usePermissions();
  const queryClient = useQueryClient();
  const [project, setProject] = useState<ProjectResponse | null>(null);
  const [endpoints, setEndpoints] = useState<EndpointResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [url, setUrl] = useState('');
  const [description, setDescription] = useState('');
  const [rateLimitPerSecond, setRateLimitPerSecond] = useState<number | undefined>(undefined);
  const [allowedSourceIps, setAllowedSourceIps] = useState('');
  const [creating, setCreating] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [toggleId, setToggleId] = useState<string | null>(null);
  const [toggling, setToggling] = useState(false);
  const [rotateId, setRotateId] = useState<string | null>(null);
  const [rotating, setRotating] = useState(false);
  const [newSecret, setNewSecret] = useState<string | null>(null);
  const [testId, setTestId] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<any>(null);
  const [mtlsEndpoint, setMtlsEndpoint] = useState<EndpointResponse | null>(null);
  const [verifyingId, setVerifyingId] = useState<string | null>(null);
  const [skippingId, setSkippingId] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(0);
  const [pageInfo, setPageInfo] = useState<PageResponse<EndpointResponse> | null>(null);
  const PAGE_SIZE = 20;

  useEffect(() => {
    if (projectId) {
      loadData();
    }
  }, [projectId, currentPage]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadData = async () => {
    if (!projectId) return;
    
    try {
      setLoading(true);
      const [projectData, endpointsData] = await Promise.all([
        projectsApi.get(projectId),
        endpointsApi.listPaged(projectId, currentPage, PAGE_SIZE),
      ]);
      setProject(projectData);
      setEndpoints(endpointsData.content);
      setPageInfo(endpointsData);
    } catch (err: any) {
      showApiError(err, 'endpoints.toast.loadFailed', { retry: loadData });
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectId) return;
    
    setCreating(true);
    try {
      const secret = generateSecret();
      await endpointsApi.create(projectId, { 
        url, 
        description, 
        enabled: true, 
        secret,
        rateLimitPerSecond: rateLimitPerSecond || undefined,
        allowedSourceIps: allowedSourceIps || undefined,
      });
      setShowCreateDialog(false);
      setUrl('');
      setDescription('');
      setRateLimitPerSecond(undefined);
      setAllowedSourceIps('');
      setNewSecret(secret);
      showSuccess(t('endpoints.toast.created'));
      queryClient.invalidateQueries({ queryKey: ['endpoints', projectId] });
      loadData();
    } catch (err: any) {
      showApiError(err, 'endpoints.toast.createFailed');
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteId || !projectId) return;
    
    setDeleting(true);
    try {
      await endpointsApi.delete(projectId, deleteId);
      showCriticalSuccess(t('endpoints.toast.deleted'));
      setDeleteId(null);
      queryClient.invalidateQueries({ queryKey: ['endpoints', projectId] });
      loadData();
    } catch (err: any) {
      showApiError(err, 'endpoints.toast.deleteFailed');
    } finally {
      setDeleting(false);
    }
  };

  const handleToggle = async () => {
    if (!toggleId || !projectId) return;
    
    const endpoint = endpoints.find((e) => e.id === toggleId);
    if (!endpoint) return;

    setToggling(true);
    try {
      await endpointsApi.update(projectId, toggleId, {
        url: endpoint.url,
        description: endpoint.description,
        enabled: !endpoint.enabled,
        rateLimitPerSecond: endpoint.rateLimitPerSecond,
      });
      showSuccess(!endpoint.enabled ? t('endpoints.toast.enabled') : t('endpoints.toast.disabled'));
      setToggleId(null);
      loadData();
    } catch (err: any) {
      showApiError(err, 'endpoints.toast.toggleFailed');
    } finally {
      setToggling(false);
    }
  };

  const handleRotateSecret = async () => {
    if (!rotateId || !projectId) return;

    setRotating(true);
    try {
      const response = await endpointsApi.rotateSecret(projectId, rotateId);
      setNewSecret(response.secret || null);
      showSuccess(t('endpoints.toast.secretRotated'));
      loadData();
    } catch (err: any) {
      showApiError(err, 'endpoints.toast.rotateFailed');
      setRotateId(null);
    } finally {
      setRotating(false);
    }
  };

  const handleCopySecret = () => {
    if (newSecret) {
      navigator.clipboard.writeText(newSecret);
      showSuccess(t('endpoints.toast.secretCopied'));
    }
  };

  const closeSecretDialog = () => {
    setRotateId(null);
    setNewSecret(null);
  };

  const handleTest = async (endpointId: string) => {
    if (!projectId) return;
    
    setTestId(endpointId);
    setTesting(true);
    setTestResult(null);
    
    try {
      const result = await endpointsApi.test(projectId, endpointId);
      setTestResult(result);
      if (result.success) {
        showSuccess(t('endpoints.toast.testSuccess', { status: result.httpStatusCode, latency: result.latencyMs }));
      } else {
        showApiError(new Error(result.message), 'endpoints.toast.testFailed');
      }
    } catch (err: any) {
      showApiError(err, 'endpoints.toast.testError');
      setTestId(null);
    } finally {
      setTesting(false);
    }
  };

  const closeTestDialog = () => {
    setTestId(null);
    setTestResult(null);
  };

  const handleVerify = async (endpointId: string) => {
    if (!projectId) return;
    
    setVerifyingId(endpointId);
    try {
      const result = await endpointsApi.verify(projectId, endpointId);
      if (result.success) {
        showSuccess(t('endpoints.toast.verified'));
        loadData();
      } else {
        showApiError(new Error(result.message), 'endpoints.toast.verifyFailed');
        loadData();
      }
    } catch (err: any) {
      showApiError(err, 'endpoints.toast.verifyError');
    } finally {
      setVerifyingId(null);
    }
  };

  const handleSkipVerification = async (endpointId: string) => {
    if (!projectId) return;
    
    setSkippingId(endpointId);
    try {
      await endpointsApi.skipVerification(projectId, endpointId, 'Manually skipped by user');
      showSuccess(t('endpoints.toast.skipped'));
      loadData();
    } catch (err: any) {
      showApiError(err, 'endpoints.toast.skipFailed');
    } finally {
      setSkippingId(null);
    }
  };

  const getVerificationBadge = (status?: string) => {
    switch (status) {
      case 'VERIFIED':
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-success/10 px-2 py-0.5 text-[11px] font-medium text-success">
            <CheckCircle className="h-3 w-3" /> {t('endpoints.verified')}
          </span>
        );
      case 'FAILED':
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-[11px] font-medium text-destructive">
            <AlertCircle className="h-3 w-3" /> {t('endpoints.failed')}
          </span>
        );
      case 'SKIPPED':
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-warning/10 px-2 py-0.5 text-[11px] font-medium text-warning">
            <ShieldOff className="h-3 w-3" /> {t('endpoints.skipped')}
          </span>
        );
      case 'PENDING':
      default:
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-warning/10 px-2 py-0.5 text-[11px] font-medium text-warning">
            <Clock className="h-3 w-3" /> {t('endpoints.pending')}
          </span>
        );
    }
  };


  const getToggleEndpoint = () => endpoints.find((e) => e.id === toggleId);

  if (loading) {
    return (
      <PageSkeleton>
        <SkeletonRows count={3} height="h-32" />
      </PageSkeleton>
    );
  }

  if (!project) {
    return (
      <div className="p-6 lg:p-8 max-w-6xl mx-auto">
        <EmptyState icon={Webhook} title={t('endpoints.projectNotFound')} />
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 max-w-6xl mx-auto">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-8">
        <div>
          <h1 className="text-title tracking-tight">{t('endpoints.title')}</h1>
          <p className="text-sm text-muted-foreground mt-1" dangerouslySetInnerHTML={{ __html: t('endpoints.subtitle', { project: project.name }) }} />
        </div>
        <PermissionGate allowed={canManageEndpoints}>
          <Button onClick={() => setShowCreateDialog(true)}>
            <Plus className="h-4 w-4" /> {t('endpoints.newEndpoint')}
          </Button>
        </PermissionGate>
      </div>

      {endpoints.length === 0 ? (
        <EmptyState
          icon={Webhook}
          title={t('endpoints.noEndpoints')}
          description={t('endpoints.noEndpointsDesc')}
          action={
            <PermissionGate allowed={canManageEndpoints}>
              <Button onClick={() => setShowCreateDialog(true)}>
                <Plus className="h-4 w-4" /> {t('endpoints.createFirst')}
              </Button>
            </PermissionGate>
          }
          docsLink="/docs#endpoints-api"
        />
      ) : (
        <div className="space-y-3 animate-fade-in">
          {endpoints.map((endpoint) => (
            <Card key={endpoint.id} className="overflow-hidden">
              <CardContent className="p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3 min-w-0 flex-1">
                    <div className={`h-9 w-9 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5 ${
                      endpoint.enabled ? 'bg-success/10' : 'bg-muted'
                    }`}>
                      <Webhook className={`h-4 w-4 ${endpoint.enabled ? 'text-success' : 'text-muted-foreground'}`} />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-semibold truncate">{endpoint.url}</p>
                        {endpoint.enabled ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-success/10 px-2 py-0.5 text-[11px] font-medium text-success">
                            <Power className="h-3 w-3" /> {t('endpoints.active')}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                            <PowerOff className="h-3 w-3" /> {t('endpoints.disabled')}
                          </span>
                        )}
                        {endpoint.mtlsEnabled && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                            <ShieldCheck className="h-3 w-3" /> mTLS
                          </span>
                        )}
                        {getVerificationBadge(endpoint.verificationStatus)}
                      </div>
                      {endpoint.description && (
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-1">{endpoint.description}</p>
                      )}
                      <div className="flex items-center gap-3 mt-2 text-[11px] text-muted-foreground">
                        <span className="flex items-center gap-1"><Calendar className="h-3 w-3" /> {formatDate(endpoint.createdAt)}</span>
                        {endpoint.rateLimitPerSecond && (
                          <span>{endpoint.rateLimitPerSecond} req/s</span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {canManageEndpoints && (
                      <>
                        <Button variant="ghost" size="icon-sm" onClick={() => handleTest(endpoint.id)} title={t('endpoints.test')} disabled={testing && testId === endpoint.id}>
                          {testing && testId === endpoint.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5 text-primary" />}
                        </Button>
                        <Button variant="ghost" size="icon-sm" onClick={() => setToggleId(endpoint.id)} title={endpoint.enabled ? t('common.disable') : t('common.enable')}>
                          {endpoint.enabled ? <PowerOff className="h-3.5 w-3.5 text-warning" /> : <Power className="h-3.5 w-3.5 text-success" />}
                        </Button>
                        <Button variant="ghost" size="icon-sm" onClick={() => setRotateId(endpoint.id)} title={t('endpoints.rotateSecret')}>
                          <RefreshCw className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon-sm" onClick={() => setMtlsEndpoint(endpoint)} title={endpoint.mtlsEnabled ? t('endpoints.configureMtls') : t('endpoints.enableMtls')}>
                          <ShieldCheck className={`h-3.5 w-3.5 ${endpoint.mtlsEnabled ? 'text-primary' : 'text-muted-foreground'}`} />
                        </Button>
                        {endpoint.verificationStatus !== 'VERIFIED' && (
                          <Button variant="ghost" size="icon-sm" onClick={() => handleVerify(endpoint.id)} title={t('endpoints.verifyEndpoint')} disabled={verifyingId === endpoint.id}>
                            {verifyingId === endpoint.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle className={`h-3.5 w-3.5 ${endpoint.verificationStatus === 'FAILED' ? 'text-destructive' : 'text-muted-foreground'}`} />}
                          </Button>
                        )}
                        <Button variant="ghost" size="icon-sm" onClick={() => setDeleteId(endpoint.id)} title={t('common.delete')} className="text-muted-foreground hover:text-destructive">
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </>
                    )}
                  </div>
                </div>

                {canManageEndpoints && (endpoint.verificationStatus === 'PENDING' || endpoint.verificationStatus === 'FAILED') && (
                  <div className="mt-4 p-3 bg-accent/50 rounded-lg border border-primary/10">
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex-1">
                        <p className="text-xs font-semibold">
                          {endpoint.verificationStatus === 'PENDING' ? t('endpoints.verificationRequired') : t('endpoints.verificationRetry')}
                        </p>
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          Respond to <code className="bg-muted px-1 py-0.5 rounded text-[10px] font-mono">POST</code> with the challenge value.
                        </p>
                      </div>
                      <div className="flex gap-2 flex-shrink-0">
                        <Button size="sm" variant="outline" onClick={() => handleSkipVerification(endpoint.id)} disabled={skippingId === endpoint.id}>
                          {skippingId === endpoint.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : t('endpoints.skip')}
                        </Button>
                        <Button size="sm" onClick={() => handleVerify(endpoint.id)} disabled={verifyingId === endpoint.id}>
                          {verifyingId === endpoint.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle className="h-3.5 w-3.5" />}
                          {t('endpoints.verify')}
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
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
            <DialogTitle>{t('endpoints.createDialog.title')}</DialogTitle>
            <DialogDescription>
              {t('endpoints.createDialog.description')}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreate}>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="url">{t('endpoints.createDialog.url')}</Label>
                <Input
                  id="url"
                  type="url"
                  placeholder={t('endpoints.createDialog.urlPlaceholder')}
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  required
                  disabled={creating}
                  autoFocus
                />
                <p className="text-xs text-muted-foreground">
                  {t('endpoints.createDialog.urlHint')}
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">{t('endpoints.createDialog.description')}</Label>
                <Textarea
                  id="description"
                  placeholder={t('endpoints.createDialog.descPlaceholder')}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  disabled={creating}
                  rows={2}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="rateLimit">{t('endpoints.createDialog.rateLimit')}</Label>
                <Input
                  id="rateLimit"
                  type="number"
                  min="1"
                  max="1000"
                  placeholder={t('endpoints.createDialog.rateLimitPlaceholder')}
                  value={rateLimitPerSecond || ''}
                  onChange={(e) => setRateLimitPerSecond(e.target.value ? parseInt(e.target.value) : undefined)}
                  disabled={creating}
                />
                <p className="text-xs text-muted-foreground">
                  {t('endpoints.createDialog.rateLimitHint')}
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="allowedSourceIps">{t('endpoints.createDialog.allowedIps')}</Label>
                <Input
                  id="allowedSourceIps"
                  placeholder={t('endpoints.createDialog.allowedIpsPlaceholder')}
                  value={allowedSourceIps}
                  onChange={(e) => setAllowedSourceIps(e.target.value)}
                  disabled={creating}
                />
                <p className="text-xs text-muted-foreground">
                  {t('endpoints.createDialog.allowedIpsHint')}
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
                {creating ? t('endpoints.createDialog.submitting') : t('endpoints.createDialog.submit')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('endpoints.deleteDialog.title')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('endpoints.deleteDialog.description')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {deleting ? t('common.deleting') : t('common.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!toggleId && !newSecret} onOpenChange={(open) => !open && setToggleId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {getToggleEndpoint()?.enabled ? t('endpoints.toggleDialog.disableTitle') : t('endpoints.toggleDialog.enableTitle')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {getToggleEndpoint()?.enabled
                ? t('endpoints.toggleDialog.disableDesc')
                : t('endpoints.toggleDialog.enableDesc')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={toggling}>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleToggle} disabled={toggling}>
              {toggling && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {toggling ? t('endpoints.toggleDialog.processing') : t('common.confirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!rotateId && !newSecret} onOpenChange={(open) => !open && setRotateId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('endpoints.rotateDialog.title')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('endpoints.rotateDialog.description')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={rotating}>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleRotateSecret} disabled={rotating}>
              {rotating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {rotating ? t('endpoints.rotateDialog.rotating') : t('endpoints.rotateDialog.submit')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={!!newSecret} onOpenChange={closeSecretDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('endpoints.secretDialog.title')}</DialogTitle>
            <DialogDescription>
              {t('endpoints.secretDialog.description')}
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <div className="flex items-center gap-2">
              <Input
                value={newSecret || ''}
                readOnly
                className="font-mono text-sm"
              />
              <Button
                variant="outline"
                size="icon"
                onClick={handleCopySecret}
                title={t('endpoints.secretDialog.copy')}
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-sm text-muted-foreground mt-2">
              {t('endpoints.secretDialog.hint')}
            </p>
          </div>
          <DialogFooter>
            <Button onClick={closeSecretDialog}>{t('endpoints.secretDialog.done')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!testResult} onOpenChange={closeTestDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t('endpoints.testDialog.title')}</DialogTitle>
            <DialogDescription>
              {t('endpoints.testDialog.description')}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="flex items-center justify-between p-4 rounded-lg bg-muted">
              <div className="flex items-center gap-3">
                {testResult?.success ? (
                  <>
                    <div className="rounded-full bg-green-100 p-2">
                      <Power className="h-5 w-5 text-green-600" />
                    </div>
                    <div>
                      <div className="font-semibold text-green-700">{t('endpoints.testDialog.success')}</div>
                      <div className="text-sm text-muted-foreground">
                        HTTP {testResult.httpStatusCode} • {testResult.latencyMs}ms
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="rounded-full bg-red-100 p-2">
                      <PowerOff className="h-5 w-5 text-red-600" />
                    </div>
                    <div>
                      <div className="font-semibold text-red-700">{t('endpoints.testDialog.failed')}</div>
                      <div className="text-sm text-muted-foreground">
                        {testResult?.latencyMs ? `${testResult.latencyMs}ms` : t('endpoints.testDialog.noResponse')}
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>

            {testResult?.httpStatusCode && (
              <div>
                <Label>{t('endpoints.testDialog.httpStatus')}</Label>
                <div className="mt-1 p-3 bg-muted rounded-md font-mono text-sm">
                  {testResult.httpStatusCode}
                </div>
              </div>
            )}

            {testResult?.responseBody && (
              <div>
                <Label>{t('endpoints.testDialog.responseBody')}</Label>
                <div className="mt-1 p-3 bg-muted rounded-md font-mono text-xs max-h-48 overflow-auto">
                  {testResult.responseBody}
                </div>
              </div>
            )}

            {testResult?.errorMessage && (
              <div>
                <Label>{t('endpoints.testDialog.errorMessage')}</Label>
                <div className="mt-1 p-3 bg-red-50 text-red-700 rounded-md text-sm">
                  {testResult.errorMessage}
                </div>
              </div>
            )}

            <div>
              <Label>{t('endpoints.testDialog.message')}</Label>
              <div className="mt-1 p-3 bg-muted rounded-md text-sm">
                {testResult?.message}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={closeTestDialog}>{t('common.close')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {mtlsEndpoint && projectId && (
        <MtlsConfigModal
          open={!!mtlsEndpoint}
          onOpenChange={(open) => !open && setMtlsEndpoint(null)}
          projectId={projectId}
          endpoint={mtlsEndpoint}
          onUpdate={(updated) => {
            setEndpoints(endpoints.map(e => e.id === updated.id ? updated : e));
            setMtlsEndpoint(null);
          }}
        />
      )}
    </div>
  );
}

function generateSecret(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
}
