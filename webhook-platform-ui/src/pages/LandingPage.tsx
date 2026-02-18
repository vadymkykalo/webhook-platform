import { ArrowRight, CheckCircle2, Code2, Eye, RefreshCw, Zap, Clock, Activity, AlertCircle, Shield, Webhook, BarChart3, Lock } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { useAuth } from '../auth/auth.store';
import { Button } from '../components/ui/button';

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      <Hero />
      <LogoCloud />
      <Features />
      <ArchitectureShowcase />
      <VisibilityAndControl />
      <DeveloperConfidence />
      <HowItWorks />
      <QuickstartCTA />
      <Footer />
    </div>
  );
}

function Navigation() {
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
              <Webhook className="h-4 w-4 text-primary-foreground" />
            </div>
            <span className="text-lg font-bold tracking-tight">Hookflow</span>
          </Link>
          <div className="hidden md:flex items-center gap-6">
            <a href="#features" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Features</a>
            <a href="#architecture" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Architecture</a>
            <Link to="/docs" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Docs</Link>
            <Link to="/quickstart" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Quickstart</Link>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {isAuthenticated ? (
            <Link to="/projects">
              <Button size="sm">Go to Dashboard <ArrowRight className="h-3.5 w-3.5" /></Button>
            </Link>
          ) : (
            <>
              <Link to="/login" className="text-sm text-muted-foreground hover:text-foreground transition-colors hidden sm:block">Sign in</Link>
              <Link to="/register">
                <Button size="sm">Get started <ArrowRight className="h-3.5 w-3.5" /></Button>
              </Link>
            </>
          )}
        </div>
      </div>
    </nav>
  );
}

