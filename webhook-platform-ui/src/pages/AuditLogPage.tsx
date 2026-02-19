import { useState, useEffect } from 'react';
import { FileText, ChevronLeft, ChevronRight, CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import { auditLogApi, AuditLogEntry, AuditLogPage as AuditLogPageData } from '../api/auditLog.api';
import { Button } from '../components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../components/ui/table';

const ACTION_COLORS: Record<string, string> = {
  CREATE: 'bg-green-100 text-green-800',
  UPDATE: 'bg-blue-100 text-blue-800',
  DELETE: 'bg-red-100 text-red-800',
  ROTATE_SECRET: 'bg-orange-100 text-orange-800',
  REVOKE: 'bg-red-100 text-red-800',
  REGISTER: 'bg-purple-100 text-purple-800',
  LOGIN: 'bg-cyan-100 text-cyan-800',
  LOGOUT: 'bg-gray-100 text-gray-800',
};

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function shortId(id: string | null) {
  if (!id) return '—';
  return id.substring(0, 8) + '…';
}

export default function AuditLogPage() {
  const [data, setData] = useState<AuditLogPageData | null>(null);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);

  const fetchData = async (p: number) => {
    setLoading(true);
    try {
      const result = await auditLogApi.list(p, 20);
      setData(result);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData(page);
  }, [page]);

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
          <FileText className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Audit Log</h1>
          <p className="text-sm text-muted-foreground">
            Track who did what in your organization
          </p>
        </div>
      </div>

      <div className="border rounded-lg bg-card overflow-hidden">
        {loading && !data ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : !data || data.content.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
            <FileText className="h-10 w-10 mb-3 opacity-40" />
            <p className="text-sm font-medium">No audit events yet</p>
            <p className="text-xs mt-1">Actions like creating endpoints, rotating secrets will appear here</p>
          </div>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[160px]">Time</TableHead>
                  <TableHead className="w-[120px]">Action</TableHead>
                  <TableHead className="w-[120px]">Resource</TableHead>
                  <TableHead className="w-[100px]">Resource ID</TableHead>
                  <TableHead className="w-[100px]">User ID</TableHead>
                  <TableHead className="w-[80px]">Status</TableHead>
                  <TableHead className="w-[80px]">Duration</TableHead>
                  <TableHead>Error</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.content.map((entry: AuditLogEntry) => (
                  <TableRow key={entry.id}>
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                      {formatDate(entry.createdAt)}
                    </TableCell>
                    <TableCell>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${ACTION_COLORS[entry.action] || 'bg-gray-100 text-gray-800'}`}>
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
                {data.totalElements} total events · Page {data.number + 1} of {data.totalPages}
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
