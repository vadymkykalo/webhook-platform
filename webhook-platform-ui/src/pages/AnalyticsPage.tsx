import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend
} from 'recharts';
import {
  ArrowLeft, RefreshCw, TrendingUp, Activity,
  Clock, CheckCircle2, XCircle, AlertTriangle, Zap, Server
} from 'lucide-react';
import { toast } from 'sonner';
import { dashboardApi, type AnalyticsData } from '../api/dashboard.api';

const CHART_COLORS = {
  success: '#22c55e',
  failed: '#ef4444',
  latency: '#6366f1',
  primary: '#3b82f6',
};

const PIE_COLORS = ['#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

export default function AnalyticsPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<'24h' | '7d' | '30d'>('24h');

  useEffect(() => {
    if (projectId) loadAnalytics();
  }, [projectId, period]);

  const loadAnalytics = async () => {
    if (!projectId) return;
    try {
      setLoading(true);
      const data = await dashboardApi.getAnalytics(projectId, period);
      setAnalytics(data);
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to load analytics');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 p-6">
        <div className="max-w-7xl mx-auto space-y-6">
          <div className="h-12 w-72 bg-white/50 dark:bg-slate-800/50 animate-pulse rounded-xl" />
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-36 bg-white/50 dark:bg-slate-800/50 animate-pulse rounded-2xl" />
            ))}
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="h-80 bg-white/50 dark:bg-slate-800/50 animate-pulse rounded-2xl" />
            <div className="h-80 bg-white/50 dark:bg-slate-800/50 animate-pulse rounded-2xl" />
          </div>
        </div>
      </div>
    );
  }

  if (!analytics) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 p-6 flex items-center justify-center">
        <div className="text-center">
          <AlertTriangle className="h-16 w-16 mx-auto text-amber-500 mb-4" />
          <h2 className="text-2xl font-bold text-slate-800 dark:text-white mb-2">No Data Available</h2>
          <p className="text-slate-500 dark:text-slate-400">Start sending webhook events to see analytics</p>
        </div>
      </div>
    );
  }

  const { overview, deliveryTimeSeries, latencyTimeSeries, eventTypeBreakdown, endpointPerformance, latencyPercentiles } = analytics;
  const hasDeliveryData = deliveryTimeSeries.length > 0;
  const hasLatencyData = latencyTimeSeries.length > 0 && latencyTimeSeries.some(d => d.avgLatencyMs && d.avgLatencyMs > 0);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800">
      <div className="max-w-7xl mx-auto p-6 space-y-6">
        
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate(-1)}
              className="p-2.5 bg-white dark:bg-slate-800 rounded-xl shadow-sm hover:shadow-md transition-all"
            >
              <ArrowLeft className="h-5 w-5 text-slate-600 dark:text-slate-300" />
            </button>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-slate-800 dark:text-white">
                Analytics Dashboard
              </h1>
              <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
                Real-time webhook delivery metrics
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <div className="inline-flex bg-white dark:bg-slate-800 rounded-xl p-1 shadow-sm">
              {(['24h', '7d', '30d'] as const).map((p) => (
                <button
                  key={p}
                  onClick={() => setPeriod(p)}
                  className={`px-4 py-2 text-sm font-medium rounded-lg transition-all ${
                    period === p
                      ? 'bg-blue-500 text-white shadow-sm'
                      : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
            <button
              onClick={loadAnalytics}
              className="p-2.5 bg-white dark:bg-slate-800 rounded-xl shadow-sm hover:shadow-md transition-all"
            >
              <RefreshCw className="h-5 w-5 text-slate-600 dark:text-slate-300" />
            </button>
          </div>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-2xl p-5 text-white shadow-lg shadow-emerald-500/20">
            <div className="flex items-center justify-between mb-3">
              <span className="text-emerald-100 text-sm font-medium">Success Rate</span>
              <CheckCircle2 className="h-5 w-5 text-emerald-200" />
            </div>
            <div className="text-4xl font-bold mb-1">{overview.successRate}%</div>
            <div className="text-emerald-100 text-sm">
              {overview.successfulDeliveries.toLocaleString()} of {overview.totalDeliveries.toLocaleString()}
            </div>
          </div>

          <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-2xl p-5 text-white shadow-lg shadow-blue-500/20">
            <div className="flex items-center justify-between mb-3">
              <span className="text-blue-100 text-sm font-medium">Avg Latency</span>
              <Clock className="h-5 w-5 text-blue-200" />
            </div>
            <div className="text-4xl font-bold mb-1">{Math.round(overview.avgLatencyMs)}ms</div>
            <div className="text-blue-100 text-sm">
              p95: {overview.p95LatencyMs}ms · p99: {overview.p99LatencyMs}ms
            </div>
          </div>

          <div className="bg-gradient-to-br from-amber-500 to-orange-500 rounded-2xl p-5 text-white shadow-lg shadow-amber-500/20">
            <div className="flex items-center justify-between mb-3">
              <span className="text-amber-100 text-sm font-medium">Throughput</span>
              <Zap className="h-5 w-5 text-amber-200" />
            </div>
            <div className="text-4xl font-bold mb-1">{overview.deliveriesPerSecond.toFixed(2)}</div>
            <div className="text-amber-100 text-sm">
              deliveries/sec · {overview.totalEvents.toLocaleString()} events
            </div>
          </div>

          <div className="bg-gradient-to-br from-red-500 to-rose-600 rounded-2xl p-5 text-white shadow-lg shadow-red-500/20">
            <div className="flex items-center justify-between mb-3">
              <span className="text-red-100 text-sm font-medium">Failed</span>
              <XCircle className="h-5 w-5 text-red-200" />
            </div>
            <div className="text-4xl font-bold mb-1">{overview.failedDeliveries.toLocaleString()}</div>
            <div className="text-red-100 text-sm">
              {overview.totalDeliveries > 0 ? ((overview.failedDeliveries / overview.totalDeliveries) * 100).toFixed(1) : 0}% failure rate
            </div>
          </div>
        </div>

        {/* Charts Row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Delivery Volume */}
          <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 shadow-sm">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                <Activity className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <h3 className="font-semibold text-slate-800 dark:text-white">Delivery Volume</h3>
                <p className="text-slate-500 dark:text-slate-400 text-sm">Success vs Failed over time</p>
              </div>
            </div>
            {hasDeliveryData ? (
              <ResponsiveContainer width="100%" height={280}>
                <AreaChart data={deliveryTimeSeries}>
                  <defs>
                    <linearGradient id="successGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={CHART_COLORS.success} stopOpacity={0.3}/>
                      <stop offset="95%" stopColor={CHART_COLORS.success} stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="failedGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={CHART_COLORS.failed} stopOpacity={0.3}/>
                      <stop offset="95%" stopColor={CHART_COLORS.failed} stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="timestamp" tickFormatter={(t) => new Date(t).toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'})} stroke="#94a3b8" fontSize={12} />
                  <YAxis stroke="#94a3b8" fontSize={12} />
                  <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: 'none', borderRadius: '12px', color: '#fff' }} />
                  <Area type="monotone" dataKey="success" stroke={CHART_COLORS.success} fill="url(#successGrad)" strokeWidth={2} name="Success" />
                  <Area type="monotone" dataKey="failed" stroke={CHART_COLORS.failed} fill="url(#failedGrad)" strokeWidth={2} name="Failed" />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[280px] flex items-center justify-center">
                <div className="text-center">
                  <TrendingUp className="h-12 w-12 mx-auto text-slate-300 dark:text-slate-600 mb-3" />
                  <p className="text-slate-500 dark:text-slate-400 font-medium">No delivery data yet</p>
                  <p className="text-slate-400 dark:text-slate-500 text-sm">Send events to see the chart</p>
                </div>
              </div>
            )}
          </div>

          {/* Latency Chart */}
          <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 shadow-sm">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2 bg-indigo-100 dark:bg-indigo-900/30 rounded-lg">
                <Clock className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
              </div>
              <div>
                <h3 className="font-semibold text-slate-800 dark:text-white">Response Latency</h3>
                <p className="text-slate-500 dark:text-slate-400 text-sm">Average latency over time</p>
              </div>
            </div>
            {hasLatencyData ? (
              <ResponsiveContainer width="100%" height={280}>
                <AreaChart data={latencyTimeSeries}>
                  <defs>
                    <linearGradient id="latencyGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={CHART_COLORS.latency} stopOpacity={0.3}/>
                      <stop offset="95%" stopColor={CHART_COLORS.latency} stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="timestamp" tickFormatter={(t) => new Date(t).toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'})} stroke="#94a3b8" fontSize={12} />
                  <YAxis stroke="#94a3b8" fontSize={12} unit="ms" />
                  <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: 'none', borderRadius: '12px', color: '#fff' }} formatter={(v) => [`${Math.round(v as number)}ms`, 'Latency']} />
                  <Area type="monotone" dataKey="avgLatencyMs" stroke={CHART_COLORS.latency} fill="url(#latencyGrad)" strokeWidth={2} name="Latency" />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[280px] flex items-center justify-center">
                <div className="text-center">
                  <Clock className="h-12 w-12 mx-auto text-slate-300 dark:text-slate-600 mb-3" />
                  <p className="text-slate-500 dark:text-slate-400 font-medium">No latency data yet</p>
                  <p className="text-slate-400 dark:text-slate-500 text-sm">Metrics appear after deliveries</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Bottom Row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Event Types */}
          <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 shadow-sm">
            <h3 className="font-semibold text-slate-800 dark:text-white mb-1">Event Types</h3>
            <p className="text-slate-500 dark:text-slate-400 text-sm mb-6">Distribution by type</p>
            {eventTypeBreakdown.length > 0 ? (
              <ResponsiveContainer width="100%" height={240}>
                <PieChart>
                  <Pie data={eventTypeBreakdown} dataKey="count" nameKey="eventType" cx="50%" cy="50%" innerRadius={60} outerRadius={90} paddingAngle={2}>
                    {eventTypeBreakdown.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Pie>
                  <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: 'none', borderRadius: '12px', color: '#fff' }} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[240px] flex items-center justify-center">
                <div className="text-center">
                  <div className="w-20 h-20 mx-auto rounded-full border-4 border-dashed border-slate-200 dark:border-slate-700 mb-3" />
                  <p className="text-slate-500 dark:text-slate-400">No events recorded</p>
                </div>
              </div>
            )}
          </div>

          {/* Latency Percentiles */}
          <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 shadow-sm">
            <h3 className="font-semibold text-slate-800 dark:text-white mb-1">Latency Percentiles</h3>
            <p className="text-slate-500 dark:text-slate-400 text-sm mb-6">Response time distribution</p>
            {overview.totalDeliveries > 0 ? (
              <div className="space-y-4">
                {[
                  { label: 'p50', value: latencyPercentiles.p50, color: 'bg-blue-500' },
                  { label: 'p75', value: latencyPercentiles.p75, color: 'bg-indigo-500' },
                  { label: 'p90', value: latencyPercentiles.p90, color: 'bg-violet-500' },
                  { label: 'p95', value: latencyPercentiles.p95, color: 'bg-purple-500' },
                  { label: 'p99', value: latencyPercentiles.p99, color: 'bg-fuchsia-500' },
                ].map(({ label, value, color }) => {
                  const max = Math.max(latencyPercentiles.p99, 1);
                  const pct = (value / max) * 100;
                  return (
                    <div key={label} className="flex items-center gap-4">
                      <span className="w-10 text-sm font-medium text-slate-600 dark:text-slate-300">{label}</span>
                      <div className="flex-1 h-3 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                        <div className={`h-full ${color} rounded-full transition-all`} style={{ width: `${pct}%` }} />
                      </div>
                      <span className="w-16 text-right text-sm font-mono text-slate-600 dark:text-slate-300">{value}ms</span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="h-[200px] flex items-center justify-center">
                <div className="text-center">
                  <div className="space-y-2 mb-3">
                    {[90, 70, 50, 30].map((w) => (
                      <div key={w} className="h-3 bg-slate-100 dark:bg-slate-700 rounded-full mx-auto" style={{ width: `${w}%` }} />
                    ))}
                  </div>
                  <p className="text-slate-500 dark:text-slate-400">No latency data</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Endpoint Performance */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 shadow-sm">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 bg-slate-100 dark:bg-slate-700 rounded-lg">
              <Server className="h-5 w-5 text-slate-600 dark:text-slate-300" />
            </div>
            <div>
              <h3 className="font-semibold text-slate-800 dark:text-white">Endpoint Performance</h3>
              <p className="text-slate-500 dark:text-slate-400 text-sm">Health status and metrics</p>
            </div>
          </div>
          {endpointPerformance.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-700">
                    <th className="text-left py-3 px-4 text-slate-500 dark:text-slate-400 text-sm font-medium">Endpoint</th>
                    <th className="text-left py-3 px-4 text-slate-500 dark:text-slate-400 text-sm font-medium">Status</th>
                    <th className="text-right py-3 px-4 text-slate-500 dark:text-slate-400 text-sm font-medium">Deliveries</th>
                    <th className="text-right py-3 px-4 text-slate-500 dark:text-slate-400 text-sm font-medium">Success</th>
                    <th className="text-right py-3 px-4 text-slate-500 dark:text-slate-400 text-sm font-medium">Latency</th>
                  </tr>
                </thead>
                <tbody>
                  {endpointPerformance.map((ep) => (
                    <tr key={ep.endpointId} className="border-b border-slate-100 dark:border-slate-700/50 hover:bg-slate-50 dark:hover:bg-slate-700/30">
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <div className={`w-2 h-2 rounded-full ${ep.enabled ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                          <span className="font-medium text-slate-700 dark:text-slate-200 truncate max-w-xs">{ep.url}</span>
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <span className={`px-2.5 py-1 text-xs font-semibold rounded-full ${
                          ep.status === 'HEALTHY' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' :
                          ep.status === 'DEGRADED' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' :
                          'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                        }`}>{ep.status}</span>
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-slate-700 dark:text-slate-300">{ep.totalDeliveries.toLocaleString()}</td>
                      <td className="py-3 px-4 text-right">
                        <span className={ep.successRate >= 99 ? 'text-emerald-600' : ep.successRate >= 95 ? 'text-amber-600' : 'text-red-600'}>
                          {ep.successRate}%
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-slate-700 dark:text-slate-300">{Math.round(ep.avgLatencyMs)}ms</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="h-32 flex items-center justify-center">
              <div className="text-center">
                <Server className="h-10 w-10 mx-auto text-slate-300 dark:text-slate-600 mb-2" />
                <p className="text-slate-500 dark:text-slate-400">No endpoint data available</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
