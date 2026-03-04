import { useState, useEffect, useRef } from 'react';
import { Loader2, FileJson2, CheckCircle2, AlertTriangle, Info } from 'lucide-react';
import { showApiError, showSuccess } from '../lib/toast';
import { subscriptionsApi, SubscriptionResponse } from '../api/subscriptions.api';
import { useTransformations, useEventTypes, useSchemaVersions } from '../api/queries';
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
  const [transformationId, setTransformationId] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const { data: transformations = [] } = useTransformations(projectId);
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
      setTransformationId(subscription.transformationId || '');
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
      setTransformationId('');
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
    } else if (!/^(\*{1,2}|[a-z][a-z0-9_]*)(\.(\*{1,2}|[a-z][a-z0-9_]*))*$/.test(eventType)) {
      newErrors.eventType = 'Lowercase with dots/underscores, wildcards * and ** allowed (e.g. order.*, **)';
    }
    if (maxAttempts < 1 || maxAttempts > 20) {
      newErrors.maxAttempts = 'Must be between 1 and 20';
    }
    if (timeoutSeconds < 1 || timeoutSeconds > 60) {
      newErrors.timeoutSeconds = 'Must be between 1 and 60';
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
        transformationId: transformationId || null,
      };

      if (subscription) {
        await subscriptionsApi.update(projectId, subscription.id, payload);
        showSuccess('Subscription updated successfully');
      } else {
        await subscriptionsApi.create(projectId, payload);
        showSuccess('Subscription created successfully');
      }

      onClose();
      onSuccess();
    } catch (err: any) {
      showApiError(err, 'toast.errors.server');
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

            <EventTypeField
              projectId={projectId}
              eventType={eventType}
              onChange={setEventType}
              disabled={saving}
              error={errors.eventType}
            />

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
                    {errors.maxAttempts ? (
                      <p className="text-xs text-destructive">{errors.maxAttempts}</p>
                    ) : (
                      <p className="text-xs text-muted-foreground">1–20 attempts</p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="timeoutSeconds">Timeout (seconds)</Label>
                    <Input
                      id="timeoutSeconds"
                      type="number"
                      min={1}
                      max={60}
                      value={timeoutSeconds}
                      onChange={(e) => setTimeoutSeconds(parseInt(e.target.value) || 30)}
                      disabled={saving}
                    />
                    {errors.timeoutSeconds ? (
                      <p className="text-xs text-destructive">{errors.timeoutSeconds}</p>
                    ) : (
                      <p className="text-xs text-muted-foreground">1–60 seconds</p>
                    )}
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
                  <Label htmlFor="transformationId">Transformation</Label>
                  <Select
                    id="transformationId"
                    value={transformationId}
                    onChange={(e) => setTransformationId(e.target.value)}
                    disabled={saving}
                  >
                    <option value="">None (use inline template below)</option>
                    {transformations.filter(tr => tr.enabled).map(tr => (
                      <option key={tr.id} value={tr.id}>{tr.name} (v{tr.version})</option>
                    ))}
                  </Select>
                  {transformationId && (() => {
                    const selected = transformations.find(tr => tr.id === transformationId);
                    return selected ? (
                      <div className="rounded-md border bg-muted/30 p-2.5 text-xs space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{selected.name}</span>
                          <span className="text-muted-foreground">v{selected.version}</span>
                        </div>
                        {selected.description && <p className="text-muted-foreground">{selected.description}</p>}
                      </div>
                    ) : null;
                  })()}
                  <p className="text-xs text-muted-foreground">
                    {transformationId
                      ? 'Saved transformation takes priority over the inline template below.'
                      : 'Select a reusable transformation or define an inline template below.'}
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

// ── Schema-Aware Event Type Field ──────────────────────────────────

function EventTypeField({
  projectId,
  eventType,
  onChange,
  disabled,
  error,
}: {
  projectId: string;
  eventType: string;
  onChange: (v: string) => void;
  disabled: boolean;
  error?: string;
}) {
  const { data: catalogTypes = [] } = useEventTypes(projectId);
  const [focused, setFocused] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Filter catalog by typed value
  const query = eventType.toLowerCase();
  const suggestions = catalogTypes.filter(
    (et) => et.name.toLowerCase().includes(query) || !query
  );

  // Find exact match for schema hint
  const exactMatch = catalogTypes.find(
    (et) => et.name === eventType.trim()
  );

  const showDropdown = focused && suggestions.length > 0 && !exactMatch;

  // Close dropdown on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setFocused(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  return (
    <div className="space-y-2" ref={wrapperRef}>
      <Label htmlFor="eventType">
        Event Type <span className="text-destructive">*</span>
      </Label>
      <div className="relative">
        <Input
          id="eventType"
          placeholder="e.g., user.created, order.*, **"
          value={eventType}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setFocused(true)}
          disabled={disabled}
          required
          autoComplete="off"
        />

        {/* Autocomplete dropdown */}
        {showDropdown && (
          <div className="absolute z-50 w-full mt-1 max-h-48 overflow-y-auto rounded-lg border bg-popover shadow-lg">
            {suggestions.map((et) => (
              <button
                key={et.id}
                type="button"
                className="w-full text-left px-3 py-2 text-sm hover:bg-accent transition-colors border-b last:border-b-0"
                onMouseDown={(e) => {
                  e.preventDefault();
                  onChange(et.name);
                  setFocused(false);
                }}
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs font-medium">{et.name}</span>
                  <div className="flex items-center gap-1.5">
                    {et.latestVersion != null && (
                      <span className="text-[10px] text-muted-foreground">v{et.latestVersion}</span>
                    )}
                    {et.activeVersionStatus === 'ACTIVE' && (
                      <CheckCircle2 className="h-3 w-3 text-green-500" />
                    )}
                    {et.hasBreakingChanges && (
                      <AlertTriangle className="h-3 w-3 text-amber-500" />
                    )}
                  </div>
                </div>
                {et.description && (
                  <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-1">{et.description}</p>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {/* Schema info badge for exact match */}
      {exactMatch && (
        <div className="rounded-lg border bg-primary/5 overflow-hidden">
          <div className="flex items-start gap-2 p-2.5">
            <FileJson2 className="h-3.5 w-3.5 text-primary mt-0.5 shrink-0" />
            <div className="text-xs space-y-0.5 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-mono font-semibold">{exactMatch.name}</span>
                {exactMatch.latestVersion != null && (
                  <span className="text-muted-foreground">v{exactMatch.latestVersion}</span>
                )}
                {exactMatch.activeVersionStatus === 'ACTIVE' && (
                  <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-green-700 dark:text-green-400 bg-green-100 dark:bg-green-900/30 px-1.5 py-0.5 rounded-full">
                    <CheckCircle2 className="h-2.5 w-2.5" /> Active
                  </span>
                )}
                {exactMatch.hasBreakingChanges && (
                  <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/30 px-1.5 py-0.5 rounded-full">
                    <AlertTriangle className="h-2.5 w-2.5" /> Breaking
                  </span>
                )}
              </div>
              {exactMatch.description && (
                <p className="text-muted-foreground">{exactMatch.description}</p>
              )}
            </div>
          </div>
          <SchemaFieldsPreview projectId={projectId} eventTypeId={exactMatch.id} />
        </div>
      )}

      {/* Hint when no match and catalogTypes exist */}
      {!exactMatch && eventType.trim() && catalogTypes.length > 0 && !focused && (
        <p className="text-xs text-muted-foreground flex items-center gap-1">
          <Info className="h-3 w-3" />
          No matching schema found — this event type has no registered schema.
        </p>
      )}

      <p className="text-xs text-muted-foreground">
        Dot notation: <code className="bg-muted px-1 rounded">order.created</code> exact, <code className="bg-muted px-1 rounded">order.*</code> one level, <code className="bg-muted px-1 rounded">order.**</code> all nested, <code className="bg-muted px-1 rounded">**</code> catch-all.
      </p>
    </div>
  );
}

// ── Schema Fields Preview ──────────────────────────────────────────

interface SchemaField {
  name: string;
  type: string;
  required: boolean;
}

function parseSchemaFields(schemaJson: string): SchemaField[] {
  try {
    const schema = JSON.parse(schemaJson);
    const props = schema.properties || {};
    const required = new Set<string>(schema.required || []);
    return Object.entries(props).map(([name, def]: [string, any]) => ({
      name,
      type: Array.isArray(def?.type) ? def.type.join(' | ') : (def?.type || 'any'),
      required: required.has(name),
    }));
  } catch {
    return [];
  }
}

function SchemaFieldsPreview({ projectId, eventTypeId }: { projectId: string; eventTypeId: string }) {
  const { data: versions, isLoading } = useSchemaVersions(projectId, eventTypeId);

  // Find the latest active version, or just the latest
  const latest = versions
    ?.slice()
    .sort((a, b) => b.version - a.version)
    .find(v => v.status === 'ACTIVE')
    || versions?.[0];

  if (isLoading) {
    return (
      <div className="px-2.5 pb-2 flex items-center gap-1.5 text-[10px] text-muted-foreground">
        <Loader2 className="h-2.5 w-2.5 animate-spin" /> Loading schema…
      </div>
    );
  }

  if (!latest) return null;

  const fields = parseSchemaFields(latest.schemaJson);
  if (fields.length === 0) return null;

  const TYPE_COLORS: Record<string, string> = {
    string: 'text-green-600 dark:text-green-400',
    number: 'text-blue-600 dark:text-blue-400',
    integer: 'text-blue-600 dark:text-blue-400',
    boolean: 'text-purple-600 dark:text-purple-400',
    object: 'text-orange-600 dark:text-orange-400',
    array: 'text-cyan-600 dark:text-cyan-400',
  };

  return (
    <div className="border-t border-primary/10 px-2.5 py-2 space-y-1">
      <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
        Payload fields (v{latest.version})
      </p>
      <div className="flex flex-wrap gap-1">
        {fields.slice(0, 12).map((f) => (
          <span
            key={f.name}
            className="inline-flex items-center gap-1 text-[10px] font-mono bg-muted/60 px-1.5 py-0.5 rounded"
          >
            <span className="font-medium">{f.name}</span>
            <span className={TYPE_COLORS[f.type] || 'text-muted-foreground'}>{f.type}</span>
            {f.required && <span className="text-destructive">*</span>}
          </span>
        ))}
        {fields.length > 12 && (
          <span className="text-[10px] text-muted-foreground self-center">
            +{fields.length - 12} more
          </span>
        )}
      </div>
    </div>
  );
}
