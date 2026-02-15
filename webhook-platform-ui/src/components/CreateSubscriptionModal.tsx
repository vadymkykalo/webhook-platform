import { useState, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { subscriptionsApi, SubscriptionResponse } from '../api/subscriptions.api';
import type { EndpointResponse } from '../types/api.types';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select } from './ui/select';
import { Switch } from './ui/switch';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';

interface CreateSubscriptionModalProps {
  projectId: string;
  endpoints: EndpointResponse[];
  subscription?: SubscriptionResponse | null;
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function CreateSubscriptionModal({
  projectId,
  endpoints,
  subscription,
  open,
  onClose,
  onSuccess,
}: CreateSubscriptionModalProps) {
  const [endpointId, setEndpointId] = useState('');
  const [eventType, setEventType] = useState('');
  const [enabled, setEnabled] = useState(true);
  const [orderingEnabled, setOrderingEnabled] = useState(false);
  const [maxAttempts, setMaxAttempts] = useState(7);
  const [timeoutSeconds, setTimeoutSeconds] = useState(30);
  const [retryDelays, setRetryDelays] = useState('60,300,900,3600,21600,86400');
  const [payloadTemplate, setPayloadTemplate] = useState('');
  const [customHeaders, setCustomHeaders] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (subscription) {
      setEndpointId(subscription.endpointId);
      setEventType(subscription.eventType);
      setEnabled(subscription.enabled);
      setOrderingEnabled(subscription.orderingEnabled || false);
      setMaxAttempts(subscription.maxAttempts || 7);
      setTimeoutSeconds(subscription.timeoutSeconds || 30);
      setRetryDelays(subscription.retryDelays || '60,300,900,3600,21600,86400');
      setPayloadTemplate(subscription.payloadTemplate || '');
      setCustomHeaders(subscription.customHeaders || '');
    } else {
      setEndpointId('');
      setEventType('');
      setEnabled(true);
      setOrderingEnabled(false);
      setMaxAttempts(7);
      setTimeoutSeconds(30);
      setRetryDelays('60,300,900,3600,21600,86400');
      setPayloadTemplate('');
      setCustomHeaders('');
    }
    setErrors({});
    setShowAdvanced(false);
  }, [subscription, open]);

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!endpointId) {
      newErrors.endpointId = 'Endpoint is required';
    }
    if (!eventType.trim()) {
      newErrors.eventType = 'Event type is required';
    } else if (!/^[a-z0-9._-]+$/i.test(eventType)) {
      newErrors.eventType = 'Use only letters, numbers, dots, hyphens, and underscores';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validate()) {
      return;
    }

    setSaving(true);
    try {
      const payload = {
        endpointId,
        eventType: eventType.trim(),
        enabled,
        orderingEnabled,
        maxAttempts,
        timeoutSeconds,
        retryDelays,
        payloadTemplate: payloadTemplate || undefined,
        customHeaders: customHeaders || undefined,
      };

      if (subscription) {
        await subscriptionsApi.update(projectId, subscription.id, payload);
        toast.success('Subscription updated successfully');
      } else {
        await subscriptionsApi.create(projectId, payload);
        toast.success('Subscription created successfully');
      }

      onClose();
      onSuccess();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to save subscription');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {subscription ? 'Edit Subscription' : 'Create Subscription'}
          </DialogTitle>
          <DialogDescription>
            Route events of a specific type to an endpoint
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="endpoint">
                Endpoint <span className="text-destructive">*</span>
              </Label>
              <Select
                id="endpoint"
                value={endpointId}
                onChange={(e) => setEndpointId(e.target.value)}
                disabled={saving}
                required
              >
                <option value="">Select an endpoint...</option>
                {endpoints.map(endpoint => (
                  <option key={endpoint.id} value={endpoint.id}>
                    {endpoint.url}
                  </option>
                ))}
              </Select>
              {errors.endpointId && (
                <p className="text-sm text-destructive">{errors.endpointId}</p>
              )}
              {endpoints.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  No endpoints available. Create an endpoint first.
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="eventType">
                Event Type <span className="text-destructive">*</span>
              </Label>
              <Input
                id="eventType"
                placeholder="e.g., user.created"
                value={eventType}
                onChange={(e) => setEventType(e.target.value)}
                disabled={saving}
                required
              />
              {errors.eventType && (
                <p className="text-sm text-destructive">{errors.eventType}</p>
              )}
              <p className="text-xs text-muted-foreground">
                Use dot notation (e.g., user.created, order.updated). One event type per subscription.
              </p>
            </div>

            <div className="flex items-center justify-between p-3 bg-muted/50 rounded-md">
              <div className="flex items-center gap-3">
                <Switch
                  id="enabled"
                  checked={enabled}
                  onCheckedChange={setEnabled}
                  disabled={saving}
                />
                <div>
                  <Label htmlFor="enabled" className="cursor-pointer">
                    Enabled
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    {enabled
                      ? 'Events will be delivered to this endpoint'
                      : 'Events will not be delivered'}
                  </p>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between p-3 bg-muted/50 rounded-md">
              <div className="flex items-center gap-3">
                <Switch
                  id="orderingEnabled"
                  checked={orderingEnabled}
                  onCheckedChange={setOrderingEnabled}
                  disabled={saving}
                />
                <div>
                  <Label htmlFor="orderingEnabled" className="cursor-pointer">
                    FIFO Ordering
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    {orderingEnabled
                      ? 'Events delivered in strict order (slower)'
                      : 'Events delivered as fast as possible'}
                  </p>
                </div>
              </div>
            </div>

            <button
              type="button"
              className="text-sm text-primary hover:underline"
              onClick={() => setShowAdvanced(!showAdvanced)}
            >
              {showAdvanced ? '▼ Hide' : '▶ Show'} Advanced Retry Settings
            </button>

            {showAdvanced && (
              <div className="space-y-4 p-4 border rounded-md bg-muted/30">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="maxAttempts">Max Attempts</Label>
                    <Input
                      id="maxAttempts"
                      type="number"
                      min={1}
                      max={20}
                      value={maxAttempts}
                      onChange={(e) => setMaxAttempts(parseInt(e.target.value) || 7)}
                      disabled={saving}
                    />
                    <p className="text-xs text-muted-foreground">1-20 attempts</p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="timeoutSeconds">Timeout (seconds)</Label>
                    <Input
                      id="timeoutSeconds"
                      type="number"
                      min={5}
                      max={120}
                      value={timeoutSeconds}
                      onChange={(e) => setTimeoutSeconds(parseInt(e.target.value) || 30)}
                      disabled={saving}
                    />
                    <p className="text-xs text-muted-foreground">5-120 seconds</p>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="retryDelays">Retry Delays (seconds)</Label>
                  <Input
                    id="retryDelays"
                    placeholder="60,300,900,3600,21600,86400"
                    value={retryDelays}
                    onChange={(e) => setRetryDelays(e.target.value)}
                    disabled={saving}
                  />
                  <p className="text-xs text-muted-foreground">
                    Comma-separated delays in seconds. Default: 1m, 5m, 15m, 1h, 6h, 24h
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="payloadTemplate">Payload Template (JSON)</Label>
                  <textarea
                    id="payloadTemplate"
                    className="w-full h-32 p-2 text-sm font-mono border rounded-md bg-background resize-y"
                    placeholder={`{\n  "event_id": "\${$.id}",\n  "data": "\${$.data}"\n}`}
                    value={payloadTemplate}
                    onChange={(e) => setPayloadTemplate(e.target.value)}
                    disabled={saving}
                  />
                  <p className="text-xs text-muted-foreground">
                    JSON template with JSONPath expressions in <code className="bg-muted px-1 rounded">${'{'}$.path{'}'}</code> syntax.
                    Leave empty to send original payload.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="customHeaders">Custom Headers (JSON)</Label>
                  <textarea
                    id="customHeaders"
                    className="w-full h-24 p-2 text-sm font-mono border rounded-md bg-background resize-y"
                    placeholder={`{\n  "X-Api-Key": "your-api-key",\n  "Authorization": "Bearer token"\n}`}
                    value={customHeaders}
                    onChange={(e) => setCustomHeaders(e.target.value)}
                    disabled={saving}
                  />
                  <p className="text-xs text-muted-foreground">
                    JSON object with header name/value pairs. Added to each webhook request.
                  </p>
                </div>
              </div>
            )}

            {!subscription && (
              <div className="bg-blue-50 border border-blue-200 rounded-md p-3">
                <p className="text-sm text-blue-900">
                  <strong>Tip:</strong> After creating this subscription, send test events from the Events page 
                  to verify delivery to your endpoint.
                </p>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={saving || endpoints.length === 0}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {saving ? 'Saving...' : (subscription ? 'Update' : 'Create')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
