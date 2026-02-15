import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  AreaChart,
  BarList,
  DonutChart,
  Card,
  Metric,
  Text,
  Flex,
  Grid,
  Title,
  Badge,
  ProgressBar,
  TabGroup,
  TabList,
  Tab,
  Color,
} from '@tremor/react';
import {
  ArrowLeft, RefreshCw, TrendingUp, TrendingDown,
  Zap, Clock, CheckCircle, XCircle, AlertTriangle
} from 'lucide-react';
import { toast } from 'sonner';
import { dashboardApi, type AnalyticsData } from '../api/dashboard.api';

const periodLabels = {
  '24h': 'Last 24 hours',
  '7d': 'Last 7 days', 
  '30d': 'Last 30 days',
};

export default function AnalyticsPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [periodIndex, setPeriodIndex] = useState(0);
  const periods = ['24h', '7d', '30d'] as const;
  const period = periods[periodIndex];

  useEffect(() => {
    if (projectId) {
      loadAnalytics();
    }
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

  const getStatusBadge = (status: string) => {
    const colors: Record<string, Color> = {
      HEALTHY: 'emerald',
      DEGRADED: 'yellow',
      FAILING: 'red',
    };
    return colors[status] || 'gray';
  };

  if (loading) {
    return (
      <div className="p-6 max-w-7xl mx-auto space-y-6">
        <div className="h-10 w-48 bg-tremor-background-subtle animate-pulse rounded-lg" />
        <Grid numItemsMd={2} numItemsLg={4} className="gap-6">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i} className="h-32 animate-pulse bg-tremor-background-subtle" />
          ))}
        </Grid>
        <Card className="h-80 animate-pulse bg-tremor-background-subtle" />
      </div>
    );
  }

  if (!analytics) {
    return (
      <div className="p-6 max-w-7xl mx-auto">
        <Card className="p-12 text-center">
          <AlertTriangle className="h-12 w-12 mx-auto text-tremor-content-subtle mb-4" />
          <Title>No Analytics Data</Title>
          <Text className="mt-2">Start sending events to see analytics</Text>
        </Card>
      </div>
    );
  }

  const { overview, deliveryTimeSeries, latencyTimeSeries, eventTypeBreakdown, endpointPerformance, latencyPercentiles } = analytics;

  const chartData = deliveryTimeSeries.map(point => ({
    date: new Date(point.timestamp).toLocaleString([], { 
      month: 'short', 
      day: 'numeric',
      hour: period === '24h' ? '2-digit' : undefined,
      minute: period === '24h' ? '2-digit' : undefined,
    }),
    Success: point.success,
    Failed: point.failed,
  }));

  const latencyData = latencyTimeSeries.map(point => ({
    date: new Date(point.timestamp).toLocaleString([], { 
      month: 'short', 
      day: 'numeric',
      hour: period === '24h' ? '2-digit' : undefined,
      minute: period === '24h' ? '2-digit' : undefined,
    }),
    'Avg Latency (ms)': point.avgLatencyMs || 0,
  }));

  const eventTypeData = eventTypeBreakdown.map(e => ({
    name: e.eventType,
    value: e.count,
  }));

  const percentileData = [
    { name: 'p50', value: latencyPercentiles.p50 },
    { name: 'p75', value: latencyPercentiles.p75 },
    { name: 'p90', value: latencyPercentiles.p90 },
    { name: 'p95', value: latencyPercentiles.p95 },
    { name: 'p99', value: latencyPercentiles.p99 },
  ];

  const hasData = overview.totalDeliveries > 0;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <Flex justifyContent="between" alignItems="center">
        <Flex alignItems="center" className="gap-4">
          <button
            onClick={() => navigate(-1)}
            className="p-2 hover:bg-tremor-background-subtle rounded-lg transition-colors"
          >
            <ArrowLeft className="h-5 w-5 text-tremor-content" />
          </button>
          <div>
            <Title className="text-2xl font-bold">Analytics Dashboard</Title>
            <Text className="text-tremor-content-subtle">{periodLabels[period]}</Text>
          </div>
        </Flex>
        <Flex className="gap-3">
          <TabGroup index={periodIndex} onIndexChange={setPeriodIndex}>
            <TabList variant="solid">
              <Tab>24h</Tab>
              <Tab>7d</Tab>
              <Tab>30d</Tab>
            </TabList>
          </TabGroup>
          <button
            onClick={loadAnalytics}
            className="p-2 hover:bg-tremor-background-subtle rounded-lg transition-colors"
          >
            <RefreshCw className="h-5 w-5 text-tremor-content" />
          </button>
        </Flex>
      </Flex>

      {/* KPI Cards */}
      <Grid numItemsMd={2} numItemsLg={4} className="gap-6">
        <Card decoration="top" decorationColor="emerald">
          <Flex alignItems="start">
            <div>
              <Text>Success Rate</Text>
              <Metric className="text-emerald-600">{overview.successRate}%</Metric>
            </div>
            <Badge color="emerald" icon={CheckCircle}>
              {overview.successfulDeliveries.toLocaleString()}
            </Badge>
          </Flex>
          <ProgressBar value={overview.successRate} color="emerald" className="mt-4" />
        </Card>

        <Card decoration="top" decorationColor="blue">
          <Flex alignItems="start">
            <div>
              <Text>Avg Latency</Text>
              <Metric>{Math.round(overview.avgLatencyMs)}ms</Metric>
            </div>
            <Badge color="blue" icon={Clock}>
              p95: {overview.p95LatencyMs}ms
            </Badge>
          </Flex>
          <Flex className="mt-4 gap-2">
            <Text className="text-xs">p50: {overview.p50LatencyMs}ms</Text>
            <Text className="text-xs text-tremor-content-subtle">•</Text>
            <Text className="text-xs">p99: {overview.p99LatencyMs}ms</Text>
          </Flex>
        </Card>

        <Card decoration="top" decorationColor="amber">
          <Flex alignItems="start">
            <div>
              <Text>Throughput</Text>
              <Metric>{overview.deliveriesPerSecond.toFixed(3)}/s</Metric>
            </div>
            <Badge color="amber" icon={Zap}>
              {overview.totalDeliveries.toLocaleString()} total
            </Badge>
          </Flex>
          <Flex className="mt-4 gap-2">
            <Text className="text-xs">{overview.totalEvents.toLocaleString()} events</Text>
          </Flex>
        </Card>

        <Card decoration="top" decorationColor="red">
          <Flex alignItems="start">
            <div>
              <Text>Failed</Text>
              <Metric className="text-red-600">{overview.failedDeliveries.toLocaleString()}</Metric>
            </div>
            <Badge color="red" icon={XCircle}>
              {overview.totalDeliveries > 0 
                ? ((overview.failedDeliveries / overview.totalDeliveries) * 100).toFixed(1)
                : 0}%
            </Badge>
          </Flex>
          <ProgressBar 
            value={overview.totalDeliveries > 0 ? (overview.failedDeliveries / overview.totalDeliveries) * 100 : 0} 
            color="red" 
            className="mt-4" 
          />
        </Card>
      </Grid>

      {/* Charts Row */}
      <Grid numItemsMd={2} className="gap-6">
        <Card>
          <Title>Delivery Volume</Title>
          <Text>Success vs Failed deliveries over time</Text>
          {hasData && chartData.length > 0 ? (
            <AreaChart
              className="h-72 mt-4"
              data={chartData}
              index="date"
              categories={['Success', 'Failed']}
              colors={['emerald', 'red']}
              valueFormatter={(v) => v.toLocaleString()}
              showAnimation
              showLegend
              showGridLines
              curveType="monotone"
            />
          ) : (
            <div className="h-72 flex items-center justify-center">
              <div className="text-center">
                <TrendingUp className="h-12 w-12 mx-auto text-tremor-content-subtle mb-3" />
                <Text>No delivery data yet</Text>
                <Text className="text-tremor-content-subtle text-sm">Send some events to see the chart</Text>
              </div>
            </div>
          )}
        </Card>

        <Card>
          <Title>Response Latency</Title>
          <Text>Average latency over time</Text>
          {hasData && latencyData.length > 0 ? (
            <AreaChart
              className="h-72 mt-4"
              data={latencyData}
              index="date"
              categories={['Avg Latency (ms)']}
              colors={['indigo']}
              valueFormatter={(v) => `${Math.round(v)}ms`}
              showAnimation
              showGridLines
              curveType="monotone"
            />
          ) : (
            <div className="h-72 flex items-center justify-center">
              <div className="text-center">
                <Clock className="h-12 w-12 mx-auto text-tremor-content-subtle mb-3" />
                <Text>No latency data yet</Text>
                <Text className="text-tremor-content-subtle text-sm">Metrics will appear after deliveries</Text>
              </div>
            </div>
          )}
        </Card>
      </Grid>

      {/* Bottom Row */}
      <Grid numItemsMd={2} className="gap-6">
        <Card>
          <Title>Event Types Distribution</Title>
          <Text>Breakdown by event type</Text>
          {eventTypeData.length > 0 ? (
            <DonutChart
              className="h-60 mt-4"
              data={eventTypeData}
              category="value"
              index="name"
              colors={['emerald', 'amber', 'rose', 'indigo', 'violet', 'cyan']}
              valueFormatter={(v) => v.toLocaleString()}
              showAnimation
            />
          ) : (
            <div className="h-60 flex items-center justify-center">
              <div className="text-center">
                <div className="w-24 h-24 mx-auto rounded-full border-4 border-dashed border-tremor-border mb-3" />
                <Text>No events recorded</Text>
              </div>
            </div>
          )}
        </Card>

        <Card>
          <Title>Latency Percentiles</Title>
          <Text>Response time distribution</Text>
          {hasData ? (
            <BarList
              data={percentileData}
              className="mt-4"
              valueFormatter={(v) => `${v}ms`}
              color="indigo"
            />
          ) : (
            <div className="h-60 flex items-center justify-center">
              <div className="text-center">
                <div className="space-y-2 mb-3">
                  {[80, 60, 40, 20].map((w) => (
                    <div key={w} className="h-3 bg-tremor-background-subtle rounded" style={{width: `${w}%`, marginLeft: 'auto', marginRight: 'auto'}} />
                  ))}
                </div>
                <Text>No latency data</Text>
              </div>
            </div>
          )}
        </Card>
      </Grid>

      {/* Endpoint Performance */}
      <Card>
        <Title>Endpoint Performance</Title>
        <Text>Health status and metrics by endpoint</Text>
        {endpointPerformance.length > 0 ? (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-tremor-border">
                  <th className="text-left py-3 px-4 text-tremor-content-subtle text-sm font-medium">Endpoint</th>
                  <th className="text-left py-3 px-4 text-tremor-content-subtle text-sm font-medium">Status</th>
                  <th className="text-right py-3 px-4 text-tremor-content-subtle text-sm font-medium">Deliveries</th>
                  <th className="text-right py-3 px-4 text-tremor-content-subtle text-sm font-medium">Success Rate</th>
                  <th className="text-right py-3 px-4 text-tremor-content-subtle text-sm font-medium">Avg Latency</th>
                  <th className="text-right py-3 px-4 text-tremor-content-subtle text-sm font-medium">p95</th>
                </tr>
              </thead>
              <tbody>
                {endpointPerformance.map((ep) => (
                  <tr key={ep.endpointId} className="border-b border-tremor-border hover:bg-tremor-background-subtle transition-colors">
                    <td className="py-3 px-4">
                      <Flex alignItems="center" className="gap-2">
                        <div className={`w-2 h-2 rounded-full ${ep.enabled ? 'bg-emerald-500' : 'bg-gray-400'}`} />
                        <Text className="truncate max-w-xs font-medium">{ep.url}</Text>
                      </Flex>
                    </td>
                    <td className="py-3 px-4">
                      <Badge color={getStatusBadge(ep.status)}>{ep.status}</Badge>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <Text className="font-mono">{ep.totalDeliveries.toLocaleString()}</Text>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <Text className={ep.successRate >= 99 ? 'text-emerald-600' : ep.successRate >= 95 ? 'text-amber-600' : 'text-red-600'}>
                        {ep.successRate}%
                      </Text>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <Text className="font-mono">{Math.round(ep.avgLatencyMs)}ms</Text>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <Text className="font-mono">{ep.p95LatencyMs}ms</Text>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="h-40 flex items-center justify-center">
            <div className="text-center">
              <AlertTriangle className="h-10 w-10 mx-auto text-tremor-content-subtle mb-3" />
              <Text>No endpoint data available</Text>
              <Text className="text-tremor-content-subtle text-sm">Configure endpoints to see metrics</Text>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
