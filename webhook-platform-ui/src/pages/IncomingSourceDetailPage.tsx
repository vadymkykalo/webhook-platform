import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowDownToLine, ArrowLeft, Plus, Loader2, Trash2, Pencil, Copy, Power, PowerOff,
  ShieldCheck, ShieldOff, Globe, Calendar, Terminal, ChevronLeft, ChevronRight
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { showApiError, showSuccess, showCriticalSuccess } from '../lib/toast';
import { formatDateTime, formatRelativeTime } from '../lib/date';
import PageSkeleton, { SkeletonRows } from '../components/PageSkeleton';
import EmptyState from '../components/EmptyState';
import { incomingSourcesApi } from '../api/incomingSources.api';
import { incomingDestinationsApi } from '../api/incomingDestinations.api';
import type {
  IncomingSourceResponse, IncomingDestinationResponse, IncomingDestinationRequest,
  IncomingAuthType, PageResponse,
} from '../types/api.types';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '../components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '../components/ui/alert-dialog';
import { Select } from '../components/ui/select';
import { Switch } from '../components/ui/switch';
import { usePermissions } from '../auth/usePermissions';

const AUTH_TYPES: IncomingAuthType[] = ['NONE', 'BEARER', 'BASIC', 'CUSTOM_HEADER'];
const PAGE_SIZE = 20;

