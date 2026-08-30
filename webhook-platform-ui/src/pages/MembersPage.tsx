import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { UserPlus, Trash2, Users, RefreshCw, MailX } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { showApiError, showSuccess } from '../lib/toast';
import { formatDate } from '../lib/date';
import PageSkeleton, { SkeletonTable } from '../components/PageSkeleton';
import PageHeader from '../components/PageHeader';
import EmptyState, { ErrorState } from '../components/EmptyState';
import StatusBadge, { type StatusKind } from '../components/StatusBadge';
import PermissionGate, { GRANTABLE_ROLES, ROLES, ROLE_ICON, RoleCard } from '../components/PermissionGate';
import DangerConfirmDialog from '../components/DangerConfirmDialog';
import ConfirmDialog from '../components/ConfirmDialog';
import AddMemberModal from '../components/AddMemberModal';
import InviteLink from '../components/InviteLink';
import { type MembershipRole, type MemberResponse } from '../api/members.api';
import { useMembers, useChangeMemberRole, useRemoveMember, useReissueInvite } from '../api/queries';
import { useAuth } from '../auth/auth.store';
import { usePermissions } from '../auth/usePermissions';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Select } from '../components/ui/select';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '../components/ui/dialog';

/** A membership status is a state, not a delivery outcome, but it reads on the same four meanings. */
function kindOfMemberStatus(status: string): StatusKind {
  if (status === 'ACTIVE') return 'ok';
  if (status === 'INVITED') return 'retry';
  return 'idle';
}

