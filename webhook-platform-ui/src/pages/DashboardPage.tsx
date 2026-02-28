import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FolderKanban, Webhook, Radio, Send, AlertCircle, CheckCircle2, Clock, BarChart3, ArrowRight, Plus, AlertTriangle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useProjects, useDashboardStats } from '../api/queries';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Select } from '../components/ui/select';
import { Button } from '../components/ui/button';

function StatCard({ title, value, icon: Icon, iconColor, subtitle, loading }: {
  title: string; value: number | string; icon: React.ElementType; iconColor: string; subtitle: string; loading: boolean;
}) {
  return (
    <Card className="relative overflow-hidden">
      <CardContent className="p-5">
        <div className="flex items-start justify-between mb-3">
          <p className="text-[13px] font-medium text-muted-foreground">{title}</p>
          <div className={`h-8 w-8 rounded-lg flex items-center justify-center ${iconColor}`}>
            <Icon className="h-4 w-4" />
          </div>
        </div>
        <div className="text-2xl font-bold tracking-tight">
          {loading ? <div className="h-8 w-16 bg-muted animate-pulse rounded" /> : value}
        </div>
        <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>
      </CardContent>
    </Card>
  );
}

function SkeletonDashboard() {
  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <div className="h-8 w-48 bg-muted animate-pulse rounded-lg" />
          <div className="h-4 w-72 bg-muted animate-pulse rounded" />
        </div>
        <div className="h-10 w-48 bg-muted animate-pulse rounded-lg" />
      </div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="h-[120px] bg-muted animate-pulse rounded-xl" />
        ))}
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {[1, 2].map((i) => (
          <div key={i} className="h-[320px] bg-muted animate-pulse rounded-xl" />
        ))}
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: projects = [], isLoading: loading } = useProjects();
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');

  // Auto-select first project when loaded
  useEffect(() => {
    if (projects.length > 0 && !selectedProjectId) {
      setSelectedProjectId(projects[0].id);
    }
  }, [projects, selectedProjectId]);

  const { data: dashboardStats, isLoading: statsLoading } = useDashboardStats(
    selectedProjectId || undefined
  );

  const selectedProject = projects.find(p => p.id === selectedProjectId);

  if (loading) return <SkeletonDashboard />;

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-title tracking-tight">{t('dashboard.title')}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {t('dashboard.subtitle')}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {selectedProjectId && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate(`/admin/projects/${selectedProjectId}/analytics`)}
            >
              <BarChart3 className="h-4 w-4" /> {t('nav.analytics')}
            </Button>
          )}
          {projects.length > 0 && (
            <div className="w-56">
              <Select
                value={selectedProjectId}
                onChange={(e) => setSelectedProjectId(e.target.value)}
              >
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </Select>
            </div>
          )}
        </div>
      </div>

      {!selectedProject ? (
        <div className="flex flex-col items-center justify-center py-20">
          <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-6">
            <FolderKanban className="h-8 w-8 text-primary" />
          </div>
          <h3 className="text-lg font-semibold mb-2">{t('dashboard.noProjects')}</h3>
          <p className="text-sm text-muted-foreground mb-6 text-center max-w-sm">
            {t('dashboard.noProjectsDesc')}
          </p>
          <Button onClick={() => navigate('/admin/projects')}>
            <Plus className="h-4 w-4" /> {t('dashboard.createProject')}
          </Button>
        </div>
      ) : (
        <div className="space-y-6 animate-fade-in">
          {/* Stat Cards */}
          <div className="grid gap-4 grid-cols-2 lg:grid-cols-5">
            <StatCard
              title={t('dashboard.stats.totalDeliveries')}
              value={dashboardStats?.deliveryStats.totalDeliveries || 0}
              icon={Send}
              iconColor="bg-primary/10 text-primary"
              subtitle={t('dashboard.stats.totalDeliveriesDesc')}
              loading={statsLoading}
            />
            <StatCard
              title={t('dashboard.stats.successful')}
              value={dashboardStats?.deliveryStats.successfulDeliveries || 0}
              icon={CheckCircle2}
              iconColor="bg-success/10 text-success"
              subtitle={t('dashboard.stats.successRate', { rate: dashboardStats?.deliveryStats.successRate || 0 })}
              loading={statsLoading}
            />
            <StatCard
              title={t('dashboard.stats.failed')}
              value={dashboardStats?.deliveryStats.failedDeliveries || 0}
              icon={AlertCircle}
              iconColor="bg-destructive/10 text-destructive"
              subtitle={t('dashboard.stats.failedDesc')}
              loading={statsLoading}
            />
            <StatCard
              title={t('dashboard.stats.dlq')}
              value={dashboardStats?.deliveryStats.dlqDeliveries || 0}
              icon={AlertTriangle}
              iconColor="bg-warning/10 text-warning"
              subtitle={t('dashboard.stats.dlqDesc')}
              loading={statsLoading}
            />
            <StatCard
              title={t('dashboard.stats.pending')}
              value={dashboardStats?.deliveryStats.pendingDeliveries || 0}
              icon={Clock}
              iconColor="bg-blue-500/10 text-blue-600"
              subtitle={t('dashboard.stats.pendingDesc')}
              loading={statsLoading}
            />
          </div>

          {/* Recent Events & Endpoint Health */}
          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base">{t('dashboard.recentEvents.title')}</CardTitle>
                    <CardDescription className="text-xs">{t('dashboard.recentEvents.subtitle')}</CardDescription>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => navigate(`/admin/projects/${selectedProjectId}/events`)}
                    className="text-xs"
                  >
                    {t('common.viewAll')} <ArrowRight className="h-3 w-3" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {statsLoading ? (
                  <div className="space-y-2">
                    {[1, 2, 3].map(i => (
                      <div key={i} className="h-14 bg-muted animate-pulse rounded-lg" />
                    ))}
                  </div>
                ) : !dashboardStats || dashboardStats.recentEvents.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-10 text-muted-foreground">
                    <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center mb-3">
                      <Radio className="h-5 w-5 opacity-50" />
                    </div>
                    <p className="text-sm font-medium">{t('dashboard.recentEvents.empty')}</p>
                    <p className="text-xs mt-1">{t('dashboard.recentEvents.emptyDesc')}</p>
                  </div>
                ) : (
                  <div className="space-y-1">
                    {dashboardStats.recentEvents.map((event) => (
                      <div
                        key={event.id}
                        className="flex items-center justify-between p-2.5 rounded-lg hover:bg-accent cursor-pointer transition-colors group"
                        onClick={() => navigate(`/admin/projects/${selectedProjectId}/events`)}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                            <Radio className="h-3.5 w-3.5 text-primary" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">{event.type}</p>
                            <p className="text-[11px] text-muted-foreground">
                              {new Date(event.createdAt).toLocaleString()}
                            </p>
                          </div>
                        </div>
                        <span className="text-[11px] text-muted-foreground bg-muted px-2 py-0.5 rounded-full flex-shrink-0 ml-2">
                          {event.deliveryCount} {event.deliveryCount === 1 ? t('dashboard.recentEvents.delivery', { count: 1 }) : t('dashboard.recentEvents.delivery_other', { count: event.deliveryCount })}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base">{t('dashboard.endpointHealth.title')}</CardTitle>
                    <CardDescription className="text-xs">{t('dashboard.endpointHealth.subtitle')}</CardDescription>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => navigate(`/admin/projects/${selectedProjectId}/endpoints`)}
                    className="text-xs"
                  >
                    {t('common.viewAll')} <ArrowRight className="h-3 w-3" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {statsLoading ? (
                  <div className="space-y-2">
                    {[1, 2, 3].map(i => (
                      <div key={i} className="h-14 bg-muted animate-pulse rounded-lg" />
                    ))}
                  </div>
                ) : !dashboardStats || dashboardStats.endpointHealth.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-10 text-muted-foreground">
                    <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center mb-3">
                      <Webhook className="h-5 w-5 opacity-50" />
                    </div>
                    <p className="text-sm font-medium">{t('dashboard.endpointHealth.empty')}</p>
                    <p className="text-xs mt-1">{t('dashboard.endpointHealth.emptyDesc')}</p>
                  </div>
                ) : (
                  <div className="space-y-1">
                    {dashboardStats.endpointHealth.slice(0, 5).map((endpoint) => (
                      <div
                        key={endpoint.id}
                        className="flex items-center justify-between p-2.5 rounded-lg hover:bg-accent cursor-pointer transition-colors"
                        onClick={() => navigate(`/admin/projects/${selectedProjectId}/endpoints`)}
                      >
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <div className={`h-2 w-2 rounded-full flex-shrink-0 ${endpoint.enabled ? 'bg-success' : 'bg-muted-foreground/30'}`} />
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium truncate">{endpoint.url}</p>
                            <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                              <span>{t('dashboard.endpointHealth.deliveries', { count: endpoint.totalDeliveries })}</span>
                              <span>·</span>
                              <span className={endpoint.successRate >= 95 ? 'text-success' : endpoint.successRate >= 80 ? 'text-warning' : 'text-destructive'}>
                                {t('dashboard.endpointHealth.success', { rate: endpoint.successRate })}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Quick Actions */}
          <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
            {[
              { label: t('dashboard.quickActions.endpoints'), path: `/admin/projects/${selectedProjectId}/endpoints`, icon: Webhook },
              { label: t('dashboard.quickActions.events'), path: `/admin/projects/${selectedProjectId}/events`, icon: Radio },
              { label: t('dashboard.quickActions.deliveries'), path: `/admin/projects/${selectedProjectId}/deliveries`, icon: Send },
              { label: t('dashboard.quickActions.dlq'), path: `/admin/projects/${selectedProjectId}/dlq`, icon: AlertTriangle },
            ].map((action) => (
              <button
                key={action.label}
                onClick={() => navigate(action.path)}
                className="flex items-center gap-3 p-4 rounded-xl border bg-card hover:bg-accent hover:border-primary/20 transition-all text-left group"
              >
                <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center group-hover:bg-primary/15 transition-colors">
                  <action.icon className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-medium">{action.label}</p>
                  <p className="text-[11px] text-muted-foreground">{t('common.manage')}</p>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
