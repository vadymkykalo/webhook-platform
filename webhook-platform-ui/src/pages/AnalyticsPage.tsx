import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend
} from 'recharts';
import {
  RefreshCw, TrendingUp, Activity,
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
      <div className="p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <div className="h-7 w-32 bg-muted animate-pulse rounded-lg" />
            <div className="h-4 w-56 bg-muted animate-pulse rounded" />
          </div>
          <div className="h-10 w-40 bg-muted animate-pulse rounded-lg" />
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-28 bg-muted animate-pulse rounded-xl" />
          ))}
        </div>
        <div className="grid lg:grid-cols-2 gap-6">
          <div className="h-80 bg-muted animate-pulse rounded-xl" />
          <div className="h-80 bg-muted animate-pulse rounded-xl" />
        </div>
      </div>
    );
  }

  if (!analytics) {
    return (
      <div className="p-6 lg:p-8 max-w-7xl mx-auto">
        <div className="flex flex-col items-center justify-center py-20">
          <div className="h-16 w-16 rounded-2xl bg-warning/10 flex items-center justify-center mb-6">
            <AlertTriangle className="h-8 w-8 text-warning" />
          </div>
          <h2 className="text-lg font-semibold mb-2">No Data Available</h2>
          <p className="text-sm text-muted-foreground">Start sending webhook events to see analytics</p>
        </div>
      </div>
    );
  }

  const { overview, deliveryTimeSeries, latencyTimeSeries, eventTypeBreakdown, endpointPerformance, latencyPercentiles } = analytics;
  const hasDeliveryData = deliveryTimeSeries.length > 0;
  const hasLatencyData = latencyTimeSeries.length > 0 && latencyTimeSeries.some(d => d.avgLatencyMs && d.avgLatencyMs > 0);

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-title tracking-tight">Analytics</h1>
            <p className="text-sm text-muted-foreground mt-1">Real-time webhook delivery metrics</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="inline-flex bg-muted rounded-lg p-0.5">
              {(['24h', '7d', '30d'] as const).map((p) => (
                <button
                  key={p}
                  onClick={() => setPeriod(p)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                    period === p
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
            <button onClick={loadAnalytics} className="p-2 rounded-lg bg-card border hover:bg-accent transition-colors">
              <RefreshCw className="h-4 w-4 text-muted-foreground" />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="rounded-xl border bg-card p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Success Rate</span>
              <div className="h-8 w-8 rounded-lg bg-success/10 flex items-center justify-center"><CheckCircle2 className="h-4 w-4 text-success" /></div>
            </div>
            <div className="text-2xl font-bold">{overview.successRate}%</div>
            <div className="text-[11px] text-muted-foreground mt-0.5">{overview.successfulDeliveries.toLocaleString()} of {overview.totalDeliveries.toLocaleString()}</div>
          </div>
          <div className="rounded-xl border bg-card p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Avg Latency</span>
              <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center"><Clock className="h-4 w-4 text-primary" /></div>
            </div>
            <div className="text-2xl font-bold">{Math.round(overview.avgLatencyMs)}ms</div>
            <div className="text-[11px] text-muted-foreground mt-0.5">p95: {overview.p95LatencyMs}ms · p99: {overview.p99LatencyMs}ms</div>
          </div>
          <div className="rounded-xl border bg-card p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Throughput</span>
              <div className="h-8 w-8 rounded-lg bg-warning/10 flex items-center justify-center"><Zap className="h-4 w-4 text-warning" /></div>
            </div>
            <div className="text-2xl font-bold">{overview.deliveriesPerSecond.toFixed(2)}</div>
            <div className="text-[11px] text-muted-foreground mt-0.5">deliveries/sec · {overview.totalEvents.toLocaleString()} events</div>
          </div>
          <div className="rounded-xl border bg-card p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Failed</span>
              <div className="h-8 w-8 rounded-lg bg-destructive/10 flex items-center justify-center"><XCircle className="h-4 w-4 text-destructive" /></div>
            </div>
            <div className="text-2xl font-bold">{overview.failedDeliveries.toLocaleString()}</div>
            <div className="text-[11px] text-muted-foreground mt-0.5">{overview.totalDeliveries > 0 ? ((overview.failedDeliveries / overview.totalDeliveries) * 100).toFixed(1) : 0}% failure rate</div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="rounded-xl border bg-card p-5">
            <div className="flex items-center gap-3 mb-5">
              <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
                <Activity className="h-4 w-4 text-primary" />
              </div>
              <div>
                <h3 className="text-sm font-semibold">Delivery Volume</h3>
                <p className="text-[11px] text-muted-foreground">Success vs Failed over time</p>
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
                  <TrendingUp className="h-10 w-10 mx-auto text-muted-foreground/30 mb-3" />
                  <p className="text-sm font-medium text-muted-foreground">No delivery data yet</p>
                  <p className="text-xs text-muted-foreground/70">Send events to see the chart</p>
                </div>
              </div>
            )}
          </div>

          <div className="rounded-xl border bg-card p-5">
            <div className="flex items-center gap-3 mb-5">
              <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
                <Clock className="h-4 w-4 text-primary" />
              </div>
              <div>
                <h3 className="text-sm font-semibold">Response Latency</h3>
                <p className="text-[11px] text-muted-foreground">Average latency over time</p>
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
                  <Clock className="h-10 w-10 mx-auto text-muted-foreground/30 mb-3" />
                  <p className="text-sm font-medium text-muted-foreground">No latency data yet</p>
                  <p className="text-xs text-muted-foreground/70">Metrics appear after deliveries</p>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="rounded-xl border bg-card p-5">
            <h3 className="text-sm font-semibold mb-0.5">Event Types</h3>
            <p className="text-[11px] text-muted-foreground mb-5">Distribution by type</p>
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
                  <div className="w-16 h-16 mx-auto rounded-full border-4 border-dashed border-border mb-3" />
                  <p className="text-sm text-muted-foreground">No events recorded</p>
                </div>
              </div>
            )}
          </div>

          <div className="rounded-xl border bg-card p-5">
            <h3 className="text-sm font-semibold mb-0.5">Latency Percentiles</h3>
            <p className="text-[11px] text-muted-foreground mb-5">Response time distribution</p>
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
                    <div key={label} className="flex items-center gap-3">
                      <span className="w-8 text-xs font-medium text-muted-foreground">{label}</span>
                      <div className="flex-1 h-2.5 bg-muted rounded-full overflow-hidden">
                        <div className={`h-full ${color} rounded-full transition-all`} style={{ width: `${pct}%` }} />
                      </div>
                      <span className="w-14 text-right text-xs font-mono">{value}ms</span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="h-[200px] flex items-center justify-center">
                <div className="text-center">
                  <div className="space-y-2 mb-3">
                    {[90, 70, 50, 30].map((w) => (
                      <div key={w} className="h-2.5 bg-muted rounded-full mx-auto" style={{ width: `${w}%` }} />
                    ))}
                  </div>
                  <p className="text-sm text-muted-foreground">No latency data</p>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="rounded-xl border bg-card p-5">
          <div className="flex items-center gap-3 mb-5">
            <div className="h-9 w-9 rounded-lg bg-muted flex items-center justify-center">
              <Server className="h-4 w-4 text-muted-foreground" />
            </div>
            <div>
              <h3 className="text-sm font-semibold">Endpoint Performance</h3>
              <p className="text-[11px] text-muted-foreground">Health status and metrics</p>
            </div>
          </div>
          {endpointPerformance.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-2.5 px-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Endpoint</th>
                    <th className="text-left py-2.5 px-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Status</th>
                    <th className="text-right py-2.5 px-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Deliveries</th>
                    <th className="text-right py-2.5 px-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Success</th>
                    <th className="text-right py-2.5 px-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Latency</th>
                  </tr>
                </thead>
                <tbody>
                  {endpointPerformance.map((ep) => (
                    <tr key={ep.endpointId} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                      <td className="py-2.5 px-3">
                        <div className="flex items-center gap-2">
                          <div className={`w-2 h-2 rounded-full ${ep.enabled ? 'bg-success' : 'bg-muted-foreground/40'}`} />
                          <span className="text-[13px] font-medium truncate max-w-xs">{ep.url}</span>
                        </div>
                      </td>
                      <td className="py-2.5 px-3">
                        <span className={`px-2 py-0.5 text-[11px] font-medium rounded-full ${
                          ep.status === 'HEALTHY' ? 'bg-success/10 text-success' :
                          ep.status === 'DEGRADED' ? 'bg-warning/10 text-warning' :
                          'bg-destructive/10 text-destructive'
                        }`}>{ep.status}</span>
                      </td>
                      <td className="py-2.5 px-3 text-right text-[13px] font-mono">{ep.totalDeliveries.toLocaleString()}</td>
                      <td className="py-2.5 px-3 text-right">
                        <span className={`text-[13px] font-medium ${ep.successRate >= 99 ? 'text-success' : ep.successRate >= 95 ? 'text-warning' : 'text-destructive'}`}>
                          {ep.successRate}%
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-right text-[13px] font-mono">{Math.round(ep.avgLatencyMs)}ms</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="h-32 flex items-center justify-center">
              <div className="text-center">
                <Server className="h-8 w-8 mx-auto text-muted-foreground/30 mb-2" />
                <p className="text-sm text-muted-foreground">No endpoint data available</p>
              </div>
            </div>
          )}
        </div>
    </div>
  );
}
