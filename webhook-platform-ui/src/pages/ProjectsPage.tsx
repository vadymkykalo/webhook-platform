import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, FolderKanban, Calendar, Loader2, Trash2, Copy, Settings, Send, Radio, Key } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useProjects, useCreateProject, useDeleteProject } from '../api/queries';
import { usePermissions } from '../auth/usePermissions';
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../components/ui/alert-dialog';

export default function ProjectsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: projects = [], isLoading: loading } = useProjects();
  const createProject = useCreateProject();
  const deleteProject = useDeleteProject();
  const { canCreateProject, canDeleteProject } = usePermissions();

  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const creating = createProject.isPending;
  const deleting = deleteProject.isPending;

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    createProject.mutate(
      { name, description },
      {
        onSuccess: () => {
          setShowCreateDialog(false);
          setName('');
          setDescription('');
          toast.success(t('projects.toast.created'));
        },
        onError: (err: any) => {
          toast.error(err.response?.data?.message || t('projects.toast.createFailed'));
        },
      }
    );
  };

  const handleDelete = () => {
    if (!deleteId) return;
    deleteProject.mutate(deleteId, {
      onSuccess: () => {
        toast.success(t('projects.toast.deleted'));
        setDeleteId(null);
      },
      onError: (err: any) => {
        toast.error(err.response?.data?.message || t('projects.toast.deleteFailed'));
      },
    });
  };

  const handleCopyId = (id: string) => {
    navigator.clipboard.writeText(id);
    toast.success(t('projects.toast.idCopied'));
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }).format(date);
  };

  if (loading) {
    return (
      <div className="p-6 lg:p-8 max-w-6xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <div className="h-7 w-32 bg-muted animate-pulse rounded-lg" />
            <div className="h-4 w-64 bg-muted animate-pulse rounded" />
          </div>
          <div className="h-10 w-32 bg-muted animate-pulse rounded-lg" />
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-48 bg-muted animate-pulse rounded-xl" />
          ))}
        </div>
      </div>
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
        {canCreateProject && (
          <Button onClick={() => setShowCreateDialog(true)}>
            <Plus className="h-4 w-4" />
            {t('projects.newProject')}
          </Button>
        )}
      </div>

      {projects.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 border border-dashed rounded-xl">
          <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-6">
            <FolderKanban className="h-8 w-8 text-primary" />
          </div>
          <h3 className="text-lg font-semibold mb-2">{t('projects.noProjects')}</h3>
          <p className="text-sm text-muted-foreground text-center mb-6 max-w-sm">
            {canCreateProject
              ? t('projects.noProjectsDesc')
              : t('projects.noProjectsViewer')}
          </p>
          {canCreateProject && (
            <Button onClick={() => setShowCreateDialog(true)}>
              <Plus className="h-4 w-4" />
              {t('projects.createFirst')}
            </Button>
          )}
        </div>
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

      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('projects.createDialog.title')}</DialogTitle>
            <DialogDescription>
              {t('projects.createDialog.description')}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreate}>
            <div className="space-y-4 py-4">
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

      <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('projects.deleteDialog.title')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('projects.deleteDialog.description')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {deleting ? t('common.deleting') : t('common.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
