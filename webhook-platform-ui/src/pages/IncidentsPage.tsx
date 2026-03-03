import { useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  Flame, Plus, Loader2, CheckCircle2, AlertTriangle, Search as SearchIcon,
  XCircle, Send, RotateCcw, MessageSquare, ArrowRight, ChevronDown, ChevronUp
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { showSuccess, showApiError } from '../lib/toast';
import {
  useIncidents, useIncident, useCreateIncident, useUpdateIncident, useAddTimelineEntry, useOpenIncidentCount,
} from '../api/queries';
import type { IncidentStatus, IncidentTimelineType } from '../api/incidents.api';
import { formatDateTime, formatRelativeTime } from '../lib/date';
import PageSkeleton from '../components/PageSkeleton';
import EmptyState from '../components/EmptyState';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Select } from '../components/ui/select';
import { Badge } from '../components/ui/badge';
import { Textarea } from '../components/ui/textarea';
import { usePermissions } from '../auth/usePermissions';
import PermissionGate from '../components/PermissionGate';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '../components/ui/dialog';

const STATUS_COLORS: Record<string, string> = {
  OPEN: 'bg-red-500/10 text-red-700 dark:text-red-400',
  INVESTIGATING: 'bg-yellow-500/10 text-yellow-700 dark:text-yellow-400',
  RESOLVED: 'bg-green-500/10 text-green-700 dark:text-green-400',
};

const STATUS_ICONS: Record<string, React.ElementType> = {
  OPEN: XCircle,
  INVESTIGATING: SearchIcon,
  RESOLVED: CheckCircle2,
};

const TIMELINE_ICONS: Record<string, React.ElementType> = {
  FAILURE: XCircle,
  RETRY: RotateCcw,
  REPLAY: Send,
  NOTE: MessageSquare,
  STATUS_CHANGE: ArrowRight,
};

const TIMELINE_COLORS: Record<string, string> = {
  FAILURE: 'text-red-500',
  RETRY: 'text-yellow-500',
  REPLAY: 'text-blue-500',
  NOTE: 'text-muted-foreground',
  STATUS_CHANGE: 'text-purple-500',
};

