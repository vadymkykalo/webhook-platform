import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Plus, Webhook, Calendar, Loader2, Trash2, Power, PowerOff, RefreshCw, Copy, ChevronRight, Zap, ShieldCheck, CheckCircle, AlertCircle, Clock, ShieldOff } from 'lucide-react';
import { toast } from 'sonner';
import { endpointsApi } from '../api/endpoints.api';
import { projectsApi } from '../api/projects.api';
import type { EndpointResponse, ProjectResponse } from '../types/api.types';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
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
import MtlsConfigModal from '../components/MtlsConfigModal';

export default function EndpointsPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const [project, setProject] = useState<ProjectResponse | null>(null);
  const [endpoints, setEndpoints] = useState<EndpointResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [url, setUrl] = useState('');
  const [description, setDescription] = useState('');
  const [rateLimitPerSecond, setRateLimitPerSecond] = useState<number | undefined>(undefined);
  const [allowedSourceIps, setAllowedSourceIps] = useState('');
  const [creating, setCreating] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [toggleId, setToggleId] = useState<string | null>(null);
  const [toggling, setToggling] = useState(false);
  const [rotateId, setRotateId] = useState<string | null>(null);
  const [rotating, setRotating] = useState(false);
  const [newSecret, setNewSecret] = useState<string | null>(null);
  const [testId, setTestId] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<any>(null);
  const [mtlsEndpoint, setMtlsEndpoint] = useState<EndpointResponse | null>(null);
  const [verifyingId, setVerifyingId] = useState<string | null>(null);
  const [skippingId, setSkippingId] = useState<string | null>(null);

  useEffect(() => {
    if (projectId) {
      loadData();
    }
  }, [projectId]);

  const loadData = async () => {
    if (!projectId) return;
    
    try {
      setLoading(true);
      const [projectData, endpointsData] = await Promise.all([
        projectsApi.get(projectId),
        endpointsApi.list(projectId),
      ]);
      setProject(projectData);
      setEndpoints(endpointsData);
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
      const secret = generateSecret();
      await endpointsApi.create(projectId, { 
        url, 
        description, 
        enabled: true, 
        secret,
        rateLimitPerSecond: rateLimitPerSecond || undefined,
        allowedSourceIps: allowedSourceIps || undefined,
      });
      setShowCreateDialog(false);
      setUrl('');
      setDescription('');
      setRateLimitPerSecond(undefined);
      setAllowedSourceIps('');
      setNewSecret(secret);
      toast.success('Endpoint created successfully');
      loadData();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to create endpoint');
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteId || !projectId) return;
    
    setDeleting(true);
    try {
      await endpointsApi.delete(projectId, deleteId);
      toast.success('Endpoint deleted successfully');
      setDeleteId(null);
      loadData();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to delete endpoint');
    } finally {
      setDeleting(false);
    }
  };

  const handleToggle = async () => {
    if (!toggleId || !projectId) return;
    
    const endpoint = endpoints.find((e) => e.id === toggleId);
    if (!endpoint) return;

    setToggling(true);
    try {
      await endpointsApi.update(projectId, toggleId, {
        url: endpoint.url,
        description: endpoint.description,
        enabled: !endpoint.enabled,
        rateLimitPerSecond: endpoint.rateLimitPerSecond,
      });
      toast.success(`Endpoint ${!endpoint.enabled ? 'enabled' : 'disabled'} successfully`);
      setToggleId(null);
      loadData();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to toggle endpoint');
    } finally {
      setToggling(false);
    }
  };

  const handleRotateSecret = async () => {
    if (!rotateId || !projectId) return;

    setRotating(true);
    try {
      const response = await endpointsApi.rotateSecret(projectId, rotateId);
      setNewSecret(response.secret || null);
      toast.success('Secret rotated successfully');
      loadData();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to rotate secret');
      setRotateId(null);
    } finally {
      setRotating(false);
    }
  };

  const handleCopySecret = () => {
    if (newSecret) {
      navigator.clipboard.writeText(newSecret);
      toast.success('Secret copied to clipboard');
    }
  };

  const closeSecretDialog = () => {
    setRotateId(null);
    setNewSecret(null);
  };

  const handleTest = async (endpointId: string) => {
    if (!projectId) return;
    
    setTestId(endpointId);
    setTesting(true);
    setTestResult(null);
    
    try {
      const result = await endpointsApi.test(projectId, endpointId);
      setTestResult(result);
      if (result.success) {
        toast.success(`Test successful: ${result.httpStatusCode} (${result.latencyMs}ms)`);
      } else {
        toast.error(`Test failed: ${result.message}`);
      }
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to test endpoint');
      setTestId(null);
    } finally {
      setTesting(false);
    }
  };

  const closeTestDialog = () => {
    setTestId(null);
    setTestResult(null);
  };

  const handleVerify = async (endpointId: string) => {
    if (!projectId) return;
    
    setVerifyingId(endpointId);
    try {
      const result = await endpointsApi.verify(projectId, endpointId);
      if (result.success) {
        toast.success('Endpoint verified successfully!');
        loadData();
      } else {
        toast.error(`Verification failed: ${result.message}`);
        loadData();
      }
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to verify endpoint');
    } finally {
      setVerifyingId(null);
    }
  };

  const handleSkipVerification = async (endpointId: string) => {
    if (!projectId) return;
    
    setSkippingId(endpointId);
    try {
      await endpointsApi.skipVerification(projectId, endpointId, 'Manually skipped by user');
      toast.success('Verification skipped');
      loadData();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to skip verification');
    } finally {
      setSkippingId(null);
    }
  };

  const getVerificationBadge = (status?: string) => {
    switch (status) {
      case 'VERIFIED':
        return (
          <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-1 text-xs font-medium text-green-700">
            <CheckCircle className="mr-1 h-3 w-3" />
            Verified
          </span>
        );
      case 'FAILED':
        return (
          <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-1 text-xs font-medium text-red-700">
            <AlertCircle className="mr-1 h-3 w-3" />
            Failed
          </span>
        );
      case 'SKIPPED':
        return (
          <span className="inline-flex items-center rounded-full bg-yellow-100 px-2 py-1 text-xs font-medium text-yellow-700">
            <ShieldOff className="mr-1 h-3 w-3" />
            Skipped
          </span>
        );
      case 'PENDING':
      default:
        return (
          <span className="inline-flex items-center rounded-full bg-orange-100 px-2 py-1 text-xs font-medium text-orange-700">
            <Clock className="mr-1 h-3 w-3" />
            Pending
          </span>
        );
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }).format(date);
  };

  const getToggleEndpoint = () => endpoints.find((e) => e.id === toggleId);

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-6xl">
        <div className="space-y-4">
          <div className="h-8 w-96 bg-muted animate-pulse rounded" />
          <div className="h-4 w-64 bg-muted animate-pulse rounded" />
          <div className="grid gap-4 mt-6">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-32 bg-muted animate-pulse rounded-lg" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-6xl">
        <div className="text-center py-16">
          <p className="text-muted-foreground">Project not found</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl">
      <div className="flex items-center text-sm text-muted-foreground mb-6">
        <button
          onClick={() => navigate('/projects')}
          className="hover:text-foreground transition-colors"
        >
          Projects
        </button>
        <ChevronRight className="h-4 w-4 mx-2" />
        <span className="text-foreground font-medium">{project.name}</span>
        <ChevronRight className="h-4 w-4 mx-2" />
        <span className="text-foreground">Endpoints</span>
      </div>

      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Endpoints</h1>
          <p className="text-muted-foreground mt-1">
            Manage webhook endpoints for {project.name}
          </p>
        </div>
        <Button onClick={() => setShowCreateDialog(true)} size="lg">
          <Plus className="mr-2 h-4 w-4" />
          New Endpoint
        </Button>
      </div>

      {endpoints.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <div className="rounded-full bg-primary/10 p-4 mb-4">
              <Webhook className="h-10 w-10 text-primary" />
            </div>
            <h3 className="text-xl font-semibold mb-2">No endpoints yet</h3>
            <p className="text-muted-foreground text-center mb-6 max-w-sm">
              Create your first endpoint to start receiving webhooks
            </p>
            <Button onClick={() => setShowCreateDialog(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Create Your First Endpoint
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {endpoints.map((endpoint) => (
            <Card key={endpoint.id} className="hover:shadow-md transition-shadow">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <CardTitle className="text-xl flex items-center gap-3">
                      <Webhook className="h-5 w-5 text-primary" />
                      <div className="flex items-center gap-2">
                        {endpoint.url}
                        {endpoint.enabled ? (
                          <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-1 text-xs font-medium text-green-700">
                            <Power className="mr-1 h-3 w-3" />
                            Enabled
                          </span>
                        ) : (
                          <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-1 text-xs font-medium text-gray-700">
                            <PowerOff className="mr-1 h-3 w-3" />
                            Disabled
                          </span>
                        )}
                        {endpoint.mtlsEnabled && (
                          <span className="inline-flex items-center rounded-full bg-blue-100 px-2 py-1 text-xs font-medium text-blue-700">
                            <ShieldCheck className="mr-1 h-3 w-3" />
                            mTLS
                          </span>
                        )}
                        {getVerificationBadge(endpoint.verificationStatus)}
                      </div>
                    </CardTitle>
                    {endpoint.description && (
                      <p className="text-sm text-muted-foreground mt-2">
                        {endpoint.description}
                      </p>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleTest(endpoint.id)}
                      title="Test Endpoint"
                      disabled={testing && testId === endpoint.id}
                    >
                      {testing && testId === endpoint.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Zap className="h-4 w-4 text-purple-600" />
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setToggleId(endpoint.id)}
                      title={endpoint.enabled ? 'Disable' : 'Enable'}
                    >
                      {endpoint.enabled ? (
                        <PowerOff className="h-4 w-4 text-orange-600" />
                      ) : (
                        <Power className="h-4 w-4 text-green-600" />
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setRotateId(endpoint.id)}
                      title="Rotate Secret"
                    >
                      <RefreshCw className="h-4 w-4 text-blue-600" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setMtlsEndpoint(endpoint)}
                      title={endpoint.mtlsEnabled ? 'Configure mTLS' : 'Enable mTLS'}
                    >
                      <ShieldCheck className={`h-4 w-4 ${endpoint.mtlsEnabled ? 'text-blue-600' : 'text-gray-400'}`} />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setDeleteId(endpoint.id)}
                      title="Delete Endpoint"
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div className="flex items-center text-muted-foreground">
                    <Calendar className="mr-2 h-4 w-4" />
                    Created on {formatDate(endpoint.createdAt)}
                  </div>
                  {endpoint.rateLimitPerSecond && (
                    <div className="flex items-center text-muted-foreground">
                      <span className="font-medium text-foreground mr-2">
                        Rate Limit:
                      </span>
                      {endpoint.rateLimitPerSecond} req/s
                    </div>
                  )}
                </div>
                
                {(endpoint.verificationStatus === 'PENDING' || endpoint.verificationStatus === 'FAILED') && (
                  <div className="mt-4 p-3 bg-muted/50 rounded-lg border">
                    <div className="flex items-center justify-between">
                      <div className="flex-1 mr-4">
                        <p className="text-sm font-medium">
                          {endpoint.verificationStatus === 'PENDING' 
                            ? 'Endpoint verification required' 
                            : 'Verification failed - retry?'}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          Your endpoint must respond to: <code className="bg-muted px-1 rounded">POST {"{"}"type": "webhook.verification", "challenge": "..."{"}"}.</code>
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Return the <code className="bg-muted px-1 rounded">challenge</code> value in your response body.
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleSkipVerification(endpoint.id)}
                          disabled={skippingId === endpoint.id}
                        >
                          {skippingId === endpoint.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            'Skip'
                          )}
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => handleVerify(endpoint.id)}
                          disabled={verifyingId === endpoint.id}
                        >
                          {verifyingId === endpoint.id ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          ) : (
                            <CheckCircle className="mr-2 h-4 w-4" />
                          )}
                          Verify Now
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Endpoint</DialogTitle>
            <DialogDescription>
              Add a new webhook endpoint to receive events
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreate}>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="url">Endpoint URL</Label>
                <Input
                  id="url"
                  type="url"
                  placeholder="https://example.com/webhooks"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  required
                  disabled={creating}
                  autoFocus
                />
                <p className="text-xs text-muted-foreground">
                  The URL where webhook events will be sent
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">Description (optional)</Label>
                <Textarea
                  id="description"
                  placeholder="Production webhook endpoint"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  disabled={creating}
                  rows={2}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="rateLimit">Rate Limit (optional)</Label>
                <Input
                  id="rateLimit"
                  type="number"
                  min="1"
                  max="1000"
                  placeholder="Requests per second"
                  value={rateLimitPerSecond || ''}
                  onChange={(e) => setRateLimitPerSecond(e.target.value ? parseInt(e.target.value) : undefined)}
                  disabled={creating}
                />
                <p className="text-xs text-muted-foreground">
                  Maximum requests per second (leave empty for no limit)
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="allowedSourceIps">Allowed Source IPs (optional)</Label>
                <Input
                  id="allowedSourceIps"
                  placeholder="192.168.1.1, 10.0.0.0/8"
                  value={allowedSourceIps}
                  onChange={(e) => setAllowedSourceIps(e.target.value)}
                  disabled={creating}
                />
                <p className="text-xs text-muted-foreground">
                  For documentation only. Record which IPs your endpoint expects webhooks from.
                  This helps with compliance audits and firewall configuration.
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
                {creating ? 'Creating...' : 'Create Endpoint'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete endpoint?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This endpoint will stop receiving webhooks immediately.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {deleting ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!toggleId && !newSecret} onOpenChange={(open) => !open && setToggleId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {getToggleEndpoint()?.enabled ? 'Disable' : 'Enable'} endpoint?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {getToggleEndpoint()?.enabled
                ? 'This endpoint will stop receiving webhooks until re-enabled.'
                : 'This endpoint will start receiving webhooks again.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={toggling}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleToggle} disabled={toggling}>
              {toggling && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {toggling ? 'Processing...' : 'Confirm'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!rotateId && !newSecret} onOpenChange={(open) => !open && setRotateId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Rotate webhook secret?</AlertDialogTitle>
            <AlertDialogDescription>
              A new secret will be generated. You'll need to update your webhook signature verification with the new secret.
              The old secret will stop working immediately.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={rotating}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleRotateSecret} disabled={rotating}>
              {rotating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {rotating ? 'Rotating...' : 'Rotate Secret'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={!!newSecret} onOpenChange={closeSecretDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Webhook Secret</DialogTitle>
            <DialogDescription>
              Save this secret securely. It won't be shown again.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <div className="flex items-center gap-2">
              <Input
                value={newSecret || ''}
                readOnly
                className="font-mono text-sm"
              />
              <Button
                variant="outline"
                size="icon"
                onClick={handleCopySecret}
                title="Copy secret"
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-sm text-muted-foreground mt-2">
              Use this secret to verify webhook signatures in your application.
            </p>
          </div>
          <DialogFooter>
            <Button onClick={closeSecretDialog}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!testResult} onOpenChange={closeTestDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Endpoint Test Result</DialogTitle>
            <DialogDescription>
              Test webhook was sent to the endpoint
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="flex items-center justify-between p-4 rounded-lg bg-muted">
              <div className="flex items-center gap-3">
                {testResult?.success ? (
                  <>
                    <div className="rounded-full bg-green-100 p-2">
                      <Power className="h-5 w-5 text-green-600" />
                    </div>
                    <div>
                      <div className="font-semibold text-green-700">Test Successful</div>
                      <div className="text-sm text-muted-foreground">
                        HTTP {testResult.httpStatusCode} • {testResult.latencyMs}ms
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="rounded-full bg-red-100 p-2">
                      <PowerOff className="h-5 w-5 text-red-600" />
                    </div>
                    <div>
                      <div className="font-semibold text-red-700">Test Failed</div>
                      <div className="text-sm text-muted-foreground">
                        {testResult?.latencyMs ? `${testResult.latencyMs}ms` : 'No response'}
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>

            {testResult?.httpStatusCode && (
              <div>
                <Label>HTTP Status Code</Label>
                <div className="mt-1 p-3 bg-muted rounded-md font-mono text-sm">
                  {testResult.httpStatusCode}
                </div>
              </div>
            )}

            {testResult?.responseBody && (
              <div>
                <Label>Response Body</Label>
                <div className="mt-1 p-3 bg-muted rounded-md font-mono text-xs max-h-48 overflow-auto">
                  {testResult.responseBody}
                </div>
              </div>
            )}

            {testResult?.errorMessage && (
              <div>
                <Label>Error Message</Label>
                <div className="mt-1 p-3 bg-red-50 text-red-700 rounded-md text-sm">
                  {testResult.errorMessage}
                </div>
              </div>
            )}

            <div>
              <Label>Message</Label>
              <div className="mt-1 p-3 bg-muted rounded-md text-sm">
                {testResult?.message}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={closeTestDialog}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {mtlsEndpoint && projectId && (
        <MtlsConfigModal
          open={!!mtlsEndpoint}
          onOpenChange={(open) => !open && setMtlsEndpoint(null)}
          projectId={projectId}
          endpoint={mtlsEndpoint}
          onUpdate={(updated) => {
            setEndpoints(endpoints.map(e => e.id === updated.id ? updated : e));
            setMtlsEndpoint(null);
          }}
        />
      )}
    </div>
  );
}

function generateSecret(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
}
