import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { BarChart3, Activity, CheckCircle2, XCircle, AlertTriangle, Clock, Webhook, ArrowDownToLine, Bell, TrendingUp } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useUsageStats } from '../api/queries';
import { projectsApi } from '../api/projects.api';
import { useQuery } from '@tanstack/react-query';
import PageSkeleton from '../components/PageSkeleton';
import EmptyState from '../components/EmptyState';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Select } from '../components/ui/select';

function StatCard({ title, value, icon: Icon, color, subtitle }: {
  title: string; value: string | number; icon: React.ElementType; color: string; subtitle?: string;
}) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-start justify-between mb-3">
          <p className="text-[13px] font-medium text-muted-foreground">{title}</p>
          <div className={`h-8 w-8 rounded-lg flex items-center justify-center ${color}`}>
            <Icon className="h-4 w-4" />
          </div>
        </div>
        <div className="text-2xl font-bold tracking-tight">{typeof value === 'number' ? value.toLocaleString() : value}</div>
        {subtitle && <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>}
      </CardContent>
    </Card>
  );
}

function MiniBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  return (
    <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
      <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

export default function UsagePage() {
  const { t } = useTranslation();
  const { projectId } = useParams<{ projectId: string }>();
  const [days, setDays] = useState(30);

  const { data: project } = useQuery({
    queryKey: ['projects', projectId],
    queryFn: () => projectsApi.get(projectId!),
    enabled: !!projectId,
  });

  const { data: usage, isLoading } = useUsageStats(projectId, days);

  if (isLoading) return <PageSkeleton maxWidth="max-w-7xl" />;

  const current = usage?.current;
  const history = usage?.history ?? [];
  const successRate = current && current.totalDeliveries > 0
    ? ((current.successfulDeliveries / current.totalDeliveries) * 100).toFixed(1)
    : '—';

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <BarChart3 className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{t('usage.title', 'Usage & Metrics')}</h1>
            <p className="text-sm text-muted-foreground"
               dangerouslySetInnerHTML={{ __html: t('usage.subtitle', { project: project?.name || '…', defaultValue: 'Resource usage for <strong>{{project}}</strong>' }) }} />
          </div>
        </div>
        <div className="w-36">
          <Select value={String(days)} onChange={(e) => setDays(Number(e.target.value))}>
            <option value="7">{t('usage.periods.7d', 'Last 7 days')}</option>
            <option value="30">{t('usage.periods.30d', 'Last 30 days')}</option>
            <option value="90">{t('usage.periods.90d', 'Last 90 days')}</option>
          </Select>
        </div>
      </div>

      {!current ? (
        <EmptyState icon={BarChart3} title={t('usage.noData', 'No usage data')} description={t('usage.noDataDesc', 'Start sending events to see usage metrics')} />
      ) : (
        <>
          {/* Live stats */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <StatCard
              title={t('usage.stats.events', 'Events (30d)')}
              value={current.totalEvents}
              icon={Activity}
              color="bg-blue-500/10 text-blue-600"
            />
            <StatCard
              title={t('usage.stats.deliveries', 'Deliveries (30d)')}
              value={current.totalDeliveries}
              icon={Webhook}
              color="bg-indigo-500/10 text-indigo-600"
            />
            <StatCard
              title={t('usage.stats.successRate', 'Success Rate')}
              value={successRate === '—' ? '—' : `${successRate}%`}
              icon={CheckCircle2}
              color="bg-green-500/10 text-green-600"
            />
            <StatCard
              title={t('usage.stats.dlq', 'DLQ')}
              value={current.dlqDeliveries}
              icon={AlertTriangle}
              color="bg-red-500/10 text-red-600"
              subtitle={current.pendingDeliveries > 0 ? `${current.pendingDeliveries} pending` : undefined}
            />
          </div>

          {/* Delivery breakdown */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t('usage.breakdown.title', 'Delivery Breakdown (30d)')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2"><CheckCircle2 className="h-3.5 w-3.5 text-green-600" /> {t('usage.breakdown.success', 'Successful')}</span>
                  <span className="font-mono">{current.successfulDeliveries.toLocaleString()}</span>
                </div>
                <MiniBar value={current.successfulDeliveries} max={current.totalDeliveries} color="bg-green-500" />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2"><XCircle className="h-3.5 w-3.5 text-red-500" /> {t('usage.breakdown.failed', 'Failed')}</span>
                  <span className="font-mono">{current.failedDeliveries.toLocaleString()}</span>
                </div>
                <MiniBar value={current.failedDeliveries} max={current.totalDeliveries} color="bg-red-500" />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2"><AlertTriangle className="h-3.5 w-3.5 text-yellow-500" /> {t('usage.breakdown.dlq', 'Dead Letter Queue')}</span>
                  <span className="font-mono">{current.dlqDeliveries.toLocaleString()}</span>
                </div>
                <MiniBar value={current.dlqDeliveries} max={current.totalDeliveries} color="bg-yellow-500" />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2"><Clock className="h-3.5 w-3.5 text-blue-500" /> {t('usage.breakdown.pending', 'Pending / Processing')}</span>
                  <span className="font-mono">{current.pendingDeliveries.toLocaleString()}</span>
                </div>
                <MiniBar value={current.pendingDeliveries} max={current.totalDeliveries} color="bg-blue-500" />
              </div>
            </CardContent>
          </Card>

          {/* Resources */}
          <div className="grid gap-4 md:grid-cols-3">
            <StatCard
              title={t('usage.resources.endpoints', 'Active Endpoints')}
              value={current.activeEndpoints}
              icon={Webhook}
              color="bg-purple-500/10 text-purple-600"
            />
            <StatCard
              title={t('usage.resources.sources', 'Incoming Sources')}
              value={current.activeIncomingSources}
              icon={ArrowDownToLine}
              color="bg-teal-500/10 text-teal-600"
            />
            <StatCard
              title={t('usage.resources.alertRules', 'Alert Rules')}
              value={current.activeAlertRules}
              icon={Bell}
              color="bg-orange-500/10 text-orange-600"
            />
          </div>

          {/* Daily history table */}
          {history.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <TrendingUp className="h-4 w-4" />
                  {t('usage.history.title', 'Daily History')}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-muted-foreground text-xs">
                        <th className="text-left py-2 px-2 font-medium">{t('usage.history.date', 'Date')}</th>
                        <th className="text-right py-2 px-2 font-medium">{t('usage.history.events', 'Events')}</th>
                        <th className="text-right py-2 px-2 font-medium">{t('usage.history.deliveries', 'Deliveries')}</th>
                        <th className="text-right py-2 px-2 font-medium">{t('usage.history.success', 'Success')}</th>
                        <th className="text-right py-2 px-2 font-medium">{t('usage.history.failed', 'Failed')}</th>
                        <th className="text-right py-2 px-2 font-medium">{t('usage.history.dlq', 'DLQ')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {history.map((day) => (
                        <tr key={day.date} className="border-b last:border-0 hover:bg-muted/30">
                          <td className="py-2 px-2 font-mono text-xs">{day.date}</td>
                          <td className="py-2 px-2 text-right font-mono">{day.eventsCount.toLocaleString()}</td>
                          <td className="py-2 px-2 text-right font-mono">{day.deliveriesCount.toLocaleString()}</td>
                          <td className="py-2 px-2 text-right font-mono text-green-600">{day.successfulDeliveries.toLocaleString()}</td>
                          <td className="py-2 px-2 text-right font-mono text-red-500">{day.failedDeliveries.toLocaleString()}</td>
                          <td className="py-2 px-2 text-right font-mono text-yellow-600">{day.dlqCount.toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
