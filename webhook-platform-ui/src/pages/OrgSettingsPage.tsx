import { useState, useEffect } from 'react';
import { useAuth } from '../auth/auth.store';
import { organizationsApi } from '../api/organizations.api';
import { membersApi } from '../api/members.api';
import { useProjects } from '../api/queries';
import { Building2, Users, Loader2, Pencil, Calendar, Hash, Shield, AlertTriangle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { showApiError, showSuccess } from '../lib/toast';
import { formatDate } from '../lib/date';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Select } from '../components/ui/select';
import ConfigExportImport from '../components/ConfigExportImport';

interface MemberInfo {
  id: string;
  email: string;
  role: string;
}

export default function OrgSettingsPage() {
  const { t } = useTranslation();
  const { user, updateUser } = useAuth();

  const orgId = user?.organization?.id || '';
  const orgName = user?.organization?.name || '';
  const orgCreatedAt = user?.organization?.createdAt || '';

  const [name, setName] = useState(orgName);
  const [saving, setSaving] = useState(false);
  const [members, setMembers] = useState<MemberInfo[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(true);
  const dirty = name !== orgName;

  const { data: projects = [] } = useProjects();
  const [exportProjectId, setExportProjectId] = useState('');
  const selectedProject = projects.find(p => p.id === exportProjectId);

  useEffect(() => {
    if (projects.length > 0 && !exportProjectId) {
      setExportProjectId(projects[0].id);
    }
  }, [projects, exportProjectId]);

  useEffect(() => {
    setName(orgName);
  }, [orgName]);

  useEffect(() => {
    if (orgId) {
      setLoadingMembers(true);
      membersApi.list(orgId)
        .then((data) => setMembers(data.map(m => ({ id: m.userId, email: m.email, role: m.role }))))
        .catch(() => setMembers([]))
        .finally(() => setLoadingMembers(false));
    }
  }, [orgId]);

  const handleSave = async () => {
    if (!orgId || !dirty) return;
    setSaving(true);
    try {
      const updated = await organizationsApi.update(orgId, { name: name.trim() });
      if (user) {
        updateUser({
          ...user,
          organization: { ...user.organization, name: updated.name },
        });
      }
      showSuccess(t('orgSettings.toast.updated'));
    } catch (err: any) {
      showApiError(err, 'orgSettings.toast.updateFailed');
    } finally {
      setSaving(false);
    }
  };

  const ownerCount = members.filter(m => m.role === 'OWNER').length;
  const developerCount = members.filter(m => m.role === 'DEVELOPER').length;
  const viewerCount = members.filter(m => m.role === 'VIEWER').length;

  return (
    <div className="p-6 lg:p-8 max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="text-title tracking-tight">{t('orgSettings.title')}</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {t('orgSettings.subtitle')}
        </p>
      </div>

      <div className="space-y-6">
        {/* Organization Details */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Building2 className="h-5 w-5 text-primary" />
              <CardTitle>{t('orgSettings.details')}</CardTitle>
            </div>
            <CardDescription>{t('orgSettings.detailsDesc')}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="orgName">{t('orgSettings.orgName')}</Label>
                <div className="flex gap-2 max-w-md">
                  <Input
                    id="orgName"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder={t('orgSettings.orgNamePlaceholder')}
                    disabled={saving}
                  />
                  <Button
                    size="sm"
                    onClick={handleSave}
                    disabled={!dirty || saving || !name.trim()}
                    className="shrink-0"
                  >
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Pencil className="h-3.5 w-3.5 mr-1" />}
                    {saving ? t('common.saving') : t('common.save')}
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="orgId">{t('orgSettings.orgId')}</Label>
                <Input id="orgId" value={orgId} disabled className="bg-muted font-mono text-xs max-w-md" />
              </div>

              <div className="space-y-2">
                <Label>{t('orgSettings.createdAt')}</Label>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Calendar className="h-4 w-4" />
                  {orgCreatedAt ? formatDate(orgCreatedAt) : '—'}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Members Overview */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" />
              <CardTitle>{t('orgSettings.membersOverview')}</CardTitle>
            </div>
            <CardDescription>{t('orgSettings.membersOverviewDesc')}</CardDescription>
          </CardHeader>
          <CardContent>
            {loadingMembers ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
                <Loader2 className="h-4 w-4 animate-spin" />
                {t('common.loading')}
              </div>
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="text-center p-3 rounded-lg bg-muted/50">
                    <div className="text-2xl font-bold">{members.length}</div>
                    <div className="text-xs text-muted-foreground">{t('orgSettings.totalMembers')}</div>
                  </div>
                  <div className="text-center p-3 rounded-lg bg-muted/50">
                    <div className="text-2xl font-bold">{ownerCount}</div>
                    <div className="text-xs text-muted-foreground">{t('orgSettings.owners')}</div>
                  </div>
                  <div className="text-center p-3 rounded-lg bg-muted/50">
                    <div className="text-2xl font-bold">{developerCount}</div>
                    <div className="text-xs text-muted-foreground">{t('orgSettings.developers')}</div>
                  </div>
                  <div className="text-center p-3 rounded-lg bg-muted/50">
                    <div className="text-2xl font-bold">{viewerCount}</div>
                    <div className="text-xs text-muted-foreground">{t('orgSettings.viewers')}</div>
                  </div>
                </div>

                <div className="border rounded-lg divide-y">
                  {members.map((member) => (
                    <div key={member.id} className="flex items-center justify-between p-3">
                      <div className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-medium text-primary">
                          {member.email[0].toUpperCase()}
                        </div>
                        <span className="text-sm">{member.email}</span>
                      </div>
                      <Badge variant={member.role === 'OWNER' ? 'default' : 'secondary'}>
                        {member.role}
                      </Badge>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Config Export/Import */}
        {projects.length > 0 && (
          <div className="space-y-3">
            {projects.length > 1 && (
              <div className="space-y-2">
                <Label>{t('configExport.selectProject')}</Label>
                <Select
                  value={exportProjectId}
                  onChange={(e) => setExportProjectId(e.target.value)}
                  className="max-w-md"
                >
                  {projects.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </Select>
              </div>
            )}
            {exportProjectId && selectedProject && (
              <ConfigExportImport
                projectId={exportProjectId}
                projectName={selectedProject.name}
              />
            )}
          </div>
        )}

        {/* Security Overview */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-primary" />
              <CardTitle>{t('orgSettings.security')}</CardTitle>
            </div>
            <CardDescription>{t('orgSettings.securityDesc')}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3 text-sm">
              <div className="flex items-center gap-2">
                <Hash className="h-4 w-4 text-muted-foreground" />
                <span className="text-muted-foreground">{t('orgSettings.authMethod')}:</span>
                <Badge variant="outline">JWT + API Key</Badge>
              </div>
              <div className="flex items-center gap-2">
                <Shield className="h-4 w-4 text-muted-foreground" />
                <span className="text-muted-foreground">{t('orgSettings.rbac')}:</span>
                <Badge variant="outline">OWNER / DEVELOPER / VIEWER</Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Danger Zone — OWNER only */}
        {user?.role === 'OWNER' && (
          <DangerZone orgId={orgId} orgName={orgName} />
        )}
      </div>
    </div>
  );
}

function DangerZone({ orgId, orgName }: { orgId: string; orgName: string }) {
  const { t } = useTranslation();
  const { logout } = useAuth();
  const [confirmName, setConfirmName] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const handleDelete = async () => {
    if (confirmName !== orgName) return;
    setDeleting(true);
    try {
      await organizationsApi.delete(orgId);
      showSuccess(t('orgSettings.deleteOrgSuccess'));
      logout();
    } catch (err: any) {
      showApiError(err, 'orgSettings.deleteOrgFailed');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Card className="border-destructive/50">
      <CardHeader>
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-destructive" />
          <CardTitle className="text-destructive">{t('orgSettings.dangerZone')}</CardTitle>
        </div>
        <CardDescription>{t('orgSettings.dangerZoneDesc')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <h4 className="text-sm font-medium">{t('orgSettings.deleteOrg')}</h4>
          <p className="text-xs text-muted-foreground mt-1">{t('orgSettings.deleteOrgDesc')}</p>
        </div>
        {!expanded ? (
          <Button variant="destructive" size="sm" onClick={() => setExpanded(true)}>
            {t('orgSettings.deleteOrg')}
          </Button>
        ) : (
          <div className="space-y-3 p-4 border border-destructive/30 rounded-lg bg-destructive/5">
            <Label className="text-sm">
              {t('orgSettings.deleteOrgConfirm')} <strong>{orgName}</strong>
            </Label>
            <Input
              value={confirmName}
              onChange={(e) => setConfirmName(e.target.value)}
              placeholder={orgName}
              className="max-w-md"
            />
            <div className="flex gap-2">
              <Button
                variant="destructive"
                size="sm"
                disabled={confirmName !== orgName || deleting}
                onClick={handleDelete}
              >
                {deleting && <Loader2 className="h-3 w-3 animate-spin mr-1" />}
                {t('orgSettings.deleteOrgButton')}
              </Button>
              <Button variant="outline" size="sm" onClick={() => { setExpanded(false); setConfirmName(''); }}>
                {t('common.cancel')}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
