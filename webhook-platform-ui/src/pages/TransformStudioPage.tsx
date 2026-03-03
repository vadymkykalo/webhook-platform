import { useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  Wand2, Play, AlertCircle, CheckCircle2, Copy, RotateCcw, FileJson, ArrowRight
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { showSuccess, showApiError } from '../lib/toast';
import { useTransformPreview } from '../api/queries';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Badge } from '../components/ui/badge';

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

const HINT_EXPRESSIONS = [
  { expr: '$.data', desc: 'Extract the data object' },
  { expr: '$.data.items', desc: 'Extract items array' },
  { expr: '$.data.customer', desc: 'Extract customer info' },
  { expr: '$.metadata', desc: 'Extract metadata' },
  { expr: '$', desc: 'Pass through entire payload' },
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

  const preview = useTransformPreview(projectId!);

  const handleRun = async () => {
    setErrors([]);
    setSuccess(null);
    setOutputPayload(null);
    setOutputHeaders(null);
    try {
      const result = await preview.mutateAsync({
        inputPayload,
        transformExpression: transformExpr || undefined,
        customHeaders: customHeaders || undefined,
      });
      setOutputPayload(result.outputPayload);
      setOutputHeaders(result.outputHeaders);
      setErrors(result.errors);
      setSuccess(result.success);
    } catch (err: any) {
      showApiError(err, 'transform.previewFailed');
    }
  };

  const handleCopy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    showSuccess(`${label} copied`);
  };

  const handleReset = () => {
    setInputPayload(SAMPLE_PAYLOAD);
    setTransformExpr('');
    setCustomHeaders('');
    setOutputPayload(null);
    setOutputHeaders(null);
    setErrors([]);
    setSuccess(null);
  };

  const formatJson = (text: string) => {
    try { return JSON.stringify(JSON.parse(text), null, 2); } catch { return text; }
  };

  const handleFormatInput = () => {
    setInputPayload(formatJson(inputPayload));
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
            {HINT_EXPRESSIONS.map((h) => (
              <button
                key={h.expr}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs border hover:bg-accent transition-colors"
                onClick={() => setTransformExpr(h.expr)}
                title={h.desc}
              >
                <code className="font-mono text-primary">{h.expr}</code>
                <span className="text-muted-foreground">— {h.desc}</span>
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
                <Button variant="ghost" size="sm" onClick={handleFormatInput}>{t('transform.format', 'Format')}</Button>
                <Button variant="ghost" size="sm" onClick={() => handleCopy(inputPayload, 'Input')}>
                  <Copy className="h-3.5 w-3.5" />
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <Textarea
                className="font-mono text-xs min-h-[280px] resize-y"
                value={inputPayload}
                onChange={(e) => setInputPayload(e.target.value)}
                placeholder='{"key": "value"}'
              />
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4 space-y-3">
              <div className="space-y-2">
                <Label className="text-xs">{t('transform.expression', 'Transform Expression (JSONPath-like)')}</Label>
                <Input
                  className="font-mono text-sm"
                  value={transformExpr}
                  onChange={(e) => setTransformExpr(e.target.value)}
                  placeholder="$.data  or  $.data.items  (empty = passthrough)"
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
                <Button variant="ghost" size="sm" onClick={() => handleCopy(outputPayload, 'Output')}>
                  <Copy className="h-3.5 w-3.5" />
                </Button>
              )}
            </CardHeader>
            <CardContent>
              {outputPayload ? (
                <pre className="bg-muted/50 border rounded-lg p-4 text-xs font-mono overflow-x-auto max-h-[280px] whitespace-pre-wrap break-words">
                  {outputPayload}
                </pre>
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

          {/* Instructions */}
          {!outputPayload && errors.length === 0 && (
            <Card className="bg-muted/20">
              <CardContent className="p-4 text-sm text-muted-foreground space-y-2">
                <p className="font-medium text-foreground">{t('transform.howItWorks', 'How it works')}</p>
                <ul className="space-y-1 text-xs">
                  <li>• <code className="bg-muted px-1 rounded">$.data</code> — extract a nested field</li>
                  <li>• <code className="bg-muted px-1 rounded">$.data.items</code> — drill into arrays</li>
                  <li>• Empty expression = forward full payload as-is</li>
                  <li>• Custom headers are merged with system headers</li>
                  <li>• Use this to test before saving to a destination</li>
                </ul>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
