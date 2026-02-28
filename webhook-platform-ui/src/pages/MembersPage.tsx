import { useState } from 'react';
import { UserPlus, Trash2, Loader2, Users } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { formatDate } from '../lib/date';
import PageSkeleton from '../components/PageSkeleton';
import EmptyState from '../components/EmptyState';
import { type MembershipRole } from '../api/members.api';
import { useMembers, useChangeMemberRole, useRemoveMember } from '../api/queries';
import { useAuth } from '../auth/auth.store';
import { usePermissions } from '../auth/usePermissions';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Badge } from '../components/ui/badge';
import { Select } from '../components/ui/select';
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
import AddMemberModal from '../components/AddMemberModal';

export default function MembersPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { canManageMembers } = usePermissions();
  const [showAddModal, setShowAddModal] = useState(false);
  const [removeUserId, setRemoveUserId] = useState<string | null>(null);

  const orgId = user?.organization?.id;

  const { data: members = [], isLoading: loading } = useMembers(orgId);
  const changeRole = useChangeMemberRole(orgId!);
  const removeMember = useRemoveMember(orgId!);

  const handleChangeRole = (userId: string, newRole: MembershipRole) => {
    changeRole.mutate(
      { userId, role: newRole },
      {
        onSuccess: () => toast.success(t('members.toast.roleChanged')),
        onError: (err: any) => toast.error(err.response?.data?.message || t('members.toast.roleChangeFailed')),
      }
    );
  };

  const handleRemove = () => {
    if (!removeUserId) return;
    removeMember.mutate(removeUserId, {
      onSuccess: () => {
        toast.success(t('members.toast.removed'));
        setRemoveUserId(null);
      },
      onError: (err: any) => toast.error(err.response?.data?.message || t('members.toast.removeFailed')),
    });
  };

  const getRoleBadgeVariant = (role: MembershipRole) => {
    switch (role) {
      case 'OWNER':
        return 'default';
      case 'DEVELOPER':
        return 'secondary';
      case 'VIEWER':
        return 'outline';
      default:
        return 'outline';
    }
  };

  const getStatusBadgeVariant = (status: string) => {
    return status === 'ACTIVE' ? 'success' : 'secondary';
  };

  if (loading) {
    return <PageSkeleton maxWidth="max-w-7xl">
      <div className="h-[300px] bg-muted animate-pulse rounded-xl" />
    </PageSkeleton>;
  }

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-8">
        <div>
          <h1 className="text-title tracking-tight">{t('members.title')}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {t('members.subtitle')}
          </p>
        </div>
        {canManageMembers && (
          <Button onClick={() => setShowAddModal(true)}>
            <UserPlus className="h-4 w-4" /> {t('members.addMember')}
          </Button>
        )}
      </div>

      {members.length === 0 ? (
        <EmptyState
          icon={Users}
          title={t('members.noMembers')}
          description={t('members.noMembersDesc')}
          action={canManageMembers ? (
            <Button onClick={() => setShowAddModal(true)}>
              <UserPlus className="h-4 w-4" /> {t('members.addMemberLower')}
            </Button>
          ) : undefined}
        />
      ) : (
        <Card className="overflow-hidden animate-fade-in">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">{t('members.email')}</TableHead>
                <TableHead className="text-xs">{t('members.role')}</TableHead>
                <TableHead className="text-xs">{t('members.status')}</TableHead>
                <TableHead className="text-xs">{t('members.joined')}</TableHead>
                {canManageMembers && <TableHead className="w-[80px]"></TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.map((member) => (
                <TableRow key={member.userId} className="hover:bg-muted/30">
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                        <span className="text-xs font-bold text-primary">{member.email.charAt(0).toUpperCase()}</span>
                      </div>
                      <div>
                        <span className="text-sm font-medium">{member.email}</span>
                        {member.userId === user?.user?.id && (
                          <Badge variant="outline" className="ml-2 text-[10px] py-0">{t('members.you')}</Badge>
                        )}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    {canManageMembers && member.role !== 'OWNER' ? (
                      <Select
                        value={member.role}
                        onChange={(e) => handleChangeRole(member.userId, e.target.value as MembershipRole)}
                        disabled={changeRole.isPending}
                        className="w-32"
                      >
                        <option value="DEVELOPER">{t('members.roles.DEVELOPER')}</option>
                        <option value="VIEWER">{t('members.roles.VIEWER')}</option>
                      </Select>
                    ) : (
                      <Badge variant={getRoleBadgeVariant(member.role)}>{member.role}</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant={getStatusBadgeVariant(member.status)}>{member.status}</Badge>
                  </TableCell>
                  <TableCell>
                    <span className="text-[13px] text-muted-foreground">{formatDate(member.createdAt)}</span>
                  </TableCell>
                  {canManageMembers && (
                    <TableCell>
                      {member.userId !== user?.user?.id && (
                        <Button variant="ghost" size="icon-sm" onClick={() => setRemoveUserId(member.userId)} title={t('members.remove')} className="text-muted-foreground hover:text-destructive">
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

      {canManageMembers && (
        <AddMemberModal
          orgId={orgId!}
          open={showAddModal}
          onClose={() => setShowAddModal(false)}
          onSuccess={() => { }}
        />
      )}

      <AlertDialog open={!!removeUserId} onOpenChange={() => setRemoveUserId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('members.removeDialog.title')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('members.removeDialog.description')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removeMember.isPending}>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRemove}
              disabled={removeMember.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {removeMember.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {removeMember.isPending ? t('members.removing') : t('members.remove')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
