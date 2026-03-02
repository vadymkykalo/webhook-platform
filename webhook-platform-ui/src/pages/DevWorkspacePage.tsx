import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { Send, ShieldCheck, RefreshCw, Loader2, Copy, CheckCircle2, XCircle, Terminal } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { showApiError, showSuccess, showWarning } from '../lib/toast';
import { eventsApi } from '../api/events.api';
import { deliveriesApi } from '../api/deliveries.api';
import { useProject } from '../api/queries';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Card, CardContent, CardHeader } from '../components/ui/card';
import { cn } from '../lib/utils';
import EmptyState from '../components/EmptyState';
import PageSkeleton from '../components/PageSkeleton';

type Tab = 'send' | 'verify' | 'replay';

function SendEventTab({ projectId }: { projectId: string }) {
  const { t } = useTranslation();
  const [eventType, setEventType] = useState('');
  const [payload, setPayload] = useState('{\n  "user_id": "123",\n  "action": "created"\n}');
  const [sending, setSending] = useState(false);
  const [jsonError, setJsonError] = useState('');
  const [result, setResult] = useState<{ eventId: string; deliveriesCreated: number } | null>(null);

  const validateJson = (text: string): boolean => {
    try {
      JSON.parse(text);
      setJsonError('');
      return true;
    } catch {
      setJsonError(t('devWorkspace.send.invalidJson'));
      return false;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateJson(payload)) {
      showWarning(t('devWorkspace.send.fixJson'));
      return;
    }
    setSending(true);
    setResult(null);
    try {
      const data = JSON.parse(payload);
      const response = await eventsApi.sendTestEvent(projectId, { type: eventType, data });
      setResult({ eventId: response.id, deliveriesCreated: response.deliveriesCreated || 0 });
      showSuccess(t('devWorkspace.send.success', { count: response.deliveriesCreated || 0 }));
    } catch (err: any) {
      showApiError(err, 'devWorkspace.send.failed');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-4">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="eventType">{t('devWorkspace.send.eventType')}</Label>
          <Input
            id="eventType"
            placeholder="user.created"
            value={eventType}
            onChange={(e) => setEventType(e.target.value)}
            required
            disabled={sending}
            autoFocus
          />
          <p className="text-xs text-muted-foreground">{t('devWorkspace.send.eventTypeHint')}</p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="payload">{t('devWorkspace.send.payload')}</Label>
          <Textarea
            id="payload"
            value={payload}
            onChange={(e) => { setPayload(e.target.value); if (e.target.value.trim()) validateJson(e.target.value); else setJsonError(''); }}
            disabled={sending}
            rows={10}
            className="font-mono text-sm"
          />
          {jsonError && <p className="text-sm text-destructive">{jsonError}</p>}
        </div>

        <Button type="submit" disabled={sending || !!jsonError} className="w-full">
          {sending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
          {sending ? t('devWorkspace.send.sending') : t('devWorkspace.send.submit')}
        </Button>
      </form>

      {result && (
        <Card className="border-success/30 bg-success/5">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle2 className="h-4 w-4 text-success" />
              <span className="text-sm font-semibold">{t('devWorkspace.send.resultTitle')}</span>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <span className="text-muted-foreground">{t('devWorkspace.send.eventId')}</span>
                <div className="flex items-center gap-1 mt-0.5">
                  <code className="font-mono text-xs">{result.eventId.substring(0, 12)}...</code>
                  <button onClick={() => { navigator.clipboard.writeText(result.eventId); showSuccess(t('common.copied')); }}>
                    <Copy className="h-3 w-3 text-muted-foreground hover:text-foreground" />
                  </button>
                </div>
              </div>
              <div>
                <span className="text-muted-foreground">{t('devWorkspace.send.deliveries')}</span>
                <p className="font-semibold mt-0.5">{result.deliveriesCreated}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function VerifySignatureTab() {
  const { t } = useTranslation();
  const [secret, setSecret] = useState('');
  const [sigHeader, setSigHeader] = useState('');
  const [body, setBody] = useState('');
  const [result, setResult] = useState<'valid' | 'invalid' | null>(null);

  const handleVerify = (e: React.FormEvent) => {
    e.preventDefault();
    try {
      // Parse the signature header: v1,timestamp.signature
      const parts = sigHeader.split(',');
      const v1Part = parts.find(p => p.startsWith('v1,') || p.startsWith('v1=')) || parts[0];
      const [timestampStr, signature] = (v1Part || '').replace('v1,', '').replace('v1=', '').split('.');

      if (!timestampStr || !signature || !secret || !body) {
        setResult('invalid');
        return;
      }

      // Reconstruct signed content: timestamp.body
      const signedContent = `${timestampStr}.${body}`;

      // Compute HMAC-SHA256
      const encoder = new TextEncoder();
      crypto.subtle.importKey(
        'raw',
        encoder.encode(secret),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
      ).then(key =>
        crypto.subtle.sign('HMAC', key, encoder.encode(signedContent))
      ).then(sig => {
        const computed = Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
        setResult(computed === signature ? 'valid' : 'invalid');
      }).catch(() => setResult('invalid'));
    } catch {
      setResult('invalid');
    }
  };

  return (
    <form onSubmit={handleVerify} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="secret">{t('devWorkspace.verify.secret')}</Label>
        <Input
          id="secret"
          type="password"
          placeholder="whsec_..."
          value={secret}
          onChange={(e) => { setSecret(e.target.value); setResult(null); }}
          required
          autoFocus
        />
        <p className="text-xs text-muted-foreground">{t('devWorkspace.verify.secretHint')}</p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="sigHeader">{t('devWorkspace.verify.signatureHeader')}</Label>
        <Input
          id="sigHeader"
          placeholder="v1,1234567890.abcdef..."
          value={sigHeader}
          onChange={(e) => { setSigHeader(e.target.value); setResult(null); }}
          required
          className="font-mono text-sm"
        />
        <p className="text-xs text-muted-foreground">{t('devWorkspace.verify.signatureHint')}</p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="body">{t('devWorkspace.verify.body')}</Label>
        <Textarea
          id="body"
          value={body}
          onChange={(e) => { setBody(e.target.value); setResult(null); }}
          required
          rows={8}
          className="font-mono text-sm"
          placeholder='{"type":"user.created","data":{...}}'
        />
      </div>

      <Button type="submit" className="w-full">
        <ShieldCheck className="mr-2 h-4 w-4" />
        {t('devWorkspace.verify.submit')}
      </Button>

      {result && (
        <Card className={result === 'valid' ? 'border-success/30 bg-success/5' : 'border-destructive/30 bg-destructive/5'}>
          <CardContent className="p-4 flex items-center gap-3">
            {result === 'valid' ? (
              <>
                <CheckCircle2 className="h-5 w-5 text-success flex-shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-success">{t('devWorkspace.verify.valid')}</p>
                  <p className="text-xs text-muted-foreground">{t('devWorkspace.verify.validDesc')}</p>
                </div>
              </>
            ) : (
              <>
                <XCircle className="h-5 w-5 text-destructive flex-shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-destructive">{t('devWorkspace.verify.invalid')}</p>
                  <p className="text-xs text-muted-foreground">{t('devWorkspace.verify.invalidDesc')}</p>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}
    </form>
  );
}

function QuickReplayTab(_props: { projectId: string }) {
  const { t } = useTranslation();
  const [deliveryId, setDeliveryId] = useState('');
  const [replaying, setReplaying] = useState(false);
  const [result, setResult] = useState<'success' | 'error' | null>(null);
  const [errorMsg, setErrorMsg] = useState('');

  const handleReplay = async (e: React.FormEvent) => {
    e.preventDefault();
    setReplaying(true);
    setResult(null);
    setErrorMsg('');
    try {
      await deliveriesApi.replay(deliveryId);
      setResult('success');
      showSuccess(t('devWorkspace.replay.success'));
    } catch (err: any) {
      setResult('error');
      setErrorMsg(err?.response?.data?.message || err?.message || t('devWorkspace.replay.failed'));
      showApiError(err, 'devWorkspace.replay.failed');
    } finally {
      setReplaying(false);
    }
  };

  return (
    <form onSubmit={handleReplay} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="deliveryId">{t('devWorkspace.replay.deliveryId')}</Label>
        <Input
          id="deliveryId"
          placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
          value={deliveryId}
          onChange={(e) => { setDeliveryId(e.target.value); setResult(null); }}
          required
          className="font-mono text-sm"
          autoFocus
        />
        <p className="text-xs text-muted-foreground">{t('devWorkspace.replay.deliveryIdHint')}</p>
      </div>

      <Button type="submit" disabled={replaying || !deliveryId.trim()} className="w-full">
        {replaying ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
        {replaying ? t('devWorkspace.replay.replaying') : t('devWorkspace.replay.submit')}
      </Button>

      {result === 'success' && (
        <Card className="border-success/30 bg-success/5">
          <CardContent className="p-4 flex items-center gap-3">
            <CheckCircle2 className="h-5 w-5 text-success flex-shrink-0" />
            <div>
              <p className="text-sm font-semibold text-success">{t('devWorkspace.replay.successTitle')}</p>
              <p className="text-xs text-muted-foreground">{t('devWorkspace.replay.successDesc')}</p>
            </div>
          </CardContent>
        </Card>
      )}
      {result === 'error' && (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="p-4 flex items-center gap-3">
            <XCircle className="h-5 w-5 text-destructive flex-shrink-0" />
            <div>
              <p className="text-sm font-semibold text-destructive">{t('devWorkspace.replay.errorTitle')}</p>
              <p className="text-xs text-muted-foreground font-mono">{errorMsg}</p>
            </div>
          </CardContent>
        </Card>
      )}
    </form>
  );
}

export default function DevWorkspacePage() {
  const { t } = useTranslation();
  const { projectId } = useParams<{ projectId: string }>();
  const { data: project, isLoading } = useProject(projectId);
  const [activeTab, setActiveTab] = useState<Tab>('send');

  if (isLoading) {
    return <PageSkeleton><div className="h-96" /></PageSkeleton>;
  }

  if (!project) {
    return (
      <div className="p-6 lg:p-8 max-w-4xl mx-auto">
        <EmptyState icon={Terminal} title={t('devWorkspace.projectNotFound')} />
      </div>
    );
  }

  const tabs: { key: Tab; icon: React.ElementType; labelKey: string }[] = [
    { key: 'send', icon: Send, labelKey: 'devWorkspace.tabs.send' },
    { key: 'verify', icon: ShieldCheck, labelKey: 'devWorkspace.tabs.verify' },
    { key: 'replay', icon: RefreshCw, labelKey: 'devWorkspace.tabs.replay' },
  ];

  return (
    <div className="p-6 lg:p-8 max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="text-title tracking-tight">{t('devWorkspace.title')}</h1>
        <p className="text-sm text-muted-foreground mt-1" dangerouslySetInnerHTML={{ __html: t('devWorkspace.subtitle', { project: project.name }) }} />
      </div>

      <Card>
        <CardHeader className="pb-0">
          <div className="flex gap-1 p-0.5 bg-muted rounded-lg">
            {tabs.map(tab => {
              const TabIcon = tab.icon;
              return (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={cn(
                    'flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium transition-all',
                    activeTab === tab.key
                      ? 'bg-card text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  <TabIcon className="h-4 w-4" />
                  {t(tab.labelKey)}
                </button>
              );
            })}
          </div>
        </CardHeader>
        <CardContent className="pt-6">
          {activeTab === 'send' && <SendEventTab projectId={projectId!} />}
          {activeTab === 'verify' && <VerifySignatureTab />}
          {activeTab === 'replay' && <QuickReplayTab projectId={projectId!} />}
        </CardContent>
      </Card>
    </div>
  );
}
