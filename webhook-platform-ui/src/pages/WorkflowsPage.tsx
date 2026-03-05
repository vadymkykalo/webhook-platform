import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, ToggleLeft, ToggleRight, Pencil, Play, GitBranch, CheckCircle2, XCircle, Clock } from 'lucide-react';
import { workflowsApi, type WorkflowResponse, type WorkflowRequest } from '../api/workflows.api';
import { Button } from '../components/ui/button';
import { showApiError, showSuccess } from '../lib/toast';

export default function WorkflowsPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');

  const { data: workflows = [], isLoading } = useQuery({
    queryKey: ['workflows', projectId],
    queryFn: () => workflowsApi.list(projectId!),
    enabled: !!projectId,
  });

  const createMutation = useMutation({
    mutationFn: (data: WorkflowRequest) => workflowsApi.create(projectId!, data),
    onSuccess: (wf) => {
      qc.invalidateQueries({ queryKey: ['workflows', projectId] });
      showSuccess(t('workflows.toast.created'));
      setShowCreate(false);
      setNewName('');
      setNewDesc('');
      navigate(`/admin/projects/${projectId}/workflows/${wf.id}`);
    },
    onError: (err) => showApiError(err, t('workflows.toast.createFailed')),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => workflowsApi.delete(projectId!, id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['workflows', projectId] });
      showSuccess(t('workflows.toast.deleted'));
    },
    onError: (err) => showApiError(err, t('workflows.toast.deleteFailed')),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) => workflowsApi.toggle(projectId!, id, enabled),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['workflows', projectId] });
    },
    onError: (err) => showApiError(err, t('workflows.toast.toggleFailed')),
  });

  const handleCreate = () => {
    if (!newName.trim()) return;
    createMutation.mutate({
      name: newName.trim(),
      description: newDesc.trim() || undefined,
      triggerType: 'WEBHOOK_EVENT',
      definition: { nodes: [], edges: [] },
    });
  };

  if (!projectId) return null;

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <GitBranch className="h-6 w-6 text-primary" />
            {t('workflows.title')}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {t('workflows.subtitle')}
          </p>
        </div>
        <Button onClick={() => setShowCreate(true)} className="gap-2">
          <Plus className="h-4 w-4" />
          {t('workflows.newWorkflow')}
        </Button>
      </div>

      {/* Create dialog */}
      {showCreate && (
        <div className="border rounded-lg p-4 bg-card space-y-3">
          <h3 className="font-semibold">{t('workflows.createWorkflow')}</h3>
          <input
            autoFocus
            placeholder={t('workflows.namePlaceholder')}
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            className="w-full px-3 py-2 border rounded-lg bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
          <input
            placeholder={t('workflows.descriptionPlaceholder')}
            value={newDesc}
            onChange={(e) => setNewDesc(e.target.value)}
            className="w-full px-3 py-2 border rounded-lg bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
          <div className="flex gap-2">
            <Button onClick={handleCreate} disabled={!newName.trim() || createMutation.isPending} size="sm">
              {t('workflows.create')}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => { setShowCreate(false); setNewName(''); setNewDesc(''); }}>
              {t('workflows.cancel')}
            </Button>
          </div>
        </div>
      )}

      {/* List */}
      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">{t('workflows.loading')}</div>
      ) : workflows.length === 0 ? (
        <div className="text-center py-16 space-y-3">
          <GitBranch className="h-12 w-12 text-muted-foreground/30 mx-auto" />
          <p className="text-muted-foreground">{t('workflows.noWorkflows')}</p>
          <p className="text-sm text-muted-foreground/70">{t('workflows.noWorkflowsHint')}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {workflows.map((wf: WorkflowResponse) => (
            <div
              key={wf.id}
              className="border rounded-lg p-4 bg-card hover:shadow-sm transition-shadow cursor-pointer"
              onClick={() => navigate(`/admin/projects/${projectId}/workflows/${wf.id}`)}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div className={`h-2 w-2 rounded-full flex-shrink-0 ${wf.enabled ? 'bg-green-500' : 'bg-gray-400'}`} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-medium truncate">{wf.name}</h3>
                      <span className="text-xs text-muted-foreground px-1.5 py-0.5 rounded bg-muted">v{wf.version}</span>
                    </div>
                    {wf.description && (
                      <p className="text-sm text-muted-foreground truncate mt-0.5">{wf.description}</p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-4 flex-shrink-0 ml-4">
                  {/* Stats */}
                  <div className="hidden sm:flex items-center gap-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1" title={t('workflows.totalExecutions')}>
                      <Play className="h-3 w-3" /> {wf.totalExecutions}
                    </span>
                    <span className="flex items-center gap-1 text-green-600" title={t('workflows.successful')}>
                      <CheckCircle2 className="h-3 w-3" /> {wf.successfulExecutions}
                    </span>
                    <span className="flex items-center gap-1 text-red-500" title={t('workflows.failed')}>
                      <XCircle className="h-3 w-3" /> {wf.failedExecutions}
                    </span>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      title={wf.enabled ? t('workflows.disable') : t('workflows.enable')}
                      onClick={() => toggleMutation.mutate({ id: wf.id, enabled: !wf.enabled })}
                    >
                      {wf.enabled ? <ToggleRight className="h-4 w-4 text-green-500" /> : <ToggleLeft className="h-4 w-4" />}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      title={t('workflows.edit')}
                      onClick={() => navigate(`/admin/projects/${projectId}/workflows/${wf.id}`)}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="text-destructive hover:text-destructive"
                      title={t('workflows.delete')}
                      onClick={() => { if (confirm(t('workflows.deleteConfirm'))) deleteMutation.mutate(wf.id); }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {new Date(wf.updatedAt).toLocaleDateString()}
                </span>
                <span className="px-1.5 py-0.5 rounded bg-muted">{wf.triggerType}</span>
                <span>{wf.definition?.nodes?.length || 0} {t('workflows.nodes')}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
