import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Plus, Trash2, Copy, RefreshCw, Loader2, Clock, ChevronDown, ChevronRight, Eraser } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { showApiError, showSuccess } from '../lib/toast';
import { formatDateTime } from '../lib/date';
import PageSkeleton, { SkeletonRows } from '../components/PageSkeleton';
import { testEndpointsApi, TestEndpointResponse, CapturedRequestResponse } from '../api/testEndpoints.api';
import { Button } from '../components/ui/button';
import { Card, CardContent } from '../components/ui/card';
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

export default function TestEndpointsPage() {
  const { t } = useTranslation();
  const { projectId } = useParams<{ projectId: string }>();
  const { canManageTestEndpoints } = usePermissions();
  const [endpoints, setEndpoints] = useState<TestEndpointResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [selectedEndpoint, setSelectedEndpoint] = useState<string | null>(null);
  const [requests, setRequests] = useState<CapturedRequestResponse[]>([]);
  const [loadingRequests, setLoadingRequests] = useState(false);
  const [expandedRequest, setExpandedRequest] = useState<string | null>(null);
  const [clearing, setClearing] = useState(false);

  useEffect(() => {
    if (projectId) {
      loadEndpoints();
    }
  }, [projectId]);

  useEffect(() => {
    if (selectedEndpoint && projectId) {
      loadRequests(selectedEndpoint);
    }
  }, [selectedEndpoint]);

  const loadEndpoints = async () => {
    if (!projectId) return;
    try {
      setLoading(true);
      const data = await testEndpointsApi.list(projectId);
      setEndpoints(data);
    } catch (err: any) {
      showApiError(err, 'testEndpoints.toast.loadFailed', { retry: loadEndpoints });
    } finally {
      setLoading(false);
    }
  };

  const loadRequests = async (endpointId: string) => {
    if (!projectId) return;
    try {
      setLoadingRequests(true);
      const data = await testEndpointsApi.getRequests(projectId, endpointId);
      setRequests(data.content);
    } catch (err: any) {
      showApiError(err, 'testEndpoints.toast.loadRequestsFailed');
    } finally {
      setLoadingRequests(false);
    }
  };

  const handleCreate = async () => {
    if (!projectId) return;
    try {
      setCreating(true);
      const endpoint = await testEndpointsApi.create(projectId);
      setEndpoints([endpoint, ...endpoints]);
      showSuccess(t('testEndpoints.toast.created'));
      copyToClipboard(endpoint.url);
    } catch (err: any) {
      showApiError(err, 'testEndpoints.toast.createFailed');
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteId || !projectId) return;
    try {
      setDeleting(true);
      await testEndpointsApi.delete(projectId, deleteId);
      setEndpoints(endpoints.filter(e => e.id !== deleteId));
      if (selectedEndpoint === deleteId) {
        setSelectedEndpoint(null);
        setRequests([]);
      }
      showSuccess(t('testEndpoints.toast.deleted'));
    } catch (err: any) {
      showApiError(err, 'testEndpoints.toast.deleteFailed');
    } finally {
      setDeleting(false);
      setDeleteId(null);
    }
  };

  const handleClearRequests = async () => {
    if (!selectedEndpoint || !projectId) return;
    try {
      setClearing(true);
      await testEndpointsApi.clearRequests(projectId, selectedEndpoint);
      setRequests([]);
      setEndpoints(endpoints.map(e => e.id === selectedEndpoint ? { ...e, requestCount: 0 } : e));
      showSuccess(t('testEndpoints.toast.cleared'));
    } catch (err: any) {
      showApiError(err, 'testEndpoints.toast.clearFailed');
    } finally {
      setClearing(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    showSuccess(t('testEndpoints.toast.urlCopied'));
  };


  const getTimeRemaining = (expiresAt: string) => {
    const now = new Date();
    const expires = new Date(expiresAt);
    const diff = expires.getTime() - now.getTime();
    if (diff <= 0) return t('testEndpoints.expired');
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    if (hours > 0) return `${hours}h ${minutes}m ${t('testEndpoints.remaining')}`;
    return `${minutes}m ${t('testEndpoints.remaining')}`;
  };

  const getMethodColor = (method: string) => {
    switch (method.toUpperCase()) {
      case 'GET': return 'bg-success/10 text-success';
      case 'POST': return 'bg-blue-500/10 text-blue-600';
      case 'PUT': return 'bg-warning/10 text-warning';
      case 'PATCH': return 'bg-warning/10 text-warning';
      case 'DELETE': return 'bg-destructive/10 text-destructive';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  const parseHeaders = (headers?: string) => {
    if (!headers) return {};
    try {
      return JSON.parse(headers);
    } catch {
      return {};
    }
  };

  if (loading) {
    return (
      <PageSkeleton>
        <div className="grid lg:grid-cols-2 gap-6">
          <SkeletonRows count={2} height="h-28" />
          <div className="h-64 bg-muted animate-pulse rounded-xl" />
        </div>
      </PageSkeleton>
    );
  }

  return (
    <div className="p-6 lg:p-8 max-w-6xl mx-auto">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-8">
        <div>
          <h1 className="text-title tracking-tight">{t('testEndpoints.title')}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {t('testEndpoints.subtitle')}
          </p>
        </div>
        {canManageTestEndpoints && (
          <Button onClick={handleCreate} disabled={creating}>
            {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            {t('testEndpoints.create')}
          </Button>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t('testEndpoints.endpoints')}</p>
          {endpoints.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 border border-dashed rounded-xl">
              <p className="text-sm text-muted-foreground">{t('testEndpoints.noEndpoints')}</p>
            </div>
          ) : (
            endpoints.map((endpoint) => (
              <Card 
                key={endpoint.id}
                className={`cursor-pointer transition-all ${selectedEndpoint === endpoint.id ? 'ring-2 ring-primary/50 border-primary' : ''}`}
                onClick={() => setSelectedEndpoint(endpoint.id)}
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-mono font-semibold truncate">{endpoint.slug}</p>
                      <p className="text-[11px] text-muted-foreground flex items-center gap-1 mt-0.5">
                        <Clock className="h-3 w-3" /> {getTimeRemaining(endpoint.expiresAt)}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <Button variant="ghost" size="icon-sm" onClick={(e) => { e.stopPropagation(); copyToClipboard(endpoint.url); }}>
                        <Copy className="h-3.5 w-3.5" />
                      </Button>
                      {canManageTestEndpoints && (
                        <Button variant="ghost" size="icon-sm" onClick={(e) => { e.stopPropagation(); setDeleteId(endpoint.id); }} className="text-muted-foreground hover:text-destructive">
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 mt-2">
                    <code className="bg-muted px-2 py-1 rounded text-[11px] truncate flex-1 font-mono">{endpoint.url}</code>
                    <span className="bg-primary/10 text-primary px-2 py-0.5 rounded-full text-[11px] font-medium flex-shrink-0">
                      {endpoint.requestCount} req
                    </span>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t('testEndpoints.capturedRequests')}</p>
            {selectedEndpoint && (
              <div className="flex gap-2">
                {canManageTestEndpoints && requests.length > 0 && (
                  <Button variant="outline" size="sm" onClick={handleClearRequests} disabled={clearing} className="text-destructive hover:text-destructive">
                    {clearing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Eraser className="h-3.5 w-3.5" />} {t('testEndpoints.clearRequests')}
                  </Button>
                )}
                <Button variant="outline" size="sm" onClick={() => loadRequests(selectedEndpoint)} disabled={loadingRequests}>
                  <RefreshCw className={`h-3.5 w-3.5 ${loadingRequests ? 'animate-spin' : ''}`} /> {t('testEndpoints.refresh')}
                </Button>
              </div>
            )}
          </div>

          {!selectedEndpoint ? (
            <div className="flex flex-col items-center justify-center py-12 border border-dashed rounded-xl">
              <p className="text-sm text-muted-foreground">{t('testEndpoints.selectEndpoint')}</p>
            </div>
          ) : loadingRequests ? (
            <div className="flex items-center justify-center h-32">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : requests.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 border border-dashed rounded-xl">
              <p className="text-sm text-muted-foreground">{t('testEndpoints.noRequests')}</p>
            </div>
          ) : (
            <div className="space-y-2 animate-fade-in">
              {requests.map((req) => (
                <Card key={req.id}>
                  <div
                    className="p-3 cursor-pointer flex items-center gap-3"
                    onClick={() => setExpandedRequest(expandedRequest === req.id ? null : req.id)}
                  >
                    {expandedRequest === req.id ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
                    <span className={`px-2 py-0.5 rounded text-[11px] font-bold ${getMethodColor(req.method)}`}>{req.method}</span>
                    <span className="text-[11px] text-muted-foreground">{formatDateTime(req.receivedAt)}</span>
                    {req.sourceIp && <span className="text-[11px] text-muted-foreground ml-auto">{req.sourceIp}</span>}
                  </div>
                  {expandedRequest === req.id && (
                    <CardContent className="pt-0 pb-4 space-y-3">
                      {req.headers && (
                        <div>
                          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">{t('testEndpoints.headers')}</p>
                          <pre className="bg-muted/50 border p-3 rounded-lg text-[11px] font-mono overflow-x-auto max-h-40">{JSON.stringify(parseHeaders(req.headers), null, 2)}</pre>
                        </div>
                      )}
                      {req.body && (
                        <div>
                          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">{t('testEndpoints.body')}</p>
                          <pre className="bg-muted/50 border p-3 rounded-lg text-[11px] font-mono overflow-x-auto max-h-60">
                            {(() => { try { return JSON.stringify(JSON.parse(req.body), null, 2); } catch { return req.body; } })()}
                          </pre>
                        </div>
                      )}
                      {req.queryString && (
                        <div>
                          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">{t('testEndpoints.queryString')}</p>
                          <code className="bg-muted/50 border px-2 py-1 rounded text-[11px] font-mono">?{req.queryString}</code>
                        </div>
                      )}
                    </CardContent>
                  )}
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>

      <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('testEndpoints.deleteDialog.title')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('testEndpoints.deleteDialog.description')}
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
              {t('common.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
