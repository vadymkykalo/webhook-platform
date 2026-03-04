import { useState, useEffect } from 'react';
import { useAuth } from '../auth/auth.store';
import { authApi } from '../api/auth.api';
import { User, Building2, Loader2, KeyRound, CheckCircle2, ShieldCheck, AlertTriangle, RotateCcw, Lock, Eye, Pencil } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { showApiError, showSuccess } from '../lib/toast';
import { formatDate } from '../lib/date';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Separator } from '../components/ui/separator';
import PasswordStrengthIndicator from '../components/PasswordStrengthIndicator';

export default function SettingsPage() {
  const { t } = useTranslation();
  const { user, updateUser } = useAuth();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState(false);

  const [fullName, setFullName] = useState(user?.user?.fullName || '');
  const [savingProfile, setSavingProfile] = useState(false);
  const profileDirty = fullName !== (user?.user?.fullName || '');

  useEffect(() => {
    setFullName(user?.user?.fullName || '');
  }, [user?.user?.fullName]);

  const handleSaveProfile = async () => {
    setSavingProfile(true);
    try {
      const updated = await authApi.updateProfile({ fullName: fullName.trim() || undefined });
      if (user) {
        updateUser({ ...user, user: { ...user.user, fullName: updated.fullName } });
      }
      showSuccess(t('settings.toast.profileUpdated'));
    } catch (err: any) {
      showApiError(err, 'settings.profileUpdateFailed');
    } finally {
      setSavingProfile(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError('');
    setPasswordSuccess(false);

    if (newPassword !== confirmPassword) {
      setPasswordError(t('settings.passwordMismatch'));
      return;
    }

    if (newPassword.length < 8) {
      setPasswordError(t('settings.passwordTooShort'));
      return;
    }

    setChangingPassword(true);
    try {
      await authApi.changePassword(currentPassword, newPassword);
      setPasswordSuccess(true);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      showSuccess(t('settings.toast.passwordChanged'));
    } catch (err: any) {
      const msg = err.response?.data?.message || t('settings.passwordChangeFailed');
      setPasswordError(msg);
      showApiError(err, 'settings.passwordChangeFailed');
    } finally {
      setChangingPassword(false);
    }
  };

  return (
    <div className="p-6 lg:p-8 max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="text-title tracking-tight">{t('settings.title')}</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {t('settings.subtitle')}
        </p>
      </div>

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <User className="h-5 w-5 text-primary" />
              <CardTitle>{t('settings.profile')}</CardTitle>
            </div>
            <CardDescription>
              {t('settings.profileDesc')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="fullName">{t('settings.fullName')}</Label>
                <div className="flex gap-2 max-w-md">
                  <Input
                    id="fullName"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder={t('settings.fullNamePlaceholder')}
                    disabled={savingProfile}
                  />
                  <Button
                    size="sm"
                    onClick={handleSaveProfile}
                    disabled={!profileDirty || savingProfile}
                    className="shrink-0"
                  >
                    {savingProfile ? <Loader2 className="h-4 w-4 animate-spin" /> : <Pencil className="h-3.5 w-3.5 mr-1" />}
                    {savingProfile ? t('common.saving') : t('common.save')}
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">{t('settings.email')}</Label>
                <Input
                  id="email"
                  type="email"
                  value={user?.user?.email || ''}
                  disabled
                  className="bg-muted"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="role">{t('settings.role')}</Label>
                <Input
                  id="role"
                  value={user?.role || ''}
                  disabled
                  className="bg-muted"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="status">{t('settings.accountStatus')}</Label>
                <Input
                  id="status"
                  value={user?.user?.status || ''}
                  disabled
                  className="bg-muted"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <KeyRound className="h-5 w-5 text-primary" />
              <CardTitle>{t('settings.changePassword')}</CardTitle>
            </div>
            <CardDescription>
              {t('settings.changePasswordDesc')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleChangePassword} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="currentPassword">{t('settings.currentPassword')}</Label>
                <Input
                  id="currentPassword"
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  required
                  disabled={changingPassword}
                  placeholder="••••••••"
                  className="max-w-md"
                />
              </div>

              <Separator />

              <div className="space-y-2">
                <Label htmlFor="newPassword">{t('settings.newPassword')}</Label>
                <Input
                  id="newPassword"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  disabled={changingPassword}
                  placeholder="••••••••"
                  className="max-w-md"
                />
                <PasswordStrengthIndicator password={newPassword} />
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirmPassword">{t('settings.confirmPassword')}</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  disabled={changingPassword}
                  placeholder="••••••••"
                  className="max-w-md"
                />
              </div>

              {passwordError && (
                <div className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-lg p-3 max-w-md">
                  {passwordError}
                </div>
              )}

              {passwordSuccess && (
                <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg p-3 max-w-md">
                  <CheckCircle2 className="h-4 w-4" />
                  {t('settings.passwordChanged')}
                </div>
              )}

              <div>
                <Button type="submit" disabled={changingPassword || !currentPassword || !newPassword || !confirmPassword}>
                  {changingPassword && <Loader2 className="h-4 w-4 animate-spin" />}
                  {changingPassword ? t('settings.changingPassword') : t('settings.changePasswordBtn')}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Building2 className="h-5 w-5 text-primary" />
              <CardTitle>{t('settings.organization')}</CardTitle>
            </div>
            <CardDescription>
              {t('settings.organizationDesc')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>{t('settings.orgName')}</Label>
                <Input
                  value={user?.organization?.name || ''}
                  disabled
                  className="bg-muted"
                />
              </div>

              <div className="space-y-2">
                <Label>{t('settings.orgId')}</Label>
                <Input
                  value={user?.organization?.id || ''}
                  disabled
                  className="bg-muted font-mono text-sm"
                />
              </div>

              <div className="space-y-2">
                <Label>{t('settings.createdAt')}</Label>
                <Input
                  value={
                    user?.organization?.createdAt
                      ? formatDate(user.organization.createdAt)
                      : ''
                  }
                  disabled
                  className="bg-muted"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-primary" />
              <CardTitle>{t('settings.security.title')}</CardTitle>
            </div>
            <CardDescription>
              {t('settings.security.subtitle')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
                <RotateCcw className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium">{t('settings.security.secretRotation')}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{t('settings.security.secretRotationDesc')}</p>
                </div>
              </div>
              <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
                <Lock className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium">{t('settings.security.hmacVerification')}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{t('settings.security.hmacVerificationDesc')}</p>
                </div>
              </div>
              <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
                <Eye className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium">{t('settings.security.auditLogging')}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{t('settings.security.auditLoggingDesc')}</p>
                </div>
              </div>
              <Separator />
              <div className="flex items-start gap-2.5 p-3 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/40">
                <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-amber-800 dark:text-amber-200">{t('settings.security.bestPracticeTitle')}</p>
                  <ul className="text-xs text-amber-700 dark:text-amber-300 mt-1 space-y-1 list-disc list-inside">
                    <li>{t('settings.security.tip1')}</li>
                    <li>{t('settings.security.tip2')}</li>
                    <li>{t('settings.security.tip3')}</li>
                    <li>{t('settings.security.tip4')}</li>
                  </ul>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-destructive">
          <CardHeader>
            <CardTitle className="text-destructive">{t('settings.dangerZone')}</CardTitle>
            <CardDescription>
              {t('settings.dangerZoneDesc')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">{t('settings.deleteAccount')}</p>
                  <p className="text-xs text-muted-foreground">
                    {t('settings.deleteAccountDesc')}
                  </p>
                </div>
                <Button variant="destructive" disabled>
                  {t('settings.deleteAccount')}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
