import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Plus, ArrowDownToLine, Calendar, Loader2, Trash2, Pencil, Copy, ChevronLeft, ChevronRight,
  Power, PowerOff, ShieldCheck, ShieldOff, ExternalLink, AlertTriangle
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { showApiError, showSuccess, showCriticalSuccess } from '../lib/toast';
import { formatRelativeTime } from '../lib/date';
import PageSkeleton, { SkeletonRows } from '../components/PageSkeleton';
import EmptyState from '../components/EmptyState';
import { incomingSourcesApi } from '../api/incomingSources.api';
import { projectsApi } from '../api/projects.api';
import type {
  IncomingSourceResponse, IncomingSourceRequest, ProjectResponse, PageResponse,
  ProviderType, VerificationMode,
} from '../types/api.types';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Card, CardContent } from '../components/ui/card';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '../components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '../components/ui/alert-dialog';
import { Select } from '../components/ui/select';
import { usePermissions } from '../auth/usePermissions';
import PermissionGate from '../components/PermissionGate';
import VerificationGate from '../components/VerificationGate';

const PROVIDER_TYPES: ProviderType[] = ['GENERIC', 'GITHUB', 'GITLAB', 'STRIPE', 'SHOPIFY', 'SLACK', 'TWILIO', 'CUSTOM'];
const VERIFICATION_MODES: VerificationMode[] = ['NONE', 'HMAC_GENERIC', 'PROVIDER'];
const PAGE_SIZE = 20;

