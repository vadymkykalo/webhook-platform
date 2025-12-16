import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FolderKanban, Webhook, Radio, Send, AlertCircle, CheckCircle2, Clock } from 'lucide-react';
import { toast } from 'sonner';
import { projectsApi } from '../api/projects.api';
import { dashboardApi, type DashboardStats } from '../api/dashboard.api';
import type { ProjectResponse } from '../types/api.types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Select } from '../components/ui/select';

export default function DashboardPage() {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<ProjectResponse[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [dashboardStats, setDashboardStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [statsLoading, setStatsLoading] = useState(false);

  useEffect(() => {
    loadProjects();
  }, []);

  useEffect(() => {
    if (selectedProjectId) {
      loadDashboardStats();
    }
  }, [selectedProjectId]);

  const loadProjects = async () => {
    try {
      setLoading(true);
      const data = await projectsApi.list();
      setProjects(data);
      if (data.length > 0) {
        setSelectedProjectId(data[0].id);
      }
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to load projects');
    } finally {
      setLoading(false);
    }
  };

  const loadDashboardStats = async () => {
    if (!selectedProjectId) return;
    
    try {
      setStatsLoading(true);
      const stats = await dashboardApi.getProjectStats(selectedProjectId);
      setDashboardStats(stats);
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to load dashboard stats');
    } finally {
      setStatsLoading(false);
    }
  };

  const selectedProject = projects.find(p => p.id === selectedProjectId);

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        <div className="space-y-4">
          <div className="h-8 w-48 bg-muted animate-pulse rounded" />
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-32 bg-muted animate-pulse rounded-lg" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground mt-1">
            Overview of your webhook platform activity
          </p>
        </div>
        {projects.length > 0 && (
          <div className="w-64">
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

      {!selectedProject ? (
        <div className="text-center py-12">
          <FolderKanban className="h-16 w-16 mx-auto mb-4 text-muted-foreground opacity-50" />
          <h3 className="text-lg font-medium mb-2">No Projects Yet</h3>
          <p className="text-muted-foreground mb-4">Create your first project to get started</p>
          <button
            onClick={() => navigate('/projects')}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
          >
            Create Project
          </button>
        </div>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5 mb-8">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Deliveries</CardTitle>
                <Send className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {statsLoading ? '-' : dashboardStats?.deliveryStats.totalDeliveries || 0}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Webhook deliveries sent
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Successful</CardTitle>
                <CheckCircle2 className="h-4 w-4 text-green-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600">
                  {statsLoading ? '-' : dashboardStats?.deliveryStats.successfulDeliveries || 0}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {statsLoading ? '-' : `${dashboardStats?.deliveryStats.successRate || 0}% success rate`}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Failed</CardTitle>
                <AlertCircle className="h-4 w-4 text-red-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-red-600">
                  {statsLoading ? '-' : dashboardStats?.deliveryStats.failedDeliveries || 0}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Retriable failures
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">DLQ</CardTitle>
                <AlertCircle className="h-4 w-4 text-orange-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-orange-600">
                  {statsLoading ? '-' : dashboardStats?.deliveryStats.dlqDeliveries || 0}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Max retries exceeded
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Pending</CardTitle>
                <Clock className="h-4 w-4 text-yellow-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-yellow-600">
                  {statsLoading ? '-' : dashboardStats?.deliveryStats.pendingDeliveries || 0}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  In progress
                </p>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 md:grid-cols-2 mb-8">
            <Card>
              <CardHeader>
                <CardTitle>Recent Events</CardTitle>
                <CardDescription>Latest webhook events in this project</CardDescription>
              </CardHeader>
              <CardContent>
                {statsLoading ? (
                  <div className="space-y-2">
                    {[1, 2, 3].map(i => (
                      <div key={i} className="h-12 bg-muted animate-pulse rounded" />
                    ))}
                  </div>
                ) : !dashboardStats || dashboardStats.recentEvents.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Radio className="h-12 w-12 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">No recent events</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {dashboardStats.recentEvents.map((event) => (
                      <div
                        key={event.id}
                        className="flex items-center justify-between p-2 rounded-lg hover:bg-accent cursor-pointer"
                        onClick={() => navigate(`/projects/${selectedProjectId}/events`)}
                      >
                        <div className="flex items-center gap-2">
                          <Radio className="h-4 w-4 text-primary" />
                          <div>
                            <p className="text-sm font-medium">{event.type}</p>
                            <p className="text-xs text-muted-foreground">
                              {new Date(event.createdAt).toLocaleString()}
                            </p>
                          </div>
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {event.deliveryCount} {event.deliveryCount === 1 ? 'delivery' : 'deliveries'}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Endpoint Health</CardTitle>
                <CardDescription>Top endpoints by delivery volume</CardDescription>
              </CardHeader>
              <CardContent>
                {statsLoading ? (
                  <div className="space-y-2">
                    {[1, 2, 3].map(i => (
                      <div key={i} className="h-12 bg-muted animate-pulse rounded" />
                    ))}
                  </div>
                ) : !dashboardStats || dashboardStats.endpointHealth.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Webhook className="h-12 w-12 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">No endpoints configured</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {dashboardStats.endpointHealth.slice(0, 5).map((endpoint) => (
                      <div
                        key={endpoint.id}
                        className="flex items-center justify-between p-2 rounded-lg hover:bg-accent cursor-pointer"
                        onClick={() => navigate(`/projects/${selectedProjectId}/endpoints`)}
                      >
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <Webhook className={`h-4 w-4 flex-shrink-0 ${endpoint.enabled ? 'text-green-600' : 'text-muted-foreground'}`} />
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium truncate">{endpoint.url}</p>
                            <p className="text-xs text-muted-foreground">
                              {endpoint.totalDeliveries} deliveries • {endpoint.successRate}% success
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}

    </div>
  );
}
