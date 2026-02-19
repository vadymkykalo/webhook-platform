import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Plus, Key, Calendar, Loader2, Trash2, Copy, Eye, EyeOff, ChevronLeft, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import { apiKeysApi, ApiKeyResponse } from '../api/apiKeys.api';
import { projectsApi } from '../api/projects.api';
import type { ProjectResponse, PageResponse } from '../types/api.types';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Card, CardContent } from '../components/ui/card';
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

export default function ApiKeysPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const [project, setProject] = useState<ProjectResponse | null>(null);
  const [apiKeys, setApiKeys] = useState<ApiKeyResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);
  const [revokeId, setRevokeId] = useState<string | null>(null);
  const [revoking, setRevoking] = useState(false);
  const [newApiKey, setNewApiKey] = useState<ApiKeyResponse | null>(null);
  const [showKey, setShowKey] = useState(false);
  const [currentPage, setCurrentPage] = useState(0);
  const [pageInfo, setPageInfo] = useState<PageResponse<ApiKeyResponse> | null>(null);
  const PAGE_SIZE = 20;

  useEffect(() => {
    if (projectId) {
      loadData();
    }
  }, [projectId, currentPage]);

  const loadData = async () => {
    if (!projectId) return;
    
    try {
      setLoading(true);
      const [projectData, apiKeysData] = await Promise.all([
        projectsApi.get(projectId),
        apiKeysApi.listPaged(projectId, currentPage, PAGE_SIZE),
      ]);
      setProject(projectData);
      setApiKeys(apiKeysData.content);
      setPageInfo(apiKeysData);
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectId) return;
    
    setCreating(true);
    try {
      const response = await apiKeysApi.create(projectId, { name });
      setShowCreateDialog(false);
      setName('');
      setNewApiKey(response);
      toast.success('API key created successfully');
      loadData();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to create API key');
    } finally {
      setCreating(false);
    }
  };

  const handleRevoke = async () => {
    if (!revokeId || !projectId) return;
    
    setRevoking(true);
    try {
      await apiKeysApi.revoke(projectId, revokeId);
      toast.success('API key revoked successfully');
      setRevokeId(null);
      loadData();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to revoke API key');
    } finally {
      setRevoking(false);
    }
  };

  const handleCopyKey = (key: string) => {
    navigator.clipboard.writeText(key);
    toast.success('API key copied to clipboard');
  };

  const closeKeyDialog = () => {
    setNewApiKey(null);
    setShowKey(false);
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  };

  const formatRelativeTime = (dateString: string | null) => {
    if (!dateString) return 'Never';
    
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHour = Math.floor(diffMin / 60);
    const diffDay = Math.floor(diffHour / 24);

    if (diffSec < 60) return 'Just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    if (diffHour < 24) return `${diffHour}h ago`;
    if (diffDay < 7) return `${diffDay}d ago`;
    
    return formatDate(dateString);
  };

  if (loading) {
    return (
      <div className="p-6 lg:p-8 max-w-6xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <div className="h-7 w-28 bg-muted animate-pulse rounded-lg" />
            <div className="h-4 w-56 bg-muted animate-pulse rounded" />
          </div>
          <div className="h-10 w-36 bg-muted animate-pulse rounded-lg" />
        </div>
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 bg-muted animate-pulse rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="p-6 lg:p-8 max-w-6xl mx-auto">
        <div className="flex flex-col items-center justify-center py-20">
          <div className="h-14 w-14 rounded-2xl bg-muted flex items-center justify-center mb-4">
            <Key className="h-7 w-7 text-muted-foreground" />
          </div>
          <p className="text-muted-foreground">Project not found</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 max-w-6xl mx-auto">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-8">
        <div>
          <h1 className="text-title tracking-tight">API Keys</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage API keys for <span className="font-medium text-foreground">{project.name}</span>
          </p>
        </div>
        <Button onClick={() => setShowCreateDialog(true)}>
          <Plus className="h-4 w-4" /> Create API Key
        </Button>
      </div>

      {apiKeys.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 border border-dashed rounded-xl">
          <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-6">
            <Key className="h-8 w-8 text-primary" />
          </div>
          <h3 className="text-lg font-semibold mb-2">No API keys yet</h3>
          <p className="text-sm text-muted-foreground text-center mb-6 max-w-sm">
            Create your first API key to start sending events
          </p>
          <Button onClick={() => setShowCreateDialog(true)}>
            <Plus className="h-4 w-4" /> Create API Key
          </Button>
        </div>
      ) : (
        <div className="space-y-3 animate-fade-in">
          {apiKeys.map((apiKey) => (
            <Card key={apiKey.id}>
              <CardContent className="p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <Key className="h-4 w-4 text-primary" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold">{apiKey.name}</p>
                      <code className="text-[13px] font-mono text-muted-foreground">{apiKey.keyPrefix}...</code>
                      <div className="flex items-center gap-3 mt-2 text-[11px] text-muted-foreground">
                        <span className="flex items-center gap-1"><Calendar className="h-3 w-3" /> {formatDate(apiKey.createdAt)}</span>
                        <span>Last used: {formatRelativeTime(apiKey.lastUsedAt)}</span>
                      </div>
                    </div>
                  </div>
                  <Button variant="ghost" size="icon-sm" onClick={() => setRevokeId(apiKey.id)} title="Revoke" className="text-muted-foreground hover:text-destructive flex-shrink-0">
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}

          {pageInfo && pageInfo.totalPages > 1 && (
            <div className="flex items-center justify-between pt-4">
              <p className="text-sm text-muted-foreground">
                Showing {currentPage * PAGE_SIZE + 1}–{Math.min((currentPage + 1) * PAGE_SIZE, pageInfo.totalElements)} of {pageInfo.totalElements}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(p => p - 1)}
                  disabled={pageInfo.first}
                >
                  <ChevronLeft className="h-4 w-4" /> Previous
                </Button>
                <span className="text-sm text-muted-foreground px-2">
                  {currentPage + 1} / {pageInfo.totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(p => p + 1)}
                  disabled={pageInfo.last}
                >
                  Next <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New API Key</DialogTitle>
            <DialogDescription>
              Add a new API key to send events to this project
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreate}>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="name">Key Name</Label>
                <Input
                  id="name"
                  placeholder="Production API Key"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  disabled={creating}
                  autoFocus
                />
                <p className="text-xs text-muted-foreground">
                  A descriptive name to identify this API key
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowCreateDialog(false)}
                disabled={creating}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={creating}>
                {creating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {creating ? 'Creating...' : 'Create API Key'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!revokeId} onOpenChange={(open) => !open && setRevokeId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke API Key?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This API key will stop working immediately
              and all requests using it will be rejected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={revoking}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRevoke}
              disabled={revoking}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {revoking && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {revoking ? 'Revoking...' : 'Revoke'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={!!newApiKey} onOpenChange={closeKeyDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>API Key Created Successfully</DialogTitle>
            <DialogDescription>
              Save this API key securely. It won't be shown again.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>API Key</Label>
                <div className="flex items-center gap-2">
                  <Input
                    value={newApiKey?.key || ''}
                    type={showKey ? 'text' : 'password'}
                    readOnly
                    className="font-mono text-sm"
                  />
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => setShowKey(!showKey)}
                    title={showKey ? 'Hide key' : 'Show key'}
                  >
                    {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => newApiKey?.key && handleCopyKey(newApiKey.key)}
                    title="Copy key"
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
                <p className="text-sm text-muted-foreground">
                  Use this key in the X-API-Key header when sending events
                </p>
              </div>
              <div className="bg-muted p-3 rounded-lg">
                <p className="text-xs font-mono">
                  curl -X POST https://your-domain.com/api/v1/events \<br />
                  &nbsp;&nbsp;-H "X-API-Key: {newApiKey?.key || 'YOUR_KEY'}" \<br />
                  &nbsp;&nbsp;-H "Content-Type: application/json" \<br />
                  &nbsp;&nbsp;-d '{`{"type":"user.created","data":{"userId":"123"}}`}'
                </p>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={closeKeyDialog}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