export default function IncomingSourceDetailPage() {
  const { t } = useTranslation();
  const { projectId, sourceId } = useParams<{ projectId: string; sourceId: string }>();
  const navigate = useNavigate();
  const { canManageIncomingSources } = usePermissions();

  const [source, setSource] = useState<IncomingSourceResponse | null>(null);
  const [destinations, setDestinations] = useState<IncomingDestinationResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [destPageInfo, setDestPageInfo] = useState<PageResponse<IncomingDestinationResponse> | null>(null);
  const [destPage, setDestPage] = useState(0);

  // Destination dialog
  const [showDestDialog, setShowDestDialog] = useState(false);
  const [editDest, setEditDest] = useState<IncomingDestinationResponse | null>(null);
  const [destUrl, setDestUrl] = useState('');
  const [destAuthType, setDestAuthType] = useState<IncomingAuthType>('NONE');
  const [destAuthConfig, setDestAuthConfig] = useState('');
  const [destCustomHeaders, setDestCustomHeaders] = useState('');
  const [destEnabled, setDestEnabled] = useState(true);
  const [destMaxAttempts, setDestMaxAttempts] = useState('5');
  const [destTimeout, setDestTimeout] = useState('30');
  const [destRetryDelays, setDestRetryDelays] = useState('60,300,900,3600');
  const [destPayloadTransform, setDestPayloadTransform] = useState('');
  const [destSaving, setDestSaving] = useState(false);

  // Delete destination
  const [deleteDestId, setDeleteDestId] = useState<string | null>(null);
  const [deletingDest, setDeletingDest] = useState(false);

  useEffect(() => {
    if (projectId && sourceId) loadData();
  }, [projectId, sourceId, destPage]);

  const loadData = async () => {
    if (!projectId || !sourceId) return;
    try {
      setLoading(true);
      const [src, dests] = await Promise.all([
        incomingSourcesApi.get(projectId, sourceId),
        incomingDestinationsApi.list(projectId, sourceId, destPage, PAGE_SIZE),
      ]);
      setSource(src);
      setDestinations(dests.content);
      setDestPageInfo(dests);
    } catch (err) {
      showApiError(err, 'incomingSources.toast.loadFailed', { retry: loadData });
    } finally {
      setLoading(false);
    }
  };

  const copyIngressUrl = () => {
    if (source) {
      navigator.clipboard.writeText(source.ingressUrl);
      showSuccess(t('incomingSources.toast.urlCopied'));
    }
  };

  // ── Destination CRUD ──
  const openCreateDest = () => {
    setEditDest(null);
    setDestUrl('');
    setDestAuthType('NONE');
    setDestAuthConfig('');
    setDestCustomHeaders('');
    setDestEnabled(true);
    setDestMaxAttempts('5');
    setDestTimeout('30');
    setDestRetryDelays('60,300,900,3600');
    setDestPayloadTransform('');
    setShowDestDialog(true);
  };

  const openEditDest = (d: IncomingDestinationResponse) => {
    setEditDest(d);
    setDestUrl(d.url);
    setDestAuthType(d.authType);
    setDestAuthConfig('');
    setDestCustomHeaders(d.customHeadersJson || '');
    setDestEnabled(d.enabled);
    setDestMaxAttempts(d.maxAttempts.toString());
    setDestTimeout(d.timeoutSeconds.toString());
    setDestRetryDelays(d.retryDelays || '');
    setDestPayloadTransform(d.payloadTransform || '');
    setShowDestDialog(true);
  };

  const handleSaveDest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectId || !sourceId) return;

    const data: IncomingDestinationRequest = {
      url: destUrl,
      authType: destAuthType,
      authConfig: destAuthConfig || undefined,
      customHeadersJson: destCustomHeaders || undefined,
      enabled: destEnabled,
      maxAttempts: parseInt(destMaxAttempts) || 5,
      timeoutSeconds: parseInt(destTimeout) || 30,
      retryDelays: destRetryDelays || undefined,
      payloadTransform: destPayloadTransform || undefined,
    };

    setDestSaving(true);
    try {
      if (editDest) {
        await incomingDestinationsApi.update(projectId, sourceId, editDest.id, data);
        showSuccess(t('incomingDestinations.toast.updated'));
      } else {
        await incomingDestinationsApi.create(projectId, sourceId, data);
        showSuccess(t('incomingDestinations.toast.created'));
      }
      setShowDestDialog(false);
      loadData();
    } catch (err) {
      showApiError(err, editDest ? 'incomingDestinations.toast.updateFailed' : 'incomingDestinations.toast.createFailed');
    } finally {
      setDestSaving(false);
    }
  };

  const handleDeleteDest = async () => {
    if (!deleteDestId || !projectId || !sourceId) return;
    setDeletingDest(true);
    try {
      await incomingDestinationsApi.delete(projectId, sourceId, deleteDestId);
      showCriticalSuccess(t('incomingDestinations.toast.deleted'));
      setDeleteDestId(null);
      loadData();
    } catch (err) {
      showApiError(err, 'incomingDestinations.toast.deleteFailed');
    } finally {
      setDeletingDest(false);
    }
  };

  if (loading) {
    return <PageSkeleton><SkeletonRows count={4} height="h-24" /></PageSkeleton>;
  }

  if (!source) {
    return (
      <div className="p-6 lg:p-8 max-w-6xl mx-auto">
        <EmptyState icon={ArrowDownToLine} title={t('endpoints.projectNotFound')} />
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 max-w-6xl mx-auto space-y-6">
      {/* Back button + Header */}
      <div>
        <Button variant="ghost" size="sm" className="mb-4 -ml-2" onClick={() => navigate(`/admin/projects/${projectId}/incoming-sources`)}>
          <ArrowLeft className="h-4 w-4 mr-1" /> {t('incomingSources.title')}
        </Button>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-title tracking-tight">{source.name}</h1>
              {source.status === 'ACTIVE' ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-success/10 px-2.5 py-1 text-xs font-medium text-success">
                  <Power className="h-3.5 w-3.5" /> {t('incomingSources.active')}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
                  <PowerOff className="h-3.5 w-3.5" /> {t('incomingSources.disabled')}
                </span>
              )}
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              {source.providerType} &middot; {source.slug} &middot; {t('incomingSources.created')} {formatDateTime(source.createdAt)}
            </p>
          </div>
        </div>
      </div>

      {/* Source Info Cards */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Ingress URL card */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Globe className="h-4 w-4" /> {t('incomingSources.ingressUrl')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <code className="text-xs font-mono bg-muted px-3 py-2 rounded flex-1 truncate">{source.ingressUrl}</code>
              <Button variant="outline" size="icon-sm" onClick={copyIngressUrl} title={t('incomingSources.howToSend.copy')}>
                <Copy className="h-3.5 w-3.5" />
              </Button>
            </div>
            <div className="mt-3 p-3 bg-muted/50 rounded-lg">
              <p className="text-xs font-semibold mb-1.5 flex items-center gap-1.5">
                <Terminal className="h-3.5 w-3.5" /> {t('incomingSources.howToSend.curlExample')}
              </p>
              <pre className="text-[11px] font-mono text-muted-foreground overflow-x-auto whitespace-pre-wrap break-all">
{`curl -X POST ${source.ingressUrl} \\
  -H "Content-Type: application/json" \\
  -d '{"event": "test", "data": {}}'`}
              </pre>
            </div>
          </CardContent>
        </Card>

        {/* Configuration card */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <ShieldCheck className="h-4 w-4" /> {t('incomingSources.verification')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t('incomingSources.createDialog.verificationMode')}</span>
                <span className="font-medium">{source.verificationMode}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">HMAC</span>
                <span>{source.hmacSecretConfigured ? (
                  <span className="inline-flex items-center gap-1 text-success text-xs font-medium"><ShieldCheck className="h-3 w-3" /> {t('incomingSources.hmacConfigured')}</span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-muted-foreground text-xs"><ShieldOff className="h-3 w-3" /> {t('incomingSources.hmacNotConfigured')}</span>
                )}</span>
              </div>
              {source.hmacHeaderName && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t('incomingSources.createDialog.hmacHeaderName')}</span>
                  <code className="text-xs font-mono">{source.hmacHeaderName}</code>
                </div>
              )}
              {source.rateLimitPerSecond && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t('incomingSources.rateLimit')}</span>
                  <span>{source.rateLimitPerSecond} req/s</span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Destinations Section */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold">{t('incomingDestinations.title')}</h2>
            <p className="text-sm text-muted-foreground">{t('incomingDestinations.subtitle')}</p>
          </div>
          {canManageIncomingSources && (
            <Button onClick={openCreateDest} size="sm">
              <Plus className="h-4 w-4" /> {t('incomingDestinations.create')}
            </Button>
          )}
        </div>

        {destinations.length === 0 ? (
          <EmptyState
            icon={Globe}
            title={t('incomingDestinations.noDestinations')}
            description={t('incomingDestinations.noDestinationsDesc')}
            action={canManageIncomingSources ? (
              <Button onClick={openCreateDest} size="sm">
                <Plus className="h-4 w-4" /> {t('incomingDestinations.create')}
              </Button>
            ) : undefined}
          />
        ) : (
          <div className="space-y-3">
            {destinations.map((dest) => (
              <Card key={dest.id}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-semibold truncate">{dest.url}</p>
                        {dest.enabled ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-success/10 px-2 py-0.5 text-[11px] font-medium text-success">
                            <Power className="h-3 w-3" /> {t('incomingDestinations.enabled')}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                            <PowerOff className="h-3 w-3" /> {t('incomingDestinations.disabled')}
                          </span>
                        )}
                        {dest.authType !== 'NONE' && (
                          <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                            {dest.authType}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-1.5 text-[11px] text-muted-foreground flex-wrap">
                        <span>{t('incomingDestinations.maxAttempts')}: {dest.maxAttempts}</span>
                        <span>{t('incomingDestinations.timeout')}: {dest.timeoutSeconds}s</span>
                        {dest.retryDelays && <span>{t('incomingDestinations.retryDelays')}: {dest.retryDelays}</span>}
                        <span className="flex items-center gap-1"><Calendar className="h-3 w-3" /> {formatRelativeTime(dest.createdAt)}</span>
                      </div>
                    </div>
                    {canManageIncomingSources && (
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <Button variant="ghost" size="icon-sm" onClick={() => openEditDest(dest)} title={t('common.edit')}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon-sm" onClick={() => setDeleteDestId(dest.id)} title={t('common.delete')} className="text-muted-foreground hover:text-destructive">
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}

            {destPageInfo && destPageInfo.totalPages > 1 && (
              <div className="flex items-center justify-between pt-2">
                <p className="text-sm text-muted-foreground">
                  {t('common.showing', { from: destPage * PAGE_SIZE + 1, to: Math.min((destPage + 1) * PAGE_SIZE, destPageInfo.totalElements), total: destPageInfo.totalElements })}
                </p>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => setDestPage(p => p - 1)} disabled={destPageInfo.first}>
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="text-sm text-muted-foreground px-2">{destPage + 1} / {destPageInfo.totalPages}</span>
                  <Button variant="outline" size="sm" onClick={() => setDestPage(p => p + 1)} disabled={destPageInfo.last}>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Create / Edit Destination Dialog */}
      <Dialog open={showDestDialog} onOpenChange={setShowDestDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editDest ? t('incomingDestinations.editDialog.title') : t('incomingDestinations.createDialog.title')}</DialogTitle>
            <DialogDescription>{editDest ? t('incomingDestinations.editDialog.description') : t('incomingDestinations.createDialog.description')}</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSaveDest}>
            <div className="space-y-4 py-4 max-h-[60vh] overflow-y-auto">
              <div className="space-y-2">
                <Label htmlFor="dest-url">{t('incomingDestinations.createDialog.url')}</Label>
                <Input id="dest-url" type="url" placeholder={t('incomingDestinations.createDialog.urlPlaceholder')} value={destUrl} onChange={(e) => setDestUrl(e.target.value)} required disabled={destSaving} autoFocus />
              </div>
              <div className="space-y-2">
                <Label>{t('incomingDestinations.createDialog.authType')}</Label>
                <Select value={destAuthType} onChange={(e) => setDestAuthType(e.target.value as IncomingAuthType)} disabled={destSaving}>
                  {AUTH_TYPES.map((a) => <option key={a} value={a}>{a}</option>)}
                </Select>
              </div>
              {destAuthType !== 'NONE' && (
                <div className="space-y-2">
                  <Label htmlFor="dest-auth-config">{t('incomingDestinations.createDialog.authConfig')}</Label>
                  <Input id="dest-auth-config" placeholder={t('incomingDestinations.createDialog.authConfigPlaceholder')} value={destAuthConfig} onChange={(e) => setDestAuthConfig(e.target.value)} disabled={destSaving} />
                  <p className="text-xs text-muted-foreground">{t('incomingDestinations.createDialog.authConfigHint')}</p>
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="dest-headers">{t('incomingDestinations.createDialog.customHeaders')}</Label>
                <Input id="dest-headers" placeholder={t('incomingDestinations.createDialog.customHeadersPlaceholder')} value={destCustomHeaders} onChange={(e) => setDestCustomHeaders(e.target.value)} disabled={destSaving} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="dest-attempts">{t('incomingDestinations.createDialog.maxAttempts')}</Label>
                  <Input id="dest-attempts" type="number" min="1" max="20" placeholder={t('incomingDestinations.createDialog.maxAttemptsPlaceholder')} value={destMaxAttempts} onChange={(e) => setDestMaxAttempts(e.target.value)} disabled={destSaving} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="dest-timeout">{t('incomingDestinations.createDialog.timeout')}</Label>
                  <Input id="dest-timeout" type="number" min="1" max="120" placeholder={t('incomingDestinations.createDialog.timeoutPlaceholder')} value={destTimeout} onChange={(e) => setDestTimeout(e.target.value)} disabled={destSaving} />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="dest-retry">{t('incomingDestinations.createDialog.retryDelays')}</Label>
                <Input id="dest-retry" placeholder={t('incomingDestinations.createDialog.retryDelaysPlaceholder')} value={destRetryDelays} onChange={(e) => setDestRetryDelays(e.target.value)} disabled={destSaving} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="dest-transform">{t('incomingDestinations.createDialog.payloadTransform')}</Label>
                <Input id="dest-transform" placeholder={t('incomingDestinations.createDialog.payloadTransformPlaceholder')} value={destPayloadTransform} onChange={(e) => setDestPayloadTransform(e.target.value)} disabled={destSaving} />
                <p className="text-xs text-muted-foreground">{t('incomingDestinations.createDialog.payloadTransformHint')}</p>
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="dest-enabled">{t('common.enabled')}</Label>
                <Switch id="dest-enabled" checked={destEnabled} onCheckedChange={setDestEnabled} disabled={destSaving} />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowDestDialog(false)} disabled={destSaving}>{t('common.cancel')}</Button>
              <Button type="submit" disabled={destSaving}>
                {destSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {destSaving ? t('common.saving') : t('common.save')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Destination Confirmation */}
      <AlertDialog open={!!deleteDestId} onOpenChange={(open) => !open && setDeleteDestId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('incomingDestinations.deleteDialog.title')}</AlertDialogTitle>
            <AlertDialogDescription>{t('incomingDestinations.deleteDialog.description')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletingDest}>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteDest} disabled={deletingDest} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {deletingDest && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {deletingDest ? t('common.deleting') : t('common.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
