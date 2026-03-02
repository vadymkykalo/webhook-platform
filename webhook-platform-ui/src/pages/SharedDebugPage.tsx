import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { Shield, Clock, Eye, AlertTriangle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { formatDateTime } from '../lib/date';
import { debugLinksApi, SharedDebugLinkPublicResponse } from '../api/debugLinks.api';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';

export default function SharedDebugPage() {
  const { t } = useTranslation();
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<SharedDebugLinkPublicResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (!token) return;
    try {
      setLoading(true);
      const response = await debugLinksApi.viewPublic(token);
      setData(response);
    } catch (err: any) {
      const status = err?.response?.status;
      if (status === 404) {
        setError(t('sharedDebug.expired'));
      } else {
        setError(t('sharedDebug.error'));
      }
    } finally {
      setLoading(false);
    }
  }, [token, t]);

  useEffect(() => {
    if (token) loadData();
  }, [token, loadData]);

  const formatPayload = (payload: string) => {
    try {
      return JSON.stringify(JSON.parse(payload), null, 2);
    } catch {
      return payload;
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-pulse text-muted-foreground">{t('sharedDebug.loading')}</div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Card className="max-w-md w-full mx-4">
          <CardContent className="flex flex-col items-center py-12">
            <AlertTriangle className="h-12 w-12 text-destructive mb-4" />
            <h2 className="text-lg font-semibold mb-2">{t('sharedDebug.unavailable')}</h2>
            <p className="text-sm text-muted-foreground text-center">{error}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-4xl mx-auto p-6 lg:p-8">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 rounded-lg bg-primary/10">
            <Shield className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-semibold">{t('sharedDebug.title')}</h1>
            <p className="text-xs text-muted-foreground">{t('sharedDebug.subtitle')}</p>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-3 mb-6">
          <Card>
            <CardContent className="p-4">
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">{t('sharedDebug.project')}</p>
              <p className="text-sm font-medium">{data.projectName}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">{t('sharedDebug.eventType')}</p>
              <p className="text-sm font-mono font-medium">{data.eventType}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">{t('sharedDebug.eventTime')}</p>
              <p className="text-sm">{formatDateTime(data.eventCreatedAt)}</p>
            </CardContent>
          </Card>
        </div>

        <div className="flex items-center gap-4 mb-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Clock className="h-3.5 w-3.5" />
            {t('sharedDebug.expiresAt', { date: formatDateTime(data.linkExpiresAt) })}
          </span>
          <span className="flex items-center gap-1">
            <Eye className="h-3.5 w-3.5" />
            {t('sharedDebug.piiMasked')}
          </span>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Shield className="h-4 w-4 text-primary" />
              {t('sharedDebug.sanitizedPayload')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="bg-muted/50 border rounded-lg p-4 text-xs font-mono overflow-x-auto max-h-[600px] overflow-y-auto whitespace-pre-wrap">
              {formatPayload(data.sanitizedPayload)}
            </pre>
          </CardContent>
        </Card>

        <p className="text-[11px] text-muted-foreground text-center mt-6">
          {t('sharedDebug.footer')}
        </p>
      </div>
    </div>
  );
}
