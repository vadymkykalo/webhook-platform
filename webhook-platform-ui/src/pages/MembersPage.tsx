import { useState } from 'react';
import { UserPlus, Trash2, Loader2, Users } from 'lucide-react';
import { toast } from 'sonner';
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
        onSuccess: () => toast.success('Member role updated successfully'),
        onError: (err: any) => toast.error(err.response?.data?.message || 'Failed to update member role'),
      }
    );
  };

  const handleRemove = () => {
    if (!removeUserId) return;
    removeMember.mutate(removeUserId, {
      onSuccess: () => {
        toast.success('Member removed successfully');
        setRemoveUserId(null);
      },
      onError: (err: any) => toast.error(err.response?.data?.message || 'Failed to remove member'),
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
    return (
      <div className="p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <div className="h-7 w-28 bg-muted animate-pulse rounded-lg" />
            <div className="h-4 w-56 bg-muted animate-pulse rounded" />
          </div>
          <div className="h-10 w-32 bg-muted animate-pulse rounded-lg" />
        </div>
        <div className="h-[300px] bg-muted animate-pulse rounded-xl" />
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-8">
        <div>
          <h1 className="text-title tracking-tight">Members</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage access to this organization
          </p>
        </div>
        {canManageMembers && (
          <Button onClick={() => setShowAddModal(true)}>
            <UserPlus className="h-4 w-4" /> Add Member
          </Button>
        )}
      </div>

      {members.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 border border-dashed rounded-xl">
          <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-6">
            <Users className="h-8 w-8 text-primary" />
          </div>
          <h3 className="text-lg font-semibold mb-2">No members yet</h3>
          <p className="text-sm text-muted-foreground text-center mb-6 max-w-sm">
            You are the only member of this organization
          </p>
          {canManageMembers && (
            <Button onClick={() => setShowAddModal(true)}>
              <UserPlus className="h-4 w-4" /> Add member
            </Button>
          )}
        </div>
      ) : (
        <Card className="overflow-hidden animate-fade-in">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">Email</TableHead>
                <TableHead className="text-xs">Role</TableHead>
                <TableHead className="text-xs">Status</TableHead>
                <TableHead className="text-xs">Joined</TableHead>
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
                          <Badge variant="outline" className="ml-2 text-[10px] py-0">You</Badge>
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
                        <option value="DEVELOPER">Developer</option>
                        <option value="VIEWER">Viewer</option>
                      </Select>
                    ) : (
                      <Badge variant={getRoleBadgeVariant(member.role)}>{member.role}</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant={getStatusBadgeVariant(member.status)}>{member.status}</Badge>
                  </TableCell>
                  <TableCell>
                    <span className="text-[13px] text-muted-foreground">{new Date(member.createdAt).toLocaleDateString()}</span>
                  </TableCell>
                  {canManageMembers && (
                    <TableCell>
                      {member.userId !== user?.user?.id && (
                        <Button variant="ghost" size="icon-sm" onClick={() => setRemoveUserId(member.userId)} title="Remove" className="text-muted-foreground hover:text-destructive">
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
            <AlertDialogTitle>Remove Member?</AlertDialogTitle>
            <AlertDialogDescription>
              This member will lose access to the organization and all its resources.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removeMember.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRemove}
              disabled={removeMember.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {removeMember.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {removeMember.isPending ? 'Removing...' : 'Remove'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
