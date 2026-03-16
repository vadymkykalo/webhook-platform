import { useState, useEffect } from 'react';
import { Cable, Loader2, Trash2, Copy, Activity, Clock, Monitor, RefreshCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { showApiError, showSuccess } from '../lib/toast';
import { formatRelativeTime } from '../lib/date';
import PageSkeleton, { SkeletonRows } from '../components/PageSkeleton';
import EmptyState from '../components/EmptyState';
import { tunnelsApi, TunnelSessionResponse, TunnelStatusResponse } from '../api/tunnels.api';
import { Badge } from '../components/ui/badge';
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

export default function TunnelsPage() {
  const { t } = useTranslation();
  const { canManageEndpoints: canCloseTunnels } = usePermissions();
  const [tunnels, setTunnels] = useState<TunnelSessionResponse[]>([]);
  const [status, setStatus] = useState<TunnelStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [closeId, setCloseId] = useState<string | null>(null);
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    loadData();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const loadData = async () => {
    try {
      setLoading(true);
      const [tunnelsData, statusData] = await Promise.all([
        tunnelsApi.list(),
        tunnelsApi.status(),
      ]);
      setTunnels(tunnelsData);
      setStatus(statusData);
    } catch (err: any) {
      showApiError(err, 'tunnels.toast.loadFailed', { retry: loadData });
    } finally {
      setLoading(false);
    }
  };

  const handleClose = async () => {
    if (!closeId) return;
    setClosing(true);
    try {
      await tunnelsApi.close(closeId);
      showSuccess(t('tunnels.toast.closed'));
      setCloseId(null);
      loadData();
    } catch (err: any) {
      showApiError(err, 'tunnels.toast.closeFailed');
    } finally {
      setClosing(false);
    }
  };

  const handleCopyUrl = (url: string) => {
    navigator.clipboard.writeText(url);
    showSuccess(t('common.copied'));
  };

  if (loading) {
    return (
      <PageSkeleton>
        <SkeletonRows count={3} height="h-24" />
      </PageSkeleton>
    );
  }

  return (
    <div className="p-6 lg:p-8 max-w-6xl mx-auto">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-8">
        <div>
          <h1 className="text-title tracking-tight">{t('tunnels.title')}</h1>
          <p className="text-sm text-muted-foreground mt-1">{t('tunnels.subtitle')}</p>
        </div>
        <Button variant="outline" onClick={loadData} disabled={loading}>
          <RefreshCw className="h-4 w-4" /> {t('tunnels.refresh')}
        </Button>
      </div>

      {/* Status cards */}
      {status && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-green-500/10 flex items-center justify-center">
                <Cable className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{status.activeTunnels}</p>
                <p className="text-xs text-muted-foreground">{t('tunnels.stats.active')}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
                <Activity className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{status.pendingRequests}</p>
                <p className="text-xs text-muted-foreground">{t('tunnels.stats.pending')}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-purple-500/10 flex items-center justify-center">
                <Monitor className="h-5 w-5 text-purple-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{status.myTunnels.length}</p>
                <p className="text-xs text-muted-foreground">{t('tunnels.stats.mine')}</p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {tunnels.length === 0 ? (
        <EmptyState
          icon={Cable}
          title={t('tunnels.noTunnels')}
          description={t('tunnels.noTunnelsDesc')}
        />
      ) : (
        <div className="space-y-3 animate-fade-in">
          {tunnels.map((tunnel) => (
            <Card key={tunnel.id}>
              <CardContent className="p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="h-9 w-9 rounded-lg bg-green-500/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <Cable className="h-4 w-4 text-green-600" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <code className="text-sm font-semibold font-mono">{tunnel.publicSlug}</code>
                        <Badge variant="default" className="text-[10px] bg-green-500/10 text-green-700 dark:text-green-400 border-green-200 dark:border-green-800">
                          {t('tunnels.active')}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-1.5 mb-2">
                        <code className="text-[13px] text-muted-foreground truncate max-w-[400px]">{tunnel.publicUrl}</code>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => handleCopyUrl(tunnel.publicUrl)}
                          title={t('tunnels.copyUrl')}
                          className="h-5 w-5 text-muted-foreground hover:text-foreground"
                        >
                          <Copy className="h-3 w-3" />
                        </Button>
                      </div>
                      <div className="flex items-center gap-3 text-[11px] text-muted-foreground flex-wrap">
                        <span className="flex items-center gap-1">
                          <Monitor className="h-3 w-3" />
                          localhost:{tunnel.localPort}
                        </span>
                        {tunnel.clientInfo && (
                          <span>{tunnel.clientInfo}</span>
                        )}
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {t('tunnels.created')}: {formatRelativeTime(tunnel.createdAt)}
                        </span>
                        {tunnel.lastHeartbeat && (
                          <span>
                            {t('tunnels.lastHeartbeat')}: {formatRelativeTime(tunnel.lastHeartbeat)}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  {canCloseTunnels && (
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => setCloseId(tunnel.id)}
                      title={t('tunnels.close')}
                      className="text-muted-foreground hover:text-destructive flex-shrink-0"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <AlertDialog open={!!closeId} onOpenChange={(open) => !open && setCloseId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('tunnels.closeDialog.title')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('tunnels.closeDialog.description')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={closing}>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleClose}
              disabled={closing}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {closing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {closing ? t('tunnels.closing') : t('tunnels.close')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