export default function IncomingSourcesPage() {
  const { t } = useTranslation();
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const { canManageIncomingSources } = usePermissions();

  const [project, setProject] = useState<ProjectResponse | null>(null);
  const [sources, setSources] = useState<IncomingSourceResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [pageInfo, setPageInfo] = useState<PageResponse<IncomingSourceResponse> | null>(null);
  const [currentPage, setCurrentPage] = useState(0);

  // Create / Edit dialog
  const [showDialog, setShowDialog] = useState(false);
  const [editSource, setEditSource] = useState<IncomingSourceResponse | null>(null);
  const [formName, setFormName] = useState('');
  const [formSlug, setFormSlug] = useState('');
  const [formProvider, setFormProvider] = useState<ProviderType>('GENERIC');
  const [formVerification, setFormVerification] = useState<VerificationMode>('NONE');
  const [formHmacSecret, setFormHmacSecret] = useState('');
  const [formHmacHeader, setFormHmacHeader] = useState('');
  const [formHmacPrefix, setFormHmacPrefix] = useState('');
  const [formRateLimit, setFormRateLimit] = useState<string>('');
  const [saving, setSaving] = useState(false);

  // Delete
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (projectId) loadData();
  }, [projectId, currentPage]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadData = async () => {
    if (!projectId) return;
    try {
      setLoading(true);
      const [proj, data] = await Promise.all([
        projectsApi.get(projectId),
        incomingSourcesApi.list(projectId, currentPage, PAGE_SIZE),
      ]);
      setProject(proj);
      setSources(data.content);
      setPageInfo(data);
    } catch (err) {
      showApiError(err, 'incomingSources.toast.loadFailed', { retry: loadData });
    } finally {
      setLoading(false);
    }
  };

  const openCreate = () => {
    setEditSource(null);
    setFormName('');
    setFormSlug('');
    setFormProvider('GENERIC');
    setFormVerification('NONE');
    setFormHmacSecret('');
    setFormHmacHeader('');
    setFormHmacPrefix('');
    setFormRateLimit('');
    setShowDialog(true);
  };

  const openEdit = (source: IncomingSourceResponse) => {
    setEditSource(source);
    setFormName(source.name);
    setFormSlug(source.slug);
    setFormProvider(source.providerType);
    setFormVerification(source.verificationMode);
    setFormHmacSecret('');
    setFormHmacHeader(source.hmacHeaderName || '');
    setFormHmacPrefix(source.hmacSignaturePrefix || '');
    setFormRateLimit(source.rateLimitPerSecond?.toString() || '');
    setShowDialog(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectId) return;

    const data: IncomingSourceRequest = {
      name: formName,
      slug: formSlug || undefined,
      providerType: formProvider,
      verificationMode: formVerification,
      hmacSecret: formHmacSecret || undefined,
      hmacHeaderName: formHmacHeader || undefined,
      hmacSignaturePrefix: formHmacPrefix || undefined,
      rateLimitPerSecond: formRateLimit ? parseInt(formRateLimit) : null,
    };

    setSaving(true);
    try {
      if (editSource) {
        await incomingSourcesApi.update(projectId, editSource.id, data);
        showSuccess(t('incomingSources.toast.updated'));
      } else {
        await incomingSourcesApi.create(projectId, data);
        showSuccess(t('incomingSources.toast.created'));
      }
      setShowDialog(false);
      loadData();
    } catch (err) {
      showApiError(err, editSource ? 'incomingSources.toast.updateFailed' : 'incomingSources.toast.createFailed');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteId || !projectId) return;
    setDeleting(true);
    try {
      await incomingSourcesApi.delete(projectId, deleteId);
      showCriticalSuccess(t('incomingSources.toast.deleted'));
      setDeleteId(null);
      loadData();
    } catch (err) {
      showApiError(err, 'incomingSources.toast.deleteFailed');
    } finally {
      setDeleting(false);
    }
  };

  const copyIngressUrl = (url: string) => {
    navigator.clipboard.writeText(url);
    showSuccess(t('incomingSources.toast.urlCopied'));
  };

  const showHmacFields = formVerification === 'HMAC_GENERIC';

  if (loading) {
    return <PageSkeleton><SkeletonRows count={3} height="h-32" /></PageSkeleton>;
  }

  if (!project) {
    return (
      <div className="p-6 lg:p-8 max-w-6xl mx-auto">
        <EmptyState icon={ArrowDownToLine} title={t('endpoints.projectNotFound')} />
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 max-w-6xl mx-auto">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-8">
        <div>
          <h1 className="text-title tracking-tight">{t('incomingSources.title')}</h1>
          <p className="text-sm text-muted-foreground mt-1" dangerouslySetInnerHTML={{ __html: t('incomingSources.subtitle', { project: project.name }) }} />
        </div>
        <PermissionGate allowed={canManageIncomingSources}>
          <VerificationGate>
            <Button onClick={openCreate}>
              <Plus className="h-4 w-4" /> {t('incomingSources.create')}
            </Button>
          </VerificationGate>
        </PermissionGate>
      </div>

      {sources.length === 0 ? (
        <EmptyState
          icon={ArrowDownToLine}
          title={t('incomingSources.noSources')}
          description={t('incomingSources.noSourcesDesc')}
          action={
            <PermissionGate allowed={canManageIncomingSources}>
              <VerificationGate>
                <Button onClick={openCreate}>
                  <Plus className="h-4 w-4" /> {t('incomingSources.create')}
                </Button>
              </VerificationGate>
            </PermissionGate>
          }
          docsLink="/docs#incoming-webhooks"
        />
      ) : (
        <div className="space-y-3 animate-fade-in">
          {sources.map((source) => (
            <Card key={source.id} className="overflow-hidden cursor-pointer hover:border-primary/30 transition-colors"
              onClick={() => navigate(`/admin/projects/${projectId}/incoming-sources/${source.id}`)}>
              <CardContent className="p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3 min-w-0 flex-1">
                    <div className={`h-9 w-9 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5 ${
                      source.status === 'ACTIVE' ? 'bg-success/10' : 'bg-muted'
                    }`}>
                      <ArrowDownToLine className={`h-4 w-4 ${source.status === 'ACTIVE' ? 'text-success' : 'text-muted-foreground'}`} />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-semibold truncate">{source.name}</p>
                        {source.status === 'ACTIVE' ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-success/10 px-2 py-0.5 text-[11px] font-medium text-success">
                            <Power className="h-3 w-3" /> {t('incomingSources.active')}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                            <PowerOff className="h-3 w-3" /> {t('incomingSources.disabled')}
                          </span>
                        )}
                        <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                          {source.providerType}
                        </span>
                        {source.hmacSecretConfigured ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-success/10 px-2 py-0.5 text-[11px] font-medium text-success">
                            <ShieldCheck className="h-3 w-3" /> {t('incomingSources.hmacConfigured')}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                            <ShieldOff className="h-3 w-3" /> {t('incomingSources.hmacNotConfigured')}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-1.5">
                        <code className="text-[11px] font-mono bg-muted px-2 py-0.5 rounded text-muted-foreground truncate max-w-[400px]">
                          {source.ingressUrl}
                        </code>
                        <Button variant="ghost" size="icon-sm" onClick={(e) => { e.stopPropagation(); copyIngressUrl(source.ingressUrl); }} title={t('incomingSources.howToSend.copy')}>
                          <Copy className="h-3 w-3" />
                        </Button>
                      </div>
                      <div className="flex items-center gap-3 mt-2 text-[11px] text-muted-foreground">
                        <span className="flex items-center gap-1"><Calendar className="h-3 w-3" /> {formatRelativeTime(source.createdAt)}</span>
                        <span className="font-mono">{source.slug}</span>
                        {source.rateLimitPerSecond && (
                          <span>{source.rateLimitPerSecond} req/s</span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                    {canManageIncomingSources && (
                      <>
                        <Button variant="ghost" size="icon-sm" onClick={() => openEdit(source)} title={t('common.edit')}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon-sm" onClick={() => navigate(`/admin/projects/${projectId}/incoming-sources/${source.id}`)} title={t('incomingSources.viewDetails')}>
                          <ExternalLink className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon-sm" onClick={() => setDeleteId(source.id)} title={t('common.delete')} className="text-muted-foreground hover:text-destructive">
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </>
                    )}
                  </div>
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
                <Button variant="outline" size="sm" onClick={() => setCurrentPage(p => p - 1)} disabled={pageInfo.first}>
                  <ChevronLeft className="h-4 w-4" /> {t('common.previous')}
                </Button>
                <span className="text-sm text-muted-foreground px-2">{currentPage + 1} / {pageInfo.totalPages}</span>
                <Button variant="outline" size="sm" onClick={() => setCurrentPage(p => p + 1)} disabled={pageInfo.last}>
                  {t('common.next')} <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Create / Edit Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editSource ? t('incomingSources.editDialog.title') : t('incomingSources.createDialog.title')}</DialogTitle>
            <DialogDescription>{editSource ? t('incomingSources.editDialog.description') : t('incomingSources.createDialog.description')}</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSave}>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="src-name">{t('incomingSources.createDialog.name')}</Label>
                <Input id="src-name" placeholder={t('incomingSources.createDialog.namePlaceholder')} value={formName} onChange={(e) => setFormName(e.target.value)} required disabled={saving} autoFocus />
              </div>
              <div className="space-y-2">
                <Label htmlFor="src-slug">{t('incomingSources.createDialog.slug')}</Label>
                <Input id="src-slug" placeholder={t('incomingSources.createDialog.slugPlaceholder')} value={formSlug} onChange={(e) => setFormSlug(e.target.value)} disabled={saving} />
                <p className="text-xs text-muted-foreground">{t('incomingSources.createDialog.slugHint')}</p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>{t('incomingSources.createDialog.provider')}</Label>
                  <Select value={formProvider} onChange={(e) => setFormProvider(e.target.value as ProviderType)} disabled={saving}>
                    {PROVIDER_TYPES.map((p) => <option key={p} value={p}>{p}</option>)}
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>{t('incomingSources.createDialog.verificationMode')}</Label>
                  <Select value={formVerification} onChange={(e) => setFormVerification(e.target.value as VerificationMode)} disabled={saving}>
                    {VERIFICATION_MODES.map((v) => <option key={v} value={v}>{v}</option>)}
                  </Select>
                </div>
              </div>
              {formVerification === 'NONE' && (
                <div className="flex items-start gap-2.5 p-3 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/40">
                  <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-amber-800 dark:text-amber-200">{t('incomingSources.security.noVerificationTitle')}</p>
                    <p className="text-xs text-amber-700 dark:text-amber-300 mt-0.5">{t('incomingSources.security.noVerificationDesc')}</p>
                  </div>
                </div>
              )}
              {showHmacFields && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="src-hmac-secret">{t('incomingSources.createDialog.hmacSecret')}</Label>
                    <Input id="src-hmac-secret" type="password" placeholder={t('incomingSources.createDialog.hmacSecretPlaceholder')} value={formHmacSecret} onChange={(e) => setFormHmacSecret(e.target.value)} disabled={saving} />
                    <p className="text-xs text-muted-foreground">{t('incomingSources.createDialog.hmacSecretHint')}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="src-hmac-header">{t('incomingSources.createDialog.hmacHeaderName')}</Label>
                      <Input id="src-hmac-header" placeholder={t('incomingSources.createDialog.hmacHeaderPlaceholder')} value={formHmacHeader} onChange={(e) => setFormHmacHeader(e.target.value)} disabled={saving} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="src-hmac-prefix">{t('incomingSources.createDialog.hmacSignaturePrefix')}</Label>
                      <Input id="src-hmac-prefix" placeholder={t('incomingSources.createDialog.hmacPrefixPlaceholder')} value={formHmacPrefix} onChange={(e) => setFormHmacPrefix(e.target.value)} disabled={saving} />
                    </div>
                  </div>
                </>
              )}
              <div className="space-y-2">
                <Label htmlFor="src-rate-limit">{t('incomingSources.createDialog.rateLimit')}</Label>
                <Input id="src-rate-limit" type="number" min="1" max="10000" placeholder={t('incomingSources.createDialog.rateLimitPlaceholder')} value={formRateLimit} onChange={(e) => setFormRateLimit(e.target.value)} disabled={saving} />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowDialog(false)} disabled={saving}>{t('common.cancel')}</Button>
              <Button type="submit" disabled={saving}>
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {saving ? t('common.saving') : t('common.save')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('incomingSources.deleteDialog.title')}</AlertDialogTitle>
            <AlertDialogDescription>{t('incomingSources.deleteDialog.description')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={deleting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {deleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {deleting ? t('common.deleting') : t('common.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
