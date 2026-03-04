import { useState, useMemo, useCallback } from 'react';
import { FileText, ChevronLeft, ChevronRight, CheckCircle2, XCircle, Filter, X, Download, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuditLog } from '../api/queries';
import { formatDateTimeCompact } from '../lib/date';
import { SkeletonTable } from '../components/PageSkeleton';
import EmptyState from '../components/EmptyState';
import { auditLogApi, type AuditLogEntry, type AuditLogFilters } from '../api/auditLog.api';
import { Button } from '../components/ui/button';
import { Select } from '../components/ui/select';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { showSuccess, showApiError } from '../lib/toast';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '../components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../components/ui/table';

const ALL_ACTIONS = [
  'CREATE', 'UPDATE', 'DELETE', 'ROTATE_SECRET', 'REVOKE',
  'REGISTER', 'LOGIN', 'LOGOUT', 'CONFIGURE_MTLS', 'TEST_WEBHOOK',
  'PASSWORD_RESET_REQUESTED', 'PASSWORD_RESET', 'PASSWORD_CHANGED',
  'MEMBER_INVITED', 'MEMBER_ROLE_CHANGED', 'MEMBER_REMOVED',
  'INVITE_ACCEPTED', 'RESOLVE_INCIDENT',
];

const ALL_RESOURCE_TYPES = [
  'Endpoint', 'Subscription', 'ApiKey', 'Project', 'Member',
  'AlertRule', 'Incident', 'IncidentTimeline',
  'IncomingSource', 'IncomingDestination', 'Transformation', 'SchemaRegistry',
  'Auth',
];

const ACTION_COLORS: Record<string, string> = {
  CREATE: 'bg-green-500/10 text-green-700 dark:text-green-400',
  UPDATE: 'bg-blue-500/10 text-blue-700 dark:text-blue-400',
  DELETE: 'bg-red-500/10 text-red-700 dark:text-red-400',
  ROTATE_SECRET: 'bg-orange-500/10 text-orange-700 dark:text-orange-400',
  REVOKE: 'bg-red-500/10 text-red-700 dark:text-red-400',
  REGISTER: 'bg-purple-500/10 text-purple-700 dark:text-purple-400',
  LOGIN: 'bg-cyan-500/10 text-cyan-700 dark:text-cyan-400',
  LOGOUT: 'bg-muted text-muted-foreground',
  CONFIGURE_MTLS: 'bg-indigo-500/10 text-indigo-700 dark:text-indigo-400',
  TEST_WEBHOOK: 'bg-teal-500/10 text-teal-700 dark:text-teal-400',
  PASSWORD_RESET_REQUESTED: 'bg-yellow-500/10 text-yellow-700 dark:text-yellow-400',
  PASSWORD_RESET: 'bg-green-500/10 text-green-700 dark:text-green-400',
  PASSWORD_CHANGED: 'bg-blue-500/10 text-blue-700 dark:text-blue-400',
  MEMBER_INVITED: 'bg-violet-500/10 text-violet-700 dark:text-violet-400',
  MEMBER_ROLE_CHANGED: 'bg-blue-500/10 text-blue-700 dark:text-blue-400',
  MEMBER_REMOVED: 'bg-red-500/10 text-red-700 dark:text-red-400',
  INVITE_ACCEPTED: 'bg-green-500/10 text-green-700 dark:text-green-400',
  RESOLVE_INCIDENT: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
};

function shortId(id: string | null) {
  if (!id) return '—';
  return id.substring(0, 8) + '…';
}

