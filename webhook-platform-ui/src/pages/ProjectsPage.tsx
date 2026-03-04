import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useEffect } from 'react';
import { Plus, FolderKanban, Calendar, Loader2, Trash2, Copy, Settings, Send, Radio, Key, CreditCard, ShoppingCart, Github, Zap, CheckCircle2, XCircle, Activity } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { showApiError, showSuccess, showCriticalSuccess } from '../lib/toast';
import { useProjects, useCreateProject, useDeleteProject } from '../api/queries';
import { dashboardApi, type DashboardStats } from '../api/dashboard.api';
import { formatDate, formatRelativeTime } from '../lib/date';
import { cn } from '../lib/utils';
import PageSkeleton, { SkeletonCards } from '../components/PageSkeleton';
import { usePermissions } from '../auth/usePermissions';
import PermissionGate from '../components/PermissionGate';
import VerificationGate from '../components/VerificationGate';
import EmptyState from '../components/EmptyState';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../components/ui/dialog';
import DangerConfirmDialog from '../components/DangerConfirmDialog';

type ProjectTemplate = 'custom' | 'stripe' | 'shopify' | 'github';

const TEMPLATES: { key: ProjectTemplate; icon: React.ElementType; iconColor: string }[] = [
  { key: 'custom', icon: Zap, iconColor: 'text-muted-foreground' },
  { key: 'stripe', icon: CreditCard, iconColor: 'text-purple-600' },
  { key: 'shopify', icon: ShoppingCart, iconColor: 'text-green-600' },
  { key: 'github', icon: Github, iconColor: 'text-gray-800 dark:text-gray-200' },
];

const TEMPLATE_DEFAULTS: Record<ProjectTemplate, { name: string; description: string }> = {
  custom: { name: '', description: '' },
  stripe: { name: 'Stripe Payments', description: 'Payment webhook integration — charge.succeeded, invoice.paid, refund.created' },
  shopify: { name: 'Shopify Store', description: 'E-commerce webhook integration — order.created, product.updated, checkout.completed' },
  github: { name: 'GitHub CI/CD', description: 'Repository webhook integration — push, pull_request.opened, workflow.completed' },
};