export default function MembersPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { canManageMembers } = usePermissions();
  const [showAddModal, setShowAddModal] = useState(false);
  const [removing, setRemoving] = useState<MemberResponse | null>(null);
  const [revoking, setRevoking] = useState<MemberResponse | null>(null);
  const [reissued, setReissued] = useState<MemberResponse | null>(null);

  const emailDelivered = user?.emailDeliveryEnabled ?? false;

  const orgId = user?.organization?.id;
  const queryClient = useQueryClient();

  const { data: members = [], isLoading, isError, error, refetch, isRefetching } = useMembers(orgId);
  const changeRole = useChangeMemberRole(orgId!);
  const removeMember = useRemoveMember(orgId!);
  const reissueInvite = useReissueInvite(orgId!);

  const handleChangeRole = (userId: string, newRole: MembershipRole) => {
    changeRole.mutate(
      { userId, role: newRole },
      {
        onSuccess: () => showSuccess(t('members.toast.roleChanged')),
        onError: (err: any) => showApiError(err, 'members.toast.roleChangeFailed'),
      }
    );
  };

  const handleRemove = () => {
    if (!removing) return;
    removeMember.mutate(removing.userId, {
      onSuccess: () => {
        showSuccess(t('members.toast.removed'));
        setRemoving(null);
      },
      onError: (err: any) => showApiError(err, 'members.toast.removeFailed'),
    });
  };

  /* An invite that has not been accepted has no member behind it yet, so taking it
     back is deleting the membership row — the same call as removing a member, asked
     for in the words of what it actually does and without the type-the-name ritual
     an irreversible removal earns. */
  const handleRevoke = () => {
    if (!revoking) return;
    removeMember.mutate(revoking.userId, {
      onSuccess: () => {
        showSuccess(t('members.toast.inviteRevoked'));
        setRevoking(null);
      },
      onError: (err: any) => showApiError(err, 'members.toast.revokeFailed'),
    });
  };

  /* Re-issuing replaces the token, so the previous link stops working. The new one
     is put on screen rather than announced as sent: with EMAIL_ENABLED=false, the
     shipped default, nothing leaves the server. */
  const handleReissue = (member: MemberResponse) => {
    reissueInvite.mutate(member.userId, {
      onSuccess: (fresh) => setReissued(fresh),
      onError: (err: any) => showApiError(err, 'members.toast.reissueFailed'),
    });
  };

  if (isLoading) {
    return (
      <PageSkeleton>
        <SkeletonTable rows={5} />
      </PageSkeleton>
    );
  }

  const addButton = (
    <PermissionGate allowed={canManageMembers} requiredRole="OWNER">
      <Button onClick={() => setShowAddModal(true)}>
        <UserPlus className="h-4 w-4" aria-hidden /> {t('members.addMember')}
      </Button>
    </PermissionGate>
  );

  return (
    <div className="p-4 lg:p-6">
      <PageHeader
        eyebrow={user?.organization?.name}
        title={t('members.title')}
        description={t('members.subtitle')}
        actions={addButton}
      />

      {/* What each role grants, on the page that grants it. */}
      <section aria-labelledby="roles-heading" className="mb-6">
        <h3 id="roles-heading" className="mono-label mb-2.5">{t('members.rolesHeading')}</h3>
        <div className="grid gap-3 sm:grid-cols-3">
          {ROLES.map((role) => (
            <RoleCard key={role} role={role} count={members.filter((m) => m.role === role).length} />
          ))}
        </div>
      </section>

      {isError ? (
        <ErrorState
          error={error}
          fallbackKey="members.loadFailed"
          onRetry={() => refetch()}
          retrying={isRefetching}
        />
      ) : members.length === 0 ? (
        <EmptyState
          icon={Users}
          title={t('members.noMembers')}
          description={t('members.noMembersDesc')}
          action={canManageMembers ? (
            <Button onClick={() => setShowAddModal(true)}>
              <UserPlus className="h-4 w-4" aria-hidden /> {t('members.addMemberLower')}
            </Button>
          ) : undefined}
        />
      ) : (
        <Card className="animate-fade-in overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('members.email')}</TableHead>
                <TableHead className="w-[190px]">{t('members.role')}</TableHead>
                <TableHead className="w-[120px]">{t('members.status')}</TableHead>
                <TableHead className="w-[130px]">{t('members.joined')}</TableHead>
                {canManageMembers && (
                  <TableHead className="w-[60px]"><span className="sr-only">{t('common.actions')}</span></TableHead>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.map((member) => {
                const isSelf = member.userId === user?.user?.id;
                const RoleIcon = ROLE_ICON[member.role];
                return (
                  <TableRow key={member.userId}>
                    <TableCell>
                      <div className="flex items-center gap-2.5">
                        <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-accent" aria-hidden>
                          <span className="font-mono text-[11px] font-medium text-accent-foreground">
                            {member.email.charAt(0).toUpperCase()}
                          </span>
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate font-mono text-[13px]">{member.email}</span>
                          {isSelf && (
                            <span className="text-[11px] text-muted-foreground">{t('members.you')}</span>
                          )}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      {canManageMembers && member.role !== 'OWNER' && !isSelf ? (
                        <Select
                          value={member.role}
                          onChange={(e) => handleChangeRole(member.userId, e.target.value as MembershipRole)}
                          disabled={changeRole.isPending}
                          aria-label={t('members.changeRoleFor', { email: member.email })}
                          className="h-8 w-[150px] text-[13px]"
                        >
                          {GRANTABLE_ROLES.map((role) => (
                            <option key={role} value={role}>{t(`roles.${role}.name`)}</option>
                          ))}
                        </Select>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 text-sm">
                          <RoleIcon className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
                          {t(`roles.${member.role}.name`)}
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      <StatusBadge
                        kind={kindOfMemberStatus(member.status)}
                        label={t(`members.statuses.${member.status}`)}
                      />
                      {member.status === 'INVITED' && member.inviteExpiresAt && (
                        <span className="mt-1 block text-[11px] text-muted-foreground">
                          {new Date(member.inviteExpiresAt) < new Date()
                            ? t('members.inviteExpired')
                            : t('members.inviteExpires', { when: formatDate(member.inviteExpiresAt) })}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-[13px] text-muted-foreground">
                      {formatDate(member.createdAt)}
                    </TableCell>
                    {canManageMembers && (
                      <TableCell>
                        {!isSelf && (
                          <div className="flex items-center gap-0.5">
                            {member.status === 'INVITED' && (
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                onClick={() => handleReissue(member)}
                                disabled={reissueInvite.isPending}
                                title={t('members.reissueInvite')}
                                aria-label={t('members.reissueInviteFor', { email: member.email })}
                                className="text-muted-foreground hover:text-foreground"
                              >
                                <RefreshCw className="h-3.5 w-3.5" />
                              </Button>
                            )}
                            {member.status === 'INVITED' ? (
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                onClick={() => setRevoking(member)}
                                title={t('members.revokeInvite')}
                                aria-label={t('members.revokeInviteFor', { email: member.email })}
                                className="text-muted-foreground hover:text-halt"
                              >
                                <MailX className="h-3.5 w-3.5" />
                              </Button>
                            ) : (
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                onClick={() => setRemoving(member)}
                                title={t('members.remove')}
                                aria-label={t('members.removeFrom', { email: member.email })}
                                className="text-muted-foreground hover:text-halt"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            )}
                          </div>
                        )}
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      )}

      {canManageMembers && (
        <AddMemberModal
          orgId={orgId!}
          open={showAddModal}
          onClose={() => setShowAddModal(false)}
          onSuccess={() => { queryClient.invalidateQueries({ queryKey: ['members'] }); }}
        />
      )}

      <ConfirmDialog
        open={!!revoking}
        onOpenChange={(open) => !open && setRevoking(null)}
        title={t('members.revokeDialog.title')}
        description={t('members.revokeDialog.description', { email: revoking?.email ?? '' })}
        onConfirm={handleRevoke}
        loading={removeMember.isPending}
        confirmLabel={t('members.revokeInvite')}
      />

      <Dialog open={!!reissued} onOpenChange={(open) => !open && setReissued(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t('members.reissueDialog.title')}</DialogTitle>
            <DialogDescription>{t('members.reissueDialog.description')}</DialogDescription>
          </DialogHeader>
          {reissued?.inviteUrl && (
            <InviteLink
              email={reissued.email}
              url={reissued.inviteUrl}
              emailDelivered={emailDelivered}
            />
          )}
        </DialogContent>
      </Dialog>

      <DangerConfirmDialog
        open={!!removing}
        onOpenChange={(open) => !open && setRemoving(null)}
        title={t('members.removeDialog.title')}
        description={t('members.removeDialog.description', { email: removing?.email ?? '' })}
        confirmName={removing?.email ?? ''}
        impact={[
          t('members.removeDialog.impactAccess'),
          t('members.removeDialog.impactKeys'),
          t('members.removeDialog.impactReinvite'),
        ]}
        onConfirm={handleRemove}
        loading={removeMember.isPending}
        confirmLabel={t('members.remove')}
      />
    </div>
  );
}
