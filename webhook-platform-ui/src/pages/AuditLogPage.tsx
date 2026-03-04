import { useState, useMemo } from 'react';
import { FileText, ChevronLeft, ChevronRight, CheckCircle2, XCircle, Filter, X, Download } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuditLog } from '../api/queries';
import { formatDateTimeCompact } from '../lib/date';
import { SkeletonTable } from '../components/PageSkeleton';
import EmptyState from '../components/EmptyState';
import { type AuditLogEntry } from '../api/auditLog.api';
import { Button } from '../components/ui/button';
import { Select } from '../components/ui/select';
import { Input } from '../components/ui/input';
import { showSuccess } from '../lib/toast';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../components/ui/table';

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
  const { data, isLoading } = useAuditLog(page);

  const uniqueActions = useMemo(() => {
    if (!data?.content) return [];
    return [...new Set(data.content.map((e: AuditLogEntry) => e.action))].sort();
  }, [data]);

  const uniqueResourceTypes = useMemo(() => {
    if (!data?.content) return [];
    return [...new Set(data.content.map((e: AuditLogEntry) => e.resourceType))].sort();
  }, [data]);

  const filteredEntries = useMemo(() => {
    if (!data?.content) return [];
    return data.content.filter((entry: AuditLogEntry) => {
      if (actionFilter && entry.action !== actionFilter) return false;
      if (statusFilter && entry.status !== statusFilter) return false;
      if (resourceTypeFilter && entry.resourceType !== resourceTypeFilter) return false;
      if (dateFrom) {
        const from = new Date(dateFrom);
        if (new Date(entry.createdAt) < from) return false;
      }
      if (dateTo) {
        const to = new Date(dateTo + 'T23:59:59');
        if (new Date(entry.createdAt) > to) return false;
      }
      return true;
    });
  }, [data, actionFilter, statusFilter, resourceTypeFilter, dateFrom, dateTo]);

  const hasFilters = actionFilter || statusFilter || resourceTypeFilter || dateFrom || dateTo;

  const clearFilters = () => {
    setActionFilter('');
    setStatusFilter('');
    setResourceTypeFilter('');
    setDateFrom('');
    setDateTo('');
  };

  const handleExportCsv = () => {
    if (!filteredEntries.length) return;
    const headers = ['Time', 'Action', 'Resource Type', 'Resource ID', 'User', 'Status', 'Duration (ms)', 'IP', 'Error'];
    const rows = filteredEntries.map((e: AuditLogEntry) => [
      e.createdAt,
      e.action,
      e.resourceType,
      e.resourceId || '',
      e.userEmail || e.userId || '',
      e.status,
      e.durationMs != null ? String(e.durationMs) : '',
      e.clientIp || '',
      (e.errorMessage || '').replace(/"/g, '""'),
    ]);
    const csv = [headers.join(','), ...rows.map(r => r.map(c => `"${c}"`).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `audit-log-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showSuccess(t('auditLog.export.done', { count: filteredEntries.length }));
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
        {data && data.content.length > 0 && (
          <Button variant="outline" size="sm" onClick={handleExportCsv} disabled={filteredEntries.length === 0}>
            <Download className="h-4 w-4 mr-2" />
            {t('auditLog.export.csv')}
          </Button>
        )}
      </div>

      {/* Filters */}
      {data && data.content.length > 0 && (
        <div className="flex items-center gap-3 flex-wrap">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <div className="w-44">
            <Select value={actionFilter} onChange={(e) => setActionFilter(e.target.value)}>
              <option value="">{t('auditLog.filters.allActions')}</option>
              {uniqueActions.map((action) => (
                <option key={action} value={action}>{actionLabel(action)}</option>
              ))}
            </Select>
          </div>
          <div className="w-36">
            <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="">{t('auditLog.filters.allStatuses')}</option>
              <option value="SUCCESS">{t('auditLog.filters.success')}</option>
              <option value="FAILURE">{t('auditLog.filters.failure')}</option>
            </Select>
          </div>
          <div className="w-44">
            <Select value={resourceTypeFilter} onChange={(e) => setResourceTypeFilter(e.target.value)}>
              <option value="">{t('auditLog.filters.allResources')}</option>
              {uniqueResourceTypes.map((rt) => (
                <option key={rt} value={rt}>{rt}</option>
              ))}
            </Select>
          </div>
          <Input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="w-36 h-9"
            placeholder={t('auditLog.filters.from')}
          />
          <Input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="w-36 h-9"
            placeholder={t('auditLog.filters.to')}
          />
          {hasFilters && (
            <Button variant="ghost" size="sm" onClick={clearFilters}>
              <X className="h-3.5 w-3.5 mr-1" /> {t('auditLog.filters.clear')}
            </Button>
          )}
          {hasFilters && (
            <span className="text-xs text-muted-foreground">
              {t('auditLog.filters.showing', { count: filteredEntries.length, total: data.content.length })}
            </span>
          )}
        </div>
      )}

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
                {filteredEntries.map((entry: AuditLogEntry) => (
                  <TableRow key={entry.id}>
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
    </div>
  );
}
