import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Shield, Plus, Trash2, Loader2, ToggleLeft, ToggleRight, Sparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { showApiError, showSuccess } from '../lib/toast';
import PageSkeleton, { SkeletonRows } from '../components/PageSkeleton';
import { piiRulesApi, PiiMaskingRuleResponse, MaskStyle } from '../api/piiRules.api';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Select } from '../components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
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
import { usePermissions } from '../auth/usePermissions';

const MASK_STYLE_OPTIONS: { value: MaskStyle; label: string }[] = [
  { value: 'PARTIAL', label: 'Partial' },
  { value: 'FULL', label: 'Full' },
  { value: 'HASH', label: 'Hash (SHA-256)' },
];

export default function PiiRulesPage() {
  const { t } = useTranslation();
  const { projectId } = useParams<{ projectId: string }>();
  const { canManagePiiRules } = usePermissions();
  const [rules, setRules] = useState<PiiMaskingRuleResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newPatternName, setNewPatternName] = useState('');
  const [newJsonPath, setNewJsonPath] = useState('');
  const [newMaskStyle, setNewMaskStyle] = useState<MaskStyle>('PARTIAL');

  useEffect(() => {
    if (projectId) loadRules();
  }, [projectId]);

  const loadRules = async () => {
    if (!projectId) return;
    try {
      setLoading(true);
      const data = await piiRulesApi.list(projectId);
      setRules(data);
    } catch (err: any) {
      showApiError(err, 'piiRules.toast.loadFailed', { retry: loadRules });
    } finally {
      setLoading(false);
    }
  };

  const handleSeedDefaults = async () => {
    if (!projectId) return;
    try {
      setSeeding(true);
      const data = await piiRulesApi.seedDefaults(projectId);
      setRules(data);
      showSuccess(t('piiRules.toast.seeded'));
    } catch (err: any) {
      showApiError(err, 'piiRules.toast.seedFailed');
    } finally {
      setSeeding(false);
    }
  };

  const handleCreate = async () => {
    if (!projectId || !newPatternName.trim()) return;
    try {
      setCreating(true);
      const rule = await piiRulesApi.create(projectId, {
        patternName: newPatternName.trim(),
        jsonPath: newJsonPath.trim() || undefined,
        maskStyle: newMaskStyle,
        enabled: true,
      });
      setRules([...rules, rule]);
      setNewPatternName('');
      setNewJsonPath('');
      setNewMaskStyle('PARTIAL');
      setShowAddForm(false);
      showSuccess(t('piiRules.toast.created'));
    } catch (err: any) {
      showApiError(err, 'piiRules.toast.createFailed');
    } finally {
      setCreating(false);
    }
  };

  const handleToggle = async (rule: PiiMaskingRuleResponse) => {
    if (!projectId) return;
    try {
      const updated = await piiRulesApi.update(projectId, rule.id, {
        patternName: rule.patternName,
        maskStyle: rule.maskStyle,
        enabled: !rule.enabled,
      });
      setRules(rules.map(r => r.id === rule.id ? updated : r));
    } catch (err: any) {
      showApiError(err, 'piiRules.toast.updateFailed');
    }
  };

  const handleChangeMaskStyle = async (rule: PiiMaskingRuleResponse, maskStyle: MaskStyle) => {
    if (!projectId) return;
    try {
      const updated = await piiRulesApi.update(projectId, rule.id, {
        patternName: rule.patternName,
        maskStyle,
        enabled: rule.enabled,
      });
      setRules(rules.map(r => r.id === rule.id ? updated : r));
    } catch (err: any) {
      showApiError(err, 'piiRules.toast.updateFailed');
    }
  };

  const handleDelete = async () => {
    if (!deleteId || !projectId) return;
    try {
      setDeleting(true);
      await piiRulesApi.delete(projectId, deleteId);
      setRules(rules.filter(r => r.id !== deleteId));
      showSuccess(t('piiRules.toast.deleted'));
    } catch (err: any) {
      showApiError(err, 'piiRules.toast.deleteFailed');
    } finally {
      setDeleting(false);
      setDeleteId(null);
    }
  };

  const getMaskStyleBadge = (style: MaskStyle) => {
    switch (style) {
      case 'FULL': return 'bg-destructive/10 text-destructive';
      case 'PARTIAL': return 'bg-warning/10 text-warning';
      case 'HASH': return 'bg-blue-500/10 text-blue-600';
    }
  };

  const getMaskExample = (style: MaskStyle, pattern: string) => {
    switch (style) {
      case 'FULL': return '***';
      case 'PARTIAL':
        if (pattern === 'email') return 'jo***@example.com';
        if (pattern === 'phone') return '+1***89';
        if (pattern === 'card') return '42***56';
        return 'ab***yz';
      case 'HASH': return 'sha256:a1b2c3d4e5f6';
    }
  };

  if (loading) {
    return (
      <PageSkeleton>
        <SkeletonRows count={4} height="h-12" />
      </PageSkeleton>
    );
  }

  return (
    <div className="p-6 lg:p-8 max-w-4xl mx-auto">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-8">
        <div>
          <h1 className="text-title tracking-tight flex items-center gap-2">
            <Shield className="h-6 w-6 text-primary" />
            {t('piiRules.title')}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {t('piiRules.subtitle')}
          </p>
        </div>
        {canManagePiiRules && (
          <div className="flex gap-2">
            {rules.length === 0 && (
              <Button variant="outline" onClick={handleSeedDefaults} disabled={seeding}>
                {seeding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                {t('piiRules.seedDefaults')}
              </Button>
            )}
            <Button onClick={() => setShowAddForm(true)}>
              <Plus className="h-4 w-4" /> {t('piiRules.addRule')}
            </Button>
          </div>
        )}
      </div>

      {showAddForm && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-base">{t('piiRules.newRule')}</CardTitle>
            <CardDescription>{t('piiRules.newRuleDesc')}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label>{t('piiRules.patternName')}</Label>
                <Input
                  placeholder="e.g. ssn, address"
                  value={newPatternName}
                  onChange={(e) => setNewPatternName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>{t('piiRules.jsonPath')}</Label>
                <Input
                  placeholder="e.g. $.user.ssn"
                  value={newJsonPath}
                  onChange={(e) => setNewJsonPath(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>{t('piiRules.maskStyle')}</Label>
                <Select
                  value={newMaskStyle}
                  onChange={(e) => setNewMaskStyle(e.target.value as MaskStyle)}
                >
                  {MASK_STYLE_OPTIONS.map(o => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </Select>
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <Button onClick={handleCreate} disabled={creating || !newPatternName.trim()}>
                {creating && <Loader2 className="h-4 w-4 animate-spin" />}
                {t('common.create')}
              </Button>
              <Button variant="ghost" onClick={() => setShowAddForm(false)}>
                {t('common.cancel')}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {rules.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 border border-dashed rounded-xl">
          <Shield className="h-10 w-10 text-muted-foreground mb-3" />
          <p className="text-sm text-muted-foreground mb-1">{t('piiRules.noRules')}</p>
          <p className="text-xs text-muted-foreground">{t('piiRules.noRulesHint')}</p>
        </div>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('piiRules.pattern')}</TableHead>
                <TableHead>{t('piiRules.type')}</TableHead>
                <TableHead>{t('piiRules.maskStyle')}</TableHead>
                <TableHead>{t('piiRules.example')}</TableHead>
                <TableHead>{t('piiRules.status')}</TableHead>
                {canManagePiiRules && <TableHead className="w-[80px]" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rules.map((rule) => (
                <TableRow key={rule.id}>
                  <TableCell>
                    <div>
                      <span className="font-mono text-sm font-medium">{rule.patternName}</span>
                      {rule.jsonPath && (
                        <span className="block text-[11px] text-muted-foreground font-mono">{rule.jsonPath}</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      rule.ruleType === 'BUILTIN' ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
                    }`}>
                      {rule.ruleType === 'BUILTIN' ? t('piiRules.builtin') : t('piiRules.custom')}
                    </span>
                  </TableCell>
                  <TableCell>
                    {canManagePiiRules ? (
                      <Select
                        value={rule.maskStyle}
                        onChange={(e) => handleChangeMaskStyle(rule, e.target.value as MaskStyle)}
                        className="h-8 text-xs w-28"
                      >
                        {MASK_STYLE_OPTIONS.map(o => (
                          <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                      </Select>
                    ) : (
                      <span className={`text-xs px-2 py-0.5 rounded ${getMaskStyleBadge(rule.maskStyle)}`}>
                        {rule.maskStyle}
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    <code className="text-[11px] text-muted-foreground">
                      {getMaskExample(rule.maskStyle, rule.patternName)}
                    </code>
                  </TableCell>
                  <TableCell>
                    {canManagePiiRules ? (
                      <button
                        onClick={() => handleToggle(rule)}
                        className="flex items-center gap-1 text-sm"
                      >
                        {rule.enabled ? (
                          <ToggleRight className="h-5 w-5 text-success" />
                        ) : (
                          <ToggleLeft className="h-5 w-5 text-muted-foreground" />
                        )}
                      </button>
                    ) : (
                      <span className={`text-xs ${rule.enabled ? 'text-success' : 'text-muted-foreground'}`}>
                        {rule.enabled ? t('piiRules.enabled') : t('piiRules.disabled')}
                      </span>
                    )}
                  </TableCell>
                  {canManagePiiRules && (
                    <TableCell>
                      {rule.ruleType !== 'BUILTIN' && (
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => setDeleteId(rule.id)}
                          className="text-muted-foreground hover:text-destructive"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('piiRules.deleteDialog.title')}</AlertDialogTitle>
            <AlertDialogDescription>{t('piiRules.deleteDialog.description')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t('common.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
