import { ArrowRight, CheckCircle2, Code2, Eye, RefreshCw, Zap, Clock, Activity, AlertCircle, Shield, Webhook, BarChart3, Lock, ChevronDown, Mail, ArrowDownToLine, Globe, FileCheck, GitBranch, Fingerprint } from 'lucide-react';
import { HookflowIcon } from '../components/icons/HookflowIcon';
import { Link } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../auth/auth.store';
import { Button } from '../components/ui/button';
import ThemeToggle from '../components/ThemeToggle';
import LanguageSwitcher from '../components/LanguageSwitcher';

export default function LandingPage() {
  const { isAuthenticated } = useAuth();
  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      <Hero isAuthenticated={isAuthenticated} />
      <QuickWins />
      <LogoCloud />
      <FlowDiagram />
      <CapabilityShowcase />
      <Features />
      <HowItWorks />
      <DeveloperConfidence />
      <Integrations />
      <TrustGrid />
      <FAQ />
      <FinalCTA />
    </div>
  );
}

function Navigation() {
  const { t } = useTranslation();
  const { isAuthenticated } = useAuth();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 10);
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <nav className={`sticky top-0 z-50 transition-all duration-300 ${scrolled ? 'glass border-b border-border/50 shadow-sm' : 'bg-transparent'}`}>
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
        <div className="flex items-center gap-8">
          <Link to="/" className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center">
              <HookflowIcon className="h-4 w-4 text-primary-foreground" />
            </div>
            <span className="text-lg font-bold tracking-tight">Hookflow</span>
          </Link>
          <div className="hidden md:flex items-center gap-6">
            <a href="#capabilities" className="text-sm text-muted-foreground hover:text-foreground transition-colors">{t('landing.nav.capabilities')}</a>
            <a href="#how-it-works" className="text-sm text-muted-foreground hover:text-foreground transition-colors">{t('landing.nav.howItWorks')}</a>
            <Link to="/docs" className="text-sm text-muted-foreground hover:text-foreground transition-colors">{t('landing.nav.docs')}</Link>
            <Link to="/quickstart" className="text-sm text-muted-foreground hover:text-foreground transition-colors">{t('landing.nav.quickstart')}</Link>
            <Link to="/docs#sdks" className="text-sm text-muted-foreground hover:text-foreground transition-colors">{t('landing.nav.sdks')}</Link>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <LanguageSwitcher />
          <ThemeToggle className="relative z-10 p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors" />
          <div className="w-px h-5 bg-border mx-1" />
          {isAuthenticated ? (
            <Link to="/admin/projects">
              <Button size="sm">{t('landing.nav.goToDashboard')} <ArrowRight className="h-3.5 w-3.5" /></Button>
            </Link>
          ) : (
            <>
              <Link to="/login" className="text-sm text-muted-foreground hover:text-foreground transition-colors hidden sm:block">{t('landing.nav.signIn')}</Link>
              <Link to="/register">
                <Button size="sm">{t('landing.nav.getStarted')} <ArrowRight className="h-3.5 w-3.5" /></Button>
              </Link>
            </>
          )}
        </div>
      </div>
    </nav>
  );
}

function Hero({ isAuthenticated }: { isAuthenticated: boolean }) {
  const { t } = useTranslation();
  return (
    <section className="relative overflow-hidden">
      {/* Background gradient orbs */}
      <div className="absolute top-0 left-1/4 w-96 h-96 bg-primary/10 rounded-full blur-3xl -translate-y-1/2" />
      <div className="absolute top-20 right-1/4 w-80 h-80 bg-purple-500/10 rounded-full blur-3xl" />

      <div className="max-w-7xl mx-auto px-6 pt-20 pb-24 relative">
        <div className="grid lg:grid-cols-2 gap-16 items-center">
          <div className="animate-fade-in-up">
            <div className="flex flex-wrap items-center gap-2 mb-6">
              <a href="https://github.com/vadymkykalo/webhook-platform" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-foreground/5 text-foreground text-xs font-semibold border border-border hover:bg-foreground/10 transition-colors">
                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z"/></svg>
                {t('landing.hero.openSource')}
              </a>
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 text-primary text-xs font-semibold border border-primary/20">
                <Zap className="h-3 w-3" />
                {t('landing.hero.badge')}
              </div>
            </div>
            <h1 className="text-display text-foreground mb-6 leading-[1.1]">
              {t('landing.hero.title1')}
              <span className="gradient-text">{t('landing.hero.titleHighlight')}</span>
              {t('landing.hero.title2')}
            </h1>
            <p className="text-body-lg text-muted-foreground mb-8 max-w-lg">
              {t('landing.hero.subtitle')}
            </p>
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
              <Link to={isAuthenticated ? '/admin/dashboard' : '/register'}>
                <Button size="lg" className="shadow-glow">
                  {isAuthenticated ? t('landing.nav.goToDashboard') : t('landing.hero.startFree')} <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
              <Link to="/docs">
                <Button variant="outline" size="lg">
                  {t('landing.hero.readDocs')}
                </Button>
              </Link>
            </div>
            <div className="flex flex-wrap items-center gap-4 mt-8 text-sm text-muted-foreground">
              <span className="flex items-center gap-1.5"><CheckCircle2 className="h-4 w-4 text-success" />{t('landing.hero.openSourceFree')}</span>
              <span className="flex items-center gap-1.5"><CheckCircle2 className="h-4 w-4 text-success" />{t('landing.hero.selfHosted')}</span>
              <span className="flex items-center gap-1.5"><CheckCircle2 className="h-4 w-4 text-success" />{t('landing.hero.fiveMinSetup')}</span>
            </div>
          </div>
          <div className="animate-fade-in" style={{ animationDelay: '0.2s' }}>
            <DashboardMockup />
          </div>
        </div>
      </div>
    </section>
  );
}

