import { useState, useCallback } from 'react';
import { ArrowRight, ArrowLeft, CheckCircle2, Copy, Send, Play, RotateCcw, Shield, Zap, ExternalLink, Loader2, Key, FolderPlus, Link2, Bell, BarChart3, Plus, Check, AlertTriangle, Timer } from 'lucide-react';
import { HookflowIcon } from '../components/icons/HookflowIcon';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../auth/auth.store';
import ThemeToggle from '../components/ThemeToggle';
import LanguageSwitcher from '../components/LanguageSwitcher';

/* ─── Types ─── */

interface WizardData {
  projectId: string;
  projectName: string;
  apiKey: string;
  endpointId: string;
  endpointUrl: string;
  endpointDesc: string;
  endpointSecret: string;
  eventTypes: string[];
  sentEventId: string;
  deliveryId: string;
}

type StepPhase = 'form' | 'loading' | 'done';

const DEFAULTS: WizardData = {
  projectId: 'proj_a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  projectName: 'Production Webhooks',
  apiKey: 'wh_live_k8Nm3pR5tW8xZ1bC4fH6jK8nP0qS2uV4wX6yA9',
  endpointId: 'ep_x1y2z3a4-b5c6-7890-defg-hi1234567890',
  endpointUrl: 'https://api.yourapp.com/webhooks',
  endpointDesc: 'Production webhook receiver',
  endpointSecret: 'whsec_k7Gd3jL9mN2pR5tW8xZ1bC4fH6jK8nP',
  eventTypes: ['order.completed', 'payment.failed', 'user.created'],
  sentEventId: 'evt_8a2f4c6e-1b3d-5f7a-9c0e-2d4b6a8f0c2e',
  deliveryId: 'del_f3c9a1b2-e4d5-6f78-90ab-cdef12345678',
};

const ALL_EVENT_TYPES = ['order.completed', 'order.refunded', 'payment.failed', 'payment.succeeded', 'user.created', 'user.updated', 'invoice.paid', 'subscription.canceled'];

const delay = (ms: number) => new Promise(r => setTimeout(r, ms));
const ts = () => new Date().toISOString().slice(11, 19);

const STEPS = [
  { key: 'project', icon: FolderPlus },
  { key: 'apiKey', icon: Key },
  { key: 'endpoint', icon: Link2 },
  { key: 'subscribe', icon: Bell },
  { key: 'send', icon: Send },
  { key: 'monitor', icon: BarChart3 },
] as const;

/* ─── Page ─── */

export default function QuickstartPage() {
  const [step, setStep] = useState(1);
  const [maxStep, setMaxStep] = useState(1);
  const [data, setData] = useState<WizardData>({ ...DEFAULTS });

  const goNext = () => {
    const next = Math.min(step + 1, 6);
    setStep(next);
    setMaxStep(m => Math.max(m, next));
  };
  const goBack = () => setStep(s => Math.max(s - 1, 1));
  const goTo = (s: number) => { if (s <= maxStep) setStep(s); };

  return (
    <div className="min-h-screen bg-gradient-to-b from-muted/50 to-background">
      <Navigation />
      <div className="max-w-5xl mx-auto px-6 py-12">
        <Hero />
        <Breadcrumbs step={step} maxStep={maxStep} onStep={goTo} />
        <div className="mt-8">
          {step === 1 && <StepProject data={data} setData={setData} onNext={goNext} />}
          {step === 2 && <StepApiKey data={data} onNext={goNext} onBack={goBack} />}
          {step === 3 && <StepEndpoint data={data} setData={setData} onNext={goNext} onBack={goBack} />}
          {step === 4 && <StepSubscribe data={data} setData={setData} onNext={goNext} onBack={goBack} />}
          {step === 5 && <StepSendEvent data={data} onNext={goNext} onBack={goBack} />}
          {step === 6 && <StepMonitor data={data} onBack={goBack} />}
        </div>
      </div>
    </div>
  );
}

/* ─── Navigation ─── */

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

/* ─── Hero ─── */

function Hero() {
  const { t } = useTranslation();
  return (
    <div className="text-center max-w-3xl mx-auto mb-10">
      <div className="inline-flex items-center px-3 py-1 bg-primary/10 text-primary text-xs font-semibold rounded-full mb-4">
        <Play className="h-3 w-3 mr-1.5" /> {t('quickstartPage.badge')}
      </div>
      <h1 className="text-4xl font-bold text-foreground mb-3 tracking-tight">{t('quickstartPage.title')}</h1>
      <p className="text-lg text-muted-foreground leading-relaxed">{t('quickstartPage.subtitle')}</p>
    </div>
  );
}

