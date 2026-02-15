import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Plus, Trash2, Copy, RefreshCw, Loader2, Clock, ExternalLink, ChevronDown, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import { testEndpointsApi, TestEndpointResponse, CapturedRequestResponse } from '../api/testEndpoints.api';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
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

export default function TestEndpointsPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const [endpoints, setEndpoints] = useState<TestEndpointResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [selectedEndpoint, setSelectedEndpoint] = useState<string | null>(null);
  const [requests, setRequests] = useState<CapturedRequestResponse[]>([]);
  const [loadingRequests, setLoadingRequests] = useState(false);
  const [expandedRequest, setExpandedRequest] = useState<string | null>(null);

  useEffect(() => {
    if (projectId) {
      loadEndpoints();
    }
  }, [projectId]);

  useEffect(() => {
    if (selectedEndpoint && projectId) {
      loadRequests(selectedEndpoint);
    }
  }, [selectedEndpoint]);

  const loadEndpoints = async () => {
    if (!projectId) return;
    try {
      setLoading(true);
      const data = await testEndpointsApi.list(projectId);
      setEndpoints(data);
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to load test endpoints');
    } finally {
      setLoading(false);
    }
  };

  const loadRequests = async (endpointId: string) => {
    if (!projectId) return;
    try {
      setLoadingRequests(true);
      const data = await testEndpointsApi.getRequests(projectId, endpointId);
      setRequests(data.content);
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to load requests');
    } finally {
      setLoadingRequests(false);
    }
  };

  const handleCreate = async () => {
    if (!projectId) return;
    try {
      setCreating(true);
      const endpoint = await testEndpointsApi.create(projectId);
      setEndpoints([endpoint, ...endpoints]);
      toast.success('Test endpoint created');
      copyToClipboard(endpoint.url);
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to create test endpoint');
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteId || !projectId) return;
    try {
      setDeleting(true);
      await testEndpointsApi.delete(projectId, deleteId);
      setEndpoints(endpoints.filter(e => e.id !== deleteId));
      if (selectedEndpoint === deleteId) {
        setSelectedEndpoint(null);
        setRequests([]);
      }
      toast.success('Test endpoint deleted');
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to delete');
    } finally {
      setDeleting(false);
      setDeleteId(null);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('URL copied to clipboard');
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  const getTimeRemaining = (expiresAt: string) => {
    const now = new Date();
    const expires = new Date(expiresAt);
    const diff = expires.getTime() - now.getTime();
    if (diff <= 0) return 'Expired';
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    if (hours > 0) return `${hours}h ${minutes}m remaining`;
    return `${minutes}m remaining`;
  };

  const getMethodColor = (method: string) => {
    switch (method.toUpperCase()) {
      case 'GET': return 'bg-green-100 text-green-800';
      case 'POST': return 'bg-blue-100 text-blue-800';
      case 'PUT': return 'bg-yellow-100 text-yellow-800';
      case 'PATCH': return 'bg-orange-100 text-orange-800';
      case 'DELETE': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const parseHeaders = (headers?: string) => {
    if (!headers) return {};
    try {
      return JSON.parse(headers);
    } catch {
      return {};
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Test Endpoints</h1>
          <p className="text-muted-foreground">
            Create temporary endpoints to capture and inspect webhook requests
          </p>
        </div>
        <Button onClick={handleCreate} disabled={creating}>
          {creating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
          Create Test Endpoint
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Endpoints List */}
        <div className="space-y-4">
          <h2 className="text-lg font-semibold">Endpoints</h2>
          {endpoints.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                No test endpoints yet. Create one to start capturing requests.
              </CardContent>
            </Card>
          ) : (
            endpoints.map((endpoint) => (
              <Card 
                key={endpoint.id}
                className={`cursor-pointer transition-colors ${selectedEndpoint === endpoint.id ? 'border-primary' : 'hover:border-muted-foreground/50'}`}
                onClick={() => setSelectedEndpoint(endpoint.id)}
              >
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <CardTitle className="text-sm font-mono truncate">
                        {endpoint.slug}
                      </CardTitle>
                      <CardDescription className="flex items-center gap-2 mt-1">
                        <Clock className="h-3 w-3" />
                        {getTimeRemaining(endpoint.expiresAt)}
                      </CardDescription>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          copyToClipboard(endpoint.url);
                        }}
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleteId(endpoint.id);
                        }}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="flex items-center gap-2 text-xs">
                    <code className="bg-muted px-2 py-1 rounded text-xs truncate flex-1">
                      {endpoint.url}
                    </code>
                    <span className="bg-primary/10 text-primary px-2 py-1 rounded font-medium">
                      {endpoint.requestCount} requests
                    </span>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>

        {/* Captured Requests */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Captured Requests</h2>
            {selectedEndpoint && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => loadRequests(selectedEndpoint)}
                disabled={loadingRequests}
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${loadingRequests ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
            )}
          </div>

          {!selectedEndpoint ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                Select an endpoint to view captured requests
              </CardContent>
            </Card>
          ) : loadingRequests ? (
            <div className="flex items-center justify-center h-32">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : requests.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                No requests captured yet. Send a request to the endpoint URL.
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {requests.map((req) => (
                <Card key={req.id}>
                  <CardHeader 
                    className="py-3 cursor-pointer"
                    onClick={() => setExpandedRequest(expandedRequest === req.id ? null : req.id)}
                  >
                    <div className="flex items-center gap-3">
                      {expandedRequest === req.id ? (
                        <ChevronDown className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      )}
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${getMethodColor(req.method)}`}>
                        {req.method}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {formatDate(req.receivedAt)}
                      </span>
                      {req.sourceIp && (
                        <span className="text-xs text-muted-foreground ml-auto">
                          {req.sourceIp}
                        </span>
                      )}
                    </div>
                  </CardHeader>
                  {expandedRequest === req.id && (
                    <CardContent className="pt-0 space-y-4">
                      {req.headers && (
                        <div>
                          <h4 className="text-sm font-medium mb-2">Headers</h4>
                          <pre className="bg-muted p-3 rounded text-xs overflow-x-auto max-h-40">
                            {JSON.stringify(parseHeaders(req.headers), null, 2)}
                          </pre>
                        </div>
                      )}
                      {req.body && (
                        <div>
                          <h4 className="text-sm font-medium mb-2">Body</h4>
                          <pre className="bg-muted p-3 rounded text-xs overflow-x-auto max-h-60">
                            {(() => {
                              try {
                                return JSON.stringify(JSON.parse(req.body), null, 2);
                              } catch {
                                return req.body;
                              }
                            })()}
                          </pre>
                        </div>
                      )}
                      {req.queryString && (
                        <div>
                          <h4 className="text-sm font-medium mb-2">Query String</h4>
                          <code className="bg-muted px-2 py-1 rounded text-xs">
                            ?{req.queryString}
                          </code>
                        </div>
                      )}
                    </CardContent>
                  )}
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>

      <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete test endpoint?</AlertDialogTitle>
            <AlertDialogDescription>
              This will delete the endpoint and all captured requests.
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
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