function Hero() {
  return (
    <section className="relative overflow-hidden">
      {/* Background gradient orbs */}
      <div className="absolute top-0 left-1/4 w-96 h-96 bg-primary/10 rounded-full blur-3xl -translate-y-1/2" />
      <div className="absolute top-20 right-1/4 w-80 h-80 bg-purple-500/10 rounded-full blur-3xl" />

      <div className="max-w-7xl mx-auto px-6 pt-20 pb-24 relative">
        <div className="grid lg:grid-cols-2 gap-16 items-center">
          <div className="animate-fade-in-up">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 text-primary text-xs font-semibold mb-6 border border-primary/20">
              <Zap className="h-3 w-3" />
              Production-ready webhook infrastructure
            </div>
            <h1 className="text-display text-foreground mb-6 leading-[1.1]">
              Reliable webhook
              <span className="gradient-text"> delivery </span>
              at any scale
            </h1>
            <p className="text-body-lg text-muted-foreground mb-8 max-w-lg">
              Configure endpoints once. We handle delivery, retries, signatures, and monitoring.
              You focus on building product.
            </p>
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
              <Link to="/register">
                <Button size="lg" className="shadow-glow">
                  Start for free <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
              <Link to="/docs">
                <Button variant="outline" size="lg">
                  Read the docs
                </Button>
              </Link>
            </div>
            <div className="flex items-center gap-6 mt-8 text-sm text-muted-foreground">
              <span className="flex items-center gap-1.5"><CheckCircle2 className="h-4 w-4 text-success" />No credit card</span>
              <span className="flex items-center gap-1.5"><CheckCircle2 className="h-4 w-4 text-success" />Free tier included</span>
              <span className="flex items-center gap-1.5"><CheckCircle2 className="h-4 w-4 text-success" />5-min setup</span>
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
          <div className="text-xs font-medium text-muted-foreground">Live Deliveries</div>
          <div className="w-16" />
        </div>
        <div className="p-3 space-y-1.5">
          {deliveries.map((delivery, index) => (
            <div
              key={delivery.id}
              className={`p-3 rounded-lg border transition-all duration-500 ${
                activeRow === index
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
                      <CheckCircle2 className="w-3 h-3" /> Delivered
                    </span>
                  )}
                  {delivery.status === 'failed' && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-destructive/10 text-destructive">
                      <AlertCircle className="w-3 h-3" /> Failed
                    </span>
                  )}
                  {delivery.status === 'retrying' && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-warning/10 text-warning animate-pulse">
                      <Clock className="w-3 h-3" /> Retry {delivery.retry}s
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

function LogoCloud() {
  const techs = ['Spring Boot', 'PostgreSQL', 'Apache Kafka', 'Redis', 'React', 'Docker'];
  return (
    <section className="py-12 border-y border-border/50">
      <div className="max-w-7xl mx-auto px-6">
        <p className="text-center text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-6">Built with battle-tested technology</p>
        <div className="flex items-center justify-center gap-8 md:gap-12 flex-wrap">
          {techs.map((t) => (
            <span key={t} className="text-sm font-medium text-muted-foreground/70 hover:text-foreground transition-colors">{t}</span>
          ))}
        </div>
      </div>
    </section>
  );
}

function Features() {
  const features = [
    { icon: RefreshCw, title: 'Automatic retries', desc: 'Exponential backoff with configurable retry policies. Never miss a delivery.' },
    { icon: Eye, title: 'Full visibility', desc: 'See every attempt, HTTP status, error message, and latency metric in real time.' },
    { icon: Shield, title: 'HMAC signatures', desc: 'Every payload signed with HMAC-SHA256. Verify authenticity on your end.' },
    { icon: Activity, title: 'One-click replay', desc: 'Replay any failed delivery from the dashboard. No code changes needed.' },
    { icon: BarChart3, title: 'Analytics & metrics', desc: 'Time-series charts, success rates, latency percentiles, endpoint health scores.' },
    { icon: Lock, title: 'mTLS support', desc: 'Configure mutual TLS for endpoints that require client certificate authentication.' },
  ];

  return (
    <section id="features" className="py-24">
      <div className="max-w-7xl mx-auto px-6">
        <div className="text-center mb-16">
          <h2 className="text-headline mb-4">Everything you need for<br /><span className="gradient-text">production webhooks</span></h2>
          <p className="text-body-lg text-muted-foreground max-w-2xl mx-auto">
            Enterprise-grade reliability with developer-friendly simplicity.
          </p>
        </div>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((f, i) => (
            <div
              key={i}
              className="group relative bg-card rounded-xl border p-6 hover:shadow-card-hover hover:border-primary/20 transition-all duration-300 hover:-translate-y-0.5"
            >
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center mb-4 group-hover:bg-primary/15 transition-colors">
                <f.icon className="h-5 w-5 text-primary" />
              </div>
              <h3 className="text-base font-semibold mb-2">{f.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function ArchitectureShowcase() {
  const [activeStep, setActiveStep] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => setActiveStep((prev) => (prev + 1) % 7), 2500);
    return () => clearInterval(interval);
  }, []);

  const components = [
    { name: 'Client', sub: 'POST /events' },
    { name: 'API', sub: 'Spring Boot' },
    { name: 'DB', sub: 'Event + Outbox' },
    { name: 'Publisher', sub: 'Scheduled' },
    { name: 'Kafka', sub: 'Queue' },
    { name: 'Worker', sub: 'Consumer' },
    { name: 'Endpoint', sub: 'HMAC' },
  ];

  return (
    <section id="architecture" className="py-24 bg-muted/30">
      <div className="max-w-7xl mx-auto px-6">
        <div className="text-center mb-16">
          <h2 className="text-headline mb-4">Battle-tested <span className="gradient-text">architecture</span></h2>
          <p className="text-body-lg text-muted-foreground">Transactional outbox pattern for zero data loss</p>
        </div>

        <div className="relative">
          <div className="absolute -inset-4 bg-gradient-to-r from-primary/10 to-purple-500/10 rounded-2xl blur-2xl" />
          <div className="relative bg-card rounded-xl border shadow-elevated overflow-hidden">
            <div className="bg-muted/50 border-b px-4 py-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-red-400" />
                <div className="w-3 h-3 rounded-full bg-yellow-400" />
                <div className="w-3 h-3 rounded-full bg-green-400" />
              </div>
              <div className="text-xs font-medium text-muted-foreground">Architecture Flow</div>
              <div className="w-16" />
            </div>

            <div className="p-8 lg:p-12">
              <div className="hidden md:flex items-center justify-center mb-12">
                {components.map((component, index) => (
                  <div key={index} className="flex items-center">
                    <div className="flex flex-col items-center">
                      <div className={`w-20 h-20 lg:w-24 lg:h-24 rounded-xl border-2 flex flex-col items-center justify-center transition-all duration-500 ${
                        activeStep === index
                          ? 'border-primary/50 bg-accent scale-110 shadow-glow'
                          : 'border-border bg-card hover:border-primary/20'
                      }`}>
                        <div className={`text-sm lg:text-base font-semibold mb-0.5 ${activeStep === index ? 'text-primary' : 'text-foreground'}`}>
                          {component.name}
                        </div>
                        <div className={`text-[10px] lg:text-xs ${activeStep === index ? 'text-primary/70' : 'text-muted-foreground'}`}>
                          {component.sub}
                        </div>
                      </div>
                    </div>
                    {index < components.length - 1 && (
                      <div className={`w-6 lg:w-12 h-0.5 mx-1 lg:mx-2 transition-all duration-500 rounded-full ${
                        activeStep > index ? 'bg-primary' : activeStep === index ? 'bg-primary/50' : 'bg-border'
                      }`} />
                    )}
                  </div>
                ))}
              </div>

              <div className="grid md:grid-cols-3 gap-4">
                {[
                  { title: 'Atomic writes', desc: 'Single transaction ensures consistency' },
                  { title: 'Zero data loss', desc: 'Events never lost during failures' },
                  { title: 'At-least-once', desc: 'Automatic retry with exponential backoff' },
                ].map((item) => (
                  <div key={item.title} className="p-4 rounded-lg border bg-muted/30 hover:bg-accent hover:border-primary/20 transition-all">
                    <div className="font-semibold text-sm mb-1">{item.title}</div>
                    <div className="text-xs text-muted-foreground">{item.desc}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}


function VisibilityAndControl() {
  const [selectedAttempt, setSelectedAttempt] = useState(2);

  const attempts = [
    { id: 1, status: 'success', code: 200, latency: '124ms', time: '10:42:15' },
    { id: 2, status: 'failed', code: 503, latency: '5002ms', time: '10:42:45', error: 'Service Unavailable' },
    { id: 3, status: 'success', code: 200, latency: '98ms', time: '10:43:45' },
  ];

  return (
    <section className="py-24">
      <div className="max-w-7xl mx-auto px-6">
        <div className="grid lg:grid-cols-2 gap-16 items-center">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 text-primary text-xs font-semibold mb-6 border border-primary/20">
              <Eye className="h-3 w-3" />
              Complete observability
            </div>
            <h2 className="text-headline mb-6">
              Full visibility into<br />every <span className="gradient-text">delivery</span>
            </h2>
            <p className="text-body-lg text-muted-foreground mb-8">
              See every attempt with full HTTP context — status codes, error messages, latency, and timestamps.
            </p>
            <div className="space-y-4">
              {[
                { title: 'Complete attempt timeline', desc: 'View all retry attempts with full HTTP context' },
                { title: 'Error details and debugging', desc: 'See exact error messages and response bodies' },
                { title: 'Performance metrics', desc: 'Track latency percentiles and identify slow endpoints' },
              ].map((item) => (
                <div key={item.title} className="flex items-start gap-3">
                  <CheckCircle2 className="h-5 w-5 text-success flex-shrink-0 mt-0.5" />
                  <div>
                    <div className="text-sm font-semibold">{item.title}</div>
                    <div className="text-sm text-muted-foreground">{item.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div>
            <div className="relative">
              <div className="absolute -inset-4 bg-gradient-to-r from-primary/10 to-purple-500/10 rounded-2xl blur-2xl" />
              <div className="relative bg-card rounded-xl border shadow-elevated overflow-hidden">
                <div className="bg-gradient-to-r from-slate-900 to-slate-800 px-6 py-4 text-white">
                  <div className="text-sm font-medium">Delivery: order.completed</div>
                  <div className="text-xs text-white/50 mt-0.5">Endpoint: https://api.customer.com/webhooks</div>
                </div>
                <div className="p-5">
                  <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Attempt History</div>
                  <div className="space-y-2">
                    {attempts.map((attempt) => (
                      <div
                        key={attempt.id}
                        onClick={() => setSelectedAttempt(attempt.id)}
                        className={`p-3 rounded-lg border cursor-pointer transition-all duration-200 ${
                          selectedAttempt === attempt.id
                            ? 'border-primary/40 bg-accent ring-1 ring-primary/20'
                            : 'border-border hover:border-primary/20 hover:bg-muted/50'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1.5">
                          <div className="flex items-center gap-2">
                            {attempt.status === 'success' ? (
                              <CheckCircle2 className="h-3.5 w-3.5 text-success" />
                            ) : (
                              <AlertCircle className="h-3.5 w-3.5 text-destructive" />
                            )}
                            <span className="text-sm font-medium">Attempt #{attempt.id}</span>
                          </div>
                          <span className="text-[11px] text-muted-foreground">{attempt.time}</span>
                        </div>
                        <div className="flex items-center gap-3 text-xs">
                          <span className={`font-mono font-semibold ${attempt.status === 'success' ? 'text-success' : 'text-destructive'}`}>
                            {attempt.code}
                          </span>
                          <span className="text-muted-foreground">{attempt.latency}</span>
                        </div>
                        {attempt.error && selectedAttempt === attempt.id && (
                          <div className="mt-2 p-2 bg-destructive/5 rounded border border-destructive/10 animate-scale-in">
                            <div className="text-xs text-destructive font-medium">{attempt.error}</div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                  <Button className="w-full mt-4" size="sm">
                    <RefreshCw className="h-3.5 w-3.5" /> Replay delivery
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function DeveloperConfidence() {
  return (
    <section className="py-24 bg-gradient-to-br from-slate-900 via-slate-900 to-slate-800 relative overflow-hidden">
      <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmYiIGZpbGwtb3BhY2l0eT0iMC4wMyI+PHBhdGggZD0iTTM2IDM0djZoLTZWMzRoNnptMC0zMHY2aC02VjRoNnptMCAyNHY2aC02di02aDZ6bTAgLTEydjZoLTZ2LTZoNnptLTI0IDI0djZIMnYtNmg2em0wLTMwdjZIMlY0aDZ6bTAgMjR2Nkgydi02aDZ6bTAtMTJ2Nkgydi02aDZ6bTEyIDEydjZoLTZ2LTZoNnptMC0zMHY2aC02VjRoNnptMCAyNHY2aC02di02aDZ6bTAtMTJ2NmgtNnYtNmg2eiIvPjwvZz48L2c+PC9zdmc+')] opacity-50" />
      <div className="max-w-7xl mx-auto px-6 relative">
        <div className="grid lg:grid-cols-2 gap-16 items-center">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/10 text-white/80 text-xs font-semibold mb-6 border border-white/10">
              <Code2 className="h-3 w-3" />
              Developer experience
            </div>
            <h2 className="text-headline text-white mb-6">
              Developer-friendly API
            </h2>
            <p className="text-lg text-white/60 mb-8">
              Clean, predictable API. Send events in one request. We handle delivery, retries, and monitoring.
            </p>
            <div className="space-y-3">
              {[
                'RESTful API design',
                'Comprehensive error messages',
                'HMAC signature verification',
                'Idempotency built-in',
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
                    Event accepted · ID: evt_abc123 · 3 deliveries queued
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
  const [activeStep, setActiveStep] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => setActiveStep((prev) => (prev + 1) % 5), 2500);
    return () => clearInterval(interval);
  }, []);

  const steps = [
    { label: 'Your system', icon: Code2 },
    { label: 'Events API', icon: Zap },
    { label: 'Queue', icon: Activity },
    { label: 'Workers', icon: RefreshCw },
    { label: 'Endpoint', icon: CheckCircle2 },
  ];

  return (
    <section className="py-24 bg-muted/30">
      <div className="max-w-7xl mx-auto px-6">
        <div className="text-center mb-16">
          <h2 className="text-headline mb-4">How it <span className="gradient-text">works</span></h2>
          <p className="text-body-lg text-muted-foreground">Simple integration. Reliable delivery.</p>
        </div>
        <div className="bg-card rounded-xl border shadow-elevated p-8 lg:p-12">
          <div className="hidden md:flex items-center justify-between relative mb-12">
            {steps.map((step, index) => (
              <div key={index} className="flex flex-col items-center relative z-10">
                <div className={`w-14 h-14 lg:w-16 lg:h-16 rounded-xl flex items-center justify-center transition-all duration-500 ${
                  activeStep === index
                    ? 'bg-primary scale-110 shadow-glow'
                    : activeStep > index
                    ? 'bg-success'
                    : 'bg-muted'
                }`}>
                  <step.icon className={`h-6 w-6 lg:h-7 lg:w-7 ${activeStep >= index ? 'text-white' : 'text-muted-foreground'}`} />
                </div>
                <div className="mt-3 text-sm font-medium text-center">{step.label}</div>
              </div>
            ))}
            <div className="absolute top-7 lg:top-8 left-0 right-0 h-1 bg-muted -z-0 rounded-full">
              <div className="h-full bg-primary rounded-full transition-all duration-700 ease-out" style={{ width: `${(activeStep / (steps.length - 1)) * 100}%` }} />
            </div>
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            {[
              { step: '1', title: 'Send events', desc: 'POST to our API with your API key. One request is all it takes.' },
              { step: '2', title: 'We deliver', desc: 'Automatic retries, exponential backoff, HMAC signatures included.' },
              { step: '3', title: 'You monitor', desc: 'See every delivery attempt in real-time from the dashboard.' },
            ].map((item) => (
              <div key={item.step} className="text-center p-4">
                <div className="inline-flex items-center justify-center h-8 w-8 rounded-full bg-primary/10 text-primary text-sm font-bold mb-3">{item.step}</div>
                <div className="text-base font-semibold mb-1">{item.title}</div>
                <p className="text-sm text-muted-foreground">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function QuickstartCTA() {
  return (
    <section className="py-24">
      <div className="max-w-7xl mx-auto px-6">
        <div className="relative bg-gradient-to-br from-primary via-primary/95 to-purple-700 rounded-2xl p-12 lg:p-16 text-center overflow-hidden">
          <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmYiIGZpbGwtb3BhY2l0eT0iMC4wNCI+PHBhdGggZD0iTTM2IDM0djZoLTZWMzRoNnptMC0zMHY2aC02VjRoNnptMCAyNHY2aC02di02aDZ6bTAgLTEydjZoLTZ2LTZoNnptLTI0IDI0djZIMnYtNmg2em0wLTMwdjZIMlY0aDZ6bTAgMjR2Nkgydi02aDZ6bTAtMTJ2Nkgydi02aDZ6bTEyIDEydjZoLTZ2LTZoNnptMC0zMHY2aC02VjRoNnptMCAyNHY2aC02di02aDZ6bTAtMTJ2NmgtNnYtNmg2eiIvPjwvZz48L2c+PC9zdmc+')] opacity-50" />
          <div className="absolute top-0 right-0 w-96 h-96 bg-white/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
          <div className="relative z-10">
            <h2 className="text-3xl lg:text-[2.75rem] font-bold text-white mb-4 leading-tight">
              Start delivering webhooks reliably
            </h2>
            <p className="text-lg text-white/70 mb-10 max-w-xl mx-auto">
              Sign up, configure endpoints, and send your first event in under 5 minutes.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              <Link to="/register">
                <Button size="lg" className="bg-white text-primary hover:bg-white/90 shadow-xl">
                  Get started free <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
              <Link to="/quickstart">
                <Button size="lg" variant="outline" className="border-white/30 text-white hover:bg-white/10 bg-transparent">
                  View quickstart
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-border/50 bg-muted/30">
      <div className="max-w-7xl mx-auto px-6 py-12">
        <div className="grid sm:grid-cols-2 md:grid-cols-4 gap-8">
          <div>
            <Link to="/" className="flex items-center gap-2.5 mb-4">
              <div className="h-7 w-7 rounded-md bg-primary flex items-center justify-center">
                <Webhook className="h-3.5 w-3.5 text-primary-foreground" />
              </div>
              <span className="text-sm font-bold">Hookflow</span>
            </Link>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Production-ready webhook infrastructure. Reliable delivery at any scale.
            </p>
          </div>
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Product</h3>
            <ul className="space-y-2">
              <li><a href="#features" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Features</a></li>
              <li><Link to="/quickstart" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Quickstart</Link></li>
              <li><Link to="/docs" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Documentation</Link></li>
            </ul>
          </div>
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Access</h3>
            <ul className="space-y-2">
              <li><Link to="/login" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Sign in</Link></li>
              <li><Link to="/register" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Create account</Link></li>
              <li><Link to="/dashboard" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Dashboard</Link></li>
            </ul>
          </div>
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Legal</h3>
            <ul className="space-y-2">
              <li><a href="#security" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Security</a></li>
              <li><a href="#privacy" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Privacy</a></li>
              <li><a href="#terms" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Terms</a></li>
            </ul>
          </div>
        </div>
        <div className="mt-10 pt-6 border-t border-border/50 flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            © {new Date().getFullYear()} Hookflow. Built for production systems.
          </p>
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <a href="#" className="hover:text-foreground transition-colors">Status</a>
            <a href="#" className="hover:text-foreground transition-colors">GitHub</a>
          </div>
        </div>
      </div>
    </footer>
  );
}
