import { useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend
} from 'recharts';
import {
  RefreshCw, TrendingUp, Activity,
  Clock, CheckCircle2, XCircle, AlertTriangle, Zap, Server
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAnalytics, queryKeys } from '../api/queries';
import { formatTime, formatNumber } from '../lib/date';
import PageSkeleton, { SkeletonCards } from '../components/PageSkeleton';
import EmptyState from '../components/EmptyState';
import { useQueryClient } from '@tanstack/react-query';

const CHART_COLORS = {
  success: '#22c55e',
  failed: '#ef4444',
  latency: '#6366f1',
  primary: '#3b82f6',
};

const PIE_COLORS = ['#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

export default function AnalyticsPage() {
  const { t } = useTranslation();
  const { projectId } = useParams<{ projectId: string }>();
  const [period, setPeriod] = useState<'24h' | '7d' | '30d'>('24h');
  const { data: analytics, isLoading: loading } = useAnalytics(projectId, period);
  const qc = useQueryClient();

  const refreshAnalytics = () => {
    if (projectId) qc.invalidateQueries({ queryKey: queryKeys.dashboard.analytics(projectId, period) });
  };

  if (loading) {
    return (
      <PageSkeleton maxWidth="max-w-7xl">
        <SkeletonCards count={4} height="h-28" cols="grid-cols-2 lg:grid-cols-4" />
        <SkeletonCards count={2} height="h-80" cols="lg:grid-cols-2" />
      </PageSkeleton>
    );
  }

  if (!analytics) {
    return (
      <div className="p-6 lg:p-8 max-w-7xl mx-auto">
        <EmptyState icon={AlertTriangle} title={t('analytics.noData')} description={t('analytics.noDataDesc')} docsLink="/docs#getting-started" />
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
            <h1 className="text-title tracking-tight">{t('analytics.title')}</h1>
            <p className="text-sm text-muted-foreground mt-1">{t('analytics.subtitle')}</p>
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
            <button onClick={refreshAnalytics} className="p-2 rounded-lg bg-card border hover:bg-accent transition-colors">
              <RefreshCw className="h-4 w-4 text-muted-foreground" />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="rounded-xl border bg-card p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{t('analytics.successRate')}</span>
              <div className="h-8 w-8 rounded-lg bg-success/10 flex items-center justify-center"><CheckCircle2 className="h-4 w-4 text-success" /></div>
            </div>
            <div className="text-2xl font-bold">{overview.successRate}%</div>
            <div className="text-[11px] text-muted-foreground mt-0.5">{formatNumber(overview.successfulDeliveries)} {t('analytics.of')} {formatNumber(overview.totalDeliveries)}</div>
          </div>
          <div className="rounded-xl border bg-card p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{t('analytics.avgLatency')}</span>
              <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center"><Clock className="h-4 w-4 text-primary" /></div>
            </div>
            <div className="text-2xl font-bold">{Math.round(overview.avgLatencyMs)}ms</div>
            <div className="text-[11px] text-muted-foreground mt-0.5">p95: {overview.p95LatencyMs}ms · p99: {overview.p99LatencyMs}ms</div>
          </div>
          <div className="rounded-xl border bg-card p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{t('analytics.throughput')}</span>
              <div className="h-8 w-8 rounded-lg bg-warning/10 flex items-center justify-center"><Zap className="h-4 w-4 text-warning" /></div>
            </div>
            <div className="text-2xl font-bold">{overview.deliveriesPerSecond.toFixed(2)}</div>
            <div className="text-[11px] text-muted-foreground mt-0.5">{t('analytics.deliveriesPerSec')} · {formatNumber(overview.totalEvents)} {t('analytics.events')}</div>
          </div>
          <div className="rounded-xl border bg-card p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{t('analytics.failed')}</span>
              <div className="h-8 w-8 rounded-lg bg-destructive/10 flex items-center justify-center"><XCircle className="h-4 w-4 text-destructive" /></div>
            </div>
            <div className="text-2xl font-bold">{formatNumber(overview.failedDeliveries)}</div>
            <div className="text-[11px] text-muted-foreground mt-0.5">{overview.totalDeliveries > 0 ? ((overview.failedDeliveries / overview.totalDeliveries) * 100).toFixed(1) : 0}% {t('analytics.failureRate')}</div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="rounded-xl border bg-card p-5">
            <div className="flex items-center gap-3 mb-5">
              <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
                <Activity className="h-4 w-4 text-primary" />
              </div>
              <div>
                <h3 className="text-sm font-semibold">{t('analytics.deliveryVolume')}</h3>
                <p className="text-[11px] text-muted-foreground">{t('analytics.deliveryVolumeDesc')}</p>
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
                  <XAxis dataKey="timestamp" tickFormatter={(v) => formatTime(v)} stroke="#94a3b8" fontSize={12} />
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
                  <p className="text-sm font-medium text-muted-foreground">{t('analytics.noDeliveryData')}</p>
                  <p className="text-xs text-muted-foreground/70">{t('analytics.noDeliveryDataDesc')}</p>
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
                <h3 className="text-sm font-semibold">{t('analytics.responseLatency')}</h3>
                <p className="text-[11px] text-muted-foreground">{t('analytics.responseLatencyDesc')}</p>
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
                  <XAxis dataKey="timestamp" tickFormatter={(v) => formatTime(v)} stroke="#94a3b8" fontSize={12} />
                  <YAxis stroke="#94a3b8" fontSize={12} unit="ms" />
                  <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: 'none', borderRadius: '12px', color: '#fff' }} formatter={(v) => [`${Math.round(v as number)}ms`, 'Latency']} />
                  <Area type="monotone" dataKey="avgLatencyMs" stroke={CHART_COLORS.latency} fill="url(#latencyGrad)" strokeWidth={2} name="Latency" />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[280px] flex items-center justify-center">
                <div className="text-center">
                  <Clock className="h-10 w-10 mx-auto text-muted-foreground/30 mb-3" />
                  <p className="text-sm font-medium text-muted-foreground">{t('analytics.noLatencyData')}</p>
                  <p className="text-xs text-muted-foreground/70">{t('analytics.noLatencyDataDesc')}</p>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="rounded-xl border bg-card p-5">
            <h3 className="text-sm font-semibold mb-0.5">{t('analytics.eventTypes')}</h3>
            <p className="text-[11px] text-muted-foreground mb-5">{t('analytics.eventTypesDesc')}</p>
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
                  <p className="text-sm text-muted-foreground">{t('analytics.noEventsRecorded')}</p>
                </div>
              </div>
            )}
          </div>

          <div className="rounded-xl border bg-card p-5">
            <h3 className="text-sm font-semibold mb-0.5">{t('analytics.latencyPercentiles')}</h3>
            <p className="text-[11px] text-muted-foreground mb-5">{t('analytics.latencyPercentilesDesc')}</p>
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
                  <p className="text-sm text-muted-foreground">{t('analytics.noLatencyPercentiles')}</p>
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
              <h3 className="text-sm font-semibold">{t('analytics.endpointPerformance')}</h3>
              <p className="text-[11px] text-muted-foreground">{t('analytics.endpointPerformanceDesc')}</p>
            </div>
          </div>
          {endpointPerformance.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-2.5 px-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{t('analytics.epColumns.endpoint')}</th>
                    <th className="text-left py-2.5 px-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{t('analytics.epColumns.status')}</th>
                    <th className="text-right py-2.5 px-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{t('analytics.epColumns.deliveries')}</th>
                    <th className="text-right py-2.5 px-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{t('analytics.epColumns.success')}</th>
                    <th className="text-right py-2.5 px-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{t('analytics.epColumns.latency')}</th>
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
                <p className="text-sm text-muted-foreground">{t('analytics.noEndpointData')}</p>
              </div>
            </div>
          )}
        </div>
    </div>
  );
}
