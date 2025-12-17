import { ArrowRight, CheckCircle2, Code2, Eye, RefreshCw, Zap, Clock, Activity, AlertCircle } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { useAuth } from '../auth/auth.store';

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-white">
      <Navigation />
      <Hero />
      <TrustThroughVisuals />
      <VisibilityAndControl />
      <HowItWorks />
      <DeveloperConfidence />
      <QuickstartCTA />
      <Footer />
    </div>
  );
}

function Navigation() {
  const { isAuthenticated } = useAuth();

  return (
    <nav className="border-b border-gray-200 bg-white">
      <div className="max-w-7xl mx-auto px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-8">
            <Link to="/" className="text-xl font-semibold text-gray-900">
              Webhook Platform
            </Link>
            <div className="hidden md:flex items-center space-x-6">
              <a href="#product" className="text-sm text-gray-600 hover:text-gray-900">
                Product
              </a>
              <a href="#solutions" className="text-sm text-gray-600 hover:text-gray-900">
                Solutions
              </a>
              <Link to="/quickstart" className="text-sm text-gray-600 hover:text-gray-900">
                Quickstart
              </Link>
              <Link to="/docs" className="text-sm text-gray-600 hover:text-gray-900">
                Docs
              </Link>
            </div>
          </div>
          <div className="flex items-center space-x-4">
            {isAuthenticated ? (
              <Link
                to="/projects"
                className="inline-flex items-center px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 transition-all hover:scale-105"
              >
                Go to Dashboard
              </Link>
            ) : (
              <>
                <Link
                  to="/login"
                  className="text-sm text-gray-600 hover:text-gray-900"
                >
                  Sign in
                </Link>
                <Link
                  to="/register"
                  className="inline-flex items-center px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 transition-colors"
                >
                  Get started
                </Link>
              </>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}

function Hero() {
  return (
    <section className="max-w-7xl mx-auto px-6 py-20">
      <div className="grid lg:grid-cols-2 gap-16 items-center">
        <div>
          <h1 className="text-6xl font-bold text-gray-900 leading-tight mb-6">
            Reliable webhook infrastructure for production systems
          </h1>
          <p className="text-xl text-gray-600 leading-relaxed mb-8">
            Configure webhook endpoints once. We handle delivery, retries, and visibility.
            You focus on building product.
          </p>
          <div className="flex items-center space-x-4">
            <Link
              to="/register"
              className="inline-flex items-center px-6 py-3 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 transition-all hover:scale-105"
            >
              Get started
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
            <Link
              to="/quickstart"
              className="inline-flex items-center px-6 py-3 border border-gray-300 text-gray-900 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors"
            >
              View quickstart
            </Link>
          </div>
        </div>
        <div>
          <DashboardMockup />
        </div>
      </div>
    </section>
  );
}

function DashboardMockup() {
  const [activeRow, setActiveRow] = useState(0);
  const [retryCountdown, setRetryCountdown] = useState(28);

  useEffect(() => {
    const rowInterval = setInterval(() => {
      setActiveRow((prev) => (prev + 1) % 5);
    }, 3000);

    const countdownInterval = setInterval(() => {
      setRetryCountdown((prev) => (prev > 0 ? prev - 1 : 30));
    }, 1000);

    return () => {
      clearInterval(rowInterval);
      clearInterval(countdownInterval);
    };
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
      <div className="absolute -inset-4 bg-gradient-to-r from-blue-500/20 to-purple-500/20 rounded-2xl blur-2xl"></div>
      <div className="relative bg-white rounded-xl border border-gray-200 shadow-2xl overflow-hidden">
        <div className="bg-gray-50 border-b border-gray-200 px-4 py-3 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <div className="w-3 h-3 rounded-full bg-red-500"></div>
            <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
            <div className="w-3 h-3 rounded-full bg-green-500"></div>
          </div>
          <div className="text-xs font-medium text-gray-500">Deliveries</div>
          <div className="w-16"></div>
        </div>
        <div className="p-4 space-y-2">
          {deliveries.map((delivery, index) => (
            <div
              key={delivery.id}
              className={`p-3 rounded-lg border transition-all duration-500 ${
                activeRow === index
                  ? 'border-blue-300 bg-blue-50 scale-105'
                  : 'border-gray-200 bg-white hover:border-gray-300'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <div className="text-sm font-medium text-gray-900">{delivery.event}</div>
                  <div className="text-xs text-gray-500">{delivery.endpoint}</div>
                </div>
                <div className="flex items-center space-x-3">
                  {delivery.status === 'success' && (
                    <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                      <CheckCircle2 className="w-3 h-3 mr-1" />
                      Success
                    </span>
                  )}
                  {delivery.status === 'failed' && (
                    <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800">
                      <AlertCircle className="w-3 h-3 mr-1" />
                      Failed
                    </span>
                  )}
                  {delivery.status === 'retrying' && (
                    <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-800 animate-pulse">
                      <Clock className="w-3 h-3 mr-1" />
                      Retry in {delivery.retry}s
                    </span>
                  )}
                  <span className="text-xs text-gray-400">{delivery.time}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
        <div className="bg-gray-50 border-t border-gray-200 px-4 py-2 text-xs text-gray-500 text-center">
          Real-time delivery monitoring • Automatic retries • Full visibility
        </div>
      </div>
    </div>
  );
}

function TrustThroughVisuals() {
  const features = [
    {
      icon: RefreshCw,
      title: 'Reliable delivery',
      description: 'Exponential backoff with configurable retry policies.',
      visual: 'retry-animation',
    },
    {
      icon: Eye,
      title: 'Full visibility',
      description: 'See every attempt, error, and latency metric.',
      visual: 'timeline-graph',
    },
    {
      icon: Activity,
      title: 'Manual replay',
      description: 'One-click replay from the dashboard. No code changes.',
      visual: 'replay-button',
    },
  ];

  return (
    <section className="bg-gradient-to-b from-gray-50 to-white py-24">
      <div className="max-w-7xl mx-auto px-6">
        <div className="text-center mb-16">
          <h2 className="text-4xl font-bold text-gray-900 mb-4">
            Built for production webhooks
          </h2>
          <p className="text-xl text-gray-600">
            Everything you need to deliver webhooks reliably at scale.
          </p>
        </div>
        <div className="grid md:grid-cols-3 gap-8">
          {features.map((feature, index) => (
            <div
              key={index}
              className="group bg-white rounded-xl border border-gray-200 p-8 hover:border-gray-300 hover:shadow-xl transition-all duration-300 hover:-translate-y-1"
            >
              <div className="w-12 h-12 rounded-lg bg-gray-900 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                <feature.icon className="h-6 w-6 text-white" />
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-3">{feature.title}</h3>
              <p className="text-gray-600 mb-6">{feature.description}</p>
              <div className="h-24 bg-gradient-to-br from-gray-50 to-gray-100 rounded-lg border border-gray-200 flex items-center justify-center">
                {feature.visual === 'retry-animation' && (
                  <div className="flex items-center space-x-2">
                    <div className="w-2 h-2 bg-blue-500 rounded-full animate-ping"></div>
                    <ArrowRight className="h-4 w-4 text-gray-400 animate-pulse" />
                    <div className="w-2 h-2 bg-blue-500 rounded-full animate-ping" style={{ animationDelay: '0.5s' }}></div>
                  </div>
                )}
                {feature.visual === 'timeline-graph' && (
                  <div className="flex items-end space-x-1">
                    {[4, 8, 6, 10, 7, 9].map((height, i) => (
                      <div
                        key={i}
                        className="w-3 bg-blue-500 rounded-t transition-all duration-500 hover:bg-blue-600"
                        style={{ height: `${height * 4}px` }}
                      ></div>
                    ))}
                  </div>
                )}
                {feature.visual === 'replay-button' && (
                  <button className="px-4 py-2 bg-gray-900 text-white text-xs font-medium rounded-lg hover:bg-gray-800 transition-all hover:scale-105">
                    <RefreshCw className="h-3 w-3 inline mr-1" />
                    Replay delivery
                  </button>
                )}
              </div>
            </div>
          ))}
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
    <section className="max-w-7xl mx-auto px-6 py-24">
      <div className="grid lg:grid-cols-2 gap-16 items-center">
        <div>
          <h2 className="text-4xl font-bold text-gray-900 mb-6">
            Visibility and control
          </h2>
          <p className="text-xl text-gray-600 mb-8">
            See every delivery attempt with full context. HTTP status, error messages, latency, and timestamps.
          </p>
          <div className="space-y-4">
            <div className="flex items-start space-x-3">
              <CheckCircle2 className="h-6 w-6 text-gray-900 flex-shrink-0 mt-1" />
              <div>
                <div className="font-semibold text-gray-900">Complete attempt timeline</div>
                <div className="text-gray-600">View all retry attempts with full HTTP context</div>
              </div>
            </div>
            <div className="flex items-start space-x-3">
              <CheckCircle2 className="h-6 w-6 text-gray-900 flex-shrink-0 mt-1" />
              <div>
                <div className="font-semibold text-gray-900">Error details and debugging</div>
                <div className="text-gray-600">See exact error messages and response bodies</div>
              </div>
            </div>
            <div className="flex items-start space-x-3">
              <CheckCircle2 className="h-6 w-6 text-gray-900 flex-shrink-0 mt-1" />
              <div>
                <div className="font-semibold text-gray-900">Performance metrics</div>
                <div className="text-gray-600">Track latency and identify slow endpoints</div>
              </div>
            </div>
          </div>
          <p className="mt-8 text-lg font-medium text-gray-900">
            Nothing fails silently.
          </p>
        </div>
        <div>
          <div className="bg-white rounded-xl border border-gray-200 shadow-2xl overflow-hidden">
            <div className="bg-gray-900 px-6 py-4 text-white">
              <div className="text-sm font-medium">Delivery: order.completed</div>
              <div className="text-xs text-gray-400">Endpoint: https://api.customer.com/webhooks</div>
            </div>
            <div className="p-6">
              <div className="text-sm font-semibold text-gray-900 mb-4">Attempt History</div>
              <div className="space-y-3">
                {attempts.map((attempt) => (
                  <div
                    key={attempt.id}
                    onClick={() => setSelectedAttempt(attempt.id)}
                    className={`p-4 rounded-lg border cursor-pointer transition-all ${
                      selectedAttempt === attempt.id
                        ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-200'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center space-x-2">
                        {attempt.status === 'success' ? (
                          <CheckCircle2 className="h-4 w-4 text-green-600" />
                        ) : (
                          <AlertCircle className="h-4 w-4 text-red-600" />
                        )}
                        <span className="text-sm font-medium text-gray-900">Attempt #{attempt.id}</span>
                      </div>
                      <span className="text-xs text-gray-500">{attempt.time}</span>
                    </div>
                    <div className="flex items-center space-x-4 text-xs">
                      <span className={`font-mono ${
                        attempt.status === 'success' ? 'text-green-700' : 'text-red-700'
                      }`}>
                        {attempt.code}
                      </span>
                      <span className="text-gray-500">{attempt.latency}</span>
                    </div>
                    {attempt.error && selectedAttempt === attempt.id && (
                      <div className="mt-3 p-2 bg-red-50 rounded border border-red-200">
                        <div className="text-xs text-red-800">{attempt.error}</div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
              <button className="mt-6 w-full px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 transition-all hover:scale-105">
                <RefreshCw className="h-4 w-4 inline mr-2" />
                Replay delivery
              </button>
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
    const interval = setInterval(() => {
      setActiveStep((prev) => (prev + 1) % 5);
    }, 2500);
    return () => clearInterval(interval);
  }, []);

  const steps = [
    { label: 'Your system', icon: Code2 },
    { label: 'Events API', icon: Zap },
    { label: 'Queue', icon: Activity },
    { label: 'Workers', icon: RefreshCw },
    { label: 'Customer endpoint', icon: CheckCircle2 },
  ];

  return (
    <section className="bg-gradient-to-b from-white to-gray-50 py-24">
      <div className="max-w-7xl mx-auto px-6">
        <div className="text-center mb-16">
          <h2 className="text-4xl font-bold text-gray-900 mb-4">How it works</h2>
          <p className="text-xl text-gray-600">Simple integration. Reliable delivery.</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-200 p-12 shadow-xl">
          <div className="flex items-center justify-between relative">
            {steps.map((step, index) => (
              <div key={index} className="flex flex-col items-center relative z-10">
                <div
                  className={`w-16 h-16 rounded-xl flex items-center justify-center transition-all duration-500 ${
                    activeStep === index
                      ? 'bg-blue-500 scale-110 shadow-xl'
                      : activeStep > index
                      ? 'bg-green-500'
                      : 'bg-gray-200'
                  }`}
                >
                  <step.icon className={`h-8 w-8 ${
                    activeStep >= index ? 'text-white' : 'text-gray-400'
                  }`} />
                </div>
                <div className="mt-4 text-sm font-medium text-gray-900 text-center">
                  {step.label}
                </div>
              </div>
            ))}
            <div className="absolute top-8 left-0 right-0 h-1 bg-gray-200 -z-0">
              <div
                className="h-full bg-blue-500 transition-all duration-500"
                style={{ width: `${(activeStep / (steps.length - 1)) * 100}%` }}
              ></div>
            </div>
          </div>
          <div className="mt-12 grid md:grid-cols-3 gap-8">
            <div className="text-center">
              <div className="text-2xl font-bold text-gray-900 mb-2">1. Send events</div>
              <p className="text-gray-600">POST to our API. We handle the rest.</p>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-gray-900 mb-2">2. We deliver</div>
              <p className="text-gray-600">Retries, backoff, signatures included.</p>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-gray-900 mb-2">3. You monitor</div>
              <p className="text-gray-600">See every attempt in real-time.</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}





function DeveloperConfidence() {
  return (
    <section className="bg-gray-900 py-24">
      <div className="max-w-7xl mx-auto px-6">
        <div className="grid lg:grid-cols-2 gap-16 items-center">
          <div>
            <h2 className="text-4xl font-bold text-white mb-6">
              Developer-friendly API
            </h2>
            <p className="text-xl text-gray-300 mb-8">
              Clean, predictable API. Send events in one request. We handle delivery, retries, and monitoring.
            </p>
            <div className="space-y-4">
              <div className="flex items-center space-x-3">
                <CheckCircle2 className="h-5 w-5 text-green-400" />
                <span className="text-gray-200">RESTful API design</span>
              </div>
              <div className="flex items-center space-x-3">
                <CheckCircle2 className="h-5 w-5 text-green-400" />
                <span className="text-gray-200">Comprehensive error messages</span>
              </div>
              <div className="flex items-center space-x-3">
                <CheckCircle2 className="h-5 w-5 text-green-400" />
                <span className="text-gray-200">HMAC signature verification</span>
              </div>
              <div className="flex items-center space-x-3">
                <CheckCircle2 className="h-5 w-5 text-green-400" />
                <span className="text-gray-200">Idempotency built-in</span>
              </div>
            </div>
          </div>
          <div>
            <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden shadow-2xl">
              <div className="bg-gray-950 px-4 py-2 flex items-center space-x-2 border-b border-gray-700">
                <div className="w-3 h-3 rounded-full bg-red-500"></div>
                <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
                <div className="w-3 h-3 rounded-full bg-green-500"></div>
                <span className="ml-4 text-xs text-gray-400">send-event.sh</span>
              </div>
              <pre className="p-6 text-sm text-gray-100 overflow-x-auto">
{`curl -X POST https://api.webhookplatform.io/v1/events \\
  -H "Authorization: Bearer sk_live_..." \\
  -H "Content-Type: application/json" \\
  -d '{
    "type": "order.completed",
    "data": {
      "order_id": "ord_12345",
      "amount": 99.99,
      "customer_id": "cus_67890"
    }
  }'`}
              </pre>
              <div className="bg-gray-950 px-6 py-3 border-t border-gray-700">
                <div className="text-xs text-green-400 font-mono">
                  ✓ Event accepted • ID: evt_abc123
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}


function QuickstartCTA() {
  return (
    <section className="max-w-7xl mx-auto px-6 py-24">
      <div className="bg-gradient-to-br from-gray-900 to-gray-800 rounded-2xl p-16 text-center relative overflow-hidden">
        <div className="absolute inset-0 bg-grid-white/5 [mask-image:linear-gradient(0deg,transparent,black)]"></div>
        <div className="relative z-10">
          <h2 className="text-5xl font-bold text-white mb-6">
            Start delivering webhooks reliably
          </h2>
          <p className="text-xl text-gray-300 mb-12 max-w-2xl mx-auto">
            Sign up, configure endpoints, and send your first event in under 5 minutes.
          </p>
          <div className="flex items-center justify-center space-x-4">
            <Link
              to="/register"
              className="inline-flex items-center px-8 py-4 bg-white text-gray-900 text-base font-semibold rounded-lg hover:bg-gray-100 transition-all hover:scale-105 shadow-xl"
            >
              Get started
              <ArrowRight className="ml-2 h-5 w-5" />
            </Link>
            <Link
              to="/quickstart"
              className="inline-flex items-center px-8 py-4 border-2 border-white/20 text-white text-base font-semibold rounded-lg hover:bg-white/10 transition-colors"
            >
              View quickstart
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-gray-200 bg-gray-50">
      <div className="max-w-7xl mx-auto px-6 py-12">
        <div className="grid md:grid-cols-3 gap-8">
          <div>
            <h3 className="text-sm font-semibold text-gray-900 mb-4">Product</h3>
            <ul className="space-y-2">
              <li>
                <a href="#solutions" className="text-sm text-gray-600 hover:text-gray-900">
                  Solutions
                </a>
              </li>
              <li>
                <Link to="/quickstart" className="text-sm text-gray-600 hover:text-gray-900">
                  Quickstart
                </Link>
              </li>
              <li>
                <Link to="/docs" className="text-sm text-gray-600 hover:text-gray-900">
                  Docs
                </Link>
              </li>
            </ul>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-gray-900 mb-4">Access</h3>
            <ul className="space-y-2">
              <li>
                <Link to="/login" className="text-sm text-gray-600 hover:text-gray-900">
                  Sign in
                </Link>
              </li>
              <li>
                <Link to="/dashboard" className="text-sm text-gray-600 hover:text-gray-900">
                  Dashboard
                </Link>
              </li>
            </ul>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-gray-900 mb-4">Legal</h3>
            <ul className="space-y-2">
              <li>
                <a href="#security" className="text-sm text-gray-600 hover:text-gray-900">
                  Security
                </a>
              </li>
              <li>
                <a href="#privacy" className="text-sm text-gray-600 hover:text-gray-900">
                  Privacy
                </a>
              </li>
              <li>
                <a href="#terms" className="text-sm text-gray-600 hover:text-gray-900">
                  Terms
                </a>
              </li>
            </ul>
          </div>
        </div>
        <div className="mt-12 pt-8 border-t border-gray-200">
          <p className="text-sm text-gray-500 text-center">
            © {new Date().getFullYear()} Webhook Platform. Built for production systems.
          </p>
        </div>
      </div>
    </footer>
  );
}
