import { useState } from 'react';
import { Loader2, Copy, CheckCircle2, Link as LinkIcon } from 'lucide-react';
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
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const handleClose = () => {
    setEmail('');
    setRole('DEVELOPER');
    setErrors({});
    setInviteLink(null);
    setCopied(false);
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

  const handleCopy = () => {
    if (!inviteLink) return;
    navigator.clipboard.writeText(inviteLink);
    setCopied(true);
    showSuccess(t('members.toast.linkCopied'));
    setTimeout(() => setCopied(false), 2000);
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
      
      if (response.status === 'INVITED' && response.inviteToken) {
        const link = `${window.location.origin}/accept-invite?token=${encodeURIComponent(response.inviteToken)}&orgId=${encodeURIComponent(orgId)}`;
        setInviteLink(link);
        showSuccess(t('members.toast.invited'));
      } else {
        showSuccess(t('members.toast.added'));
        handleClose();
      }
      
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

        {inviteLink ? (
          <div className="space-y-4 py-4">
            <div className="flex items-center gap-2 text-green-600 mb-2">
              <CheckCircle2 className="h-5 w-5" />
              <span className="text-sm font-medium">{t('members.addModal.inviteSent')}</span>
            </div>
            <div className="space-y-2">
              <Label className="flex items-center gap-1.5">
                <LinkIcon className="h-3.5 w-3.5" />
                {t('members.addModal.inviteLink')}
              </Label>
              <div className="flex items-center gap-2">
                <Input
                  value={inviteLink}
                  readOnly
                  className="font-mono text-xs"
                />
                <Button variant="outline" size="icon" onClick={handleCopy} title={t('members.addModal.copyLink')}>
                  {copied ? <CheckCircle2 className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                {t('members.addModal.inviteLinkHint')}
              </p>
            </div>
            <DialogFooter>
              <Button onClick={handleClose}>{t('common.done')}</Button>
            </DialogFooter>
          </div>
        ) : (
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
        )}
      </DialogContent>
    </Dialog>
  );
}
