import { useState, useCallback } from 'react';
import { ArrowRight, CheckCircle2, Send, Play, RotateCcw, Shield, Clock, Zap, AlertTriangle, ArrowDownToLine, Globe, ExternalLink, XCircle, Loader2, Timer } from 'lucide-react';
import { HookflowIcon } from '../components/icons/HookflowIcon';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../auth/auth.store';
import ThemeToggle from '../components/ThemeToggle';
import LanguageSwitcher from '../components/LanguageSwitcher';

type OutgoingPhase = 'idle' | 'accepted' | 'signing' | 'delivering' | 'delivered' | 'done';
type RetryPhase = 'idle' | 'attempt1' | 'failed' | 'waiting' | 'attempt2' | 'success';
type IncomingPhase = 'idle' | 'received' | 'verified' | 'forwarding' | 'done';
interface LogEntry { time: string; event: string; status: 'ok' | 'err' | 'pending'; detail: string }

const FAKE_SIG = 't=1740000000,v1=5f2c8a3e9b1d4f6a8c0e2d4b6a8f0c2e4d6b8a0c2e4f6a8d0b2c4e6f8a0b2d';
const FAKE_SECRET = 'whsec_k7Gd3jL9mN2pR5tW8xZ1bC4fH6jK8nP';
const delay = (ms: number) => new Promise(r => setTimeout(r, ms));
const ts = () => new Date().toISOString().slice(11, 19);

export default function QuickstartPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-muted/50 to-background">
      <Navigation />
      <div className="max-w-6xl mx-auto px-6 py-16">
        <Hero />
        <div className="space-y-24 mt-20">
          <OutgoingDemo />
          <SignatureDemo />
          <RetryDemo />
          <IncomingDemo />
          <DashboardPreview />
        </div>
        <FinalCTA />
      </div>
    </div>
  );
}

function Navigation() {
  const { t } = useTranslation();
  const { isAuthenticated } = useAuth();
  return (
    <nav className="sticky top-0 z-50 border-b border-border bg-card/80 backdrop-blur-lg">
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
        <div className="flex items-center space-x-8">
          <Link to="/" className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center">
              <HookflowIcon className="h-4 w-4 text-primary-foreground" />
            </div>
            <span className="text-lg font-bold">Hookflow</span>
          </Link>
          <Link to="/docs" className="text-sm text-muted-foreground hover:text-foreground transition-colors">{t('quickstartPage.nav.docs')}</Link>
        </div>
        <div className="flex items-center gap-3">
          <LanguageSwitcher />
          <ThemeToggle />
          {isAuthenticated ? (
            <Link to="/admin/projects" className="inline-flex items-center px-4 py-2 bg-primary text-primary-foreground text-sm font-medium rounded-lg hover:bg-primary/90 transition-all">
              {t('quickstartPage.nav.dashboard')} <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
            </Link>
          ) : (
            <>
              <Link to="/login" className="text-sm text-muted-foreground hover:text-foreground transition-colors">{t('quickstartPage.nav.signIn')}</Link>
              <Link to="/register" className="inline-flex items-center px-4 py-2 bg-primary text-primary-foreground text-sm font-medium rounded-lg hover:bg-primary/90 transition-all">
                {t('quickstartPage.nav.getStarted')} <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
              </Link>
            </>
          )}
        </div>
      </div>
    </nav>
  );
}