/* ─── Breadcrumbs ─── */

function Breadcrumbs({ step, maxStep, onStep }: { step: number; maxStep: number; onStep: (s: number) => void }) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center justify-center gap-0">
      {STEPS.map((s, i) => {
        const num = i + 1;
        const isActive = num === step;
        const isDone = num < step;
        const isReachable = num <= maxStep;
        const Icon = s.icon;
        return (
          <div key={s.key} className="flex items-center">
            <button
              onClick={() => isReachable && onStep(num)}
              disabled={!isReachable}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                isActive ? 'bg-primary text-primary-foreground shadow-md' :
                isDone ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 hover:bg-green-200 dark:hover:bg-green-900/50 cursor-pointer' :
                isReachable ? 'bg-muted text-foreground hover:bg-muted/80 cursor-pointer' :
                'bg-muted/50 text-muted-foreground cursor-not-allowed'
              }`}
            >
              {isDone ? <Check className="h-3.5 w-3.5" /> : <Icon className="h-3.5 w-3.5" />}
              <span className="hidden sm:inline">{t(`quickstartPage.breadcrumb.${s.key}`)}</span>
              <span className="sm:hidden">{num}</span>
            </button>
            {i < STEPS.length - 1 && (
              <div className={`w-6 lg:w-10 h-px mx-1 ${num < step ? 'bg-green-400' : 'bg-border'}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ─── Shared UI ─── */

function StepCard({ children }: { children: React.ReactNode }) {
  return <div className="bg-card rounded-2xl border border-border shadow-lg overflow-hidden animate-fade-in">{children}</div>;
}

function StepHeader({ icon: Icon, step, title, desc }: { icon: React.ElementType; step: number; title: string; desc: string }) {
  const { t } = useTranslation();
  return (
    <div className="px-8 py-6 border-b border-border bg-muted/20">
      <div className="flex items-center gap-3 mb-2">
        <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
          <Icon className="h-4 w-4 text-primary" />
        </div>
        <span className="text-xs font-semibold text-muted-foreground uppercase">{t('quickstartPage.stepLabel', { step, total: 6 })}</span>
      </div>
      <h2 className="text-2xl font-bold text-foreground">{title}</h2>
      <p className="text-muted-foreground mt-1">{desc}</p>
    </div>
  );
}

function NavButtons({ onBack, onNext, nextLabel, nextDisabled, loading }: {
  onBack?: () => void; onNext?: () => void; nextLabel?: string; nextDisabled?: boolean; loading?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <div className="px-8 py-5 border-t border-border bg-muted/10 flex items-center justify-between">
      {onBack ? (
        <button onClick={onBack} className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="h-4 w-4" /> {t('quickstartPage.back')}
        </button>
      ) : <div />}
      {onNext && (
        <button
          onClick={onNext}
          disabled={nextDisabled || loading}
          className="inline-flex items-center gap-2 px-6 py-2.5 bg-primary text-primary-foreground text-sm font-semibold rounded-lg hover:bg-primary/90 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {nextLabel || t('quickstartPage.next')}
          {!loading && <ArrowRight className="h-4 w-4" />}
        </button>
      )}
    </div>
  );
}

function ResultBanner({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-8 my-6 p-4 bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800 rounded-xl flex items-start gap-3 animate-scale-in">
      <CheckCircle2 className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
      <div className="flex-1">{children}</div>
    </div>
  );
}

function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
      className="p-1.5 rounded-md bg-muted/50 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
    >
      {copied ? <Check className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  );
}

function FieldRow({ label, value, mono, copyable }: { label: string; value: string; mono?: boolean; copyable?: boolean }) {
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-border last:border-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <div className="flex items-center gap-2">
        <span className={`text-sm text-foreground ${mono ? 'font-mono' : 'font-medium'}`}>{value}</span>
        {copyable && <CopyBtn text={value} />}
      </div>
    </div>
  );
}


/* ═══════════════════════════════════════════
   Step 1 — Create Project
   ═══════════════════════════════════════════ */

function StepProject({ data, setData, onNext }: { data: WizardData; setData: (fn: (d: WizardData) => WizardData) => void; onNext: () => void }) {
  const { t } = useTranslation();
  const [phase, setPhase] = useState<StepPhase>('form');

  const submit = async () => {
    setPhase('loading');
    await delay(1200);
    setPhase('done');
  };

  return (
    <StepCard>
      <StepHeader icon={FolderPlus} step={1} title={t('quickstartPage.step1.title')} desc={t('quickstartPage.step1.desc')} />
      <div className="px-8 py-6">
        {phase === 'form' && (
          <div className="max-w-md space-y-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">{t('quickstartPage.step1.nameLabel')}</label>
              <input
                value={data.projectName}
                onChange={e => setData(d => ({ ...d, projectName: e.target.value }))}
                className="w-full px-4 py-2.5 rounded-lg border border-border bg-background text-foreground text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors"
                placeholder={t('quickstartPage.step1.namePlaceholder')}
              />
            </div>
            <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
              <span className="px-2 py-1 bg-muted rounded-md flex items-center gap-1"><CheckCircle2 className="h-3 w-3 text-green-600" /> {t('quickstartPage.step1.feat1')}</span>
              <span className="px-2 py-1 bg-muted rounded-md flex items-center gap-1"><CheckCircle2 className="h-3 w-3 text-green-600" /> {t('quickstartPage.step1.feat2')}</span>
              <span className="px-2 py-1 bg-muted rounded-md flex items-center gap-1"><CheckCircle2 className="h-3 w-3 text-green-600" /> {t('quickstartPage.step1.feat3')}</span>
            </div>
            <button onClick={submit} disabled={!data.projectName.trim()} className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary text-primary-foreground text-sm font-semibold rounded-lg hover:bg-primary/90 transition-all disabled:opacity-50">
              <Plus className="h-4 w-4" /> {t('quickstartPage.step1.createBtn')}
            </button>
          </div>
        )}
        {phase === 'loading' && (
          <div className="flex items-center gap-3 text-muted-foreground py-8">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
            <span className="text-sm">{t('quickstartPage.step1.creating')}</span>
          </div>
        )}
        {phase === 'done' && (
          <ResultBanner>
            <div className="text-sm font-semibold text-green-700 dark:text-green-400 mb-3">{t('quickstartPage.step1.created')}</div>
            <div className="bg-card rounded-lg border border-border p-4">
              <FieldRow label={t('quickstartPage.field.id')} value={data.projectId} mono copyable />
              <FieldRow label={t('quickstartPage.field.name')} value={data.projectName} />
              <FieldRow label={t('quickstartPage.field.org')} value="org_default" mono />
              <FieldRow label={t('quickstartPage.field.created')} value={new Date().toISOString().slice(0, 19) + 'Z'} mono />
            </div>
          </ResultBanner>
        )}
      </div>
      <NavButtons onNext={phase === 'done' ? onNext : undefined} />
    </StepCard>
  );
}

/* ═══════════════════════════════════════════
   Step 2 — Generate API Key
   ═══════════════════════════════════════════ */

function StepApiKey({ data, onNext, onBack }: { data: WizardData; onNext: () => void; onBack: () => void }) {
  const { t } = useTranslation();
  const [phase, setPhase] = useState<StepPhase>('form');

  const generate = async () => {
    setPhase('loading');
    await delay(1000);
    setPhase('done');
  };

  return (
    <StepCard>
      <StepHeader icon={Key} step={2} title={t('quickstartPage.step2.title')} desc={t('quickstartPage.step2.desc')} />
      <div className="px-8 py-6">
        {/* Project context */}
        <div className="mb-6 p-3 bg-muted/30 rounded-lg border border-border flex items-center gap-3">
          <FolderPlus className="h-4 w-4 text-primary" />
          <span className="text-sm text-foreground font-medium">{data.projectName}</span>
          <span className="text-xs text-muted-foreground font-mono">{data.projectId.slice(0, 20)}…</span>
        </div>

        {phase === 'form' && (
          <button onClick={generate} className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary text-primary-foreground text-sm font-semibold rounded-lg hover:bg-primary/90 transition-all">
            <Key className="h-4 w-4" /> {t('quickstartPage.step2.generateBtn')}
          </button>
        )}
        {phase === 'loading' && (
          <div className="flex items-center gap-3 text-muted-foreground py-4">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
            <span className="text-sm">{t('quickstartPage.step2.generating')}</span>
          </div>
        )}
        {phase === 'done' && (
          <>
            <ResultBanner>
              <div className="text-sm font-semibold text-green-700 dark:text-green-400 mb-3">{t('quickstartPage.step2.created')}</div>
              <div className="bg-card rounded-lg border border-border p-4">
                <div className="flex items-center justify-between">
                  <code className="text-sm font-mono text-foreground break-all">{data.apiKey}</code>
                  <CopyBtn text={data.apiKey} />
                </div>
              </div>
            </ResultBanner>
            <div className="mx-8 p-3 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-lg flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-600 flex-shrink-0 mt-0.5" />
              <span className="text-xs text-amber-800 dark:text-amber-300">{t('quickstartPage.step2.warning')}</span>
            </div>
          </>
        )}
      </div>
      <NavButtons onBack={onBack} onNext={phase === 'done' ? onNext : undefined} />
    </StepCard>
  );
}

/* ═══════════════════════════════════════════
   Step 3 — Create Endpoint
   ═══════════════════════════════════════════ */

function StepEndpoint({ data, setData, onNext, onBack }: { data: WizardData; setData: (fn: (d: WizardData) => WizardData) => void; onNext: () => void; onBack: () => void }) {
  const { t } = useTranslation();
  const [phase, setPhase] = useState<StepPhase>('form');

  const submit = async () => {
    setPhase('loading');
    await delay(1200);
    setPhase('done');
  };

  return (
    <StepCard>
      <StepHeader icon={Link2} step={3} title={t('quickstartPage.step3.title')} desc={t('quickstartPage.step3.desc')} />
      <div className="px-8 py-6">
        {phase === 'form' && (
          <div className="max-w-lg space-y-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">{t('quickstartPage.step3.urlLabel')}</label>
              <input
                value={data.endpointUrl}
                onChange={e => setData(d => ({ ...d, endpointUrl: e.target.value }))}
                className="w-full px-4 py-2.5 rounded-lg border border-border bg-background text-foreground text-sm font-mono focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors"
                placeholder="https://..."
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">{t('quickstartPage.step3.descLabel')}</label>
              <input
                value={data.endpointDesc}
                onChange={e => setData(d => ({ ...d, endpointDesc: e.target.value }))}
                className="w-full px-4 py-2.5 rounded-lg border border-border bg-background text-foreground text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors"
              />
            </div>
            <button onClick={submit} disabled={!data.endpointUrl.trim()} className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary text-primary-foreground text-sm font-semibold rounded-lg hover:bg-primary/90 transition-all disabled:opacity-50">
              <Plus className="h-4 w-4" /> {t('quickstartPage.step3.createBtn')}
            </button>
          </div>
        )}
        {phase === 'loading' && (
          <div className="flex items-center gap-3 text-muted-foreground py-8">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
            <span className="text-sm">{t('quickstartPage.step3.creating')}</span>
          </div>
        )}
        {phase === 'done' && (
          <>
            <ResultBanner>
              <div className="text-sm font-semibold text-green-700 dark:text-green-400 mb-3">{t('quickstartPage.step3.created')}</div>
              <div className="bg-card rounded-lg border border-border p-4">
                <FieldRow label={t('quickstartPage.field.id')} value={data.endpointId} mono copyable />
                <FieldRow label="URL" value={data.endpointUrl} mono copyable />
                <FieldRow label={t('quickstartPage.field.description')} value={data.endpointDesc} />
              </div>
            </ResultBanner>
            <div className="mx-8 mb-2">
              <div className="p-4 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-lg">
                <div className="flex items-start gap-2 mb-2">
                  <Shield className="h-4 w-4 text-amber-600 flex-shrink-0 mt-0.5" />
                  <span className="text-sm font-semibold text-foreground">{t('quickstartPage.step3.secretTitle')}</span>
                </div>
                <div className="flex items-center gap-2 bg-card rounded-md border border-border p-3">
                  <code className="text-sm font-mono text-foreground break-all flex-1">{data.endpointSecret}</code>
                  <CopyBtn text={data.endpointSecret} />
                </div>
                <p className="text-xs text-amber-800 dark:text-amber-300 mt-2">{t('quickstartPage.step3.secretHint')}</p>
              </div>
            </div>
          </>
        )}
      </div>
      <NavButtons onBack={onBack} onNext={phase === 'done' ? onNext : undefined} />
    </StepCard>
  );
}


/* ═══════════════════════════════════════════
   Step 4 — Subscribe to Events
   ═══════════════════════════════════════════ */

function StepSubscribe({ data, setData, onNext, onBack }: { data: WizardData; setData: (fn: (d: WizardData) => WizardData) => void; onNext: () => void; onBack: () => void }) {
  const { t } = useTranslation();
  const [phase, setPhase] = useState<StepPhase>('form');

  const toggle = (evt: string) => {
    setData(d => ({
      ...d,
      eventTypes: d.eventTypes.includes(evt)
        ? d.eventTypes.filter(e => e !== evt)
        : [...d.eventTypes, evt],
    }));
  };

  const submit = async () => {
    setPhase('loading');
    await delay(900);
    setPhase('done');
  };

  return (
    <StepCard>
      <StepHeader icon={Bell} step={4} title={t('quickstartPage.step4.title')} desc={t('quickstartPage.step4.desc')} />
      <div className="px-8 py-6">
        {/* Endpoint context */}
        <div className="mb-6 p-3 bg-muted/30 rounded-lg border border-border flex items-center gap-3">
          <Link2 className="h-4 w-4 text-primary" />
          <span className="text-sm text-foreground font-mono">{data.endpointUrl}</span>
        </div>

        {phase === 'form' && (
          <div className="space-y-4">
            <label className="block text-sm font-medium text-foreground">{t('quickstartPage.step4.selectLabel')}</label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {ALL_EVENT_TYPES.map(evt => {
                const checked = data.eventTypes.includes(evt);
                return (
                  <button
                    key={evt}
                    onClick={() => toggle(evt)}
                    className={`px-3 py-2.5 rounded-lg border text-xs font-mono text-left transition-all ${
                      checked
                        ? 'border-primary bg-primary/5 text-primary ring-1 ring-primary/20'
                        : 'border-border bg-card text-muted-foreground hover:border-primary/30 hover:text-foreground'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <div className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${checked ? 'bg-primary border-primary' : 'border-border'}`}>
                        {checked && <Check className="h-2.5 w-2.5 text-primary-foreground" />}
                      </div>
                      {evt}
                    </div>
                  </button>
                );
              })}
            </div>
            <button onClick={submit} disabled={data.eventTypes.length === 0} className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary text-primary-foreground text-sm font-semibold rounded-lg hover:bg-primary/90 transition-all disabled:opacity-50 mt-2">
              <Bell className="h-4 w-4" /> {t('quickstartPage.step4.subscribeBtn')}
            </button>
          </div>
        )}
        {phase === 'loading' && (
          <div className="flex items-center gap-3 text-muted-foreground py-8">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
            <span className="text-sm">{t('quickstartPage.step4.subscribing')}</span>
          </div>
        )}
        {phase === 'done' && (
          <ResultBanner>
            <div className="text-sm font-semibold text-green-700 dark:text-green-400 mb-3">{t('quickstartPage.step4.subscribed')}</div>
            <div className="bg-card rounded-lg border border-border p-4 space-y-2">
              <FieldRow label={t('quickstartPage.field.endpoint')} value={data.endpointUrl} mono />
              <div className="pt-2">
                <span className="text-xs font-medium text-muted-foreground">{t('quickstartPage.step4.eventTypes')}</span>
                <div className="flex flex-wrap gap-1.5 mt-1.5">
                  {data.eventTypes.map(evt => (
                    <span key={evt} className="px-2 py-1 bg-primary/10 text-primary text-xs font-mono rounded-md">{evt}</span>
                  ))}
                </div>
              </div>
            </div>
          </ResultBanner>
        )}
      </div>
      <NavButtons onBack={onBack} onNext={phase === 'done' ? onNext : undefined} />
    </StepCard>
  );
}

/* ═══════════════════════════════════════════
   Step 5 — Send Event (with animated delivery)
   ═══════════════════════════════════════════ */

type DeliveryPhase = 'idle' | 'accepted' | 'signing' | 'delivering' | 'delivered' | 'done';

function StepSendEvent({ data, onNext, onBack }: { data: WizardData; onNext: () => void; onBack: () => void }) {
  const { t } = useTranslation();
  const [deliveryPhase, setDeliveryPhase] = useState<DeliveryPhase>('idle');
  const [logs, setLogs] = useState<{ time: string; text: string; status: 'ok' | 'pending' }[]>([]);

  const payload = JSON.stringify({
    type: data.eventTypes[0] || 'order.completed',
    data: {
      orderId: 'ord_12345',
      customerId: 'cust_67890',
      amount: 99.99,
      currency: 'USD',
      items: [{ name: 'Pro Plan', quantity: 1, price: 99.99 }],
    },
  }, null, 2);

  const send = useCallback(async () => {
    setLogs([]); setDeliveryPhase('accepted');
    await delay(600);
    setLogs(l => [...l, { time: ts(), text: t('quickstartPage.step5.log.accepted', { id: data.sentEventId.slice(0, 16) }), status: 'ok' }]);

    setDeliveryPhase('signing');
    await delay(700);
    setLogs(l => [...l, { time: ts(), text: t('quickstartPage.step5.log.signed'), status: 'ok' }]);

    setDeliveryPhase('delivering');
    await delay(900);
    setLogs(l => [...l, { time: ts(), text: t('quickstartPage.step5.log.delivering', { url: data.endpointUrl }), status: 'pending' }]);

    await delay(800);
    setDeliveryPhase('delivered');
    setLogs(l => { const c = [...l]; c[c.length - 1] = { ...c[c.length - 1], status: 'ok' }; return c; });

    await delay(400);
    setLogs(l => [...l, { time: ts(), text: t('quickstartPage.step5.log.confirmed', { id: data.deliveryId.slice(0, 16) }), status: 'ok' }]);
    setDeliveryPhase('done');
  }, [data, t]);

  const idx = (p: DeliveryPhase) => ['idle', 'accepted', 'signing', 'delivering', 'delivered', 'done'].indexOf(p);
  const cur = idx(deliveryPhase);

  const phases = [
    { key: 'accepted', icon: CheckCircle2 },
    { key: 'signed', icon: Shield },
    { key: 'delivering', icon: Send },
    { key: 'confirmed', icon: Zap },
  ];

  return (
    <StepCard>
      <StepHeader icon={Send} step={5} title={t('quickstartPage.step5.title')} desc={t('quickstartPage.step5.desc')} />
      <div className="px-8 py-6">
        {/* Context bar */}
        <div className="mb-6 p-3 bg-muted/30 rounded-lg border border-border flex items-center gap-4 text-xs">
          <span className="flex items-center gap-1.5 text-muted-foreground"><Key className="h-3.5 w-3.5 text-primary" /> {data.apiKey.slice(0, 18)}…</span>
          <span className="flex items-center gap-1.5 text-muted-foreground"><Link2 className="h-3.5 w-3.5 text-primary" /> {data.endpointUrl}</span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left: Payload */}
          <div>
            <div className="rounded-xl overflow-hidden border border-border">
              <div className="bg-slate-900 px-4 py-2 flex items-center gap-2 border-b border-white/10">
                <div className="flex gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-red-500/80" /><div className="w-2.5 h-2.5 rounded-full bg-yellow-500/80" /><div className="w-2.5 h-2.5 rounded-full bg-green-500/80" /></div>
                <span className="text-xs text-white/40 ml-2">POST /api/v1/events</span>
              </div>
              <div className="bg-slate-950 p-4">
                <div className="text-slate-500 text-xs font-mono mb-2">{`// X-API-Key: ${data.apiKey.slice(0, 16)}…`}</div>
                <pre className="text-[13px] text-slate-100 font-mono whitespace-pre-wrap leading-relaxed">{payload}</pre>
              </div>
            </div>
            <div className="mt-4">
              {deliveryPhase === 'idle' ? (
                <button onClick={send} className="inline-flex items-center gap-2 px-6 py-3 bg-primary text-primary-foreground font-semibold rounded-lg hover:bg-primary/90 transition-all hover:scale-105 shadow-lg">
                  <Play className="h-4 w-4" /> {t('quickstartPage.step5.sendBtn')}
                </button>
              ) : deliveryPhase !== 'done' ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin text-primary" /> {t('quickstartPage.step5.processing')}
                </div>
              ) : null}
            </div>
          </div>

          {/* Right: Delivery pipeline */}
          <div className="space-y-3">
            {phases.map((p, i) => {
              const phaseIdx = i + 1;
              const isActive = cur === phaseIdx;
              const isDone = cur > phaseIdx || (i === 3 && cur >= 5);
              const Icon = p.icon;
              return (
                <div
                  key={p.key}
                  className={`flex items-center gap-3 p-3 rounded-lg border transition-all ${
                    isDone ? 'bg-green-50 border-green-200 dark:bg-green-950/20 dark:border-green-800' :
                    isActive ? 'bg-primary/5 border-primary/30 animate-pulse' :
                    'bg-muted/30 border-border opacity-50'
                  }`}
                >
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                    isDone ? 'bg-green-100 dark:bg-green-900/50' : isActive ? 'bg-primary/10' : 'bg-muted'
                  }`}>
                    {isDone ? <Check className="h-4 w-4 text-green-600" /> : isActive ? <Loader2 className="h-4 w-4 text-primary animate-spin" /> : <Icon className="h-4 w-4 text-muted-foreground" />}
                  </div>
                  <div>
                    <div className={`text-sm font-medium ${isDone ? 'text-green-700 dark:text-green-400' : isActive ? 'text-foreground' : 'text-muted-foreground'}`}>
                      {t(`quickstartPage.step5.phase.${p.key}`)}
                    </div>
                    <div className="text-xs text-muted-foreground">{t(`quickstartPage.step5.phaseDesc.${p.key}`)}</div>
                  </div>
                  {isDone && <span className="ml-auto text-xs text-green-600 font-mono">✓</span>}
                </div>
              );
            })}
          </div>
        </div>

        {/* Live log */}
        {logs.length > 0 && (
          <div className="mt-6 rounded-xl border border-border overflow-hidden">
            <div className="px-4 py-2 bg-muted/30 border-b border-border flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              <span className="text-xs font-semibold text-foreground">{t('quickstartPage.step5.liveLog')}</span>
            </div>
            <div className="divide-y divide-border">
              {logs.map((l, i) => (
                <div key={i} className="px-4 py-2.5 flex items-center gap-3 text-sm animate-fade-in">
                  <span className={`w-2 h-2 rounded-full ${l.status === 'ok' ? 'bg-green-500' : 'bg-amber-500 animate-pulse'}`} />
                  <span className="text-muted-foreground font-mono text-xs w-16 flex-shrink-0">{l.time}</span>
                  <span className="font-medium text-foreground">{l.text}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
      <NavButtons onBack={onBack} onNext={deliveryPhase === 'done' ? onNext : undefined} nextLabel={t('quickstartPage.step5.viewDashboard')} />
    </StepCard>
  );
}


/* ═══════════════════════════════════════════
   Step 6 — Monitor Dashboard
   ═══════════════════════════════════════════ */

function StepMonitor({ data, onBack }: { data: WizardData; onBack: () => void }) {
  const { t } = useTranslation();
  const { isAuthenticated } = useAuth();

  const delivery = {
    id: data.deliveryId,
    eventType: data.eventTypes[0] || 'order.completed',
    endpoint: data.endpointUrl,
    status: 'DELIVERED' as const,
    code: 200,
    latency: '127ms',
    attempts: 1,
    time: ts(),
  };

  const extraDeliveries = [
    { id: 'del_a7b2e4f1', eventType: 'payment.failed', endpoint: 'notify.ops.io/hooks', status: 'RETRYING' as const, code: 503, latency: '2,140ms', attempts: 2, time: '15s ago' },
    { id: 'del_c1d5f890', eventType: 'user.created', endpoint: 'api.partner.com/wh', status: 'DELIVERED' as const, code: 200, latency: '89ms', attempts: 1, time: '1m ago' },
    { id: 'del_k4m8n2p6', eventType: 'subscription.canceled', endpoint: 'hooks.crm.io/wh', status: 'FAILED' as const, code: 500, latency: '45ms', attempts: 5, time: '5m ago' },
  ];

  const stColor = (s: string) =>
    s === 'DELIVERED' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
    : s === 'RETRYING' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
    : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400';

  return (
    <StepCard>
      <StepHeader icon={BarChart3} step={6} title={t('quickstartPage.step6.title')} desc={t('quickstartPage.step6.desc')} />
      <div className="px-8 py-6">
        {/* Stats bar */}
        <div className="grid grid-cols-4 gap-4 mb-6">
          {[
            { label: t('quickstartPage.step6.stats.total'), value: '4', color: 'text-foreground' },
            { label: t('quickstartPage.step6.stats.delivered'), value: '2', color: 'text-green-600' },
            { label: t('quickstartPage.step6.stats.retrying'), value: '1', color: 'text-amber-600' },
            { label: t('quickstartPage.step6.stats.failed'), value: '1', color: 'text-red-600' },
          ].map(s => (
            <div key={s.label} className="bg-muted/30 rounded-xl p-4 text-center border border-border">
              <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
              <div className="text-xs text-muted-foreground mt-0.5">{s.label}</div>
            </div>
          ))}
        </div>

        {/* Your delivery — highlighted */}
        <div className="mb-4">
          <div className="text-xs font-semibold text-muted-foreground uppercase mb-2">{t('quickstartPage.step6.yourDelivery')}</div>
          <div className="bg-primary/5 rounded-xl border-2 border-primary/20 p-4 animate-scale-in">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <span className={`text-xs px-2.5 py-1 rounded-full font-semibold ${stColor(delivery.status)}`}>{delivery.status}</span>
                <code className="text-sm font-mono text-foreground">{delivery.eventType}</code>
              </div>
              <span className="text-xs text-muted-foreground">{t('quickstartPage.step6.justNow')}</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div>
                <span className="text-muted-foreground">{t('quickstartPage.step6.col.endpoint')}</span>
                <div className="text-foreground font-mono mt-0.5 truncate">{delivery.endpoint}</div>
              </div>
              <div>
                <span className="text-muted-foreground">{t('quickstartPage.step6.col.response')}</span>
                <div className="text-green-600 font-mono mt-0.5">{delivery.code} OK</div>
              </div>
              <div>
                <span className="text-muted-foreground">{t('quickstartPage.step6.col.latency')}</span>
                <div className="text-foreground font-mono mt-0.5">{delivery.latency}</div>
              </div>
              <div>
                <span className="text-muted-foreground">{t('quickstartPage.step6.col.attempts')}</span>
                <div className="text-foreground font-mono mt-0.5">{delivery.attempts}/5</div>
              </div>
            </div>
            <div className="mt-3 pt-3 border-t border-border">
              <div className="text-xs text-muted-foreground mb-1">{t('quickstartPage.step6.deliveryId')}</div>
              <div className="flex items-center gap-2">
                <code className="text-xs font-mono text-foreground">{delivery.id}</code>
                <CopyBtn text={delivery.id} />
              </div>
            </div>
          </div>
        </div>

        {/* Other deliveries table */}
        <div className="rounded-xl border border-border overflow-hidden">
          <div className="px-4 py-2.5 bg-muted/20 border-b border-border flex items-center justify-between">
            <span className="text-xs font-semibold text-foreground">{t('quickstartPage.step6.otherDeliveries')}</span>
            <span className="text-xs text-muted-foreground">{t('quickstartPage.step6.sampleData')}</span>
          </div>
          <div className="divide-y divide-border">
            {extraDeliveries.map(d => (
              <div key={d.id} className="px-4 py-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${stColor(d.status)}`}>{d.status}</span>
                  <code className="text-xs font-mono text-foreground">{d.eventType}</code>
                  <span className="text-xs text-muted-foreground hidden sm:inline">{d.endpoint}</span>
                </div>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="font-mono">{d.code}</span>
                  <span>{d.latency}</span>
                  <span>{d.time}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Feature cards */}
        <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-3">
          {[
            { icon: BarChart3, title: t('quickstartPage.step6.feat.realtime'), desc: t('quickstartPage.step6.feat.realtimeDesc') },
            { icon: RotateCcw, title: t('quickstartPage.step6.feat.replay'), desc: t('quickstartPage.step6.feat.replayDesc') },
            { icon: Timer, title: t('quickstartPage.step6.feat.retries'), desc: t('quickstartPage.step6.feat.retriesDesc') },
          ].map(({ icon: Icon, title, desc }) => (
            <div key={title} className="flex items-start gap-3 p-3 bg-muted/20 rounded-lg border border-border">
              <Icon className="h-4 w-4 text-primary flex-shrink-0 mt-0.5" />
              <div>
                <div className="text-xs font-semibold text-foreground">{title}</div>
                <div className="text-xs text-muted-foreground">{desc}</div>
              </div>
            </div>
          ))}
        </div>

        {/* CTA */}
        <div className="mt-8 bg-gradient-to-br from-slate-900 to-slate-800 rounded-xl p-8 text-center relative overflow-hidden">
          <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmYiIGZpbGwtb3BhY2l0eT0iMC4wMyI+PHBhdGggZD0iTTM2IDM0djZoLTZWMzRoNnptMC0zMHY2aC02VjRoNnptMCAyNHY2aC02di02aDZ6bTAgLTEydjZoLTZ2LTZoNnptLTI0IDI0djZIMnYtNmg2em0wLTMwdjZIMlY0aDZ6bTAgMjR2Nkgydi02aDZ6bTAtMTJ2Nkgydi02aDZ6bTEyIDEydjZoLTZ2LTZoNnptMC0zMHY2aC02VjRoNnptMCAyNHY2aC02di02aDZ6bTAtMTJ2NmgtNnYtNmg2eiIvPjwvZz48L2c+PC9zdmc+')] opacity-50" />
          <div className="relative z-10">
            <h3 className="text-xl font-bold text-white mb-2">{t('quickstartPage.cta.title')}</h3>
            <p className="text-sm text-slate-300 mb-6 max-w-lg mx-auto">{t('quickstartPage.cta.subtitle')}</p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              <Link
                to={isAuthenticated ? '/admin/projects' : '/register'}
                className="inline-flex items-center px-6 py-3 bg-white text-slate-900 text-sm font-semibold rounded-lg hover:bg-slate-100 transition-all hover:scale-105 shadow-xl"
              >
                {isAuthenticated ? t('quickstartPage.cta.goToDashboard') : t('quickstartPage.cta.createAccount')} <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
              <Link to="/docs" className="inline-flex items-center px-6 py-3 border border-white/20 text-white text-sm font-semibold rounded-lg hover:bg-white/10 transition-colors">
                {t('quickstartPage.cta.readDocs')} <ExternalLink className="ml-2 h-3.5 w-3.5" />
              </Link>
            </div>
          </div>
        </div>
      </div>
      <NavButtons onBack={onBack} />
    </StepCard>
  );
}
