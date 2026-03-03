import { useState, useMemo } from 'react';
import { FileText, ChevronLeft, ChevronRight, CheckCircle2, XCircle, Filter, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuditLog } from '../api/queries';
import { formatDateTimeCompact } from '../lib/date';
import { SkeletonTable } from '../components/PageSkeleton';
import EmptyState from '../components/EmptyState';
import { type AuditLogEntry } from '../api/auditLog.api';
import { Button } from '../components/ui/button';
import { Select } from '../components/ui/select';
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
  PASSWORD_RESET_REQUESTED: 'bg-yellow-500/10 text-yellow-700 dark:text-yellow-400',
  PASSWORD_RESET: 'bg-green-500/10 text-green-700 dark:text-green-400',
  PASSWORD_CHANGED: 'bg-blue-500/10 text-blue-700 dark:text-blue-400',
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
  const { data, isLoading } = useAuditLog(page);

  const uniqueActions = useMemo(() => {
    if (!data?.content) return [];
    return [...new Set(data.content.map((e: AuditLogEntry) => e.action))].sort();
  }, [data]);

  const filteredEntries = useMemo(() => {
    if (!data?.content) return [];
    return data.content.filter((entry: AuditLogEntry) => {
      if (actionFilter && entry.action !== actionFilter) return false;
      if (statusFilter && entry.status !== statusFilter) return false;
      return true;
    });
  }, [data, actionFilter, statusFilter]);

  const hasFilters = actionFilter || statusFilter;

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
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

      {/* Filters */}
      {data && data.content.length > 0 && (
        <div className="flex items-center gap-3 flex-wrap">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <div className="w-40">
            <Select value={actionFilter} onChange={(e) => setActionFilter(e.target.value)}>
              <option value="">{t('auditLog.filters.allActions', 'All Actions')}</option>
              {uniqueActions.map((action) => (
                <option key={action} value={action}>{action}</option>
              ))}
            </Select>
          </div>
          <div className="w-36">
            <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="">{t('auditLog.filters.allStatuses', 'All Statuses')}</option>
              <option value="SUCCESS">{t('auditLog.filters.success', 'Success')}</option>
              <option value="FAILURE">{t('auditLog.filters.failure', 'Failure')}</option>
            </Select>
          </div>
          {hasFilters && (
            <Button variant="ghost" size="sm" onClick={() => { setActionFilter(''); setStatusFilter(''); }}>
              <X className="h-3.5 w-3.5 mr-1" /> {t('auditLog.filters.clear', 'Clear')}
            </Button>
          )}
          {hasFilters && (
            <span className="text-xs text-muted-foreground">
              {t('auditLog.filters.showing', { count: filteredEntries.length, total: data.content.length,
                defaultValue: 'Showing {{count}} of {{total}} on this page' })}
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
                  <TableHead className="w-[120px]">{t('auditLog.columns.action')}</TableHead>
                  <TableHead className="w-[120px]">{t('auditLog.columns.resource')}</TableHead>
                  <TableHead className="w-[100px]">{t('auditLog.columns.resourceId')}</TableHead>
                  <TableHead className="w-[100px]">{t('auditLog.columns.userId')}</TableHead>
                  <TableHead className="w-[80px]">{t('auditLog.columns.status')}</TableHead>
                  <TableHead className="w-[80px]">{t('auditLog.columns.duration')}</TableHead>
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
                        {entry.action}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm font-medium">
                      {entry.resourceType}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground" title={entry.resourceId || undefined}>
                      {shortId(entry.resourceId)}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground" title={entry.userId || undefined}>
                      {shortId(entry.userId)}
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