export default function ProjectsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: projects = [], isLoading: loading } = useProjects();
  const createProject = useCreateProject();
  const deleteProject = useDeleteProject();
  const { canCreateProject, canDeleteProject } = usePermissions();

  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<ProjectTemplate>('custom');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [healthStats, setHealthStats] = useState<Record<string, DashboardStats>>({});

  const creating = createProject.isPending;
  const deleting = deleteProject.isPending;

  useEffect(() => {
    if (projects.length > 0) {
      projects.forEach((project) => {
        if (!healthStats[project.id]) {
          dashboardApi.getProjectStats(project.id).then((stats) => {
            setHealthStats((prev) => ({ ...prev, [project.id]: stats }));
          }).catch(() => { /* ignore — health is best-effort */ });
        }
      });
    }
  }, [projects]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    createProject.mutate(
      { name, description },
      {
        onSuccess: (project) => {
          setShowCreateDialog(false);
          setName('');
          setDescription('');
          showSuccess(t('projects.toast.created'));
          navigate(`/admin/projects/${project.id}/connection-setup`);
        },
        onError: (err: any) => {
          showApiError(err, 'projects.toast.createFailed');
        },
      }
    );
  };

  const handleDelete = () => {
    if (!deleteId) return;
    deleteProject.mutate(deleteId, {
      onSuccess: () => {
        showCriticalSuccess(t('projects.toast.deleted'));
        setDeleteId(null);
      },
      onError: (err: any) => {
        showApiError(err, 'projects.toast.deleteFailed');
      },
    });
  };

  const handleCopyId = (id: string) => {
    navigator.clipboard.writeText(id);
    showSuccess(t('projects.toast.idCopied'));
  };


  if (loading) {
    return (
      <PageSkeleton>
        <SkeletonCards count={3} height="h-48" />
      </PageSkeleton>
    );
  }

  return (
    <div className="p-6 lg:p-8 max-w-6xl mx-auto">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-8">
        <div>
          <h1 className="text-title tracking-tight">{t('projects.title')}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {t('projects.subtitle')}
          </p>
        </div>
        <PermissionGate allowed={canCreateProject}>
          <VerificationGate>
            <Button onClick={() => setShowCreateDialog(true)}>
              <Plus className="h-4 w-4" />
              {t('projects.newProject')}
            </Button>
          </VerificationGate>
        </PermissionGate>
      </div>

      {projects.length === 0 ? (
        <EmptyState
          icon={FolderKanban}
          title={t('projects.noProjects')}
          description={canCreateProject ? t('projects.noProjectsDesc') : t('projects.noProjectsViewer')}
          action={
            <PermissionGate allowed={canCreateProject}>
              <VerificationGate>
                <Button onClick={() => setShowCreateDialog(true)}>
                  <Plus className="h-4 w-4" />
                  {t('projects.createFirst')}
                </Button>
              </VerificationGate>
            </PermissionGate>
          }
          docsLink="/docs#getting-started"
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 animate-fade-in">
          {projects.map((project) => (
            <Card
              key={project.id}
              className="group cursor-pointer hover:border-primary/20 transition-all"
              onClick={() => navigate(`/admin/projects/${project.id}/endpoints`)}
            >
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center mb-3 group-hover:bg-primary/15 transition-colors">
                    <FolderKanban className="h-5 w-5 text-primary" />
                  </div>
                  <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                    <Button variant="ghost" size="icon-sm" onClick={() => handleCopyId(project.id)} title={t('common.copyId')}>
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                    {canDeleteProject && <Button variant="ghost" size="icon-sm" onClick={() => setDeleteId(project.id)} title={t('common.delete')} className="text-muted-foreground hover:text-destructive">
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>}
                  </div>
                </div>
                <CardTitle className="text-base">{project.name}</CardTitle>
                {project.description && (
                  <CardDescription className="text-xs line-clamp-2 mt-1">{project.description}</CardDescription>
                )}
              </CardHeader>
              <CardContent>
                {/* Health stats */}
                {(() => {
                  const stats = healthStats[project.id];
                  if (!stats) return null;
                  const ds = stats.deliveryStats;
                  const hasDeliveries = ds.totalDeliveries > 0;
                  const lastEvent = stats.recentEvents?.[0];
                  const endpointCount = stats.endpointHealth?.length ?? 0;
                  return (
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] mb-3">
                      <span className="inline-flex items-center gap-1 text-muted-foreground">
                        <Settings className="h-3 w-3" />
                        {endpointCount > 0 ? t('projects.health.endpoints', { count: endpointCount }) : t('projects.health.noEndpoints')}
                      </span>
                      {hasDeliveries ? (
                        <span className={cn('inline-flex items-center gap-1 font-medium',
                          ds.successRate >= 95 ? 'text-green-600' : ds.successRate >= 80 ? 'text-amber-600' : 'text-red-600'
                        )}>
                          {ds.successRate >= 95 ? <CheckCircle2 className="h-3 w-3" /> : ds.successRate >= 80 ? <Activity className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
                          {t('projects.health.successRate', { rate: Math.round(ds.successRate) })}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">{t('projects.health.noDeliveries')}</span>
                      )}
                      {ds.failedDeliveries + ds.dlqDeliveries > 0 && (
                        <span className="inline-flex items-center gap-1 text-red-500 font-medium">
                          <XCircle className="h-3 w-3" />
                          {t('projects.health.errors', { count: ds.failedDeliveries + ds.dlqDeliveries })}
                        </span>
                      )}
                      {lastEvent ? (
                        <span className="text-muted-foreground">
                          {t('projects.health.lastEvent', { time: formatRelativeTime(lastEvent.createdAt) })}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">{t('projects.health.noEvents')}</span>
                      )}
                    </div>
                  );
                })()}

                <div className="flex items-center text-[11px] text-muted-foreground mb-4">
                  <Calendar className="mr-1.5 h-3 w-3" />
                  {t('projects.created', { date: formatDate(project.createdAt) })}
                </div>
                <div className="flex flex-wrap gap-1.5" onClick={(e) => e.stopPropagation()}>
                  {[
                    { label: t('projects.quickLinks.endpoints'), path: `/admin/projects/${project.id}/endpoints`, icon: Settings },
                    { label: t('projects.quickLinks.events'), path: `/admin/projects/${project.id}/events`, icon: Radio },
                    { label: t('projects.quickLinks.keys'), path: `/admin/projects/${project.id}/api-keys`, icon: Key },
                    { label: t('projects.quickLinks.deliveries'), path: `/admin/projects/${project.id}/deliveries`, icon: Send },
                  ].map((action) => (
                    <button
                      key={action.label}
                      onClick={() => navigate(action.path)}
                      className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded-md bg-muted hover:bg-accent hover:text-accent-foreground transition-colors"
                    >
                      <action.icon className="h-3 w-3" />
                      {action.label}
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={showCreateDialog} onOpenChange={(open) => { setShowCreateDialog(open); if (!open) { setSelectedTemplate('custom'); setName(''); setDescription(''); } }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t('projects.createDialog.title')}</DialogTitle>
            <DialogDescription>
              {t('projects.createDialog.description')}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreate}>
            <div className="space-y-4 py-4">
              {/* Template selector */}
              <div className="space-y-2">
                <Label>{t('projects.createDialog.templateLabel')}</Label>
                <div className="grid grid-cols-4 gap-2">
                  {TEMPLATES.map(({ key, icon: TIcon, iconColor }) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => {
                        setSelectedTemplate(key);
                        const defaults = TEMPLATE_DEFAULTS[key];
                        setName(defaults.name);
                        setDescription(defaults.description);
                      }}
                      className={cn(
                        'flex flex-col items-center gap-1.5 p-3 rounded-lg border text-center transition-all',
                        selectedTemplate === key
                          ? 'border-primary bg-primary/5 ring-2 ring-primary/20'
                          : 'border-border hover:border-primary/30 hover:bg-muted/30'
                      )}
                    >
                      <TIcon className={cn('h-5 w-5', iconColor)} />
                      <span className="text-[10px] font-medium leading-tight">
                        {t(`projects.createDialog.template${key.charAt(0).toUpperCase() + key.slice(1)}`)}
                      </span>
                    </button>
                  ))}
                </div>
                {selectedTemplate !== 'custom' && (
                  <p className="text-[11px] text-muted-foreground">
                    {t(`projects.createDialog.template${selectedTemplate.charAt(0).toUpperCase() + selectedTemplate.slice(1)}Desc`)}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="name">{t('projects.createDialog.name')}</Label>
                <Input
                  id="name"
                  placeholder={t('projects.createDialog.namePlaceholder')}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  disabled={creating}
                  autoFocus
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">{t('projects.createDialog.descriptionLabel')}</Label>
                <Textarea
                  id="description"
                  placeholder={t('projects.createDialog.descriptionPlaceholder')}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  disabled={creating}
                  rows={3}
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowCreateDialog(false)}
                disabled={creating}
              >
                {t('common.cancel')}
              </Button>
              <Button type="submit" disabled={creating}>
                {creating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {creating ? t('projects.createDialog.submitting') : t('projects.createDialog.submit')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <DangerConfirmDialog
        open={!!deleteId}
        onOpenChange={(open) => !open && setDeleteId(null)}
        title={t('projects.deleteDialog.title')}
        description={t('projects.deleteDialog.description')}
        confirmName={projects.find(p => p.id === deleteId)?.name || ''}
        impact={[
          t('projects.deleteDialog.impactEndpoints'),
          t('projects.deleteDialog.impactEvents'),
          t('projects.deleteDialog.impactKeys'),
        ]}
        onConfirm={handleDelete}
        loading={deleting}
      />
    </div>
  );
}
