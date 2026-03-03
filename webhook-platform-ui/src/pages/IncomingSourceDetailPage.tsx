import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowDownToLine, ArrowLeft, Plus, Loader2, Trash2, Pencil, Copy, Power, PowerOff,
  ShieldCheck, ShieldOff, Globe, Calendar, Terminal, ChevronLeft, ChevronRight,
  CheckCircle2, XCircle, Play, Wand2
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
import { transformApi } from '../api/transform.api';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Textarea } from '../components/ui/textarea';
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

const RETRY_PRESETS: { label: string; delays: string; attempts: string; desc: string }[] = [
  { label: 'Aggressive', delays: '10,30,60,120', attempts: '4', desc: '10s → 30s → 1m → 2m' },
  { label: 'Standard', delays: '60,300,900,3600', attempts: '5', desc: '1m → 5m → 15m → 1h' },
  { label: 'Patient', delays: '300,900,3600,21600,86400', attempts: '6', desc: '5m → 15m → 1h → 6h → 24h' },
  { label: 'No retry', delays: '', attempts: '1', desc: 'Single attempt only' },
];

function isValidJson(value: string): boolean {
  try {
    JSON.parse(value);
    return true;
  } catch {
    return false;
  }
}

function formatJson(value: string): string {
  try {
    return JSON.stringify(JSON.parse(value), null, 2);
  } catch {
    return value;
  }
}

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

  // Validation & transform preview state
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [validationOk, setValidationOk] = useState(false);
  const [transformPreview, setTransformPreview] = useState<string | null>(null);
  const [transformPreviewLoading, setTransformPreviewLoading] = useState(false);
  const [transformPreviewErrors, setTransformPreviewErrors] = useState<string[]>([]);

  // Delete destination
  const [deleteDestId, setDeleteDestId] = useState<string | null>(null);
  const [deletingDest, setDeletingDest] = useState(false);

  useEffect(() => {
    if (projectId && sourceId) loadData();
  }, [projectId, sourceId, destPage]); // eslint-disable-line react-hooks/exhaustive-deps

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
  const resetValidation = () => {
    setValidationErrors([]);
    setValidationOk(false);
    setTransformPreview(null);
    setTransformPreviewErrors([]);
  };

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
    resetValidation();
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
    resetValidation();
    setShowDestDialog(true);
  };

  const validateConfig = () => {
    const errors: string[] = [];
    if (!destUrl) errors.push(t('incomingDestinations.validation.urlRequired'));
    try { new URL(destUrl); } catch { errors.push(t('incomingDestinations.validation.invalidUrl')); }
    if (destCustomHeaders && !isValidJson(destCustomHeaders)) errors.push(t('incomingDestinations.validation.headersInvalidJson'));
    if (destPayloadTransform && !isValidJson(destPayloadTransform)) errors.push(t('incomingDestinations.validation.transformInvalidJson'));
    const attempts = parseInt(destMaxAttempts);
    if (isNaN(attempts) || attempts < 1 || attempts > 20) errors.push(t('incomingDestinations.validation.attemptsRange'));
    const timeout = parseInt(destTimeout);
    if (isNaN(timeout) || timeout < 1 || timeout > 120) errors.push(t('incomingDestinations.validation.timeoutRange'));
    if (destRetryDelays) {
      const parts = destRetryDelays.split(',');
      for (const p of parts) {
        if (isNaN(Number(p.trim())) || Number(p.trim()) < 0) {
          errors.push(t('incomingDestinations.validation.retryDelaysFormat'));
          break;
        }
      }
    }
    setValidationErrors(errors);
    setValidationOk(errors.length === 0);
    return errors.length === 0;
  };

  const runTransformPreview = async () => {
    if (!projectId) return;
    setTransformPreviewLoading(true);
    setTransformPreview(null);
    setTransformPreviewErrors([]);
    try {
      const samplePayload = JSON.stringify({ event: 'test.event', data: { id: 1, name: 'sample', nested: { key: 'value' } }, timestamp: new Date().toISOString() }, null, 2);
      const result = await transformApi.preview(projectId, {
        inputPayload: samplePayload,
        transformExpression: destPayloadTransform || undefined,
        customHeaders: destCustomHeaders || undefined,
      });
      if (result.success) {
        setTransformPreview(result.outputPayload ? formatJson(result.outputPayload) : samplePayload);
      }
      setTransformPreviewErrors(result.errors || []);
    } catch (err) {
      setTransformPreviewErrors([t('incomingDestinations.validation.previewFailed')]);
    } finally {
      setTransformPreviewLoading(false);
    }
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
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editDest ? t('incomingDestinations.editDialog.title') : t('incomingDestinations.createDialog.title')}</DialogTitle>
            <DialogDescription>{editDest ? t('incomingDestinations.editDialog.description') : t('incomingDestinations.createDialog.description')}</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSaveDest}>
            <div className="space-y-4 py-4 max-h-[65vh] overflow-y-auto pr-1">
              {/* URL */}
              <div className="space-y-2">
                <Label htmlFor="dest-url">{t('incomingDestinations.createDialog.url')}</Label>
                <Input id="dest-url" type="url" placeholder={t('incomingDestinations.createDialog.urlPlaceholder')} value={destUrl} onChange={(e) => { setDestUrl(e.target.value); resetValidation(); }} required disabled={destSaving} autoFocus />
              </div>

              {/* Auth */}
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

              {/* Custom Headers — JSON Textarea */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="dest-headers">{t('incomingDestinations.createDialog.customHeaders')}</Label>
                  {destCustomHeaders && (
                    <Button type="button" variant="ghost" size="sm" className="h-6 text-[11px] px-2" onClick={() => { setDestCustomHeaders(formatJson(destCustomHeaders)); resetValidation(); }}>
                      <Wand2 className="h-3 w-3 mr-1" /> {t('incomingDestinations.validation.format')}
                    </Button>
                  )}
                </div>
                <Textarea
                  id="dest-headers"
                  placeholder={'{\n  "X-Custom-Header": "value"\n}'}
                  value={destCustomHeaders}
                  onChange={(e) => { setDestCustomHeaders(e.target.value); resetValidation(); }}
                  disabled={destSaving}
                  className={`font-mono text-xs min-h-[80px] ${destCustomHeaders && !isValidJson(destCustomHeaders) ? 'border-destructive' : ''}`}
                  rows={3}
                />
                {destCustomHeaders && !isValidJson(destCustomHeaders) && (
                  <p className="text-xs text-destructive flex items-center gap-1"><XCircle className="h-3 w-3" /> {t('incomingDestinations.validation.invalidJson', 'Invalid JSON format')}</p>
                )}
                {destCustomHeaders && isValidJson(destCustomHeaders) && (
                  <p className="text-xs text-green-600 flex items-center gap-1"><CheckCircle2 className="h-3 w-3" /> {t('incomingDestinations.validation.validJson')}</p>
                )}
              </div>

              {/* Retry Policy — Presets */}
              <div className="space-y-3">
                <Label>{t('incomingDestinations.createDialog.retryPolicy', 'Retry Policy')}</Label>
                <div className="grid grid-cols-4 gap-2">
                  {RETRY_PRESETS.map((preset) => (
                    <button
                      key={preset.label}
                      type="button"
                      className={`text-left border rounded-lg px-3 py-2 transition-colors hover:border-primary/50 ${
                        destRetryDelays === preset.delays && destMaxAttempts === preset.attempts
                          ? 'border-primary bg-primary/5 ring-1 ring-primary/20'
                          : 'border-border'
                      }`}
                      onClick={() => { setDestRetryDelays(preset.delays); setDestMaxAttempts(preset.attempts); resetValidation(); }}
                    >
                      <span className="text-xs font-medium">{preset.label}</span>
                      <p className="text-[10px] text-muted-foreground mt-0.5">{preset.desc}</p>
                    </button>
                  ))}
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <Label htmlFor="dest-attempts" className="text-[11px]">{t('incomingDestinations.createDialog.maxAttempts')}</Label>
                    <Input id="dest-attempts" type="number" min="1" max="20" value={destMaxAttempts} onChange={(e) => { setDestMaxAttempts(e.target.value); resetValidation(); }} disabled={destSaving} className="h-8 text-xs" />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="dest-timeout" className="text-[11px]">{t('incomingDestinations.createDialog.timeout')}</Label>
                    <Input id="dest-timeout" type="number" min="1" max="120" value={destTimeout} onChange={(e) => { setDestTimeout(e.target.value); resetValidation(); }} disabled={destSaving} className="h-8 text-xs" />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="dest-retry" className="text-[11px]">{t('incomingDestinations.createDialog.retryDelays')}</Label>
                    <Input id="dest-retry" placeholder="60,300,900" value={destRetryDelays} onChange={(e) => { setDestRetryDelays(e.target.value); resetValidation(); }} disabled={destSaving} className="h-8 text-xs font-mono" />
                  </div>
                </div>
              </div>

              {/* Payload Transform — JSON Textarea + Preview */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="dest-transform">{t('incomingDestinations.createDialog.payloadTransform')}</Label>
                  <div className="flex items-center gap-1">
                    {destPayloadTransform && (
                      <Button type="button" variant="ghost" size="sm" className="h-6 text-[11px] px-2" onClick={() => { setDestPayloadTransform(formatJson(destPayloadTransform)); resetValidation(); }}>
                        <Wand2 className="h-3 w-3 mr-1" /> {t('incomingDestinations.validation.format')}
                      </Button>
                    )}
                    <Button type="button" variant="outline" size="sm" className="h-6 text-[11px] px-2" onClick={runTransformPreview} disabled={transformPreviewLoading}>
                      {transformPreviewLoading ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Play className="h-3 w-3 mr-1" />}
                      {t('incomingDestinations.validation.testPreview')}
                    </Button>
                  </div>
                </div>
                <Textarea
                  id="dest-transform"
                  placeholder={'{\n  "event_type": "$.event",\n  "payload": "$.data"\n}'}
                  value={destPayloadTransform}
                  onChange={(e) => { setDestPayloadTransform(e.target.value); resetValidation(); setTransformPreview(null); }}
                  disabled={destSaving}
                  className={`font-mono text-xs min-h-[80px] ${destPayloadTransform && !isValidJson(destPayloadTransform) ? 'border-destructive' : ''}`}
                  rows={4}
                />
                {destPayloadTransform && !isValidJson(destPayloadTransform) && (
                  <p className="text-xs text-destructive flex items-center gap-1"><XCircle className="h-3 w-3" /> {t('incomingDestinations.validation.invalidJson', 'Invalid JSON format')}</p>
                )}
                {destPayloadTransform && isValidJson(destPayloadTransform) && (
                  <p className="text-xs text-green-600 flex items-center gap-1"><CheckCircle2 className="h-3 w-3" /> {t('incomingDestinations.validation.validJson')}</p>
                )}
                <p className="text-xs text-muted-foreground">{t('incomingDestinations.createDialog.payloadTransformHint')}</p>

                {/* Transform Preview Output */}
                {(transformPreview || transformPreviewErrors.length > 0) && (
                  <div className="mt-2 border rounded-lg overflow-hidden">
                    {transformPreview && (
                      <div className="bg-muted/50 p-3">
                        <div className="flex items-center gap-1.5 mb-1.5">
                          <CheckCircle2 className="h-3 w-3 text-green-600" />
                          <span className="text-[11px] font-medium text-green-700 dark:text-green-400">{t('incomingDestinations.validation.previewOutput')}</span>
                        </div>
                        <pre className="text-[11px] font-mono overflow-x-auto max-h-[120px] whitespace-pre-wrap">{transformPreview}</pre>
                      </div>
                    )}
                    {transformPreviewErrors.length > 0 && (
                      <div className="bg-destructive/5 p-3">
                        {transformPreviewErrors.map((err, i) => (
                          <p key={i} className="text-xs text-destructive flex items-center gap-1"><XCircle className="h-3 w-3 flex-shrink-0" /> {err}</p>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Enabled toggle */}
              <div className="flex items-center justify-between">
                <Label htmlFor="dest-enabled">{t('common.enabled')}</Label>
                <Switch id="dest-enabled" checked={destEnabled} onCheckedChange={setDestEnabled} disabled={destSaving} />
              </div>

              {/* Validation Results */}
              {validationErrors.length > 0 && (
                <div className="bg-destructive/5 border border-destructive/20 rounded-lg p-3 space-y-1">
                  {validationErrors.map((err, i) => (
                    <p key={i} className="text-xs text-destructive flex items-center gap-1.5"><XCircle className="h-3 w-3 flex-shrink-0" /> {err}</p>
                  ))}
                </div>
              )}
              {validationOk && (
                <div className="bg-green-500/5 border border-green-500/20 rounded-lg p-3">
                  <p className="text-xs text-green-700 dark:text-green-400 flex items-center gap-1.5"><CheckCircle2 className="h-3 w-3" /> {t('incomingDestinations.validation.allValid')}</p>
                </div>
              )}
            </div>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button type="button" variant="ghost" size="sm" onClick={validateConfig} disabled={destSaving}>
                <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> {t('incomingDestinations.validation.validate')}
              </Button>
              <div className="flex-1" />
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
