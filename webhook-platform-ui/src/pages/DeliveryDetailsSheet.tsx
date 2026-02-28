import { useState, useEffect } from 'react';
import { Copy, RefreshCw, Loader2, Clock, CheckCircle2, XCircle, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { formatDateTime } from '../lib/date';
import { useTranslation } from 'react-i18next';
import { deliveriesApi } from '../api/deliveries.api';
import type { DeliveryResponse, DeliveryAttemptResponse } from '../types/api.types';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '../components/ui/sheet';
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
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';

interface DeliveryDetailsSheetProps {
  deliveryId: string | null;
  open: boolean;
  onClose: () => void;
  onRefresh: () => void;
}

export default function DeliveryDetailsSheet({
  deliveryId,
  open,
  onClose,
  onRefresh,
}: DeliveryDetailsSheetProps) {
  const { t } = useTranslation();
  const [delivery, setDelivery] = useState<DeliveryResponse | null>(null);
  const [attempts, setAttempts] = useState<DeliveryAttemptResponse[]>([]);
  const [loading, setLoading] = useState(false);
  const [attemptsLoading, setAttemptsLoading] = useState(false);
  const [showReplayDialog, setShowReplayDialog] = useState(false);
  const [replaying, setReplaying] = useState(false);

  useEffect(() => {
    if (deliveryId && open) {
      loadDelivery();
      loadAttempts();
    }
  }, [deliveryId, open]);

  const loadDelivery = async () => {
    if (!deliveryId) return;

    try {
      setLoading(true);
      const data = await deliveriesApi.get(deliveryId);
      setDelivery(data);
    } catch (err: any) {
      toast.error(err.response?.data?.message || t('deliveryDetails.toast.loadFailed'));
    } finally {
      setLoading(false);
    }
  };

  const loadAttempts = async () => {
    if (!deliveryId) return;

    try {
      setAttemptsLoading(true);
      const data = await deliveriesApi.getAttempts(deliveryId);
      setAttempts(data);
    } catch (err: any) {
      console.error('Failed to load delivery attempts:', err);
      setAttempts([]);
    } finally {
      setAttemptsLoading(false);
    }
  };

  const handleReplay = async () => {
    if (!deliveryId) return;

    setReplaying(true);
    try {
      await deliveriesApi.replay(deliveryId);
      toast.success(t('deliveryDetails.toast.replaySuccess'));
      setShowReplayDialog(false);
      onRefresh();
      loadDelivery();
      loadAttempts();
    } catch (err: any) {
      toast.error(err.response?.data?.message || t('deliveryDetails.toast.replayFailed'));
    } finally {
      setReplaying(false);
    }
  };

  const handleCopyId = () => {
    if (deliveryId) {
      navigator.clipboard.writeText(deliveryId);
      toast.success(t('deliveryDetails.toast.idCopied'));
    }
  };

  const getStatusBadge = (status: DeliveryResponse['status']) => {
    const variants: Record<typeof status, { variant: any; icon: any }> = {
      SUCCESS: { variant: 'success', icon: CheckCircle2 },
      FAILED: { variant: 'destructive', icon: XCircle },
      DLQ: { variant: 'destructive', icon: AlertCircle },
      PENDING: { variant: 'secondary', icon: Clock },
      PROCESSING: { variant: 'info', icon: RefreshCw },
    };
    
    const config = variants[status];
    const Icon = config.icon;
    
    return (
      <Badge variant={config.variant} className="gap-1">
        <Icon className="h-3 w-3" />
        {status}
      </Badge>
    );
  };


  const getGuidanceText = (status: DeliveryResponse['status']) => {
    if (status === 'FAILED' || status === 'DLQ') {
      return (
        <div className="mt-4 p-4 bg-yellow-50 border border-yellow-200 rounded-md">
          <h4 className="text-sm font-semibold text-yellow-900 mb-2">{t('deliveryDetails.troubleshooting.title')}</h4>
          <ul className="text-sm text-yellow-800 space-y-1 list-disc list-inside">
            <li>{t('deliveryDetails.troubleshooting.tip1')}</li>
            <li>{t('deliveryDetails.troubleshooting.tip2')}</li>
            <li>{t('deliveryDetails.troubleshooting.tip3')}</li>
            <li>{t('deliveryDetails.troubleshooting.tip4')}</li>
            <li>{t('deliveryDetails.troubleshooting.tip5')}</li>
          </ul>
        </div>
      );
    }
    return null;
  };

  return (
    <>
      <Sheet open={open} onOpenChange={onClose}>
        <SheetContent className="overflow-y-auto w-full sm:max-w-2xl">
          <SheetHeader>
            <SheetTitle>{t('deliveryDetails.title')}</SheetTitle>
            <SheetDescription>
              {t('deliveryDetails.description')}
            </SheetDescription>
          </SheetHeader>

          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : delivery ? (
            <div className="space-y-6 mt-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">{t('deliveryDetails.summary')}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-muted-foreground">{t('deliveryDetails.deliveryId')}</span>
                    <div className="flex items-center gap-2">
                      <code className="text-sm font-mono">{delivery.id.substring(0, 8)}...</code>
                      <Button variant="ghost" size="icon" onClick={handleCopyId}>
                        <Copy className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-muted-foreground">{t('deliveryDetails.status')}</span>
                    {getStatusBadge(delivery.status)}
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-muted-foreground">{t('deliveryDetails.eventId')}</span>
                    <code className="text-sm font-mono">{delivery.eventId.substring(0, 8)}...</code>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-muted-foreground">{t('deliveryDetails.endpointId')}</span>
                    <code className="text-sm font-mono">{delivery.endpointId.substring(0, 8)}...</code>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-muted-foreground">{t('deliveryDetails.created')}</span>
                    <span className="text-sm">{formatDateTime(delivery.createdAt)}</span>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-muted-foreground">{t('deliveryDetails.attempts')}</span>
                    <span className="text-sm font-medium">
                      {delivery.attemptCount} / {delivery.maxAttempts}
                    </span>
                  </div>

                  {delivery.nextRetryAt && (
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-muted-foreground">{t('deliveryDetails.nextRetry')}</span>
                      <span className="text-sm">{formatDateTime(delivery.nextRetryAt)}</span>
                    </div>
                  )}

                  {delivery.succeededAt && (
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-muted-foreground">{t('deliveryDetails.succeededAt')}</span>
                      <span className="text-sm">{formatDateTime(delivery.succeededAt)}</span>
                    </div>
                  )}

                  {delivery.failedAt && (
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-muted-foreground">{t('deliveryDetails.failedAt')}</span>
                      <span className="text-sm">{formatDateTime(delivery.failedAt)}</span>
                    </div>
                  )}
                </CardContent>
              </Card>

              {getGuidanceText(delivery.status)}

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">{t('deliveryDetails.deliveryAttempts')}</CardTitle>
                </CardHeader>
                <CardContent>
                  {attemptsLoading ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="h-6 w-6 animate-spin text-primary" />
                    </div>
                  ) : attempts.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      {t('deliveryDetails.noAttempts')}
                    </p>
                  ) : (
                    <div className="space-y-4">
                      {attempts.map((attempt) => (
                        <div
                          key={attempt.id}
                          className="border rounded-lg p-4 space-y-2"
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-semibold text-sm">
                              {t('deliveryDetails.attemptNumber', { number: attempt.attemptNumber })}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {formatDateTime(attempt.createdAt)}
                            </span>
                          </div>

                          <div className="grid grid-cols-2 gap-2 text-sm">
                            {attempt.httpStatusCode && (
                              <div>
                                <span className="text-muted-foreground">{t('deliveryDetails.statusLabel')}</span>
                                <span className={`ml-2 font-medium ${
                                  attempt.httpStatusCode >= 200 && attempt.httpStatusCode < 300
                                    ? 'text-green-600'
                                    : 'text-red-600'
                                }`}>
                                  {attempt.httpStatusCode}
                                </span>
                              </div>
                            )}
                            {attempt.durationMs !== null && attempt.durationMs !== undefined && (
                              <div>
                                <span className="text-muted-foreground">{t('deliveryDetails.duration')}</span>
                                <span className="ml-2 font-medium">{attempt.durationMs}ms</span>
                              </div>
                            )}
                          </div>

                          {attempt.requestHeaders && (
                            <details className="mt-2">
                              <summary className="text-sm text-muted-foreground cursor-pointer hover:text-foreground">
                                {t('deliveryDetails.requestHeaders')}
                              </summary>
                              <pre className="text-xs mt-1 p-2 bg-muted rounded overflow-x-auto max-h-32">
                                {JSON.stringify(JSON.parse(attempt.requestHeaders), null, 2)}
                              </pre>
                            </details>
                          )}

                          {attempt.requestBody && (
                            <details className="mt-2">
                              <summary className="text-sm text-muted-foreground cursor-pointer hover:text-foreground">
                                {t('deliveryDetails.requestBody')}
                              </summary>
                              <pre className="text-xs mt-1 p-2 bg-muted rounded overflow-x-auto max-h-48">
                                {(() => {
                                  try {
                                    return JSON.stringify(JSON.parse(attempt.requestBody), null, 2);
                                  } catch {
                                    return attempt.requestBody;
                                  }
                                })()}
                              </pre>
                            </details>
                          )}

                          {attempt.responseHeaders && (
                            <details className="mt-2">
                              <summary className="text-sm text-muted-foreground cursor-pointer hover:text-foreground">
                                {t('deliveryDetails.responseHeaders')}
                              </summary>
                              <pre className="text-xs mt-1 p-2 bg-muted rounded overflow-x-auto max-h-32">
                                {JSON.stringify(JSON.parse(attempt.responseHeaders), null, 2)}
                              </pre>
                            </details>
                          )}

                          {attempt.errorMessage && (
                            <div className="mt-2">
                              <span className="text-sm text-muted-foreground">{t('deliveryDetails.error')}</span>
                              <p className="text-sm text-red-600 mt-1 font-mono bg-red-50 p-2 rounded">
                                {attempt.errorMessage}
                              </p>
                            </div>
                          )}

                          {attempt.responseBody && (
                            <details className="mt-2">
                              <summary className="text-sm text-muted-foreground cursor-pointer hover:text-foreground">
                                {t('deliveryDetails.responseBody')}
                              </summary>
                              <pre className="text-xs mt-1 p-2 bg-muted rounded overflow-x-auto max-h-48">
                                {(() => {
                                  try {
                                    return JSON.stringify(JSON.parse(attempt.responseBody), null, 2);
                                  } catch {
                                    return attempt.responseBody;
                                  }
                                })()}
                              </pre>
                            </details>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              <div className="flex gap-2 pt-4">
                <Button
                  onClick={() => setShowReplayDialog(true)}
                  disabled={delivery.status === 'SUCCESS'}
                  className="flex-1"
                >
                  <RefreshCw className="mr-2 h-4 w-4" />
                  {t('deliveryDetails.replayDelivery')}
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center py-16">
              <p className="text-muted-foreground">{t('deliveryDetails.noData')}</p>
            </div>
          )}
        </SheetContent>
      </Sheet>

      <AlertDialog open={showReplayDialog} onOpenChange={setShowReplayDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('deliveryDetails.replayDialog.title')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('deliveryDetails.replayDialog.description')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={replaying}>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleReplay} disabled={replaying}>
              {replaying && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {replaying ? t('deliveryDetails.replaying') : t('deliveryDetails.replay')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
