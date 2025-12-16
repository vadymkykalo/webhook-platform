import { useState, useEffect } from 'react';
import { ChevronRight, UserPlus, Trash2, Loader2, Users } from 'lucide-react';
import { toast } from 'sonner';
import { membersApi, MemberResponse, MembershipRole } from '../api/members.api';
import { useAuth } from '../auth/auth.store';
import { Button } from '../components/ui/button';
import { Card, CardContent } from '../components/ui/card';
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
  const [members, setMembers] = useState<MemberResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [removeUserId, setRemoveUserId] = useState<string | null>(null);
  const [removingUserId, setRemovingUserId] = useState<string | null>(null);
  const [changingRoleUserId, setChangingRoleUserId] = useState<string | null>(null);

  const orgId = user?.currentOrganization?.id;
  // Assuming current user is OWNER for now - backend should provide this in user object
  const currentUserRole = 'OWNER' as MembershipRole;
  const isOwner = currentUserRole === 'OWNER';

  useEffect(() => {
    if (orgId) {
      loadMembers();
    }
  }, [orgId]);

  const loadMembers = async () => {
    if (!orgId) return;

    try {
      setLoading(true);
      const data = await membersApi.list(orgId);
      setMembers(data);
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to load members');
    } finally {
      setLoading(false);
    }
  };

  const handleChangeRole = async (userId: string, newRole: MembershipRole) => {
    if (!orgId) return;

    setChangingRoleUserId(userId);
    try {
      await membersApi.changeRole(orgId, userId, { role: newRole });
      toast.success('Member role updated successfully');
      loadMembers();
    } catch (err: any) {
      const errorMessage = err.response?.data?.message || 'Failed to update member role';
      toast.error(errorMessage);
    } finally {
      setChangingRoleUserId(null);
    }
  };

  const handleRemove = async () => {
    if (!removeUserId || !orgId) return;

    setRemovingUserId(removeUserId);
    try {
      await membersApi.remove(orgId, removeUserId);
      toast.success('Member removed successfully');
      setRemoveUserId(null);
      loadMembers();
    } catch (err: any) {
      const errorMessage = err.response?.data?.message || 'Failed to remove member';
      toast.error(errorMessage);
    } finally {
      setRemovingUserId(null);
    }
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
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        <div className="space-y-4">
          <div className="h-8 w-96 bg-muted animate-pulse rounded" />
          <div className="h-4 w-64 bg-muted animate-pulse rounded" />
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl">
      <div className="flex items-center text-sm text-muted-foreground mb-6">
        <span className="text-foreground font-medium">Organization</span>
        <ChevronRight className="h-4 w-4 mx-2" />
        <span className="text-foreground">Members</span>
      </div>

      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Members</h1>
          <p className="text-muted-foreground mt-1">
            Manage access to this organization
          </p>
        </div>
        {isOwner && (
          <Button onClick={() => setShowAddModal(true)} size="lg">
            <UserPlus className="mr-2 h-4 w-4" />
            Add Member
          </Button>
        )}
      </div>

      {members.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <div className="rounded-full bg-primary/10 p-4 mb-4">
              <Users className="h-10 w-10 text-primary" />
            </div>
            <h3 className="text-xl font-semibold mb-2">No members yet</h3>
            <p className="text-muted-foreground text-center mb-6 max-w-sm">
              You are the only member of this organization
            </p>
            {isOwner && (
              <Button onClick={() => setShowAddModal(true)} size="lg">
                <UserPlus className="mr-2 h-4 w-4" />
                Add Your First Member
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Joined</TableHead>
                {isOwner && <TableHead className="w-[100px]">Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.map((member) => (
                <TableRow key={member.userId}>
                  <TableCell>
                    <span className="font-medium">{member.email}</span>
                    {member.userId === user?.id && (
                      <Badge variant="outline" className="ml-2 text-xs">
                        You
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    {isOwner && member.role !== 'OWNER' ? (
                      <Select
                        value={member.role}
                        onChange={(e) => handleChangeRole(member.userId, e.target.value as MembershipRole)}
                        disabled={changingRoleUserId === member.userId}
                        className="w-36"
                      >
                        <option value="DEVELOPER">Developer</option>
                        <option value="VIEWER">Viewer</option>
                      </Select>
                    ) : (
                      <Badge variant={getRoleBadgeVariant(member.role)}>
                        {member.role}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant={getStatusBadgeVariant(member.status)}>
                      {member.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm text-muted-foreground">
                      {new Date(member.createdAt).toLocaleDateString()}
                    </span>
                  </TableCell>
                  {isOwner && (
                    <TableCell>
                      {member.userId !== user?.id && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setRemoveUserId(member.userId)}
                          title="Remove member"
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
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

      {isOwner && (
        <AddMemberModal
          orgId={orgId!}
          open={showAddModal}
          onClose={() => setShowAddModal(false)}
          onSuccess={loadMembers}
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
            <AlertDialogCancel disabled={!!removingUserId}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRemove}
              disabled={!!removingUserId}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {removingUserId && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {removingUserId ? 'Removing...' : 'Remove'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