export default function IncidentsPage() {
  const { t } = useTranslation();
  const { projectId } = useParams<{ projectId: string }>();
  const { canManageEndpoints } = usePermissions();

  const [openOnly, setOpenOnly] = useState(true);
  const [page, setPage] = useState(0);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showNoteDialog, setShowNoteDialog] = useState<string | null>(null);

  // Create form
  const [formTitle, setFormTitle] = useState('');
  const [formSeverity, setFormSeverity] = useState('WARNING');

  // Note form
  const [noteTitle, setNoteTitle] = useState('');
  const [noteDetail, setNoteDetail] = useState('');

  const { data: incidentsData, isLoading } = useIncidents(projectId, openOnly, page);
  const { data: openCount } = useOpenIncidentCount(projectId);
  const createIncident = useCreateIncident(projectId!);
  const updateIncident = useUpdateIncident(projectId!);
  const addTimeline = useAddTimelineEntry(projectId!);

  // Expanded incident detail
  const { data: expandedIncident } = useIncident(projectId, expandedId ?? undefined);

  const incidents = incidentsData?.content ?? [];

  const handleCreate = async () => {
    try {
      await createIncident.mutateAsync({ title: formTitle, severity: formSeverity });
      showSuccess(t('incidents.toast.created', 'Incident created'));
      setShowCreateDialog(false);
      setFormTitle('');
      setFormSeverity('WARNING');
    } catch (err: any) {
      showApiError(err, 'incidents.toast.createFailed');
    }
  };

  const handleStatusChange = async (incidentId: string, status: IncidentStatus) => {
    try {
      await updateIncident.mutateAsync({ incidentId, data: { status } });
      showSuccess(t('incidents.toast.statusUpdated', 'Status updated'));
    } catch (err: any) {
      showApiError(err, 'incidents.toast.updateFailed');
    }
  };

  const handleSaveRca = async (incidentId: string, rcaNotes: string) => {
    try {
      await updateIncident.mutateAsync({ incidentId, data: { rcaNotes } });
      showSuccess(t('incidents.toast.rcaSaved', 'RCA notes saved'));
    } catch (err: any) {
      showApiError(err, 'incidents.toast.updateFailed');
    }
  };

  const handleAddNote = async () => {
    if (!showNoteDialog) return;
    try {
      await addTimeline.mutateAsync({
        incidentId: showNoteDialog,
        data: { entryType: 'NOTE' as IncidentTimelineType, title: noteTitle, detail: noteDetail || undefined },
      });
      showSuccess(t('incidents.toast.noteAdded', 'Note added'));
      setShowNoteDialog(null);
      setNoteTitle('');
      setNoteDetail('');
    } catch (err: any) {
      showApiError(err, 'incidents.toast.addNoteFailed');
    }
  };

  if (isLoading) return <PageSkeleton maxWidth="max-w-6xl" />;

  return (
    <div className="p-6 lg:p-8 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-red-500/10 flex items-center justify-center">
            <Flame className="h-5 w-5 text-red-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{t('incidents.title', 'Incidents')}</h1>
            <p className="text-sm text-muted-foreground">
              {openCount?.count ? t('incidents.openCount', { count: openCount.count, defaultValue: '{{count}} open incidents' }) : t('incidents.noOpen', 'No open incidents')}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant={openOnly ? 'default' : 'outline'} size="sm" onClick={() => { setOpenOnly(!openOnly); setPage(0); }}>
            {openOnly ? t('incidents.showAll', 'Show All') : t('incidents.openOnly', 'Open Only')}
          </Button>
          <PermissionGate allowed={canManageEndpoints}>
            <Button size="sm" onClick={() => setShowCreateDialog(true)}>
              <Plus className="h-4 w-4 mr-1" /> {t('incidents.create', 'Create Incident')}
            </Button>
          </PermissionGate>
        </div>
      </div>

      {/* List */}
      {incidents.length === 0 ? (
        <EmptyState
          icon={Flame}
          title={t('incidents.empty', 'No incidents')}
          description={t('incidents.emptyDesc', 'Incidents group related failures for tracking and RCA')}
          action={<PermissionGate allowed={canManageEndpoints}><Button onClick={() => setShowCreateDialog(true)}><Plus className="h-4 w-4 mr-1" /> {t('incidents.create', 'Create Incident')}</Button></PermissionGate>}
        />
      ) : (
        <div className="space-y-3 animate-fade-in">
          {incidents.map((incident) => {
            const isExpanded = expandedId === incident.id;
            const StatusIcon = STATUS_ICONS[incident.status] || AlertTriangle;
            return (
              <Card key={incident.id} className={isExpanded ? 'ring-2 ring-primary/20' : ''}>
                <CardHeader className="pb-2 cursor-pointer" onClick={() => setExpandedId(isExpanded ? null : incident.id)}>
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <StatusIcon className={`h-5 w-5 flex-shrink-0 ${incident.status === 'OPEN' ? 'text-red-500' : incident.status === 'INVESTIGATING' ? 'text-yellow-500' : 'text-green-500'}`} />
                      <div className="min-w-0">
                        <CardTitle className="text-base truncate">{incident.title}</CardTitle>
                        <div className="flex items-center gap-2 mt-1">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium ${STATUS_COLORS[incident.status] || ''}`}>
                            {incident.status}
                          </span>
                          <Badge variant="outline" className="text-[11px]">{incident.severity}</Badge>
                          <span className="text-[11px] text-muted-foreground">{formatRelativeTime(incident.createdAt)}</span>
                        </div>
                      </div>
                    </div>
                    {isExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                  </div>
                </CardHeader>

                {isExpanded && expandedIncident && (
                  <CardContent className="pt-0 space-y-4">
                    {/* Status actions */}
                    <PermissionGate allowed={canManageEndpoints}>
                      <div className="flex items-center gap-2 flex-wrap">
                        {expandedIncident.status !== 'INVESTIGATING' && (
                          <Button variant="outline" size="sm" onClick={() => handleStatusChange(incident.id, 'INVESTIGATING')}>
                            <SearchIcon className="h-3.5 w-3.5 mr-1" /> {t('incidents.investigate', 'Investigate')}
                          </Button>
                        )}
                        {expandedIncident.status !== 'RESOLVED' && (
                          <Button variant="outline" size="sm" className="text-green-600" onClick={() => handleStatusChange(incident.id, 'RESOLVED')}>
                            <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> {t('incidents.resolve', 'Resolve')}
                          </Button>
                        )}
                        {expandedIncident.status === 'RESOLVED' && (
                          <Button variant="outline" size="sm" className="text-red-600" onClick={() => handleStatusChange(incident.id, 'OPEN')}>
                            <XCircle className="h-3.5 w-3.5 mr-1" /> {t('incidents.reopen', 'Reopen')}
                          </Button>
                        )}
                        <Button variant="outline" size="sm" onClick={() => setShowNoteDialog(incident.id)}>
                          <MessageSquare className="h-3.5 w-3.5 mr-1" /> {t('incidents.addNote', 'Add Note')}
                        </Button>
                      </div>
                    </PermissionGate>

                    {/* RCA Notes */}
                    <div className="space-y-2">
                      <Label className="text-xs font-medium">{t('incidents.rcaNotes', 'Root Cause Analysis')}</Label>
                      <Textarea
                        className="text-sm min-h-[80px]"
                        placeholder={t('incidents.rcaPlaceholder', 'Document the root cause, impact, and remediation steps...')}
                        defaultValue={expandedIncident.rcaNotes || ''}
                        onBlur={(e) => {
                          const val = e.target.value;
                          if (val !== (expandedIncident.rcaNotes || '')) handleSaveRca(incident.id, val);
                        }}
                      />
                    </div>

                    {/* Timeline */}
                    {expandedIncident.timeline && expandedIncident.timeline.length > 0 && (
                      <div className="space-y-1">
                        <Label className="text-xs font-medium">{t('incidents.timeline', 'Timeline')}</Label>
                        <div className="relative pl-6 border-l-2 border-muted space-y-3 py-2">
                          {expandedIncident.timeline.map((entry) => {
                            const EntryIcon = TIMELINE_ICONS[entry.entryType] || ArrowRight;
                            return (
                              <div key={entry.id} className="relative">
                                <div className={`absolute -left-[25px] top-0.5 h-4 w-4 rounded-full bg-background border-2 border-muted flex items-center justify-center`}>
                                  <EntryIcon className={`h-2.5 w-2.5 ${TIMELINE_COLORS[entry.entryType] || ''}`} />
                                </div>
                                <div>
                                  <div className="flex items-center gap-2">
                                    <span className="text-sm font-medium">{entry.title}</span>
                                    <span className="text-[10px] text-muted-foreground">{formatRelativeTime(entry.createdAt)}</span>
                                  </div>
                                  {entry.detail && <p className="text-xs text-muted-foreground mt-0.5">{entry.detail}</p>}
                                  {entry.deliveryId && <code className="text-[10px] font-mono text-muted-foreground">delivery: {entry.deliveryId.substring(0, 8)}…</code>}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Meta */}
                    {expandedIncident.resolvedAt && (
                      <p className="text-xs text-muted-foreground">
                        {t('incidents.resolvedAt', 'Resolved')}: {formatDateTime(expandedIncident.resolvedAt)}
                      </p>
                    )}
                  </CardContent>
                )}
              </Card>
            );
          })}

          {/* Pagination */}
          {(incidentsData?.totalPages ?? 0) > 1 && (
            <div className="flex items-center justify-center gap-2 pt-4">
              <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)}>{t('common.previous', 'Previous')}</Button>
              <span className="text-sm text-muted-foreground">
                {page + 1} / {incidentsData?.totalPages}
              </span>
              <Button variant="outline" size="sm" disabled={page >= (incidentsData?.totalPages ?? 1) - 1} onClick={() => setPage(p => p + 1)}>{t('common.next', 'Next')}</Button>
            </div>
          )}
        </div>
      )}

      {/* Create dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('incidents.createDialog.title', 'Create Incident')}</DialogTitle>
            <DialogDescription>{t('incidents.createDialog.desc', 'Track a group of related failures')}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>{t('incidents.form.title', 'Title')}</Label>
              <Input value={formTitle} onChange={(e) => setFormTitle(e.target.value)} placeholder="e.g. Payment endpoint returning 503" />
            </div>
            <div className="space-y-2">
              <Label>{t('incidents.form.severity', 'Severity')}</Label>
              <Select value={formSeverity} onChange={(e) => setFormSeverity(e.target.value)}>
                <option value="INFO">Info</option>
                <option value="WARNING">Warning</option>
                <option value="CRITICAL">Critical</option>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>{t('common.cancel', 'Cancel')}</Button>
            <Button onClick={handleCreate} disabled={!formTitle || createIncident.isPending}>
              {createIncident.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
              {t('incidents.createDialog.submit', 'Create')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Note dialog */}
      <Dialog open={!!showNoteDialog} onOpenChange={() => setShowNoteDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('incidents.noteDialog.title', 'Add Timeline Note')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>{t('incidents.noteDialog.noteTitle', 'Title')}</Label>
              <Input value={noteTitle} onChange={(e) => setNoteTitle(e.target.value)} placeholder="e.g. Contacted vendor support" />
            </div>
            <div className="space-y-2">
              <Label>{t('incidents.noteDialog.detail', 'Detail (optional)')}</Label>
              <Textarea value={noteDetail} onChange={(e) => setNoteDetail(e.target.value)} placeholder="Additional context..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNoteDialog(null)}>{t('common.cancel', 'Cancel')}</Button>
            <Button onClick={handleAddNote} disabled={!noteTitle || addTimeline.isPending}>
              {addTimeline.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
              {t('incidents.noteDialog.submit', 'Add Note')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