export default function AuditLogPage() {
  const { t } = useTranslation();
  const [page, setPage] = useState(0);
  const [actionFilter, setActionFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [resourceTypeFilter, setResourceTypeFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [exporting, setExporting] = useState(false);
  const [selected, setSelected] = useState<AuditLogEntry | null>(null);

  const filters: AuditLogFilters = useMemo(() => ({
    action: actionFilter || undefined,
    status: statusFilter || undefined,
    resourceType: resourceTypeFilter || undefined,
    from: dateFrom || undefined,
    to: dateTo || undefined,
  }), [actionFilter, statusFilter, resourceTypeFilter, dateFrom, dateTo]);

  const { data, isLoading } = useAuditLog(page, 20, filters);

  const hasFilters = actionFilter || statusFilter || resourceTypeFilter || dateFrom || dateTo;

  const clearFilters = () => {
    setActionFilter('');
    setStatusFilter('');
    setResourceTypeFilter('');
    setDateFrom('');
    setDateTo('');
    setPage(0);
  };

  const applyFilter = useCallback((setter: (v: string) => void) => {
    return (e: { target: { value: string } }) => {
      setter(e.target.value);
      setPage(0);
    };
  }, []);

  const handleExportCsv = async () => {
    setExporting(true);
    try {
      const blob = await auditLogApi.exportCsv(filters);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `audit-log-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      showSuccess(t('auditLog.export.done', { count: data?.totalElements ?? 0 }));
    } catch (err: any) {
      showApiError(err, 'auditLog.export.failed');
    } finally {
      setExporting(false);
    }
  };

  const actionLabel = (action: string) =>
    t(`auditLog.actions.${action}`, { defaultValue: action });

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <FileText className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{t('auditLog.title')}</h1>
            <p className="text-sm text-muted-foreground">
              {t('auditLog.subtitle')}
            </p>
          </div>
        </div>
        {data && data.totalElements > 0 && (
          <Button variant="outline" size="sm" onClick={handleExportCsv} disabled={exporting}>
            {exporting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
            {t('auditLog.export.csv')}
          </Button>
        )}
      </div>

      {/* Filters — always visible */}
      <div className="flex items-center gap-3 flex-wrap">
        <Filter className="h-4 w-4 text-muted-foreground" />
        <div className="w-44">
          <Select value={actionFilter} onChange={applyFilter(setActionFilter)}>
            <option value="">{t('auditLog.filters.allActions')}</option>
            {ALL_ACTIONS.map((action) => (
              <option key={action} value={action}>{actionLabel(action)}</option>
            ))}
          </Select>
        </div>
        <div className="w-36">
          <Select value={statusFilter} onChange={applyFilter(setStatusFilter)}>
            <option value="">{t('auditLog.filters.allStatuses')}</option>
            <option value="SUCCESS">{t('auditLog.filters.success')}</option>
            <option value="FAILURE">{t('auditLog.filters.failure')}</option>
          </Select>
        </div>
        <div className="w-44">
          <Select value={resourceTypeFilter} onChange={applyFilter(setResourceTypeFilter)}>
            <option value="">{t('auditLog.filters.allResources')}</option>
            {ALL_RESOURCE_TYPES.map((rt) => (
              <option key={rt} value={rt}>{rt}</option>
            ))}
          </Select>
        </div>
        <Input
          type="date"
          value={dateFrom}
          onChange={applyFilter(setDateFrom)}
          className="w-36 h-9"
        />
        <Input
          type="date"
          value={dateTo}
          onChange={applyFilter(setDateTo)}
          className="w-36 h-9"
        />
        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters}>
            <X className="h-3.5 w-3.5 mr-1" /> {t('auditLog.filters.clear')}
          </Button>
        )}
      </div>

      <div className="border rounded-lg bg-card overflow-hidden">
        {isLoading ? (
          <SkeletonTable rows={8} />
        ) : !data || data.content.length === 0 ? (
          <EmptyState icon={FileText} title={t('auditLog.noLogs')} description={t('auditLog.noLogsDesc')} className="flex flex-col items-center justify-center py-20" />
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[160px]">{t('auditLog.columns.time')}</TableHead>
                  <TableHead className="w-[140px]">{t('auditLog.columns.action')}</TableHead>
                  <TableHead className="w-[120px]">{t('auditLog.columns.resource')}</TableHead>
                  <TableHead className="w-[100px]">{t('auditLog.columns.resourceId')}</TableHead>
                  <TableHead className="w-[160px]">{t('auditLog.columns.user')}</TableHead>
                  <TableHead className="w-[80px]">{t('auditLog.columns.status')}</TableHead>
                  <TableHead className="w-[80px]">{t('auditLog.columns.duration')}</TableHead>
                  <TableHead className="w-[110px]">{t('auditLog.columns.ip')}</TableHead>
                  <TableHead>{t('auditLog.columns.error')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.content.map((entry: AuditLogEntry) => (
                  <TableRow key={entry.id} className="cursor-pointer hover:bg-muted/50" onClick={() => setSelected(entry)}>
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                      {formatDateTimeCompact(entry.createdAt)}
                    </TableCell>
                    <TableCell>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${ACTION_COLORS[entry.action] || 'bg-muted text-muted-foreground'}`}>
                        {actionLabel(entry.action)}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm font-medium">
                      {entry.resourceType}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground" title={entry.resourceId || undefined}>
                      {shortId(entry.resourceId)}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground" title={entry.userId || undefined}>
                      {entry.userEmail || (entry.userId ? shortId(entry.userId) : '—')}
                    </TableCell>
                    <TableCell>
                      {entry.status === 'SUCCESS' ? (
                        <CheckCircle2 className="h-4 w-4 text-green-600" />
                      ) : (
                        <XCircle className="h-4 w-4 text-red-500" />
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {entry.durationMs != null ? `${entry.durationMs}ms` : '—'}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {entry.clientIp || '—'}
                    </TableCell>
                    <TableCell className="text-xs text-red-600 max-w-[200px] truncate" title={entry.errorMessage || undefined}>
                      {entry.errorMessage || ''}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            <div className="flex items-center justify-between px-4 py-3 border-t bg-muted/30">
              <p className="text-xs text-muted-foreground">
                {t('auditLog.pagination', { total: data.totalElements, page: data.number + 1, pages: data.totalPages })}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page === 0}
                  onClick={() => setPage(p => p - 1)}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= data.totalPages - 1}
                  onClick={() => setPage(p => p + 1)}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Detail Modal */}
      <Dialog open={!!selected} onOpenChange={(open) => { if (!open) setSelected(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{t('auditLog.detail.title')}</DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-3 text-sm">
              <DetailRow label={t('auditLog.columns.time')} value={formatDateTimeCompact(selected.createdAt)} />
              <DetailRow label={t('auditLog.columns.action')}>
                <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${ACTION_COLORS[selected.action] || 'bg-muted text-muted-foreground'}`}>
                  {actionLabel(selected.action)}
                </span>
              </DetailRow>
              <DetailRow label={t('auditLog.columns.status')}>
                <span className="flex items-center gap-1.5">
                  {selected.status === 'SUCCESS' ? (
                    <><CheckCircle2 className="h-4 w-4 text-green-600" /> {t('auditLog.filters.success')}</>
                  ) : (
                    <><XCircle className="h-4 w-4 text-red-500" /> {t('auditLog.filters.failure')}</>
                  )}
                </span>
              </DetailRow>
              <DetailRow label={t('auditLog.columns.resource')} value={selected.resourceType} />
              <DetailRow label={t('auditLog.columns.resourceId')} mono value={selected.resourceId || '—'} />
              <DetailRow label={t('auditLog.columns.user')} value={selected.userEmail || '—'} />
              <DetailRow label="User ID" mono value={selected.userId || '—'} />
              <DetailRow label={t('auditLog.columns.duration')} value={selected.durationMs != null ? `${selected.durationMs}ms` : '—'} />
              <DetailRow label={t('auditLog.columns.ip')} mono value={selected.clientIp || '—'} />
              {selected.details && (
                <div>
                  <Label className="text-xs text-muted-foreground">{t('auditLog.detail.changes')}</Label>
                  <pre className="text-xs bg-muted p-2 rounded mt-1 overflow-auto max-h-48 whitespace-pre-wrap break-all">
                    {(() => { try { return JSON.stringify(JSON.parse(selected.details), null, 2); } catch { return selected.details; } })()}
                  </pre>
                </div>
              )}
              {selected.errorMessage && (
                <div>
                  <Label className="text-xs text-muted-foreground">{t('auditLog.columns.error')}</Label>
                  <p className="text-sm text-red-600 mt-1 break-all">{selected.errorMessage}</p>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function DetailRow({ label, value, mono, children }: { label: string; value?: string; mono?: boolean; children?: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <span className="text-xs text-muted-foreground w-28 shrink-0 pt-0.5">{label}</span>
      {children || <span className={`text-sm break-all ${mono ? 'font-mono text-xs' : ''}`}>{value}</span>}
    </div>
  );
}
