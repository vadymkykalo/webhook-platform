import { useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  Wand2, Play, AlertCircle, CheckCircle2, Copy, RotateCcw, FileJson, ArrowRight, Download, Loader2, Zap, Send, Globe, Shield
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { showSuccess, showApiError } from '../lib/toast';
import { useTransformPreview, useTransformations, useEvents, useEndpoints, useDeliveryDryRun } from '../api/queries';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import { Select } from '../components/ui/select';
import JsonEditor from '../components/JsonEditor';
import type { DeliveryDryRunResponse } from '../api/transform.api';

const SAMPLE_PAYLOAD = JSON.stringify({
  event: "order.completed",
  data: {
    orderId: "ord_12345",
    customer: { name: "Jane Doe", email: "jane@example.com" },
    items: [
      { sku: "SKU-001", name: "Widget", qty: 2, price: 19.99 },
      { sku: "SKU-002", name: "Gadget", qty: 1, price: 49.99 }
    ],
    total: 89.97,
    currency: "USD"
  },
  metadata: { source: "checkout-v2", region: "us-east-1" }
}, null, 2);

const HINT_EXPRESSION_KEYS = [
  { expr: '$.data', descKey: 'transform.hints.extractData' },
  { expr: '$.data.items', descKey: 'transform.hints.extractItems' },
  { expr: '$.data.customer', descKey: 'transform.hints.extractCustomer' },
  { expr: '$.metadata', descKey: 'transform.hints.extractMetadata' },
  { expr: '$', descKey: 'transform.hints.passThrough' },
];

export default function TransformStudioPage() {
  const { t } = useTranslation();
  const { projectId } = useParams<{ projectId: string }>();

  const [inputPayload, setInputPayload] = useState(SAMPLE_PAYLOAD);
  const [transformExpr, setTransformExpr] = useState('');
  const [customHeaders, setCustomHeaders] = useState('');
  const [outputPayload, setOutputPayload] = useState<string | null>(null);
  const [outputHeaders, setOutputHeaders] = useState<string | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [success, setSuccess] = useState<boolean | null>(null);
  const [selectedTransformationId, setSelectedTransformationId] = useState('');
  const [showEventPicker, setShowEventPicker] = useState(false);
  const [eventSearch, setEventSearch] = useState('');
  const [eventPageSize, setEventPageSize] = useState(10);
  const [dryRunEndpointId, setDryRunEndpointId] = useState('');
  const [dryRunEventType, setDryRunEventType] = useState('order.completed');
  const [dryRunResult, setDryRunResult] = useState<DeliveryDryRunResponse | null>(null);
  const [showDryRun, setShowDryRun] = useState(false);

  const preview = useTransformPreview(projectId!);
  const dryRun = useDeliveryDryRun(projectId!);
  const { data: transformations = [] } = useTransformations(projectId!);
  const { data: endpoints = [] } = useEndpoints(projectId);
  const { data: recentEventsData, isLoading: eventsLoading } = useEvents(projectId, 0, eventPageSize, 'createdAt,desc', eventSearch || undefined);
  const recentEvents = recentEventsData?.content ?? [];
  const hasMoreEvents = recentEventsData ? !recentEventsData.last : false;

  const handleRun = async () => {
    setErrors([]);
    setSuccess(null);
    setOutputPayload(null);
    setOutputHeaders(null);
    try {
      const isJsonTemplate = transformExpr.trim().startsWith('{') || transformExpr.trim().startsWith('[');
      const result = await preview.mutateAsync({
        inputPayload,
        customHeaders: customHeaders || undefined,
        // Saved transformation by ID — highest priority
        transformationId: selectedTransformationId || undefined,
        // Inline JSON template with ${$.path} expressions
        template: !selectedTransformationId && isJsonTemplate ? transformExpr : undefined,
        // Simple JSONPath pointer ($.data)
        transformExpression: !selectedTransformationId && !isJsonTemplate && transformExpr ? transformExpr : undefined,
      });
      setOutputPayload(result.outputPayload);
      setOutputHeaders(result.outputHeaders);
      setErrors(result.errors);
      setSuccess(result.success);
    } catch (err: any) {
      showApiError(err, 'transform.previewFailed');
    }
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    showSuccess(t('common.copied'));
  };

  const handleReset = () => {
    setInputPayload(SAMPLE_PAYLOAD);
    setTransformExpr('');
    setCustomHeaders('');
    setOutputPayload(null);
    setOutputHeaders(null);
    setErrors([]);
    setSuccess(null);
    setSelectedTransformationId('');
  };

  const formatJson = (text: string) => {
    try { return JSON.stringify(JSON.parse(text), null, 2); } catch { return text; }
  };

  const handleFormatInput = () => {
    setInputPayload(formatJson(inputPayload));
  };

  const handleLoadEvent = (payload: string) => {
    try {
      setInputPayload(JSON.stringify(JSON.parse(payload), null, 2));
    } catch {
      setInputPayload(payload);
    }
    setShowEventPicker(false);
  };

  const handleDryRun = async () => {
    setDryRunResult(null);
    try {
      const isJsonTemplate = transformExpr.trim().startsWith('{') || transformExpr.trim().startsWith('[');
      const result = await dryRun.mutateAsync({
        payload: inputPayload,
        transformationId: selectedTransformationId || undefined,
        payloadTemplate: !selectedTransformationId && isJsonTemplate ? transformExpr : undefined,
        customHeaders: customHeaders || undefined,
        endpointId: dryRunEndpointId || undefined,
        eventType: dryRunEventType || undefined,
      });
      setDryRunResult(result);
    } catch (err: any) {
      showApiError(err, 'transform.dryRunFailed');
    }
  };

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-lg bg-violet-500/10 flex items-center justify-center">
          <Wand2 className="h-5 w-5 text-violet-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t('transform.title', 'Transform Studio')}</h1>
          <p className="text-sm text-muted-foreground">{t('transform.subtitle', 'Test payload transformations for incoming destinations')}</p>
        </div>
      </div>

      {/* Expression hints */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">{t('transform.hints', 'Quick Expressions')}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {HINT_EXPRESSION_KEYS.map((h) => (
              <button
                key={h.expr}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs border hover:bg-accent transition-colors"
                onClick={() => setTransformExpr(h.expr)}
                title={t(h.descKey)}
              >
                <code className="font-mono text-primary">{h.expr}</code>
                <span className="text-muted-foreground">— {t(h.descKey)}</span>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Left: Input */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-2 flex flex-row items-center justify-between">
              <CardTitle className="text-sm flex items-center gap-2">
                <FileJson className="h-4 w-4" /> {t('transform.inputPayload', 'Input Payload')}
              </CardTitle>
              <div className="flex gap-1">
                <Button variant="ghost" size="sm" onClick={() => setShowEventPicker(!showEventPicker)} title={t('transform.loadEvent', 'Load real event')}>
                  <Download className="h-3.5 w-3.5 mr-1" /> {t('transform.loadEvent', 'Load Event')}
                </Button>
                <Button variant="ghost" size="sm" onClick={handleFormatInput}>{t('transform.format', 'Format')}</Button>
                <Button variant="ghost" size="sm" onClick={() => handleCopy(inputPayload)}>
                  <Copy className="h-3.5 w-3.5" />
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {showEventPicker && (
                <div className="mb-3 border rounded-lg bg-muted/30 p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-medium">{t('transform.recentEvents', 'Recent Events')}</p>
                    <Button variant="ghost" size="sm" className="h-5 text-[10px] px-1.5" onClick={() => setShowEventPicker(false)}>✕</Button>
                  </div>
                  <Input
                    className="h-7 text-xs font-mono"
                    placeholder={t('transform.searchEvents', 'Filter by event type...')}
                    value={eventSearch}
                    onChange={(e) => { setEventSearch(e.target.value); setEventPageSize(10); }}
                  />
                  {eventsLoading ? (
                    <div className="flex items-center justify-center py-4"><Loader2 className="h-4 w-4 animate-spin" /></div>
                  ) : recentEvents.length === 0 ? (
                    <p className="text-xs text-muted-foreground py-2">{t('transform.noEvents', 'No events found in this project')}</p>
                  ) : (
                    <div className="space-y-1 max-h-[240px] overflow-y-auto">
                      {recentEvents.map((evt) => (
                        <button
                          key={evt.id}
                          className="w-full text-left px-2.5 py-2 rounded-md text-xs hover:bg-accent transition-colors border border-transparent hover:border-border"
                          onClick={() => handleLoadEvent(evt.payload)}
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-medium font-mono text-primary">{evt.eventType}</span>
                            <span className="text-[10px] text-muted-foreground">{new Date(evt.createdAt).toLocaleString()}</span>
                          </div>
                          <p className="text-[10px] text-muted-foreground mt-0.5 truncate font-mono">
                            {evt.payload?.substring(0, 100)}{(evt.payload?.length ?? 0) > 100 ? '…' : ''}
                          </p>
                        </button>
                      ))}
                      {hasMoreEvents && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="w-full text-xs h-7"
                          onClick={() => setEventPageSize((s) => s + 10)}
                        >
                          {t('transform.loadMore', 'Load more...')}
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              )}
              <JsonEditor
                value={inputPayload}
                onChange={setInputPayload}
                placeholder='{"key": "value"}'
                minHeight="280px"
                maxHeight="400px"
              />
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4 space-y-3">
              {transformations.length > 0 && (
                <div className="space-y-2">
                  <Label className="text-xs">{t('transform.savedTransformation', 'Saved Transformation')}</Label>
                  <Select
                    value={selectedTransformationId}
                    onChange={(e) => {
                      const id = e.target.value;
                      setSelectedTransformationId(id);
                      if (id) {
                        const tr = transformations.find(t => t.id === id);
                        if (tr) {
                          try { setTransformExpr(JSON.stringify(JSON.parse(tr.template), null, 2)); } catch { setTransformExpr(tr.template); }
                        }
                      }
                    }}
                  >
                    <option value="">{t('transform.noSavedTransformation', '— Use custom expression below —')}</option>
                    {transformations.filter(t => t.enabled).map(t => (
                      <option key={t.id} value={t.id}>{t.name} (v{t.version})</option>
                    ))}
                  </Select>
                </div>
              )}
              <div className="space-y-2">
                <Label className="text-xs">{t('transform.expression', 'Transform Expression (JSONPath-like)')}</Label>
                <JsonEditor
                  value={transformExpr}
                  onChange={(val) => { setTransformExpr(val); if (selectedTransformationId) setSelectedTransformationId(''); }}
                  placeholder={'$.data  or  {"event": "${$.event}", "data": "${$.data}"}'}
                  minHeight="80px"
                  maxHeight="200px"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs">{t('transform.customHeaders', 'Custom Headers (JSON object)')}</Label>
                <Input
                  className="font-mono text-sm"
                  value={customHeaders}
                  onChange={(e) => setCustomHeaders(e.target.value)}
                  placeholder='{"X-Custom": "value"}'
                />
              </div>
            </CardContent>
          </Card>

          <div className="flex gap-2">
            <Button onClick={handleRun} disabled={!inputPayload || preview.isPending} className="flex-1">
              <Play className="h-4 w-4 mr-1" />
              {preview.isPending ? t('transform.running', 'Running...') : t('transform.run', 'Run Preview')}
            </Button>
            <Button variant="outline" onClick={handleReset}>
              <RotateCcw className="h-4 w-4 mr-1" /> {t('transform.reset', 'Reset')}
            </Button>
          </div>

          {/* Dry-run Delivery */}
          <Card className="border-violet-200 dark:border-violet-800">
            <CardHeader className="pb-2">
              <button
                className="flex items-center gap-2 w-full text-left"
                onClick={() => setShowDryRun(!showDryRun)}
              >
                <Zap className="h-4 w-4 text-violet-600 dark:text-violet-400" />
                <CardTitle className="text-sm">{t('transform.dryRun', 'Dry-run Delivery')}</CardTitle>
                <Badge variant="outline" className="text-[10px] ml-auto">{showDryRun ? '▲' : '▼'}</Badge>
              </button>
            </CardHeader>
            {showDryRun && (
              <CardContent className="space-y-3 pt-0">
                <p className="text-xs text-muted-foreground">
                  {t('transform.dryRunDesc', 'Simulate a full delivery — see the transformed payload, computed HMAC signature, and all HTTP headers that your endpoint would receive. Nothing is sent.')}
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">{t('transform.dryRunEndpoint', 'Target Endpoint')}</Label>
                    <Select value={dryRunEndpointId} onChange={(e) => setDryRunEndpointId(e.target.value)}>
                      <option value="">{t('transform.dryRunNoEndpoint', '— None (skip HMAC) —')}</option>
                      {endpoints.filter((ep: any) => ep.enabled).map((ep: any) => (
                        <option key={ep.id} value={ep.id}>{ep.url}</option>
                      ))}
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">{t('transform.dryRunEventType', 'Event Type')}</Label>
                    <Input
                      className="font-mono text-xs"
                      value={dryRunEventType}
                      onChange={(e) => setDryRunEventType(e.target.value)}
                      placeholder="order.created"
                    />
                  </div>
                </div>
                <Button
                  onClick={handleDryRun}
                  disabled={!inputPayload || dryRun.isPending}
                  variant="outline"
                  className="w-full border-violet-300 dark:border-violet-700 text-violet-700 dark:text-violet-300 hover:bg-violet-50 dark:hover:bg-violet-950/30"
                >
                  <Send className="h-3.5 w-3.5 mr-1.5" />
                  {dryRun.isPending ? t('transform.dryRunRunning', 'Simulating...') : t('transform.dryRunBtn', 'Simulate Delivery')}
                </Button>
              </CardContent>
            )}
          </Card>
        </div>

        {/* Right: Output */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-2 flex flex-row items-center justify-between">
              <CardTitle className="text-sm flex items-center gap-2">
                <ArrowRight className="h-4 w-4" /> {t('transform.outputPayload', 'Output Payload')}
                {success === true && <Badge variant="outline" className="text-green-600"><CheckCircle2 className="h-3 w-3 mr-1" />OK</Badge>}
                {success === false && <Badge variant="destructive"><AlertCircle className="h-3 w-3 mr-1" />Errors</Badge>}
              </CardTitle>
              {outputPayload && (
                <Button variant="ghost" size="sm" onClick={() => handleCopy(outputPayload)}>
                  <Copy className="h-3.5 w-3.5" />
                </Button>
              )}
            </CardHeader>
            <CardContent>
              {outputPayload ? (
                <JsonEditor
                  value={outputPayload}
                  readOnly
                  minHeight="280px"
                  maxHeight="400px"
                />
              ) : (
                <div className="bg-muted/30 border border-dashed rounded-lg p-8 text-center text-sm text-muted-foreground min-h-[280px] flex items-center justify-center">
                  {t('transform.noOutput', 'Click "Run Preview" to see the transform output')}
                </div>
              )}
            </CardContent>
          </Card>

          {outputHeaders && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">{t('transform.outputHeaders', 'Output Headers')}</CardTitle>
              </CardHeader>
              <CardContent>
                <pre className="bg-muted/50 border rounded-lg p-3 text-xs font-mono overflow-x-auto whitespace-pre-wrap">
                  {outputHeaders}
                </pre>
              </CardContent>
            </Card>
          )}

          {/* Errors */}
          {errors.length > 0 && (
            <Card className="border-red-200 dark:border-red-900">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-red-600 flex items-center gap-2">
                  <AlertCircle className="h-4 w-4" /> {t('transform.errors', 'Validation Errors')}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-1">
                  {errors.map((err, i) => (
                    <li key={i} className="text-xs text-red-600 flex items-start gap-2">
                      <span className="mt-0.5">•</span> {err}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          {/* Dry-run Result */}
          {dryRunResult && (
            <Card className="border-violet-200 dark:border-violet-800">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Zap className="h-4 w-4 text-violet-600" />
                  {t('transform.dryRunResult', 'Delivery Dry-run Result')}
                  {dryRunResult.success
                    ? <Badge variant="outline" className="text-green-600"><CheckCircle2 className="h-3 w-3 mr-1" />OK</Badge>
                    : <Badge variant="destructive"><AlertCircle className="h-3 w-3 mr-1" />Issues</Badge>
                  }
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {dryRunResult.endpointUrl && (
                  <div className="flex items-center gap-2 text-xs">
                    <Globe className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-muted-foreground">POST</span>
                    <code className="font-mono text-primary bg-muted px-1.5 py-0.5 rounded truncate">{dryRunResult.endpointUrl}</code>
                  </div>
                )}

                {dryRunResult.transformationName && (
                  <div className="flex items-center gap-2 text-xs">
                    <Wand2 className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-muted-foreground">{t('transform.dryRunTransformation', 'Transformation')}:</span>
                    <Badge variant="outline" className="text-[10px]">{dryRunResult.transformationName} v{dryRunResult.transformationVersion}</Badge>
                  </div>
                )}

                {dryRunResult.signature && (
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-xs">
                      <Shield className="h-3.5 w-3.5 text-green-600" />
                      <span className="font-medium text-green-700 dark:text-green-400">{t('transform.dryRunSignature', 'HMAC Signature')}</span>
                      <Button variant="ghost" size="sm" className="h-5 px-1.5" onClick={() => handleCopy(dryRunResult.signature!)}>
                        <Copy className="h-3 w-3" />
                      </Button>
                    </div>
                    <code className="block text-[10px] font-mono bg-muted/50 border rounded p-2 break-all text-muted-foreground">{dryRunResult.signature}</code>
                  </div>
                )}

                {dryRunResult.requestHeaders && Object.keys(dryRunResult.requestHeaders).length > 0 && (
                  <div className="space-y-1">
                    <p className="text-xs font-medium">{t('transform.dryRunHeaders', 'Request Headers')}</p>
                    <div className="bg-muted/50 border rounded-lg p-2.5 space-y-0.5 max-h-[200px] overflow-y-auto">
                      {Object.entries(dryRunResult.requestHeaders).map(([key, val]) => (
                        <div key={key} className="flex gap-2 text-[11px] font-mono">
                          <span className="text-primary font-medium shrink-0">{key}:</span>
                          <span className="text-muted-foreground break-all">{val}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {dryRunResult.transformedPayload && (
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-medium">{t('transform.dryRunBody', 'Request Body')}</p>
                      <Button variant="ghost" size="sm" className="h-5 px-1.5" onClick={() => handleCopy(dryRunResult.transformedPayload!)}>
                        <Copy className="h-3 w-3" />
                      </Button>
                    </div>
                    <JsonEditor
                      value={dryRunResult.transformedPayload}
                      readOnly
                      minHeight="120px"
                      maxHeight="250px"
                    />
                  </div>
                )}

                {dryRunResult.errors && dryRunResult.errors.length > 0 && (
                  <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-lg p-2.5">
                    <ul className="space-y-1">
                      {dryRunResult.errors.map((err, i) => (
                        <li key={i} className="text-xs text-red-600 dark:text-red-400 flex items-start gap-1.5">
                          <AlertCircle className="h-3 w-3 mt-0.5 shrink-0" /> {err}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Instructions */}
          {!outputPayload && errors.length === 0 && !dryRunResult && (
            <Card className="bg-muted/20">
              <CardContent className="p-4 text-sm text-muted-foreground space-y-2">
                <p className="font-medium text-foreground">{t('transform.howItWorks', 'How it works')}</p>
                <ul className="space-y-1 text-xs">
                  <li>• <code className="bg-muted px-1 rounded">$.data</code> — {t('transform.help.extractField')}</li>
                  <li>• <code className="bg-muted px-1 rounded">$.data.items</code> — {t('transform.help.drillArrays')}</li>
                  <li>• {t('transform.help.emptyExpr')}</li>
                  <li>• {t('transform.help.headersMerge')}</li>
                  <li>• {t('transform.help.testBefore')}</li>
                </ul>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
