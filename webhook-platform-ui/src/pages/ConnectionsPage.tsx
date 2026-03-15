import { useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Webhook, Radio, Bell, ArrowRight, CheckCircle2, XCircle, Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useEndpoints, useSubscriptions, useProject } from '../api/queries';
import PageSkeleton, { SkeletonCards } from '../components/PageSkeleton';
import EmptyState from '../components/EmptyState';
import { Badge } from '../components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { cn } from '../lib/utils';

interface ConnectionNode {
  eventType: string;
  endpoints: {
    id: string;
    url: string;
    enabled: boolean;
    subscriptionId: string;
    subscriptionEnabled: boolean;
  }[];
}

export default function ConnectionsPage() {
  const { t } = useTranslation();
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const { data: project, isLoading: projectLoading } = useProject(projectId);
  const { data: endpoints = [], isLoading: endpointsLoading } = useEndpoints(projectId);
  const { data: subscriptions = [] } = useSubscriptions(projectId);

  const loading = projectLoading || endpointsLoading;

  const connections = useMemo<ConnectionNode[]>(() => {
    const byType = new Map<string, ConnectionNode['endpoints']>();

    for (const sub of subscriptions) {
      const ep = endpoints.find(e => e.id === sub.endpointId);
      if (!ep) continue;

      if (!byType.has(sub.eventType)) {
        byType.set(sub.eventType, []);
      }
      byType.get(sub.eventType)!.push({
        id: ep.id,
        url: ep.url,
        enabled: ep.enabled,
        subscriptionId: sub.id,
        subscriptionEnabled: sub.enabled,
      });
    }

    return Array.from(byType.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([eventType, eps]) => ({ eventType, endpoints: eps }));
  }, [endpoints, subscriptions]);

  const orphanEndpoints = useMemo(() => {
    const subscribedIds = new Set(subscriptions.map(s => s.endpointId));
    return endpoints.filter(ep => !subscribedIds.has(ep.id));
  }, [endpoints, subscriptions]);

  if (loading) {
    return (
      <PageSkeleton maxWidth="max-w-6xl">
        <SkeletonCards count={3} height="h-[200px]" cols="grid-cols-1" />
      </PageSkeleton>
    );
  }

  return (
    <div className="p-6 lg:p-8 max-w-6xl mx-auto">
      <div className="mb-8">
        <h1 className="text-title tracking-tight">{t('connections.title')}</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {t('connections.subtitle', { project: project?.name || '' })}
        </p>
      </div>

      {/* Summary badges */}
      <div className="flex flex-wrap gap-2 mb-6">
        <Badge variant="outline" className="gap-1.5 px-3 py-1">
          <Radio className="h-3.5 w-3.5" />
          {t('connections.eventTypes', { count: connections.length })}
        </Badge>
        <Badge variant="outline" className="gap-1.5 px-3 py-1">
          <Webhook className="h-3.5 w-3.5" />
          {t('connections.endpoints', { count: endpoints.length })}
        </Badge>
        <Badge variant="outline" className="gap-1.5 px-3 py-1">
          <Bell className="h-3.5 w-3.5" />
          {t('connections.subscriptions', { count: subscriptions.length })}
        </Badge>
      </div>

      {connections.length === 0 && orphanEndpoints.length === 0 ? (
        <EmptyState
          icon={Bell}
          title={t('connections.empty')}
          description={t('connections.emptyDesc')}
          action={
            <Button variant="outline" size="sm" onClick={() => navigate(`/admin/projects/${projectId}/endpoints`)}>
              <Plus className="h-3.5 w-3.5 mr-1.5" />
              {t('endpoints.createFirst', 'Create endpoint')}
            </Button>
          }
        />
      ) : (
        <div className="space-y-4">
          {/* Connection map */}
          {connections.map((node) => (
            <Card key={node.eventType}>
              <CardContent className="p-4">
                <div className="flex items-start gap-4">
                  {/* Event type node */}
                  <div className="flex-shrink-0 w-56">
                    <div className="flex items-center gap-2 p-3 rounded-lg bg-primary/5 border border-primary/20">
                      <Radio className="h-4 w-4 text-primary shrink-0" />
                      <span className="text-sm font-medium truncate">{node.eventType}</span>
                    </div>
                  </div>

                  {/* Arrow */}
                  <div className="flex items-center pt-3 shrink-0">
                    <ArrowRight className="h-4 w-4 text-muted-foreground" />
                  </div>

                  {/* Endpoint nodes */}
                  <div className="flex-1 space-y-2">
                    {node.endpoints.map((ep) => {
                      const active = ep.enabled && ep.subscriptionEnabled;
                      return (
                        <div
                          key={ep.subscriptionId}
                          className={cn(
                            'flex items-center gap-2 p-3 rounded-lg border cursor-pointer transition-colors hover:bg-accent',
                            active ? 'border-border' : 'border-dashed border-muted-foreground/30 opacity-60',
                          )}
                          onClick={() => navigate(`/admin/projects/${projectId}/endpoints`)}
                        >
                          {active ? (
                            <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0" />
                          ) : (
                            <XCircle className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          )}
                          <Webhook className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          <span className="text-sm truncate">{ep.url}</span>
                          {!ep.enabled && (
                            <Badge variant="secondary" className="text-[10px] ml-auto shrink-0">
                              {t('connections.endpointDisabled')}
                            </Badge>
                          )}
                          {!ep.subscriptionEnabled && ep.enabled && (
                            <Badge variant="secondary" className="text-[10px] ml-auto shrink-0">
                              {t('connections.subDisabled')}
                            </Badge>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}

          {/* Orphan endpoints (no subscriptions) */}
          {orphanEndpoints.length > 0 && (
            <Card className="border-dashed">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm text-muted-foreground">{t('connections.unsubscribed')}</CardTitle>
                <CardDescription className="text-xs">{t('connections.unsubscribedDesc')}</CardDescription>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="space-y-2">
                  {orphanEndpoints.map((ep) => (
                    <div
                      key={ep.id}
                      className="flex items-center gap-2 p-3 rounded-lg border border-dashed opacity-60 cursor-pointer hover:bg-accent transition-colors"
                      onClick={() => navigate(`/admin/projects/${projectId}/subscriptions`)}
                    >
                      <Webhook className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <span className="text-sm truncate">{ep.url}</span>
                      <Badge variant="outline" className="text-[10px] ml-auto shrink-0">
                        {t('connections.noSubscriptions')}
                      </Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