function DashboardMockup() {
  const { t } = useTranslation();
  const [activeRow, setActiveRow] = useState(0);
  const [retryCountdown, setRetryCountdown] = useState(28);

  useEffect(() => {
    const rowInterval = setInterval(() => setActiveRow((prev) => (prev + 1) % 5), 3000);
    const countdownInterval = setInterval(() => setRetryCountdown((prev) => (prev > 0 ? prev - 1 : 30)), 1000);
    return () => { clearInterval(rowInterval); clearInterval(countdownInterval); };
  }, []);

  const deliveries = [
    { id: 'del_1', event: 'order.completed', endpoint: 'api.acme.com', status: 'success', time: '2s ago' },
    { id: 'del_2', event: 'user.created', endpoint: 'hooks.customer.io', status: 'success', time: '5s ago' },
    { id: 'del_3', event: 'payment.failed', endpoint: 'notify.stripe.com', status: 'retrying', time: '12s ago', retry: retryCountdown },
    { id: 'del_4', event: 'subscription.canceled', endpoint: 'api.partner.com', status: 'failed', time: '1m ago' },
    { id: 'del_5', event: 'invoice.finalized', endpoint: 'billing.external.com', status: 'success', time: '2m ago' },
  ];

  return (
    <div className="relative">
      <div className="absolute -inset-4 bg-gradient-to-r from-primary/20 to-purple-500/20 rounded-2xl blur-2xl" />
      <div className="relative bg-card rounded-xl border shadow-elevated overflow-hidden">
        <div className="bg-muted/50 border-b px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-red-400" />
            <div className="w-3 h-3 rounded-full bg-yellow-400" />
            <div className="w-3 h-3 rounded-full bg-green-400" />
          </div>
          <div className="text-xs font-medium text-muted-foreground">{t('landing.mockup.liveDeliveries')}</div>
          <div className="w-16" />
        </div>
        <div className="p-3 space-y-1.5">
          {deliveries.map((delivery, index) => (
            <div
              key={delivery.id}
              className={`p-3 rounded-lg border transition-all duration-500 ${activeRow === index
                  ? 'border-primary/30 bg-accent shadow-sm scale-[1.02]'
                  : 'border-transparent bg-transparent hover:bg-muted/50'
                }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium">{delivery.event}</div>
                  <div className="text-xs text-muted-foreground truncate">{delivery.endpoint}</div>
                </div>
                <div className="flex items-center gap-2 ml-3">
                  {delivery.status === 'success' && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-success/10 text-success">
                      <CheckCircle2 className="w-3 h-3" /> {t('landing.mockup.delivered')}
                    </span>
                  )}
                  {delivery.status === 'failed' && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-destructive/10 text-destructive">
                      <AlertCircle className="w-3 h-3" /> {t('landing.mockup.failed')}
                    </span>
                  )}
                  {delivery.status === 'retrying' && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-warning/10 text-warning animate-pulse">
                      <Clock className="w-3 h-3" /> {t('landing.mockup.retry')} {delivery.retry}s
                    </span>
                  )}
                  <span className="text-[10px] text-muted-foreground">{delivery.time}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function QuickWins() {
  const { t } = useTranslation();

  const cards = [
    { icon: RefreshCw, title: t('landing.quickWins.queueing'), desc: t('landing.quickWins.queueingDesc'), color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
    { icon: Eye, title: t('landing.quickWins.replay'), desc: t('landing.quickWins.replayDesc'), color: 'text-blue-500', bg: 'bg-blue-500/10' },
    { icon: Code2, title: t('landing.quickWins.devTools'), desc: t('landing.quickWins.devToolsDesc'), color: 'text-violet-500', bg: 'bg-violet-500/10' },
    { icon: GitBranch, title: t('landing.quickWins.routing'), desc: t('landing.quickWins.routingDesc'), color: 'text-amber-500', bg: 'bg-amber-500/10' },
  ];

  return (
    <section className="py-12 -mt-8 relative z-10">
      <div className="max-w-7xl mx-auto px-6">
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {cards.map((card, i) => (
            <div key={i} className="group p-5 rounded-xl border bg-card hover:shadow-card-hover hover:border-primary/20 transition-all duration-300 hover:-translate-y-0.5">
              <div className={`h-9 w-9 rounded-lg ${card.bg} flex items-center justify-center mb-3`}>
                <card.icon className={`h-4.5 w-4.5 ${card.color}`} />
              </div>
              <h3 className="text-sm font-semibold mb-1">{card.title}</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">{card.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function LogoCloud() {
  const { t } = useTranslation();
  const logos = [
    { name: 'Spring Boot', src: '/logos/springboot.svg' },
    { name: 'PostgreSQL', src: '/logos/postgresql.svg' },
    { name: 'Apache Kafka', src: '/logos/apachekafka.svg' },
    { name: 'Redis', src: '/logos/redis.svg' },
    { name: 'React', src: '/logos/react.svg' },
    { name: 'Docker', src: '/logos/docker.svg' },
    { name: 'TypeScript', src: '/logos/typescript.svg' },
  ];

  const track = [...logos, ...logos];

  return (
    <section className="py-14 border-y border-border/50 overflow-hidden">
      <div className="max-w-7xl mx-auto px-6 mb-8">
        <p className="text-center text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
          {t('landing.logoCloud')}
        </p>
      </div>
      <div className="relative">
        <div className="absolute left-0 top-0 bottom-0 w-24 bg-gradient-to-r from-background to-transparent z-10 pointer-events-none" />
        <div className="absolute right-0 top-0 bottom-0 w-24 bg-gradient-to-l from-background to-transparent z-10 pointer-events-none" />
        <div className="marquee-track">
          {track.map((logo, i) => (
            <div key={`${logo.name}-${i}`} className="group flex flex-col items-center gap-3 px-8 md:px-10 flex-shrink-0 cursor-default select-none">
              <div className="h-14 w-14 flex items-center justify-center rounded-xl border border-border/50 bg-card shadow-sm transition-all duration-500 group-hover:scale-110 group-hover:shadow-lg group-hover:-translate-y-1.5">
                <img src={logo.src} alt={logo.name} className="h-8 w-8 object-contain transition-all duration-500 opacity-60 grayscale group-hover:opacity-100 group-hover:grayscale-0" />
              </div>
              <span className="text-xs font-medium text-muted-foreground/60 transition-colors duration-300 group-hover:text-foreground whitespace-nowrap">{logo.name}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function FlowConnector({ fromCount, toCount }: { fromCount: number; toCount: number }) {
  const getY = (count: number): number[] => {
    if (count === 1) return [50];
    if (count === 2) return [28, 72];
    return [18, 50, 82];
  };

  const fromY = getY(fromCount);
  const toY = getY(toCount);
  const paths: string[] = [];

  if (fromCount === 1 && toCount === 1) {
    paths.push('M 0,50 L 200,50');
  } else if (fromCount === 1) {
    toY.forEach(ty => {
      paths.push(`M 0,50 C 80,50 120,${ty} 200,${ty}`);
    });
  } else {
    fromY.forEach(fy => {
      paths.push(`M 0,${fy} C 80,${fy} 120,50 200,50`);
    });
  }

  return (
    <svg viewBox="0 0 200 100" preserveAspectRatio="none" className="w-full h-full" fill="none">
      {paths.map((d, i) => (
        <path
          key={i}
          d={d}
          stroke="hsl(var(--primary))"
          strokeOpacity="0.25"
          strokeWidth="2"
          strokeDasharray="8 5"
          vectorEffect="non-scaling-stroke"
          className="flow-svg-path"
        />
      ))}
    </svg>
  );
}

function FlowDiagram() {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<'send' | 'receive'>('send');

  const sendSources = [{ label: t('landing.flowDiagram.sendSource'), icon: Webhook }];
  const sendDestinations = [
    { label: 'Stripe', src: '/logos/stripe.svg' },
    { label: 'GitHub', src: '/logos/github.svg' },
    { label: 'Slack', src: '/logos/slack.svg' },
  ];

  const receiveSources = [
    { label: 'Stripe', src: '/logos/stripe.svg' },
    { label: 'Twilio', src: '/logos/twilio.svg' },
    { label: 'HubSpot', src: '/logos/hubspot.svg' },
  ];
  const receiveDestinations = [{ label: t('landing.flowDiagram.receiveDest'), icon: Webhook }];

  const sources = activeTab === 'send' ? sendSources : receiveSources;
  const destinations = activeTab === 'send' ? sendDestinations : receiveDestinations;

  const badges = [
    { label: t('landing.flowDiagram.retries'), icon: RefreshCw },
    { label: t('landing.flowDiagram.signatures'), icon: Shield },
    { label: t('landing.flowDiagram.monitoring'), icon: Eye },
  ];

  const renderPill = (item: any, idx: number) => (
    <div
      key={idx}
      className="flex items-center gap-2.5 px-4 py-2.5 rounded-xl border bg-background shadow-sm"
    >
      {'src' in item ? (
        <img src={item.src} alt={item.label} className="h-5 w-5 object-contain" />
      ) : (
        <item.icon className="h-5 w-5 text-primary" />
      )}
      <span className="text-xs font-semibold tracking-wide whitespace-nowrap">{item.label}</span>
    </div>
  );

  return (
    <section className="py-24">
      <div className="max-w-7xl mx-auto px-6">
        <div className="text-center mb-12">
          <h2 className="text-headline mb-4">
            {t('landing.flowDiagram.title')}
            <span className="gradient-text">{t('landing.flowDiagram.titleHighlight')}</span>
          </h2>
          <p className="text-body-lg text-muted-foreground max-w-2xl mx-auto">
            {t('landing.flowDiagram.subtitle')}
          </p>
        </div>

        {/* Tabs */}
        <div className="flex justify-center mb-10">
          <div className="inline-flex rounded-xl border bg-muted/50 p-1 gap-1">
            <button
              onClick={() => setActiveTab('send')}
              className={`px-5 py-2.5 rounded-lg text-sm font-semibold transition-all duration-300 ${activeTab === 'send' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
            >
              {t('landing.flowDiagram.tabSend')}
            </button>
            <button
              onClick={() => setActiveTab('receive')}
              className={`px-5 py-2.5 rounded-lg text-sm font-semibold transition-all duration-300 ${activeTab === 'receive' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
            >
              {t('landing.flowDiagram.tabReceive')}
            </button>
          </div>
        </div>

        {/* Flow Diagram Card */}
        <div className="relative max-w-4xl mx-auto rounded-2xl border bg-card p-8 md:p-12 shadow-sm overflow-hidden">
          {/* Background dots pattern */}
          <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: 'radial-gradient(circle, currentColor 1px, transparent 1px)', backgroundSize: '24px 24px' }} />

          {/* Desktop: SVG bezier curve connections */}
          <div className="relative hidden md:flex items-stretch min-h-[240px]">
            {/* Sources column */}
            <div className="flex flex-col justify-around flex-shrink-0 z-10 py-4">
              {sources.map((s, i) => renderPill(s, i))}
            </div>

            {/* Left SVG connector */}
            <div className="flex-1 min-w-[90px] self-stretch">
              <FlowConnector fromCount={sources.length} toCount={1} />
            </div>

            {/* Center hub */}
            <div className="flex flex-col items-center justify-center gap-3 flex-shrink-0 z-10 px-3">
              <div className="h-[72px] w-[72px] rounded-2xl bg-gradient-to-br from-primary to-purple-600 flex items-center justify-center shadow-lg shadow-primary/20 ring-4 ring-primary/10 hub-pulse">
                <HookflowIcon className="h-9 w-9 text-white" />
              </div>
              <span className="text-sm font-bold tracking-tight">Hookflow</span>
              <div className="flex flex-wrap justify-center gap-1.5 mt-1">
                {badges.map((b) => (
                  <span key={b.label} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[10px] font-semibold">
                    <b.icon className="h-2.5 w-2.5" />
                    {b.label}
                  </span>
                ))}
              </div>
            </div>

            {/* Right SVG connector */}
            <div className="flex-1 min-w-[90px] self-stretch">
              <FlowConnector fromCount={1} toCount={destinations.length} />
            </div>

            {/* Destinations column */}
            <div className="flex flex-col justify-around flex-shrink-0 z-10 py-4">
              {destinations.map((d, i) => renderPill(d, i))}
            </div>
          </div>

          {/* Mobile: simple vertical flow */}
          <div className="md:hidden flex flex-col items-center gap-3 relative">
            {sources.map((s, i) => renderPill(s, i))}
            <div className="h-8 w-px border-l-2 border-dashed border-primary/30" />
            <div className="flex flex-col items-center gap-2">
              <div className="h-14 w-14 rounded-xl bg-gradient-to-br from-primary to-purple-600 flex items-center justify-center shadow-lg">
                <HookflowIcon className="h-7 w-7 text-white" />
              </div>
              <span className="text-xs font-bold">Hookflow</span>
            </div>
            <div className="h-8 w-px border-l-2 border-dashed border-primary/30" />
            {destinations.map((d, i) => renderPill(d, i))}
          </div>

          {/* Description under diagram */}
          <p className="text-center text-sm text-muted-foreground mt-8 max-w-lg mx-auto">
            {activeTab === 'send' ? t('landing.flowDiagram.sendDesc') : t('landing.flowDiagram.receiveDesc')}
          </p>
        </div>
      </div>
    </section>
  );
}

function CapabilityShowcase() {
  const { t } = useTranslation();

  return (
    <section id="capabilities" className="py-24 bg-muted/30 relative overflow-hidden">
      <div className="absolute top-0 left-1/3 w-[500px] h-[500px] bg-primary/5 rounded-full blur-[120px] pointer-events-none" />
      <div className="max-w-7xl mx-auto px-6 relative">
        <div className="text-center mb-16">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 text-primary text-xs font-semibold mb-6 border border-primary/20">
            <Zap className="h-3 w-3" />
            {t('landing.capabilities.badge')}
          </div>
          <h2 className="text-headline mb-4">{t('landing.capabilities.title')}<br /><span className="gradient-text">{t('landing.capabilities.titleHighlight')}</span></h2>
          <p className="text-body-lg text-muted-foreground max-w-2xl mx-auto">
            {t('landing.capabilities.subtitle')}
          </p>
        </div>

        <div className="space-y-12">
          {/* Capability 1: Smart Retries + DLQ */}
          <div className="grid lg:grid-cols-2 gap-8 items-center">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-600 text-xs font-semibold mb-4 border border-emerald-500/20">
                <RefreshCw className="h-3 w-3" />
                {t('landing.capabilities.retries.badge')}
              </div>
              <h3 className="text-2xl font-bold mb-3">{t('landing.capabilities.retries.title')}</h3>
              <p className="text-muted-foreground mb-6">{t('landing.capabilities.retries.desc')}</p>
              <div className="space-y-3">
                {['exponential', 'dlq', 'replay'].map((key) => (
                  <div key={key} className="flex items-start gap-3">
                    <CheckCircle2 className="h-5 w-5 text-emerald-500 flex-shrink-0 mt-0.5" />
                    <div>
                      <div className="text-sm font-semibold">{t(`landing.capabilities.retries.${key}`)}</div>
                      <div className="text-xs text-muted-foreground">{t(`landing.capabilities.retries.${key}Desc`)}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="relative">
              <div className="absolute -inset-4 bg-gradient-to-r from-emerald-500/10 to-primary/10 rounded-2xl blur-2xl" />
              <div className="relative bg-card rounded-xl border shadow-elevated overflow-hidden">
                <div className="bg-muted/50 border-b px-4 py-3 flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-red-400" />
                  <div className="w-3 h-3 rounded-full bg-yellow-400" />
                  <div className="w-3 h-3 rounded-full bg-green-400" />
                  <span className="ml-auto text-[10px] text-muted-foreground font-mono">delivery: order.completed</span>
                </div>
                <div className="p-4 space-y-2">
                  {[
                    { attempt: 1, status: 'failed', code: 503, delay: '—', time: '10:42:00' },
                    { attempt: 2, status: 'failed', code: 503, delay: '1m', time: '10:43:00' },
                    { attempt: 3, status: 'failed', code: 503, delay: '5m', time: '10:48:00' },
                    { attempt: 4, status: 'success', code: 200, delay: '15m', time: '11:03:00' },
                  ].map((row) => (
                    <div key={row.attempt} className={`flex items-center gap-3 p-2.5 rounded-lg text-xs ${row.status === 'success' ? 'bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800' : 'bg-muted/50'}`}>
                      {row.status === 'success' ? (
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 flex-shrink-0" />
                      ) : (
                        <AlertCircle className="h-3.5 w-3.5 text-destructive flex-shrink-0" />
                      )}
                      <span className="font-mono text-muted-foreground w-6">#{row.attempt}</span>
                      <span className={`font-mono font-bold w-8 ${row.status === 'success' ? 'text-emerald-600' : 'text-destructive'}`}>{row.code}</span>
                      <span className="text-muted-foreground flex-1">{row.delay !== '—' ? `+${row.delay}` : '—'}</span>
                      <span className="text-muted-foreground/60">{row.time}</span>
                    </div>
                  ))}
                  <div className="pt-2 flex items-center gap-2">
                    <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                      <div className="h-full bg-gradient-to-r from-destructive via-amber-500 to-emerald-500 rounded-full" style={{ width: '100%' }} />
                    </div>
                    <span className="text-[10px] font-semibold text-emerald-600">4/4 delivered</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Capability 2: Error Diagnostics */}
          <div className="grid lg:grid-cols-2 gap-8 items-center">
            <div className="lg:order-2">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/10 text-amber-600 text-xs font-semibold mb-4 border border-amber-500/20">
                <Eye className="h-3 w-3" />
                {t('landing.capabilities.diagnostics.badge')}
              </div>
              <h3 className="text-2xl font-bold mb-3">{t('landing.capabilities.diagnostics.title')}</h3>
              <p className="text-muted-foreground mb-6">{t('landing.capabilities.diagnostics.desc')}</p>
              <div className="space-y-3">
                {['classify', 'suggest', 'timeline'].map((key) => (
                  <div key={key} className="flex items-start gap-3">
                    <CheckCircle2 className="h-5 w-5 text-amber-500 flex-shrink-0 mt-0.5" />
                    <div>
                      <div className="text-sm font-semibold">{t(`landing.capabilities.diagnostics.${key}`)}</div>
                      <div className="text-xs text-muted-foreground">{t(`landing.capabilities.diagnostics.${key}Desc`)}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="lg:order-1 relative">
              <div className="absolute -inset-4 bg-gradient-to-r from-amber-500/10 to-rose-500/10 rounded-2xl blur-2xl" />
              <div className="relative bg-card rounded-xl border shadow-elevated overflow-hidden">
                <div className="bg-muted/50 border-b px-4 py-3 flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-red-400" />
                  <div className="w-3 h-3 rounded-full bg-yellow-400" />
                  <div className="w-3 h-3 rounded-full bg-green-400" />
                  <span className="ml-auto text-[10px] text-muted-foreground font-mono">error diagnosis</span>
                </div>
                <div className="p-4 space-y-3">
                  <div className="p-3 rounded-lg border border-destructive/20 bg-destructive/5">
                    <div className="flex items-center gap-2 mb-2">
                      <AlertCircle className="h-4 w-4 text-destructive" />
                      <span className="text-sm font-semibold text-destructive">Connection Timeout</span>
                      <span className="ml-auto text-[10px] px-2 py-0.5 rounded-full bg-destructive/10 text-destructive font-medium">HIGH</span>
                    </div>
                    <p className="text-xs text-muted-foreground">Endpoint did not respond within 30s timeout window</p>
                  </div>
                  <div className="p-3 rounded-lg border bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800">
                    <div className="flex items-center gap-2 mb-1">
                      <Zap className="h-3.5 w-3.5 text-amber-600" />
                      <span className="text-xs font-semibold text-amber-700 dark:text-amber-400">Suggested Fix</span>
                    </div>
                    <p className="text-xs text-amber-600 dark:text-amber-300/80">Increase endpoint timeout or check if the target server is under heavy load. Consider adding a health check.</p>
                  </div>
                  <div className="flex items-center gap-1 pt-1">
                    <span className="text-[10px] text-muted-foreground mr-2">Attempts:</span>
                    {[false, false, false, true].map((ok, i) => (
                      <div key={i} className={`h-2 w-2 rounded-full ${ok ? 'bg-emerald-500' : 'bg-destructive'}`} />
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Capability 3: Incoming Webhooks */}
          <div className="grid lg:grid-cols-2 gap-8 items-center">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 text-blue-600 text-xs font-semibold mb-4 border border-blue-500/20">
                <ArrowDownToLine className="h-3 w-3" />
                {t('landing.capabilities.incoming.badge')}
              </div>
              <h3 className="text-2xl font-bold mb-3">{t('landing.capabilities.incoming.title')}</h3>
              <p className="text-muted-foreground mb-6">{t('landing.capabilities.incoming.desc')}</p>
              <div className="space-y-3">
                {['ingest', 'verify', 'forward'].map((key) => (
                  <div key={key} className="flex items-start gap-3">
                    <CheckCircle2 className="h-5 w-5 text-blue-500 flex-shrink-0 mt-0.5" />
                    <div>
                      <div className="text-sm font-semibold">{t(`landing.capabilities.incoming.${key}`)}</div>
                      <div className="text-xs text-muted-foreground">{t(`landing.capabilities.incoming.${key}Desc`)}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="relative">
              <div className="absolute -inset-4 bg-gradient-to-r from-blue-500/10 to-violet-500/10 rounded-2xl blur-2xl" />
              <div className="relative bg-card rounded-xl border shadow-elevated overflow-hidden">
                <div className="bg-muted/50 border-b px-4 py-3 flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-red-400" />
                  <div className="w-3 h-3 rounded-full bg-yellow-400" />
                  <div className="w-3 h-3 rounded-full bg-green-400" />
                  <span className="ml-auto text-[10px] text-muted-foreground font-mono">incoming webhook pipeline</span>
                </div>
                <div className="p-4">
                  <div className="flex items-center justify-between mb-4">
                    {['Stripe', 'GitHub', 'Twilio'].map((name) => (
                      <div key={name} className="flex items-center gap-2 px-3 py-2 rounded-lg border bg-muted/30">
                        <img src={`/logos/${name.toLowerCase()}.svg`} alt={name} className="h-4 w-4 object-contain" />
                        <span className="text-xs font-medium">{name}</span>
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center justify-center gap-2 mb-4">
                    <div className="h-px flex-1 bg-border" />
                    <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/10 border border-primary/20">
                      <Shield className="h-3 w-3 text-primary" />
                      <span className="text-[10px] font-semibold text-primary">HMAC Verified</span>
                    </div>
                    <div className="h-px flex-1 bg-border" />
                  </div>
                  <div className="flex items-center justify-center gap-1.5 mb-4">
                    <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-primary to-purple-600 flex items-center justify-center">
                      <HookflowIcon className="h-4 w-4 text-white" />
                    </div>
                    <ArrowRight className="h-3 w-3 text-muted-foreground" />
                    <div className="flex items-center gap-2 px-3 py-2 rounded-lg border bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800">
                      <Globe className="h-3.5 w-3.5 text-emerald-600" />
                      <span className="text-xs font-medium">api.internal.com/hooks</span>
                    </div>
                  </div>
                  <div className="text-center">
                    <span className="text-[10px] text-muted-foreground">Receive → Verify → Route → Forward — zero code required</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function Features() {
  const { t } = useTranslation();
  const features = [
    { icon: RefreshCw, title: t('landing.features.retries'), desc: t('landing.features.retriesDesc') },
    { icon: Shield, title: t('landing.features.hmac'), desc: t('landing.features.hmacDesc') },
    { icon: AlertCircle, title: t('landing.features.dlq'), desc: t('landing.features.dlqDesc') },
    { icon: Eye, title: t('landing.features.diagnostics'), desc: t('landing.features.diagnosticsDesc') },
    { icon: ArrowDownToLine, title: t('landing.features.incomingIngress'), desc: t('landing.features.incomingIngressDesc') },
    { icon: FileCheck, title: t('landing.features.schemaRegistry'), desc: t('landing.features.schemaRegistryDesc') },
    { icon: GitBranch, title: t('landing.features.wildcardRouting'), desc: t('landing.features.wildcardRoutingDesc') },
    { icon: Fingerprint, title: t('landing.features.deterministicReplay'), desc: t('landing.features.deterministicReplayDesc') },
    { icon: BarChart3, title: t('landing.features.analytics'), desc: t('landing.features.analyticsDesc') },
    { icon: Lock, title: t('landing.features.piiMasking'), desc: t('landing.features.piiMaskingDesc') },
    { icon: Activity, title: t('landing.features.auditLog'), desc: t('landing.features.auditLogDesc') },
    { icon: Webhook, title: t('landing.features.rbac'), desc: t('landing.features.rbacDesc') },
  ];

  return (
    <section id="features" className="py-24">
      <div className="max-w-7xl mx-auto px-6">
        <div className="text-center mb-16">
          <h2 className="text-headline mb-4">{t('landing.features.title')}<br /><span className="gradient-text">{t('landing.features.titleHighlight')}</span></h2>
          <p className="text-body-lg text-muted-foreground max-w-2xl mx-auto">
            {t('landing.features.subtitle')}
          </p>
        </div>
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
          {features.map((f, i) => (
            <div
              key={i}
              className="group relative bg-card rounded-xl border p-5 hover:shadow-card-hover hover:border-primary/20 transition-all duration-300 hover:-translate-y-0.5"
            >
              <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center mb-3 group-hover:bg-primary/15 transition-colors">
                <f.icon className="h-4.5 w-4.5 text-primary" />
              </div>
              <h3 className="text-sm font-semibold mb-1">{f.title}</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}





function DeveloperConfidence() {
  const { t } = useTranslation();
  return (
    <section className="py-24 bg-gradient-to-br from-slate-900 via-slate-900 to-slate-800 relative overflow-hidden">
      <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmYiIGZpbGwtb3BhY2l0eT0iMC4wMyI+PHBhdGggZD0iTTM2IDM0djZoLTZWMzRoNnptMC0zMHY2aC02VjRoNnptMCAyNHY2aC02di02aDZ6bTAgLTEydjZoLTZ2LTZoNnptLTI0IDI0djZIMnYtNmg2em0wLTMwdjZIMlY0aDZ6bTAgMjR2Nkgydi02aDZ6bTAtMTJ2Nkgydi02aDZ6bTEyIDEydjZoLTZ2LTZoNnptMC0zMHY2aC02VjRoNnptMCAyNHY2aC02di02aDZ6bTAtMTJ2NmgtNnYtNmg2eiIvPjwvZz48L2c+PC9zdmc+')] opacity-50" />
      <div className="max-w-7xl mx-auto px-6 relative">
        <div className="grid lg:grid-cols-2 gap-16 items-center">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/10 text-white/80 text-xs font-semibold mb-6 border border-white/10">
              <Code2 className="h-3 w-3" />
              {t('landing.devExperience.badge')}
            </div>
            <h2 className="text-headline text-white mb-6">
              {t('landing.devExperience.title')}
            </h2>
            <p className="text-lg text-white/60 mb-8">
              {t('landing.devExperience.subtitle')}
            </p>
            <div className="space-y-3">
              {[
                t('landing.devExperience.rest'),
                t('landing.devExperience.errors'),
                t('landing.devExperience.hmac'),
                t('landing.devExperience.idempotency'),
              ].map((text) => (
                <div key={text} className="flex items-center gap-3">
                  <CheckCircle2 className="h-4 w-4 text-green-400 flex-shrink-0" />
                  <span className="text-sm text-white/80">{text}</span>
                </div>
              ))}
            </div>
          </div>
          <div>
            <div className="relative">
              <div className="absolute -inset-4 bg-primary/20 rounded-2xl blur-2xl" />
              <div className="relative bg-slate-800/80 rounded-xl border border-white/10 overflow-hidden shadow-2xl backdrop-blur-sm">
                <div className="bg-slate-950 px-4 py-2.5 flex items-center gap-2 border-b border-white/10">
                  <div className="w-3 h-3 rounded-full bg-red-400/80" />
                  <div className="w-3 h-3 rounded-full bg-yellow-400/80" />
                  <div className="w-3 h-3 rounded-full bg-green-400/80" />
                  <span className="ml-3 text-xs text-white/40 font-mono">send-event.sh</span>
                </div>
                <pre className="p-5 text-[13px] text-white/90 overflow-x-auto font-mono leading-relaxed">
                  {`curl -X POST /api/v1/events \\
  -H "X-API-Key: wh_live_abc123..." \\
  -H "Content-Type: application/json" \\
  -H "Idempotency-Key: unique-id" \\
  -d '{
    "type": "order.completed",
    "data": {
      "order_id": "ord_12345",
      "amount": 99.99
    }
  }'`}
                </pre>
                <div className="bg-slate-950 px-5 py-3 border-t border-white/10">
                  <div className="text-xs text-green-400 font-mono flex items-center gap-1.5">
                    <CheckCircle2 className="h-3 w-3" />
                    {t('landing.devExperience.accepted')}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function HowItWorks() {
  const { t } = useTranslation();
  const [activeStep, setActiveStep] = useState(0);
  const [hoveredStep, setHoveredStep] = useState<number | null>(null);

  useEffect(() => {
    if (hoveredStep !== null) return;
    const interval = setInterval(() => setActiveStep((prev) => (prev + 1) % 3), 5000);
    return () => clearInterval(interval);
  }, [hoveredStep]);

  const current = hoveredStep ?? activeStep;

  const steps = [
    {
      num: '01',
      title: t('landing.howItWorks.step1Title'),
      desc: t('landing.howItWorks.step1Desc'),
      color: '#8B5CF6',
      details: [t('landing.howItWorks.step1Detail1'), t('landing.howItWorks.step1Detail2'), t('landing.howItWorks.step1Detail3')],
    },
    {
      num: '02',
      title: t('landing.howItWorks.step2Title'),
      desc: t('landing.howItWorks.step2Desc'),
      color: '#10B981',
      details: [t('landing.howItWorks.step2Detail1'), t('landing.howItWorks.step2Detail2'), t('landing.howItWorks.step2Detail3')],
    },
    {
      num: '03',
      title: t('landing.howItWorks.step3Title'),
      desc: t('landing.howItWorks.step3Desc'),
      color: '#F59E0B',
      details: [t('landing.howItWorks.step3Detail1'), t('landing.howItWorks.step3Detail2'), t('landing.howItWorks.step3Detail3')],
    },
  ];

  return (
    <section id="how-it-works" className="py-24 bg-muted/30 relative overflow-hidden">
      <div className="absolute top-1/2 left-0 w-[600px] h-[600px] bg-primary/[0.03] rounded-full blur-[100px] -translate-y-1/2 -translate-x-1/2 pointer-events-none" />
      <div className="absolute top-1/2 right-0 w-[400px] h-[400px] bg-purple-500/[0.03] rounded-full blur-[80px] -translate-y-1/2 translate-x-1/2 pointer-events-none" />

      <div className="max-w-7xl mx-auto px-6 relative">
        <div className="text-center mb-16">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 text-primary text-xs font-semibold mb-6 border border-primary/20">
            <Zap className="h-3 w-3" />
            {t('landing.howItWorks.badge')}
          </div>
          <h2 className="text-headline mb-4">{t('landing.howItWorks.title')} <span className="gradient-text">{t('landing.howItWorks.titleHighlight')}</span></h2>
          <p className="text-body-lg text-muted-foreground max-w-2xl mx-auto">
            {t('landing.howItWorks.subtitle')}
          </p>
        </div>

        <div className="grid lg:grid-cols-[380px_1fr] gap-8 lg:gap-12 items-start">
          {/* Left: Timeline */}
          <div className="space-y-3">
            {steps.map((step, index) => (
              <div
                key={index}
                className={`group relative p-5 rounded-2xl border cursor-pointer transition-all duration-500 ${current === index
                    ? 'bg-card border-primary/30 shadow-lg'
                    : 'bg-card/50 border-transparent hover:bg-card hover:border-border'
                  }`}
                onClick={() => { setActiveStep(index); setHoveredStep(null); }}
                onMouseEnter={() => setHoveredStep(index)}
                onMouseLeave={() => setHoveredStep(null)}
              >
                {current === index && (
                  <div className="absolute left-0 top-4 bottom-4 w-[3px] rounded-full" style={{ background: step.color }} />
                )}
                <div className="flex items-start gap-4">
                  <div
                    className={`flex-shrink-0 h-10 w-10 rounded-xl flex items-center justify-center text-sm font-bold tracking-wider transition-all duration-500 ${current === index ? 'text-white scale-110' : 'bg-muted text-muted-foreground'
                      }`}
                    style={current === index ? { background: step.color, boxShadow: `0 4px 20px ${step.color}40` } : {}}
                  >
                    {step.num}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-base font-semibold mb-1">{step.title}</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">{step.desc}</p>
                    <div className={`mt-3 space-y-1.5 overflow-hidden transition-all duration-500 ${current === index ? 'max-h-40 opacity-100' : 'max-h-0 opacity-0'
                      }`}>
                      {step.details.map((detail) => (
                        <div key={detail} className="flex items-center gap-2 text-xs">
                          <div className="h-1 w-1 rounded-full flex-shrink-0" style={{ background: step.color }} />
                          <span className="text-muted-foreground">{detail}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
                {current === index && (
                  <div className="absolute bottom-0 left-5 right-5 h-px">
                    <div className="h-full rounded-full animate-pulse" style={{ background: `linear-gradient(90deg, transparent, ${step.color}30, transparent)` }} />
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Right: Live preview */}
          <div className="relative">
            <div className="absolute -inset-4 bg-gradient-to-br from-primary/10 via-purple-500/5 to-transparent rounded-3xl blur-2xl pointer-events-none" />
            <div className="relative bg-card rounded-2xl border shadow-elevated overflow-hidden">
              <div className="bg-muted/50 border-b px-5 py-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-red-400/80" />
                  <div className="w-3 h-3 rounded-full bg-yellow-400/80" />
                  <div className="w-3 h-3 rounded-full bg-green-400/80" />
                </div>
                <div className="flex items-center gap-2">
                  {steps.map((s, i) => (
                    <div
                      key={i}
                      className={`h-1.5 rounded-full transition-all duration-500 ${current === i ? 'w-6' : 'w-1.5'
                        }`}
                      style={{ background: current === i ? s.color : '#d1d5db' }}
                    />
                  ))}
                </div>
                <div className="w-16" />
              </div>

              <div className="relative min-h-[380px]">
                {/* Step 1: Code */}
                <div className={`absolute inset-0 p-6 transition-all duration-500 ${current === 0 ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4 pointer-events-none'
                  }`}>
                  <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-4">{t('landing.howItWorks.sendFirstEvent')}</div>
                  <div className="bg-slate-900 rounded-xl overflow-hidden">
                    <div className="px-4 py-2 border-b border-white/10 flex items-center gap-2">
                      <span className="text-[10px] font-mono text-white/40">POST</span>
                      <span className="text-[10px] font-mono text-green-400">/api/v1/events</span>
                    </div>
                    <pre className="p-4 text-[12px] font-mono text-white/80 leading-relaxed overflow-x-auto">{`{
  "type": "order.completed",
  "data": {
    "order_id": "ord_12345",
    "amount": 99.99,
    "customer": "cus_abc"
  }
}`}</pre>
                  </div>
                  <div className="mt-4 flex items-center gap-3">
                    <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                      <div className="h-full bg-gradient-to-r from-violet-500 to-purple-500 rounded-full" style={{ width: '100%', animation: 'shimmer 2s ease-in-out infinite' }} />
                    </div>
                    <span className="text-xs font-mono text-green-600 font-semibold">201 Created</span>
                  </div>
                  <div className="mt-4 p-3 rounded-lg bg-green-500/5 border border-green-500/20">
                    <div className="flex items-center gap-2 text-xs text-green-700">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      <span className="font-medium">{t('landing.howItWorks.eventAccepted')}</span>
                      <span className="text-green-600/60 ml-auto font-mono">evt_8f3k2m · 3 deliveries queued</span>
                    </div>
                  </div>
                </div>

                {/* Step 2: Delivery */}
                <div className={`absolute inset-0 p-6 transition-all duration-500 ${current === 1 ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4 pointer-events-none'
                  }`}>
                  <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-4">{t('landing.howItWorks.livePipeline')}</div>
                  <div className="space-y-3">
                    {[
                      { endpoint: 'api.acme.com/hooks', status: 'delivered', code: 200, latency: '89ms', sig: true },
                      { endpoint: 'hooks.partner.io/v2', status: 'retrying', code: 503, latency: '5002ms', sig: true, retryIn: '60s' },
                      { endpoint: 'notify.internal.dev', status: 'delivered', code: 200, latency: '45ms', sig: true },
                    ].map((d, i) => (
                      <div key={i} className={`p-4 rounded-xl border transition-all duration-300 ${d.status === 'retrying' ? 'border-amber-200 bg-amber-50/50' : 'border-border bg-card'
                        }`}>
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            {d.status === 'delivered' ? (
                              <div className="h-6 w-6 rounded-full bg-green-100 flex items-center justify-center">
                                <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
                              </div>
                            ) : (
                              <div className="h-6 w-6 rounded-full bg-amber-100 flex items-center justify-center animate-pulse">
                                <Clock className="h-3.5 w-3.5 text-amber-600" />
                              </div>
                            )}
                            <span className="text-sm font-medium font-mono">{d.endpoint}</span>
                          </div>
                          <span className={`text-xs font-mono font-bold ${d.code === 200 ? 'text-green-600' : 'text-amber-600'}`}>{d.code}</span>
                        </div>
                        <div className="flex items-center gap-4 text-[11px] text-muted-foreground pl-8">
                          <span>{d.latency}</span>
                          {d.sig && <span className="flex items-center gap-1"><Shield className="h-3 w-3" /> {t('landing.howItWorks.hmacSigned')}</span>}
                          {d.retryIn && <span className="text-amber-600 font-medium">Retry in {d.retryIn}</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Step 3: Monitor */}
                <div className={`absolute inset-0 p-6 transition-all duration-500 ${current === 2 ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4 pointer-events-none'
                  }`}>
                  <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-4">{t('landing.howItWorks.dashboardOverview')}</div>
                  <div className="grid grid-cols-3 gap-3 mb-4">
                    {[
                      { label: t('landing.howItWorks.successRate'), value: '99.7%', color: 'text-green-600', bg: 'bg-green-50' },
                      { label: t('landing.howItWorks.avgLatency'), value: '124ms', color: 'text-blue-600', bg: 'bg-blue-50' },
                      { label: t('landing.howItWorks.eventsToday'), value: '12,847', color: 'text-violet-600', bg: 'bg-violet-50' },
                    ].map((stat) => (
                      <div key={stat.label} className={`${stat.bg} rounded-xl p-3 text-center`}>
                        <div className={`text-lg font-bold ${stat.color}`}>{stat.value}</div>
                        <div className="text-[10px] text-muted-foreground mt-0.5">{stat.label}</div>
                      </div>
                    ))}
                  </div>
                  <div className="bg-muted/30 rounded-xl p-4 border">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-xs font-semibold">{t('landing.howItWorks.deliveryVolume24h')}</span>
                      <span className="text-[10px] text-muted-foreground">{t('landing.howItWorks.updatedLive')}</span>
                    </div>
                    <div className="flex items-end gap-[3px] h-20">
                      {[40, 55, 45, 70, 65, 80, 75, 90, 85, 95, 88, 92, 78, 85, 90, 70, 60, 75, 80, 85, 90, 95, 88, 92].map((h, i) => (
                        <div
                          key={i}
                          className="flex-1 rounded-sm transition-all duration-700"
                          style={{
                            height: `${h}%`,
                            background: i >= 22 ? '#8B5CF6' : i >= 20 ? '#a78bfa' : '#e2e8f0',
                            opacity: current === 2 ? 1 : 0,
                            transitionDelay: `${i * 30}ms`,
                          }}
                        />
                      ))}
                    </div>
                    <div className="flex justify-between mt-2 text-[9px] text-muted-foreground">
                      <span>00:00</span><span>06:00</span><span>12:00</span><span>18:00</span><span>Now</span>
                    </div>
                  </div>
                  <div className="mt-3 flex items-center gap-2">
                    <Button size="sm" variant="outline" className="text-xs h-7">
                      <RefreshCw className="h-3 w-3" /> {t('landing.howItWorks.replayFailed')}
                    </Button>
                    <Button size="sm" variant="outline" className="text-xs h-7">
                      <Eye className="h-3 w-3" /> {t('landing.howItWorks.viewAll')}
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}


function Integrations() {
  const { t } = useTranslation();

  const sdks = [
    { name: 'Node.js', desc: t('landing.integrations.nodeDesc'), logoSrc: '/logos/typescript.svg' },
    { name: 'Python', desc: t('landing.integrations.pythonDesc'), logoSrc: '/logos/python.svg' },
    { name: 'PHP', desc: t('landing.integrations.phpDesc'), logoSrc: '/logos/php.svg' },
  ];

  const services = [
    { name: 'Stripe', desc: t('landing.integrations.service1Desc'), src: '/logos/stripe.svg' },
    { name: 'GitHub', desc: t('landing.integrations.service2Desc'), src: '/logos/github.svg' },
    { name: 'Slack', desc: t('landing.integrations.service3Desc'), src: '/logos/slack.svg' },
    { name: 'Twilio', desc: t('landing.integrations.service4Desc'), src: '/logos/twilio.svg' },
    { name: 'Salesforce', desc: t('landing.integrations.service5Desc'), src: '/logos/salesforce.svg' },
    { name: t('landing.integrations.service6'), desc: t('landing.integrations.service6Desc'), icon: Webhook },
  ];

  return (
    <section className="py-24">
      <div className="max-w-7xl mx-auto px-6">
        <div className="text-center mb-16">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 text-primary text-xs font-semibold mb-6 border border-primary/20">
            <Code2 className="h-3 w-3" />
            {t('landing.integrations.badge')}
          </div>
          <h2 className="text-headline mb-4">{t('landing.integrations.title')}<span className="gradient-text">{t('landing.integrations.titleHighlight')}</span></h2>
          <p className="text-body-lg text-muted-foreground max-w-2xl mx-auto">{t('landing.integrations.subtitle')}</p>
        </div>

        <div className="grid lg:grid-cols-3 gap-8 mb-12">
          <div className="lg:col-span-2">
            <h3 className="text-lg font-semibold mb-2">{t('landing.integrations.sdksTitle')}</h3>
            <p className="text-sm text-muted-foreground mb-6">{t('landing.integrations.sdksDesc')}</p>
            <div className="grid sm:grid-cols-3 gap-4">
              {sdks.map((sdk) => (
                <div key={sdk.name} className="group p-5 rounded-xl border bg-card hover:shadow-card-hover hover:border-primary/20 transition-all duration-300">
                  <div className="flex items-center gap-3 mb-3">
                    <img src={sdk.logoSrc} alt={sdk.name} className="h-8 w-8 object-contain opacity-70 group-hover:opacity-100 transition-opacity" />
                    <span className="text-sm font-semibold">{sdk.name}</span>
                  </div>
                  <code className="text-[11px] text-muted-foreground font-mono bg-muted px-2 py-1 rounded">{sdk.desc}</code>
                </div>
              ))}
            </div>
            <div className="mt-4 p-4 rounded-xl border bg-muted/30">
              <div className="flex items-center gap-2 mb-1">
                <Code2 className="h-4 w-4 text-primary" />
                <span className="text-sm font-semibold">{t('landing.integrations.restTitle')}</span>
              </div>
              <p className="text-xs text-muted-foreground">{t('landing.integrations.restDesc')}</p>
            </div>
          </div>

          <div>
            <h3 className="text-lg font-semibold mb-2">{t('landing.integrations.deliverTo')}</h3>
            <p className="text-sm text-muted-foreground mb-6">{t('landing.integrations.deliverToDesc')}</p>
            <div className="space-y-3">
              {services.map((service) => (
                <div key={service.name} className="flex items-center gap-3 p-3 rounded-xl border hover:border-primary/20 hover:bg-accent transition-all duration-200">
                  <div className="h-9 w-9 rounded-lg bg-muted/50 flex items-center justify-center flex-shrink-0">
                    {'src' in service ? (
                      <img src={service.src} alt={service.name} className="h-5 w-5 object-contain" />
                    ) : (
                      <service.icon className="h-4 w-4 text-primary" />
                    )}
                  </div>
                  <div>
                    <span className="text-sm font-medium block">{service.name}</span>
                    <span className="text-[11px] text-muted-foreground">{service.desc}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function TrustGrid() {
  const { t } = useTranslation();

  const items = [
    { icon: Lock, title: t('landing.trust.encryption'), desc: t('landing.trust.encryptionDesc'), color: 'text-emerald-500' },
    { icon: Shield, title: t('landing.trust.hmac'), desc: t('landing.trust.hmacDesc'), color: 'text-blue-500' },
    { icon: Globe, title: t('landing.trust.ssrf'), desc: t('landing.trust.ssrfDesc'), color: 'text-violet-500' },
    { icon: Webhook, title: t('landing.trust.rbac'), desc: t('landing.trust.rbacDesc'), color: 'text-amber-500' },
    { icon: Fingerprint, title: t('landing.trust.apiKeys'), desc: t('landing.trust.apiKeysDesc'), color: 'text-rose-500' },
    { icon: Activity, title: t('landing.trust.audit'), desc: t('landing.trust.auditDesc'), color: 'text-cyan-500' },
    { icon: RefreshCw, title: t('landing.trust.atLeastOnce'), desc: t('landing.trust.atLeastOnceDesc'), color: 'text-green-500' },
    { icon: Code2, title: t('landing.trust.selfHosted'), desc: t('landing.trust.selfHostedDesc'), color: 'text-orange-500' },
    { icon: CheckCircle2, title: t('landing.trust.openSource'), desc: t('landing.trust.openSourceDesc'), color: 'text-primary' },
  ];

  return (
    <section className="py-24 bg-muted/30 relative overflow-hidden">
      <div className="absolute bottom-0 right-1/4 w-[400px] h-[400px] bg-emerald-500/5 rounded-full blur-[100px] pointer-events-none" />
      <div className="max-w-7xl mx-auto px-6 relative">
        <div className="text-center mb-16">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/10 text-emerald-600 text-xs font-semibold mb-6 border border-emerald-500/20">
            <Shield className="h-3 w-3" />
            {t('landing.trust.badge')}
          </div>
          <h2 className="text-headline mb-4">{t('landing.trust.title')}<br /><span className="gradient-text">{t('landing.trust.titleHighlight')}</span></h2>
          <p className="text-body-lg text-muted-foreground max-w-2xl mx-auto">
            {t('landing.trust.subtitle')}
          </p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {items.map((item, i) => (
            <div key={i} className="group flex items-start gap-4 p-5 rounded-xl border bg-card hover:shadow-card-hover hover:border-primary/20 transition-all duration-300">
              <div className={`h-10 w-10 rounded-lg bg-muted/50 flex items-center justify-center flex-shrink-0 group-hover:bg-primary/10 transition-colors`}>
                <item.icon className={`h-5 w-5 ${item.color}`} />
              </div>
              <div>
                <h3 className="text-sm font-semibold mb-0.5">{item.title}</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">{item.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function FAQ() {
  const { t } = useTranslation();
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  const questions = [
    { q: t('landing.faq.q1'), a: t('landing.faq.a1') },
    { q: t('landing.faq.q2'), a: t('landing.faq.a2') },
    { q: t('landing.faq.q3'), a: t('landing.faq.a3') },
    { q: t('landing.faq.q7'), a: t('landing.faq.a7') },
    { q: t('landing.faq.q4'), a: t('landing.faq.a4') },
    { q: t('landing.faq.q5'), a: t('landing.faq.a5') },
  ];

  return (
    <section className="py-24 bg-muted/30">
      <div className="max-w-3xl mx-auto px-6">
        <div className="text-center mb-16">
          <h2 className="text-headline mb-4">{t('landing.faq.title')}<span className="gradient-text">{t('landing.faq.titleHighlight')}</span></h2>
        </div>

        <div className="space-y-3">
          {questions.map((item, index) => (
            <div key={index} className="rounded-xl border bg-card overflow-hidden transition-all duration-300 hover:border-primary/20">
              <button
                className="w-full flex items-center justify-between p-5 text-left"
                onClick={() => setOpenIndex(openIndex === index ? null : index)}
              >
                <span className="text-sm font-semibold pr-4">{item.q}</span>
                <ChevronDown className={`h-4 w-4 text-muted-foreground flex-shrink-0 transition-transform duration-300 ${openIndex === index ? 'rotate-180' : ''}`} />
              </button>
              <div className={`overflow-hidden transition-all duration-300 ${openIndex === index ? 'max-h-60 opacity-100' : 'max-h-0 opacity-0'}`}>
                <p className="px-5 pb-5 text-sm text-muted-foreground leading-relaxed">{item.a}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function FinalCTA() {
  const { t } = useTranslation();
  return (
    <section className="py-24">
      <div className="max-w-7xl mx-auto px-6">
        <div className="relative bg-gradient-to-br from-primary via-primary/95 to-purple-700 rounded-2xl p-12 lg:p-16 text-center overflow-hidden">
          <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmYiIGZpbGwtb3BhY2l0eT0iMC4wNCI+PHBhdGggZD0iTTM2IDM0djZoLTZWMzRoNnptMC0zMHY2aC02VjRoNnptMCAyNHY2aC02di02aDZ6bTAgLTEydjZoLTZ2LTZoNnptLTI0IDI0djZIMnYtNmg2em0wLTMwdjZIMlY0aDZ6bTAgMjR2Nkgydi02aDZ6bTAtMTJ2Nkgydi02aDZ6bTEyIDEydjZoLTZ2LTZoNnptMC0zMHY2aC02VjRoNnptMCAyNHY2aC02di02aDZ6bTAtMTJ2NmgtNnYtNmg2eiIvPjwvZz48L2c+PC9zdmc+')] opacity-50" />
          <div className="absolute top-0 right-0 w-96 h-96 bg-white/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
          <div className="relative z-10">
            <h2 className="text-3xl lg:text-[2.75rem] font-bold text-white mb-4 leading-tight">
              {t('landing.cta.title')}
            </h2>
            <p className="text-lg text-white/70 mb-6 max-w-xl mx-auto">
              {t('landing.cta.subtitle')}
            </p>
            <div className="flex items-center justify-center gap-4 mb-8 text-sm text-white/60">
              <span className="flex items-center gap-1.5"><CheckCircle2 className="h-4 w-4 text-green-300" />{t('landing.hero.openSourceFree')}</span>
              <span className="flex items-center gap-1.5"><CheckCircle2 className="h-4 w-4 text-green-300" />{t('landing.hero.selfHosted')}</span>
              <span className="flex items-center gap-1.5"><CheckCircle2 className="h-4 w-4 text-green-300" />{t('landing.hero.fiveMinSetup')}</span>
            </div>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              <Link to="/register">
                <Button size="lg" className="bg-white text-primary hover:bg-white/90 shadow-xl">
                  {t('landing.cta.getStartedFree')} <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
              <a href="mailto:vadymkykalo@gmail.com">
                <Button size="lg" variant="outline" className="border-white/30 text-white hover:bg-white/10 bg-transparent">
                  <Mail className="h-4 w-4" /> {t('landing.cta.contactSales')}
                </Button>
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