function Hero() {
  const { t } = useTranslation();
  return (
    <div className="text-center max-w-3xl mx-auto">
      <div className="inline-flex items-center px-3 py-1 bg-primary/10 text-primary text-xs font-semibold rounded-full mb-4">
        <Play className="h-3 w-3 mr-1.5" /> {t('quickstartPage.badge')}
      </div>
      <h1 className="text-5xl font-bold text-foreground mb-4 tracking-tight">{t('quickstartPage.title')}</h1>
      <p className="text-xl text-muted-foreground leading-relaxed">{t('quickstartPage.subtitle')}</p>
      <div className="flex items-center justify-center gap-6 mt-8 flex-wrap">
        {[
          { icon: Send, label: t('quickstartPage.hero.outgoing') },
          { icon: Shield, label: t('quickstartPage.hero.signatures') },
          { icon: RotateCcw, label: t('quickstartPage.hero.retries') },
          { icon: ArrowDownToLine, label: t('quickstartPage.hero.incoming') },
        ].map(({ icon: Icon, label }) => (
          <div key={label} className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Icon className="h-4 w-4 text-primary" /> {label}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── Shared UI ─── */

function SectionBadge({ icon: Icon, children }: { icon: React.ElementType; children: React.ReactNode }) {
  return (
    <div className="inline-flex items-center px-3 py-1 bg-primary/10 text-primary text-xs font-semibold rounded-full mb-4">
      <Icon className="h-3 w-3 mr-1.5" /> {children}
    </div>
  );
}

function Terminal({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl overflow-hidden border border-border shadow-lg">
      <div className="bg-slate-900 px-4 py-2 flex items-center gap-2 border-b border-white/10">
        <div className="flex gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-red-500/80" /><div className="w-2.5 h-2.5 rounded-full bg-yellow-500/80" /><div className="w-2.5 h-2.5 rounded-full bg-green-500/80" /></div>
        <span className="text-xs text-white/40 ml-2">{title}</span>
      </div>
      <div className="bg-slate-950 p-4 text-[13px] text-slate-100 overflow-x-auto leading-relaxed font-mono">{children}</div>
    </div>
  );
}

function StatusDot({ status }: { status: 'ok' | 'err' | 'pending' }) {
  const c = status === 'ok' ? 'bg-green-500' : status === 'err' ? 'bg-red-500' : 'bg-amber-500 animate-pulse';
  return <span className={`inline-block w-2 h-2 rounded-full ${c}`} />;
}

function PhasePill({ active, done, children }: { active: boolean; done: boolean; children: React.ReactNode }) {
  const c = done ? 'bg-green-100 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800'
    : active ? 'bg-primary/10 text-primary border-primary/30 animate-pulse'
    : 'bg-muted/50 text-muted-foreground border-border';
  return (
    <div className={`px-3 py-1.5 rounded-lg border text-xs font-medium flex items-center gap-1.5 ${c}`}>
      {done && <CheckCircle2 className="h-3 w-3" />}
      {active && !done && <Loader2 className="h-3 w-3 animate-spin" />}
      {children}
    </div>
  );
}

function LiveLog({ logs, color = 'green' }: { logs: LogEntry[]; color?: string }) {
  const { t } = useTranslation();
  if (!logs.length) return null;
  return (
    <div className="mt-6 rounded-xl border border-border overflow-hidden">
      <div className="px-4 py-2 bg-muted/30 border-b border-border flex items-center gap-2">
        <span className={`w-2 h-2 rounded-full bg-${color}-500 animate-pulse`} />
        <span className="text-xs font-semibold text-foreground">{t('quickstartPage.liveLog')}</span>
      </div>
      <div className="divide-y divide-border">
        {logs.map((l, i) => (
          <div key={i} className="px-4 py-2.5 flex items-center gap-3 text-sm animate-fade-in">
            <StatusDot status={l.status} />
            <span className="text-muted-foreground font-mono text-xs w-16 flex-shrink-0">{l.time}</span>
            <span className="font-medium text-foreground">{l.event}</span>
            <span className="text-muted-foreground text-xs ml-auto truncate max-w-[300px]">{l.detail}</span>
          </div>
        ))}
      </div>
    </div>
  );
}


/* ═══════════════════════════════════════════
   DEMO 1 — Outgoing Webhook
   ═══════════════════════════════════════════ */

function OutgoingDemo() {
  const { t } = useTranslation();
  const [phase, setPhase] = useState<OutgoingPhase>('idle');
  const [logs, setLogs] = useState<LogEntry[]>([]);

  const payload = {
    type: 'order.completed',
    data: { orderId: 'ord_92f1a', customerId: 'cust_7d3k8', amount: 149.99, currency: 'USD', items: [{ sku: 'PRO_PLAN', qty: 1 }] },
  };

  const run = useCallback(async () => {
    setLogs([]); setPhase('accepted');
    await delay(600);
    setLogs(l => [...l, { time: ts(), event: t('quickstartPage.outgoing.log.accepted'), status: 'ok', detail: 'evt_8a2f4c — order.completed' }]);
    setPhase('signing');
    await delay(800);
    setLogs(l => [...l, { time: ts(), event: t('quickstartPage.outgoing.log.signed'), status: 'ok', detail: `HMAC-SHA256 → ${FAKE_SIG.slice(0, 32)}…` }]);
    setPhase('delivering');
    await delay(1000);
    setLogs(l => [...l, { time: ts(), event: 'POST → api.customer.com/webhooks', status: 'pending', detail: t('quickstartPage.outgoing.log.delivering') }]);
    await delay(700);
    setPhase('delivered');
    setLogs(l => { const c = [...l]; c[c.length - 1] = { ...c[c.length - 1], status: 'ok', detail: '200 OK — 127ms' }; return c; });
    await delay(400);
    setLogs(l => [...l, { time: ts(), event: t('quickstartPage.outgoing.log.confirmed'), status: 'ok', detail: 'del_f3c9a1 — attempt 1/1' }]);
    setPhase('done');
  }, [t]);

  const reset = () => { setPhase('idle'); setLogs([]); };
  const idx = (p: OutgoingPhase) => ['idle','accepted','signing','delivering','delivered','done'].indexOf(p);
  const cur = idx(phase);

  return (
    <section>
      <SectionBadge icon={Send}>{t('quickstartPage.outgoing.badge')}</SectionBadge>
      <h2 className="text-3xl font-bold text-foreground mb-2">{t('quickstartPage.outgoing.title')}</h2>
      <p className="text-lg text-muted-foreground mb-8 max-w-2xl">{t('quickstartPage.outgoing.desc')}</p>

      <div className="flex flex-wrap gap-2 mb-6">
        <PhasePill active={cur >= 1} done={cur > 1}>{t('quickstartPage.outgoing.phases.accepted')}</PhasePill>
        <PhasePill active={cur >= 2} done={cur > 2}>{t('quickstartPage.outgoing.phases.signed')}</PhasePill>
        <PhasePill active={cur >= 3} done={cur > 3}>{t('quickstartPage.outgoing.phases.delivering')}</PhasePill>
        <PhasePill active={cur >= 4} done={cur >= 5}>{t('quickstartPage.outgoing.phases.confirmed')}</PhasePill>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div>
          <Terminal title="POST /api/v1/events">
            <div className="text-slate-500 mb-1">// X-API-Key: wh_live_k8Nm3p...</div>
            <pre className="whitespace-pre-wrap">{JSON.stringify(payload, null, 2)}</pre>
          </Terminal>
          <div className="mt-4">
            {phase === 'idle' ? (
              <button onClick={run} className="inline-flex items-center gap-2 px-6 py-3 bg-primary text-primary-foreground font-semibold rounded-lg hover:bg-primary/90 transition-all hover:scale-105 shadow-lg">
                <Play className="h-4 w-4" /> {t('quickstartPage.outgoing.sendBtn')}
              </button>
            ) : phase === 'done' ? (
              <button onClick={reset} className="inline-flex items-center gap-2 px-5 py-2.5 bg-muted text-foreground font-medium rounded-lg hover:bg-muted/80 transition-colors">
                <RotateCcw className="h-4 w-4" /> {t('quickstartPage.resetBtn')}
              </button>
            ) : (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin text-primary" /> {t('quickstartPage.processing')}
              </div>
            )}
          </div>
        </div>

        <Terminal title="api.customer.com/webhooks — received">
          {phase === 'idle' ? (
            <div className="text-slate-500 italic">{t('quickstartPage.outgoing.waiting')}</div>
          ) : cur >= 3 ? (
            <>
              <div className="text-emerald-400 mb-2">// {t('quickstartPage.outgoing.incomingRequest')}</div>
              <div className="text-slate-400 mb-1">Headers:</div>
              <div className="text-amber-300 ml-2">Content-Type: application/json</div>
              <div className="text-amber-300 ml-2">X-Signature: {FAKE_SIG.slice(0, 40)}…</div>
              <div className="text-amber-300 ml-2 mb-3">X-Timestamp: 1740000000</div>
              <div className="text-slate-400 mb-1">Body:</div>
              <pre className="whitespace-pre-wrap">{JSON.stringify(payload, null, 2)}</pre>
              {cur >= 4 && (
                <div className="mt-3 pt-3 border-t border-white/10">
                  <span className="text-emerald-400">→ 200 OK</span>
                  <span className="text-slate-500 ml-2">{'{ "received": true }'}</span>
                </div>
              )}
            </>
          ) : (
            <div className="flex items-center gap-2 text-slate-500"><Loader2 className="h-3.5 w-3.5 animate-spin" /> {t('quickstartPage.outgoing.preparing')}</div>
          )}
        </Terminal>
      </div>
      <LiveLog logs={logs} />
    </section>
  );
}

/* ═══════════════════════════════════════════
   DEMO 2 — Signature Verification
   ═══════════════════════════════════════════ */

function SignatureDemo() {
  const { t } = useTranslation();
  const [tampered, setTampered] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [result, setResult] = useState<'none' | 'valid' | 'invalid'>('none');

  const originalPayload = '{"type":"order.completed","data":{"orderId":"ord_92f1a","amount":149.99}}';
  const tamperedPayload = '{"type":"order.completed","data":{"orderId":"ord_92f1a","amount":0.01}}';

  const verify = async () => {
    setVerifying(true); setResult('none');
    await delay(1200);
    setResult(tampered ? 'invalid' : 'valid');
    setVerifying(false);
  };

  return (
    <section>
      <SectionBadge icon={Shield}>{t('quickstartPage.signature.badge')}</SectionBadge>
      <h2 className="text-3xl font-bold text-foreground mb-2">{t('quickstartPage.signature.title')}</h2>
      <p className="text-lg text-muted-foreground mb-8 max-w-2xl">{t('quickstartPage.signature.desc')}</p>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <Terminal title={t('quickstartPage.signature.payloadTitle')}>
            <div className="text-slate-500 text-xs mb-2">// {t('quickstartPage.signature.toggleHint')}</div>
            <pre className={`whitespace-pre-wrap ${tampered ? 'text-red-400' : 'text-slate-100'}`}>
              {tampered ? tamperedPayload : originalPayload}
            </pre>
            {tampered && <div className="mt-2 text-red-400 text-xs">⚠ {t('quickstartPage.signature.tamperedWarning')}</div>}
          </Terminal>
          <div className="flex items-center gap-3 mt-4">
            <button
              onClick={() => { setTampered(!tampered); setResult('none'); }}
              className={`px-4 py-2 text-sm font-medium rounded-lg border transition-colors ${tampered ? 'border-red-300 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-400' : 'border-border bg-card text-foreground hover:bg-muted'}`}
            >
              <AlertTriangle className="h-3.5 w-3.5 inline mr-1.5" />
              {tampered ? t('quickstartPage.signature.restoreBtn') : t('quickstartPage.signature.tamperBtn')}
            </button>
            <button onClick={verify} disabled={verifying} className="px-4 py-2 text-sm font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50">
              {verifying ? <Loader2 className="h-3.5 w-3.5 inline mr-1.5 animate-spin" /> : <Shield className="h-3.5 w-3.5 inline mr-1.5" />}
              {t('quickstartPage.signature.verifyBtn')}
            </button>
          </div>
        </div>

        <div className="space-y-4">
          <div className="bg-card rounded-xl border border-border p-4">
            <div className="text-xs font-semibold text-muted-foreground uppercase mb-2">{t('quickstartPage.signature.secret')}</div>
            <code className="text-xs text-primary font-mono break-all">{FAKE_SECRET}</code>
          </div>
          <div className="bg-card rounded-xl border border-border p-4">
            <div className="text-xs font-semibold text-muted-foreground uppercase mb-2">{t('quickstartPage.signature.headerLabel')}</div>
            <code className="text-[11px] text-foreground font-mono break-all leading-relaxed">{FAKE_SIG}</code>
          </div>
          {result !== 'none' && (
            <div className={`rounded-xl border p-4 animate-scale-in ${result === 'valid' ? 'bg-green-50 border-green-200 dark:bg-green-950/30 dark:border-green-800' : 'bg-red-50 border-red-200 dark:bg-red-950/30 dark:border-red-800'}`}>
              <div className="flex items-center gap-2">
                {result === 'valid' ? <CheckCircle2 className="h-5 w-5 text-green-600" /> : <XCircle className="h-5 w-5 text-red-600" />}
                <span className={`text-sm font-semibold ${result === 'valid' ? 'text-green-700 dark:text-green-400' : 'text-red-700 dark:text-red-400'}`}>
                  {result === 'valid' ? t('quickstartPage.signature.resultValid') : t('quickstartPage.signature.resultInvalid')}
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {result === 'valid' ? t('quickstartPage.signature.resultValidDesc') : t('quickstartPage.signature.resultInvalidDesc')}
              </p>
            </div>
          )}
        </div>
      </div>

      <div className="mt-8 grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { icon: Clock, title: t('quickstartPage.signature.step1'), desc: t('quickstartPage.signature.step1Desc') },
          { icon: Shield, title: t('quickstartPage.signature.step2'), desc: t('quickstartPage.signature.step2Desc') },
          { icon: CheckCircle2, title: t('quickstartPage.signature.step3'), desc: t('quickstartPage.signature.step3Desc') },
        ].map(({ icon: Icon, title, desc }) => (
          <div key={title} className="flex items-start gap-3 p-4 bg-card rounded-xl border border-border">
            <Icon className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
            <div>
              <div className="text-sm font-semibold text-foreground">{title}</div>
              <div className="text-xs text-muted-foreground">{desc}</div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}


/* ═══════════════════════════════════════════
   DEMO 3 — Retry Mechanism
   ═══════════════════════════════════════════ */

function RetryDemo() {
  const { t } = useTranslation();
  const [phase, setPhase] = useState<RetryPhase>('idle');
  const [attempts, setAttempts] = useState<{ num: number; ok: boolean; code: number; lat: string; time: string }[]>([]);
  const schedule = ['30s', '2m', '15m', '1h', '6h'];

  const run = useCallback(async () => {
    setAttempts([]); setPhase('attempt1');
    await delay(800);
    setAttempts([{ num: 1, ok: false, code: 503, lat: '2,140ms', time: ts() }]);
    setPhase('failed');
    await delay(600);
    setPhase('waiting');
    await delay(2000);
    setPhase('attempt2');
    await delay(800);
    setAttempts(a => [...a, { num: 2, ok: true, code: 200, lat: '89ms', time: ts() }]);
    setPhase('success');
  }, []);

  const reset = () => { setPhase('idle'); setAttempts([]); };

  return (
    <section>
      <SectionBadge icon={RotateCcw}>{t('quickstartPage.retry.badge')}</SectionBadge>
      <h2 className="text-3xl font-bold text-foreground mb-2">{t('quickstartPage.retry.title')}</h2>
      <p className="text-lg text-muted-foreground mb-8 max-w-2xl">{t('quickstartPage.retry.desc')}</p>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div>
          <div className="rounded-xl border border-border overflow-hidden shadow-lg">
            <div className="px-5 py-3 bg-muted/30 border-b border-border">
              <span className="text-sm font-semibold text-foreground">{t('quickstartPage.retry.attemptHistory')}</span>
            </div>
            {attempts.length === 0 && phase === 'idle' ? (
              <div className="p-8 text-center text-sm text-muted-foreground">{t('quickstartPage.retry.noAttempts')}</div>
            ) : (
              <div className="divide-y divide-border">
                {attempts.map((a, i) => (
                  <div key={i} className="px-5 py-3 flex items-center justify-between animate-fade-in">
                    <div className="flex items-center gap-3">
                      <span className="w-6 h-6 rounded-full bg-muted flex items-center justify-center text-xs font-bold text-foreground">#{a.num}</span>
                      <div>
                        <div className="text-sm font-medium text-foreground">POST api.customer.com/webhooks</div>
                        <div className="text-xs text-muted-foreground">{a.time} — {a.lat}</div>
                      </div>
                    </div>
                    <span className={`text-xs px-2.5 py-1 rounded-full font-semibold ${a.ok ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'}`}>
                      {a.code} {a.ok ? 'OK' : 'Unavailable'}
                    </span>
                  </div>
                ))}
                {phase === 'waiting' && (
                  <div className="px-5 py-3 flex items-center gap-3 animate-pulse">
                    <Timer className="h-4 w-4 text-amber-500" />
                    <span className="text-sm text-amber-600 dark:text-amber-400 font-medium">{t('quickstartPage.retry.waitingRetry')}</span>
                  </div>
                )}
                {(phase === 'attempt1' || phase === 'attempt2') && (
                  <div className="px-5 py-3 flex items-center gap-3">
                    <Loader2 className="h-4 w-4 text-primary animate-spin" />
                    <span className="text-sm text-muted-foreground">{t('quickstartPage.retry.delivering')}</span>
                  </div>
                )}
              </div>
            )}
          </div>
          <div className="mt-4">
            {phase === 'idle' ? (
              <button onClick={run} className="inline-flex items-center gap-2 px-6 py-3 bg-red-600 text-white font-semibold rounded-lg hover:bg-red-700 transition-all hover:scale-105 shadow-lg">
                <Play className="h-4 w-4" /> {t('quickstartPage.retry.simulateBtn')}
              </button>
            ) : phase === 'success' ? (
              <button onClick={reset} className="inline-flex items-center gap-2 px-5 py-2.5 bg-muted text-foreground font-medium rounded-lg hover:bg-muted/80 transition-colors">
                <RotateCcw className="h-4 w-4" /> {t('quickstartPage.resetBtn')}
              </button>
            ) : null}
          </div>
        </div>

        <div className="space-y-4">
          <div className="bg-card rounded-xl border border-border p-5">
            <div className="text-sm font-semibold text-foreground mb-4">{t('quickstartPage.retry.schedule')}</div>
            <div className="space-y-2">
              {schedule.map((interval, i) => {
                const isActive = phase === 'waiting' && i === 0;
                const isDone = phase === 'success' && i === 0;
                return (
                  <div key={i} className={`flex items-center gap-3 p-2.5 rounded-lg transition-colors ${isActive ? 'bg-amber-50 dark:bg-amber-950/20' : isDone ? 'bg-green-50 dark:bg-green-950/20' : 'bg-muted/30'}`}>
                    <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${isActive ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-400' : isDone ? 'bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-400' : 'bg-muted text-muted-foreground'}`}>
                      {i + 1}
                    </span>
                    <span className="text-sm text-foreground font-medium">{t('quickstartPage.retry.retryAfter', { interval })}</span>
                    {isActive && <Loader2 className="h-3.5 w-3.5 text-amber-500 animate-spin ml-auto" />}
                    {isDone && <CheckCircle2 className="h-3.5 w-3.5 text-green-600 ml-auto" />}
                  </div>
                );
              })}
            </div>
          </div>
          <div className="bg-card rounded-xl border border-border p-5">
            <div className="flex items-start gap-3">
              <Zap className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
              <div>
                <div className="text-sm font-semibold text-foreground">{t('quickstartPage.retry.smartRetries')}</div>
                <div className="text-xs text-muted-foreground mt-1">{t('quickstartPage.retry.smartRetriesDesc')}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}


/* ═══════════════════════════════════════════
   DEMO 4 — Incoming Webhooks
   ═══════════════════════════════════════════ */

function IncomingDemo() {
  const { t } = useTranslation();
  const [phase, setPhase] = useState<IncomingPhase>('idle');
  const [logs, setLogs] = useState<LogEntry[]>([]);

  const stripePayload = {
    id: 'evt_1R2s3T4u5V6w7X',
    type: 'payment_intent.succeeded',
    data: { object: { id: 'pi_3P4q5R6s7T8u', amount: 2499, currency: 'usd', status: 'succeeded' } },
  };

  const run = useCallback(async () => {
    setLogs([]); setPhase('received');
    await delay(600);
    setLogs(l => [...l, { time: ts(), event: t('quickstartPage.incoming.log.received'), status: 'ok', detail: 'POST /ingress/proj_a1b2/stripe — payment_intent.succeeded' }]);
    setPhase('verified');
    await delay(800);
    setLogs(l => [...l, { time: ts(), event: t('quickstartPage.incoming.log.verified'), status: 'ok', detail: 'Stripe-Signature valid — HMAC match' }]);
    setPhase('forwarding');
    await delay(900);
    setLogs(l => [...l, { time: ts(), event: t('quickstartPage.incoming.log.forwarding'), status: 'pending', detail: t('quickstartPage.incoming.log.delivering') }]);
    await delay(600);
    setPhase('done');
    setLogs(l => {
      const c = [...l];
      c[c.length - 1] = { ...c[c.length - 1], status: 'ok', detail: '200 OK — 45ms' };
      return [...c, { time: ts(), event: t('quickstartPage.incoming.log.complete'), status: 'ok', detail: 'inc_evt_9f2a1b' }];
    });
  }, [t]);

  const reset = () => { setPhase('idle'); setLogs([]); };

  return (
    <section>
      <SectionBadge icon={ArrowDownToLine}>{t('quickstartPage.incoming.badge')}</SectionBadge>
      <h2 className="text-3xl font-bold text-foreground mb-2">{t('quickstartPage.incoming.title')}</h2>
      <p className="text-lg text-muted-foreground mb-8 max-w-2xl">{t('quickstartPage.incoming.desc')}</p>

      {/* Flow: Provider → Hookflow → Your API */}
      <div className="flex items-center justify-center gap-4 mb-8 flex-wrap">
        {[
          { label: 'Stripe', sub: t('quickstartPage.incoming.provider'), cls: 'bg-violet-100 dark:bg-violet-950/40 border-violet-200 dark:border-violet-800' },
          null,
          { label: 'Hookflow', sub: t('quickstartPage.incoming.validates'), cls: 'bg-primary/10 border-primary/30' },
          null,
          { label: t('quickstartPage.incoming.yourApi'), sub: t('quickstartPage.incoming.receives'), cls: 'bg-emerald-100 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800' },
        ].map((item, i) =>
          item === null ? (
            <ArrowRight key={i} className="h-5 w-5 text-muted-foreground flex-shrink-0" />
          ) : (
            <div key={i} className={`px-5 py-3 rounded-xl border text-center ${item.cls}`}>
              <div className="text-sm font-semibold text-foreground">{item.label}</div>
              <div className="text-xs text-muted-foreground">{item.sub}</div>
            </div>
          )
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: What Stripe sends */}
        <div>
          <Terminal title="Stripe → POST /ingress/proj_a1b2/stripe">
            <div className="text-slate-500 text-xs mb-2">// Stripe webhook payload</div>
            <pre className="whitespace-pre-wrap">{JSON.stringify(stripePayload, null, 2)}</pre>
          </Terminal>
          <div className="mt-4">
            {phase === 'idle' ? (
              <button onClick={run} className="inline-flex items-center gap-2 px-6 py-3 bg-violet-600 text-white font-semibold rounded-lg hover:bg-violet-700 transition-all hover:scale-105 shadow-lg">
                <Globe className="h-4 w-4" /> {t('quickstartPage.incoming.simulateBtn')}
              </button>
            ) : phase === 'done' ? (
              <button onClick={reset} className="inline-flex items-center gap-2 px-5 py-2.5 bg-muted text-foreground font-medium rounded-lg hover:bg-muted/80 transition-colors">
                <RotateCcw className="h-4 w-4" /> {t('quickstartPage.resetBtn')}
              </button>
            ) : (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin text-violet-500" /> {t('quickstartPage.processing')}
              </div>
            )}
          </div>
        </div>

        {/* Right: What your API receives */}
        <Terminal title="api.internal.com/hooks — forwarded">
          {phase === 'idle' ? (
            <div className="text-slate-500 italic">{t('quickstartPage.incoming.waiting')}</div>
          ) : phase === 'forwarding' || phase === 'done' ? (
            <>
              <div className="text-emerald-400 mb-2">// {t('quickstartPage.incoming.forwardedPayload')}</div>
              <div className="text-slate-400 mb-1">Headers:</div>
              <div className="text-amber-300 ml-2">X-Hookflow-Source: stripe</div>
              <div className="text-amber-300 ml-2 mb-3">X-Hookflow-Event-Id: inc_evt_9f2a1b</div>
              <div className="text-slate-400 mb-1">Body:</div>
              <pre className="whitespace-pre-wrap">{JSON.stringify(stripePayload, null, 2)}</pre>
              {phase === 'done' && (
                <div className="mt-3 pt-3 border-t border-white/10">
                  <span className="text-emerald-400">→ 200 OK</span>
                  <span className="text-slate-500 ml-2">{'{ "processed": true }'}</span>
                </div>
              )}
            </>
          ) : (
            <div className="flex items-center gap-2 text-slate-500"><Loader2 className="h-3.5 w-3.5 animate-spin" /> {t('quickstartPage.incoming.verifying')}</div>
          )}
        </Terminal>
      </div>

      <LiveLog logs={logs} color="violet" />

      {/* Features */}
      <div className="mt-8 grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { icon: Globe, label: t('quickstartPage.incoming.features.uniqueUrl') },
          { icon: Shield, label: t('quickstartPage.incoming.features.hmac') },
          { icon: RotateCcw, label: t('quickstartPage.incoming.features.autoForward') },
          { icon: Zap, label: t('quickstartPage.incoming.features.logging') },
        ].map(({ icon: Icon, label }) => (
          <div key={label} className="flex items-center gap-2 p-3 bg-card rounded-xl border border-border text-xs font-medium text-foreground">
            <Icon className="h-4 w-4 text-primary flex-shrink-0" /> {label}
          </div>
        ))}
      </div>
    </section>
  );
}


/* ═══════════════════════════════════════════
   DEMO 5 — Dashboard Preview
   ═══════════════════════════════════════════ */

function DashboardPreview() {
  const { t } = useTranslation();

  const deliveries = [
    { id: 'del_f3c9a1', evt: 'order.completed', ep: 'api.customer.com/webhooks', st: 'DELIVERED' as const, code: 200, lat: '127ms', att: '1/1', ago: '2s' },
    { id: 'del_a7b2e4', evt: 'payment.failed', ep: 'notify.ops.io/hooks', st: 'RETRYING' as const, code: 503, lat: '2,140ms', att: '2/5', ago: '15s' },
    { id: 'del_c1d5f8', evt: 'user.created', ep: 'api.partner.com/wh', st: 'DELIVERED' as const, code: 200, lat: '89ms', att: '1/1', ago: '1m' },
    { id: 'del_e9g3h7', evt: 'invoice.paid', ep: 'billing.internal/hooks', st: 'DELIVERED' as const, code: 200, lat: '203ms', att: '1/1', ago: '2m' },
    { id: 'del_k4m8n2', evt: 'subscription.canceled', ep: 'hooks.crm.io/wh', st: 'FAILED' as const, code: 500, lat: '45ms', att: '5/5', ago: '5m' },
    { id: 'del_p6q1r5', evt: 'order.refunded', ep: 'api.customer.com/webhooks', st: 'DELIVERED' as const, code: 200, lat: '156ms', att: '1/1', ago: '8m' },
  ];

  const stColor = (s: string) =>
    s === 'DELIVERED' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
    : s === 'RETRYING' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
    : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400';

  return (
    <section>
      <SectionBadge icon={Zap}>{t('quickstartPage.dashboard.badge')}</SectionBadge>
      <h2 className="text-3xl font-bold text-foreground mb-2">{t('quickstartPage.dashboard.title')}</h2>
      <p className="text-lg text-muted-foreground mb-8 max-w-2xl">{t('quickstartPage.dashboard.desc')}</p>

      {/* Mock dashboard */}
      <div className="rounded-2xl border border-border overflow-hidden shadow-2xl bg-card">
        {/* Top bar */}
        <div className="px-6 py-3 border-b border-border bg-muted/30 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-6 w-6 rounded bg-primary flex items-center justify-center">
              <HookflowIcon className="h-3 w-3 text-primary-foreground" />
            </div>
            <span className="text-sm font-semibold text-foreground">Production Webhooks</span>
            <span className="text-xs px-2 py-0.5 bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 rounded-full font-medium">{t('quickstartPage.dashboard.healthy')}</span>
          </div>
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <span>3 {t('quickstartPage.dashboard.endpoints')}</span>
            <span>12 {t('quickstartPage.dashboard.eventTypes')}</span>
            <span>99.2% {t('quickstartPage.dashboard.successRate')}</span>
          </div>
        </div>

        {/* Stats */}
        <div className="px-6 py-4 grid grid-cols-4 gap-4 border-b border-border">
          {[
            { label: t('quickstartPage.dashboard.stats.total'), value: '1,247', sub: '+23%' },
            { label: t('quickstartPage.dashboard.stats.delivered'), value: '1,238', sub: '99.2%' },
            { label: t('quickstartPage.dashboard.stats.retrying'), value: '6', sub: '' },
            { label: t('quickstartPage.dashboard.stats.failed'), value: '3', sub: '' },
          ].map(s => (
            <div key={s.label} className="text-center">
              <div className="text-2xl font-bold text-foreground">{s.value}</div>
              <div className="text-xs text-muted-foreground">{s.label}</div>
              {s.sub && <div className="text-xs text-green-600 font-medium">{s.sub}</div>}
            </div>
          ))}
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/20 border-b border-border text-left">
                <th className="px-5 py-2.5 text-xs font-semibold text-muted-foreground">{t('quickstartPage.dashboard.col.event')}</th>
                <th className="px-5 py-2.5 text-xs font-semibold text-muted-foreground">{t('quickstartPage.dashboard.col.endpoint')}</th>
                <th className="px-5 py-2.5 text-xs font-semibold text-muted-foreground">{t('quickstartPage.dashboard.col.status')}</th>
                <th className="px-5 py-2.5 text-xs font-semibold text-muted-foreground">{t('quickstartPage.dashboard.col.response')}</th>
                <th className="px-5 py-2.5 text-xs font-semibold text-muted-foreground">{t('quickstartPage.dashboard.col.latency')}</th>
                <th className="px-5 py-2.5 text-xs font-semibold text-muted-foreground">{t('quickstartPage.dashboard.col.attempts')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {deliveries.map(d => (
                <tr key={d.id} className="hover:bg-muted/10 transition-colors">
                  <td className="px-5 py-3"><code className="text-xs font-mono text-foreground">{d.evt}</code></td>
                  <td className="px-5 py-3 text-xs text-muted-foreground">{d.ep}</td>
                  <td className="px-5 py-3"><span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${stColor(d.st)}`}>{d.st}</span></td>
                  <td className="px-5 py-3 font-mono text-xs text-foreground">{d.code}</td>
                  <td className="px-5 py-3 text-xs text-muted-foreground">{d.lat}</td>
                  <td className="px-5 py-3 text-xs text-muted-foreground">{d.att}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Feature highlights */}
      <div className="mt-8 grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { icon: Zap, title: t('quickstartPage.dashboard.feat.realtime'), desc: t('quickstartPage.dashboard.feat.realtimeDesc') },
          { icon: RotateCcw, title: t('quickstartPage.dashboard.feat.replay'), desc: t('quickstartPage.dashboard.feat.replayDesc') },
          { icon: Shield, title: t('quickstartPage.dashboard.feat.dlq'), desc: t('quickstartPage.dashboard.feat.dlqDesc') },
        ].map(({ icon: Icon, title, desc }) => (
          <div key={title} className="flex items-start gap-3 p-4 bg-card rounded-xl border border-border">
            <Icon className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
            <div>
              <div className="text-sm font-semibold text-foreground">{title}</div>
              <div className="text-xs text-muted-foreground">{desc}</div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════════
   Final CTA
   ═══════════════════════════════════════════ */

function FinalCTA() {
  const { t } = useTranslation();
  const { isAuthenticated } = useAuth();
  return (
    <section className="mt-24 text-center">
      <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-2xl p-12 lg:p-16 relative overflow-hidden">
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmYiIGZpbGwtb3BhY2l0eT0iMC4wMyI+PHBhdGggZD0iTTM2IDM0djZoLTZWMzRoNnptMC0zMHY2aC02VjRoNnptMCAyNHY2aC02di02aDZ6bTAgLTEydjZoLTZ2LTZoNnptLTI0IDI0djZIMnYtNmg2em0wLTMwdjZIMlY0aDZ6bTAgMjR2Nkgydi02aDZ6bTAtMTJ2Nkgydi02aDZ6bTEyIDEydjZoLTZ2LTZoNnptMC0zMHY2aC02VjRoNnptMCAyNHY2aC02di02aDZ6bTAtMTJ2NmgtNnYtNmg2eiIvPjwvZz48L2c+PC9zdmc+')] opacity-50" />
        <div className="relative z-10">
          <h2 className="text-3xl lg:text-4xl font-bold text-white mb-4">{t('quickstartPage.cta.title')}</h2>
          <p className="text-lg text-slate-300 mb-10 max-w-2xl mx-auto">{t('quickstartPage.cta.subtitle')}</p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              to={isAuthenticated ? '/admin/projects' : '/register'}
              className="inline-flex items-center px-8 py-4 bg-white text-slate-900 text-base font-semibold rounded-lg hover:bg-slate-100 transition-all hover:scale-105 shadow-xl"
            >
              {isAuthenticated ? t('quickstartPage.cta.goToDashboard') : t('quickstartPage.cta.createAccount')} <ArrowRight className="ml-2 h-5 w-5" />
            </Link>
            <Link to="/docs" className="inline-flex items-center px-8 py-4 border-2 border-white/20 text-white text-base font-semibold rounded-lg hover:bg-white/10 transition-colors">
              {t('quickstartPage.cta.readDocs')} <ExternalLink className="ml-2 h-4 w-4" />
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
