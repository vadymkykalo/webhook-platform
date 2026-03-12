import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { showApiError, showSuccess } from '../lib/toast';
import { membersApi, MembershipRole } from '../api/members.api';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select } from './ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';

interface AddMemberModalProps {
  orgId: string;
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function AddMemberModal({
  orgId,
  open,
  onClose,
  onSuccess,
}: AddMemberModalProps) {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<MembershipRole>('DEVELOPER');
  const [adding, setAdding] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const handleClose = () => {
    setEmail('');
    setRole('DEVELOPER');
    setErrors({});
    onClose();
  };

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!email.trim()) {
      newErrors.email = t('members.addModal.emailRequired');
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      newErrors.email = t('members.addModal.emailInvalid');
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validate()) {
      return;
    }

    setAdding(true);
    try {
      const response = await membersApi.add(orgId, {
        email: email.trim(),
        role,
      });
      
      // Invite token is sent via email only (not returned in API response for security)
      if (response.status === 'INVITED') {
        showSuccess(t('members.toast.invited'));
      } else {
        showSuccess(t('members.toast.added'));
      }
      
      handleClose();
      onSuccess();
    } catch (err: any) {
      showApiError(err, 'members.toast.addFailed');
    } finally {
      setAdding(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t('members.addModal.title')}</DialogTitle>
          <DialogDescription>
            {t('members.addModal.description')}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="email">
                  {t('members.addModal.email')} <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="member@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={adding}
                  required
                />
                {errors.email && (
                  <p className="text-sm text-destructive">{errors.email}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="role">
                  {t('members.addModal.role')} <span className="text-destructive">*</span>
                </Label>
                <Select
                  id="role"
                  value={role}
                  onChange={(e) => setRole(e.target.value as MembershipRole)}
                  disabled={adding}
                >
                  <option value="DEVELOPER">{t('members.roles.DEVELOPER')}</option>
                  <option value="VIEWER">{t('members.roles.VIEWER')}</option>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {t('members.addModal.roleHint')}
                </p>
              </div>

              <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900 rounded-md p-3">
                <p className="text-sm text-blue-900 dark:text-blue-200">
                  {t('members.addModal.emailNote')}
                </p>
              </div>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={handleClose}
                disabled={adding}
              >
                {t('common.cancel')}
              </Button>
              <Button type="submit" disabled={adding}>
                {adding && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {adding ? t('members.addModal.adding') : t('members.addModal.submit')}
              </Button>
            </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
