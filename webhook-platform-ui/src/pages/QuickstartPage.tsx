import { ArrowLeft, CheckCircle2, Code2, Copy, ArrowRight, RefreshCw, Shield, Clock, Zap } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useState } from 'react';
import { useAuth } from '../auth/auth.store';

export default function QuickstartPage() {
  const [currentStep, setCurrentStep] = useState(1);
  const totalSteps = 5;

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white">
      <Navigation />
      <div className="max-w-6xl mx-auto px-6 py-16">
        <Header totalSteps={totalSteps} />
        <ProgressBar currentStep={currentStep} totalSteps={totalSteps} />
        <StepContainer>
          <Step1 />
          <Step2 />
          <Step3 />
          <Step4 />
          <Step5 />
        </StepContainer>
        <FinalCTA />
      </div>
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
            <Link to="/docs" className="text-sm text-gray-600 hover:text-gray-900">
              Docs
            </Link>
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
                <Link to="/login" className="text-sm text-gray-600 hover:text-gray-900">
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

function Header({ totalSteps }: { totalSteps: number }) {
  return (
    <div className="mb-16">
      <Link
        to="/"
        className="inline-flex items-center text-sm text-gray-600 hover:text-gray-900 mb-8 transition-colors"
      >
        <ArrowLeft className="h-4 w-4 mr-2" />
        Back to home
      </Link>
      <div className="text-center">
        <h1 className="text-5xl font-bold text-gray-900 mb-4">Quickstart</h1>
        <p className="text-xl text-gray-600">
          Get your first webhook delivered in under 5 minutes.
        </p>
      </div>
    </div>
  );
}

function ProgressBar({ currentStep, totalSteps }: { currentStep: number; totalSteps: number }) {
  return (
    <div className="mb-16">
      <div className="flex items-center justify-between mb-3">
        {Array.from({ length: totalSteps }, (_, i) => i + 1).map((step) => (
          <div key={step} className="flex-1 relative">
            <div className="flex items-center">
              <div
                className={`w-10 h-10 rounded-full flex items-center justify-center font-semibold transition-all ${
                  step <= currentStep
                    ? 'bg-gray-900 text-white scale-110'
                    : 'bg-gray-200 text-gray-400'
                }`}
              >
                {step <= currentStep - 1 ? (
                  <CheckCircle2 className="h-5 w-5" />
                ) : (
                  step
                )}
              </div>
              {step < totalSteps && (
                <div
                  className={`flex-1 h-1 mx-2 transition-all ${
                    step < currentStep ? 'bg-gray-900' : 'bg-gray-200'
                  }`}
                />
              )}
            </div>
          </div>
        ))}
      </div>
      <div className="text-center text-sm text-gray-500">
        Step {currentStep} of {totalSteps}
      </div>
    </div>
  );
}

function StepContainer({ children }: { children: React.ReactNode }) {
  return <div className="space-y-24">{children}</div>;
}

function Step1() {
  return (
    <section className="grid lg:grid-cols-2 gap-12 items-center">
      <div>
        <div className="inline-flex items-center px-3 py-1 bg-blue-100 text-blue-800 text-xs font-medium rounded-full mb-4">
          Step 1 of 5
        </div>
        <h2 className="text-3xl font-bold text-gray-900 mb-4">
          Create your project
        </h2>
        <p className="text-lg text-gray-600 mb-6">
          A project groups your webhook endpoints and events together.
        </p>
        <div className="flex items-center space-x-3 mb-6">
          <CheckCircle2 className="h-5 w-5 text-green-600" />
          <span className="text-gray-600">Retries enabled by default</span>
        </div>
        <div className="flex items-center space-x-3 mb-6">
          <CheckCircle2 className="h-5 w-5 text-green-600" />
          <span className="text-gray-600">Webhook signatures configured</span>
        </div>
        <Link
          to="/register"
          className="inline-flex items-center px-6 py-3 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 transition-all hover:scale-105"
        >
          Create project
          <ArrowRight className="ml-2 h-4 w-4" />
        </Link>
      </div>
      <div>
        <div className="bg-white rounded-xl border border-gray-200 shadow-xl overflow-hidden">
          <div className="bg-gray-900 px-4 py-3 flex items-center justify-between">
            <div className="text-sm font-medium text-white">Create new project</div>
            <div className="flex space-x-2">
              <div className="w-3 h-3 rounded-full bg-red-500"></div>
              <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
              <div className="w-3 h-3 rounded-full bg-green-500"></div>
            </div>
          </div>
          <div className="p-6 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Project name</label>
              <input
                type="text"
                value="Production Webhooks"
                readOnly
                className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-gray-50 text-gray-900"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Environment</label>
              <select className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-gray-50 text-gray-900">
                <option>Production</option>
              </select>
            </div>
            <div className="pt-4">
              <button className="w-full px-4 py-3 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 transition-colors">
                Create project
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function Step2() {
  return (
    <section className="grid lg:grid-cols-2 gap-12 items-center">
      <div className="order-2 lg:order-1">
        <div className="bg-white rounded-xl border border-gray-200 shadow-xl overflow-hidden">
          <div className="bg-gray-50 px-6 py-4 border-b border-gray-200">
            <div className="text-sm font-semibold text-gray-900">Configure endpoint</div>
          </div>
          <div className="p-6 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Endpoint URL</label>
              <input
                type="text"
                value="https://api.customer.com/webhooks"
                readOnly
                className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-gray-50 text-gray-900 font-mono text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Signing secret</label>
              <div className="flex items-center space-x-2">
                <input
                  type="text"
                  value="whsec_••••••••••••••••"
                  readOnly
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg bg-gray-50 text-gray-900 font-mono text-sm"
                />
                <button className="px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">
                  <Copy className="h-4 w-4 text-gray-600" />
                </button>
              </div>
              <p className="mt-1 text-xs text-gray-500">Generated automatically</p>
            </div>
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="flex items-start space-x-3">
                <Shield className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
                <div>
                  <div className="text-sm font-medium text-blue-900">Retry policy configured</div>
                  <div className="text-xs text-blue-700 mt-1">
                    Exponential backoff • 5 attempts • You can change this later
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="order-1 lg:order-2">
        <div className="inline-flex items-center px-3 py-1 bg-blue-100 text-blue-800 text-xs font-medium rounded-full mb-4">
          Step 2 of 5
        </div>
        <h2 className="text-3xl font-bold text-gray-900 mb-4">
          Configure a webhook endpoint
        </h2>
        <p className="text-lg text-gray-600 mb-6">
          Add the URL where you want to receive webhooks.
        </p>
        <div className="space-y-3 mb-6">
          <div className="flex items-start space-x-3">
            <CheckCircle2 className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
            <div className="text-gray-600">Secret generated automatically for signature verification</div>
          </div>
          <div className="flex items-start space-x-3">
            <CheckCircle2 className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
            <div className="text-gray-600">Retry policy already configured with exponential backoff</div>
          </div>
          <div className="flex items-start space-x-3">
            <CheckCircle2 className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
            <div className="text-gray-600">Everything can be changed later in settings</div>
          </div>
        </div>
      </div>
    </section>
  );
}

function Step3() {
  const [eventSent, setEventSent] = useState(false);

  const code = `curl -X POST https://api.webhookplatform.io/v1/events \\
  -H "Authorization: Bearer sk_live_..." \\
  -H "Content-Type: application/json" \\
  -d '{
    "type": "order.completed",
    "data": {
      "order_id": "ord_12345",
      "amount": 99.99
    }
  }'`;

  return (
    <section>
      <div className="text-center mb-12">
        <div className="inline-flex items-center px-3 py-1 bg-blue-100 text-blue-800 text-xs font-medium rounded-full mb-4">
          Step 3 of 5
        </div>
        <h2 className="text-3xl font-bold text-gray-900 mb-4">
          Send your first event
        </h2>
        <p className="text-lg text-gray-600">
          This is the moment everything comes together.
        </p>
      </div>
      <div className="grid lg:grid-cols-2 gap-8 items-start">
        <div>
          <div className="bg-gray-900 rounded-xl overflow-hidden shadow-2xl">
            <div className="bg-gray-950 px-4 py-2 flex items-center space-x-2 border-b border-gray-700">
              <div className="w-3 h-3 rounded-full bg-red-500"></div>
              <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
              <div className="w-3 h-3 rounded-full bg-green-500"></div>
              <span className="ml-4 text-xs text-gray-400">terminal</span>
            </div>
            <div className="relative">
              <pre className="p-6 text-sm text-gray-100 overflow-x-auto">{code}</pre>
              <button
                onClick={() => setEventSent(true)}
                className="absolute top-3 right-3 px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-white text-xs font-medium rounded transition-colors"
              >
                Copy
              </button>
            </div>
            {eventSent && (
              <div className="bg-green-900 border-t border-green-700 px-6 py-3">
                <div className="flex items-center space-x-2">
                  <CheckCircle2 className="h-4 w-4 text-green-400" />
                  <span className="text-xs text-green-100 font-mono">
                    Event accepted • ID: evt_abc123
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
        <div>
          <div className="bg-white rounded-xl border border-gray-200 shadow-xl overflow-hidden">
            <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
              <div className="text-sm font-semibold text-gray-900">Delivery status</div>
            </div>
            <div className="p-6">
              {!eventSent ? (
                <div className="text-center py-8">
                  <Clock className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-500">Waiting for event...</p>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-4 bg-green-50 border border-green-200 rounded-lg">
                    <div>
                      <div className="text-sm font-medium text-gray-900">order.completed</div>
                      <div className="text-xs text-gray-500">api.customer.com/webhooks</div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <CheckCircle2 className="h-5 w-5 text-green-600" />
                      <span className="text-sm font-medium text-green-700">Delivered</span>
                    </div>
                  </div>
                  <div className="text-xs text-gray-500 text-center">
                    Delivered in 124ms • HTTP 200
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function Step4() {
  const [selectedAttempt, setSelectedAttempt] = useState(1);

  const attempts = [
    { id: 1, status: 'success', code: 200, latency: '124ms', time: '14:32:15' },
    { id: 2, status: 'success', code: 200, latency: '98ms', time: '14:32:45' },
  ];

  return (
    <section className="grid lg:grid-cols-2 gap-12 items-center">
      <div>
        <div className="inline-flex items-center px-3 py-1 bg-blue-100 text-blue-800 text-xs font-medium rounded-full mb-4">
          Step 4 of 5
        </div>
        <h2 className="text-3xl font-bold text-gray-900 mb-4">
          See delivery and attempts
        </h2>
        <p className="text-lg text-gray-600 mb-6">
          Every delivery is tracked with complete visibility.
        </p>
        <div className="space-y-4 mb-8">
          <div className="flex items-start space-x-3">
            <Zap className="h-6 w-6 text-gray-900 flex-shrink-0 mt-0.5" />
            <div>
              <div className="font-semibold text-gray-900">Delivery status</div>
              <div className="text-gray-600">Real-time updates on success or failure</div>
            </div>
          </div>
          <div className="flex items-start space-x-3">
            <Clock className="h-6 w-6 text-gray-900 flex-shrink-0 mt-0.5" />
            <div>
              <div className="font-semibold text-gray-900">Attempt history</div>
              <div className="text-gray-600">View all retry attempts with full context</div>
            </div>
          </div>
          <div className="flex items-start space-x-3">
            <CheckCircle2 className="h-6 w-6 text-gray-900 flex-shrink-0 mt-0.5" />
            <div>
              <div className="font-semibold text-gray-900">Error visibility</div>
              <div className="text-gray-600">See exact error messages and HTTP codes</div>
            </div>
          </div>
        </div>
        <p className="text-lg font-semibold text-gray-900">
          Nothing fails silently.
        </p>
      </div>
      <div>
        <div className="bg-white rounded-xl border border-gray-200 shadow-2xl overflow-hidden">
          <div className="bg-gray-900 px-6 py-4 text-white">
            <div className="text-sm font-medium">Delivery details</div>
            <div className="text-xs text-gray-400 mt-1">order.completed → api.customer.com</div>
          </div>
          <div className="p-6">
            <div className="mb-4">
              <div className="inline-flex items-center px-3 py-1 bg-green-100 text-green-800 text-sm font-medium rounded-full">
                <CheckCircle2 className="h-4 w-4 mr-1" />
                Delivered successfully
              </div>
            </div>
            <div className="text-sm font-semibold text-gray-900 mb-3">Attempt History</div>
            <div className="space-y-2">
              {attempts.map((attempt) => (
                <div
                  key={attempt.id}
                  onClick={() => setSelectedAttempt(attempt.id)}
                  className={`p-3 rounded-lg border cursor-pointer transition-all ${
                    selectedAttempt === attempt.id
                      ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-200'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center space-x-2">
                      <CheckCircle2 className="h-4 w-4 text-green-600" />
                      <span className="text-sm font-medium text-gray-900">Attempt #{attempt.id}</span>
                    </div>
                    <span className="text-xs text-gray-500">{attempt.time}</span>
                  </div>
                  <div className="flex items-center space-x-4 text-xs">
                    <span className="font-mono text-green-700">{attempt.code}</span>
                    <span className="text-gray-500">{attempt.latency}</span>
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

function Step5() {
  return (
    <section className="grid lg:grid-cols-2 gap-12 items-center">
      <div className="order-2 lg:order-1">
        <div className="bg-white rounded-xl border border-gray-200 shadow-xl overflow-hidden">
          <div className="bg-gray-50 px-6 py-4 border-b border-gray-200">
            <div className="text-sm font-semibold text-gray-900">Delivery failed</div>
            <div className="text-xs text-gray-500 mt-1">payment.failed → api.partner.com</div>
          </div>
          <div className="p-6">
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
              <div className="flex items-start space-x-3">
                <div className="text-sm text-red-800">
                  <div className="font-medium mb-1">HTTP 503: Service Unavailable</div>
                  <div className="text-xs">Endpoint temporarily down</div>
                </div>
              </div>
            </div>
            <button className="w-full px-4 py-3 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 transition-all hover:scale-105 flex items-center justify-center">
              <RefreshCw className="h-4 w-4 mr-2" />
              Replay delivery
            </button>
            <p className="text-xs text-gray-500 text-center mt-3">
              No code changes required
            </p>
          </div>
        </div>
      </div>
      <div className="order-1 lg:order-2">
        <div className="inline-flex items-center px-3 py-1 bg-blue-100 text-blue-800 text-xs font-medium rounded-full mb-4">
          Step 5 of 5
        </div>
        <h2 className="text-3xl font-bold text-gray-900 mb-4">
          Replay failed deliveries
        </h2>
        <p className="text-lg text-gray-600 mb-6">
          When a delivery fails, replay it with one click.
        </p>
        <div className="space-y-3">
          <div className="flex items-start space-x-3">
            <CheckCircle2 className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
            <div className="text-gray-600">One-click replay from the dashboard</div>
          </div>
          <div className="flex items-start space-x-3">
            <CheckCircle2 className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
            <div className="text-gray-600">No code changes or redeployments</div>
          </div>
          <div className="flex items-start space-x-3">
            <CheckCircle2 className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
            <div className="text-gray-600">Full audit trail of all replays</div>
          </div>
        </div>
      </div>
    </section>
  );
}


function FinalCTA() {
  return (
    <section className="mt-24 text-center">
      <div className="bg-gradient-to-br from-gray-900 to-gray-800 rounded-2xl p-16 relative overflow-hidden">
        <div className="absolute inset-0 bg-grid-white/5"></div>
        <div className="relative z-10">
          <h2 className="text-4xl font-bold text-white mb-4">
            You're all set
          </h2>
          <p className="text-xl text-gray-300 mb-12 max-w-2xl mx-auto">
            Explore deliveries, configure endpoints, and invite your team in the dashboard.
          </p>
          <div className="flex items-center justify-center space-x-4">
            <Link
              to="/dashboard"
              className="inline-flex items-center px-8 py-4 bg-white text-gray-900 text-base font-semibold rounded-lg hover:bg-gray-100 transition-all hover:scale-105 shadow-xl"
            >
              Continue to dashboard
              <ArrowRight className="ml-2 h-5 w-5" />
            </Link>
            <Link
              to="/members"
              className="inline-flex items-center px-8 py-4 border-2 border-white/20 text-white text-base font-semibold rounded-lg hover:bg-white/10 transition-colors"
            >
              Invite your team
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
