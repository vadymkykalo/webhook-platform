import { useState, useEffect, useCallback } from 'react';
import { Outlet, useNavigate, useLocation, Link, useParams } from 'react-router-dom';
import {
  Menu, X, LogOut, FolderKanban, Webhook, Users, LayoutDashboard, Settings, Building2, CreditCard,
  BookOpen, ChevronRight, ChevronDown, Radio, Send, Key, BarChart3, AlertTriangle, TestTube,
  Bell, Search, ChevronsLeft, FileText, Mail, Loader2, Moon, Sun,
  ArrowDownToLine, Activity, FileJson2, Shield, GitCompare, History, Repeat2, Cable, Play, Network, GitBranch
} from 'lucide-react';
import { HookflowIcon } from '../components/icons/HookflowIcon';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../auth/auth.store';
import { useProject } from '../api/queries';
import { authApi } from '../api/auth.api';
import { Button } from '../components/ui/button';
import { cn } from '../lib/utils';
import { type Role, hasMinRole } from '../auth/ProtectedRoute';
import { usePermissions } from '../auth/usePermissions';
import { showApiError, showSuccess } from '../lib/toast';
import { CommandPalette } from '../components/CommandPalette';
import { getTheme, setTheme } from '../lib/theme';
import LanguageSwitcher from '../components/LanguageSwitcher';
import ProjectSwitcher from '../components/ProjectSwitcher';

interface NavItem {
  nameKey: string;
  path: string;
  icon: React.ElementType;
  badge?: string;
  requiredRole?: Role;
}

const mainNav: NavItem[] = [
  { nameKey: 'nav.dashboard', path: '/admin/dashboard', icon: LayoutDashboard },
  { nameKey: 'nav.projects', path: '/admin/projects', icon: FolderKanban },
];

const orgNav: NavItem[] = [
  { nameKey: 'nav.members', path: '/admin/members', icon: Users, requiredRole: 'OWNER' },
  { nameKey: 'nav.auditLog', path: '/admin/audit-log', icon: FileText },
  { nameKey: 'nav.orgSettings', path: '/admin/org-settings', icon: Building2, requiredRole: 'OWNER' },
  { nameKey: 'nav.billing', path: '/admin/billing', icon: CreditCard, requiredRole: 'OWNER' },
  { nameKey: 'nav.settings', path: '/admin/settings', icon: Settings, requiredRole: 'OWNER' },
];

const getProjectOutgoingNav = (projectId: string): NavItem[] => [
  { nameKey: 'nav.connectionSetup', path: `/admin/projects/${projectId}/connection-setup`, icon: Cable },
  { nameKey: 'nav.connections', path: `/admin/projects/${projectId}/connections`, icon: Network },
  { nameKey: 'nav.endpoints', path: `/admin/projects/${projectId}/endpoints`, icon: Webhook },
  { nameKey: 'nav.subscriptions', path: `/admin/projects/${projectId}/subscriptions`, icon: Bell },
  { nameKey: 'nav.events', path: `/admin/projects/${projectId}/events`, icon: Radio },
  { nameKey: 'nav.deliveries', path: `/admin/projects/${projectId}/deliveries`, icon: Send },
];

const getProjectIncomingNav = (projectId: string): NavItem[] => [
  { nameKey: 'nav.incomingSources', path: `/admin/projects/${projectId}/incoming-sources`, icon: ArrowDownToLine },
  { nameKey: 'nav.incomingEvents', path: `/admin/projects/${projectId}/incoming-events`, icon: Activity },
];

const getProjectPipelineNav = (projectId: string): NavItem[] => [
  { nameKey: 'nav.transformations', path: `/admin/projects/${projectId}/transformations`, icon: Repeat2 },
  { nameKey: 'nav.transformStudio', path: `/admin/projects/${projectId}/transform-studio`, icon: GitCompare },
  { nameKey: 'nav.rules', path: `/admin/projects/${projectId}/rules`, icon: GitBranch },
  { nameKey: 'nav.schemas', path: `/admin/projects/${projectId}/schemas`, icon: FileJson2 },
];

const getProjectObservabilityNav = (projectId: string): NavItem[] => [
  { nameKey: 'nav.analytics', path: `/admin/projects/${projectId}/analytics`, icon: BarChart3 },
  { nameKey: 'nav.alerts', path: `/admin/projects/${projectId}/alerts`, icon: Bell },
  { nameKey: 'nav.incidents', path: `/admin/projects/${projectId}/incidents`, icon: AlertTriangle },
  { nameKey: 'nav.usage', path: `/admin/projects/${projectId}/usage`, icon: Activity },
];

const getProjectRecoveryNav = (projectId: string): NavItem[] => [
  { nameKey: 'nav.replay', path: `/admin/projects/${projectId}/replay`, icon: History },
  { nameKey: 'nav.dlq', path: `/admin/projects/${projectId}/dlq`, icon: AlertTriangle },
];

const getProjectSecurityNav = (projectId: string): NavItem[] => [
  { nameKey: 'nav.apiKeys', path: `/admin/projects/${projectId}/api-keys`, icon: Key },
  { nameKey: 'nav.piiRules', path: `/admin/projects/${projectId}/pii-rules`, icon: Shield },
];

const getProjectDevToolsNav = (projectId: string): NavItem[] => [
  { nameKey: 'nav.testConsole', path: `/admin/projects/${projectId}/test-console`, icon: Play },
  { nameKey: 'nav.eventDiff', path: `/admin/projects/${projectId}/event-diff`, icon: GitCompare },
  { nameKey: 'nav.testEndpoints', path: `/admin/projects/${projectId}/test-endpoints`, icon: TestTube },
];

function SidebarSection({ label, children, collapsible = false, storageKey, defaultOpen = true }: {
  label: string;
  children: React.ReactNode;
  collapsible?: boolean;
  storageKey?: string;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(() => {
    if (!collapsible || !storageKey) return true;
    const stored = localStorage.getItem(`sidebar-${storageKey}`);
    return stored !== null ? stored === '1' : defaultOpen;
  });

  const toggle = useCallback(() => {
    if (!collapsible || !storageKey) return;
    setOpen(prev => {
      const next = !prev;
      localStorage.setItem(`sidebar-${storageKey}`, next ? '1' : '0');
      return next;
    });
  }, [collapsible, storageKey]);

  return (
    <div className="mb-2">
      {collapsible ? (
        <button
          onClick={toggle}
          className="flex items-center justify-between w-full px-3 mb-1 group"
        >
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70 group-hover:text-muted-foreground transition-colors">
            {label}
          </span>
          <ChevronDown className={cn(
            "h-3 w-3 text-muted-foreground/50 transition-transform duration-200",
            !open && "-rotate-90"
          )} />
        </button>
      ) : (
        <p className="px-3 mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
          {label}
        </p>
      )}
      {open && <div className="space-y-0.5">{children}</div>}
    </div>
  );
}

function NavLink({ item, collapsed, onClick }: { item: NavItem; collapsed?: boolean; onClick?: () => void }) {
  const location = useLocation();
  const { t } = useTranslation();
  const isActive = location.pathname === item.path;
  const Icon = item.icon;
  const name = t(item.nameKey);

  return (
    <Link
      to={item.path}
      onClick={onClick}
      title={collapsed ? name : undefined}
      className={cn(
        "flex items-center gap-3 px-3 py-2 text-[13px] font-medium rounded-lg transition-all duration-150",
        collapsed && "justify-center px-2",
        isActive
          ? "bg-primary/10 text-primary shadow-sm"
          : "text-muted-foreground hover:bg-accent hover:text-foreground"
      )}
    >
      <Icon className={cn("h-4 w-4 flex-shrink-0", isActive && "text-primary")} />
      {!collapsed && <span className="truncate">{name}</span>}
      {!collapsed && item.badge && (
        <span className="ml-auto text-[10px] font-semibold bg-primary/10 text-primary px-1.5 py-0.5 rounded-full">
          {item.badge}
        </span>
      )}
    </Link>
  );
}

const BREADCRUMB_SEGMENTS: Record<string, { key: string; icon: React.ElementType }> = {
  dashboard: { key: 'breadcrumb.dashboard', icon: LayoutDashboard },
  projects: { key: 'breadcrumb.projects', icon: FolderKanban },
  endpoints: { key: 'breadcrumb.endpoints', icon: Webhook },
  events: { key: 'breadcrumb.events', icon: Radio },
  deliveries: { key: 'breadcrumb.deliveries', icon: Send },
  subscriptions: { key: 'breadcrumb.subscriptions', icon: Bell },
  'api-keys': { key: 'breadcrumb.api-keys', icon: Key },
  analytics: { key: 'breadcrumb.analytics', icon: BarChart3 },
  replay: { key: 'breadcrumb.replay', icon: History },
  dlq: { key: 'breadcrumb.dlq', icon: AlertTriangle },
  'test-endpoints': { key: 'breadcrumb.test-endpoints', icon: TestTube },
  'incoming-sources': { key: 'breadcrumb.incoming-sources', icon: ArrowDownToLine },
  'incoming-events': { key: 'breadcrumb.incoming-events', icon: Activity },
  schemas: { key: 'breadcrumb.schemas', icon: FileJson2 },
  'pii-rules': { key: 'breadcrumb.pii-rules', icon: Shield },
  'event-diff': { key: 'breadcrumb.event-diff', icon: GitCompare },
  alerts: { key: 'breadcrumb.alerts', icon: Bell },
  usage: { key: 'breadcrumb.usage', icon: Activity },
  incidents: { key: 'breadcrumb.incidents', icon: AlertTriangle },
  rules: { key: 'breadcrumb.rules', icon: GitBranch },
  transformations: { key: 'breadcrumb.transformations', icon: Repeat2 },
  'transform-studio': { key: 'breadcrumb.transform-studio', icon: GitCompare },
  'connection-setup': { key: 'breadcrumb.connection-setup', icon: Cable },
  'test-console': { key: 'breadcrumb.test-console', icon: Play },
  members: { key: 'breadcrumb.members', icon: Users },
  'audit-log': { key: 'breadcrumb.audit-log', icon: FileText },
  settings: { key: 'breadcrumb.settings', icon: Settings },
};

function Breadcrumb({ projectId }: { projectId: string | undefined }) {
  const { t } = useTranslation();
  const location = useLocation();
  const { data: project } = useProject(projectId);

  const crumbs: { label: string; to?: string; icon?: React.ElementType }[] = [];

  // Always start with Home
  const path = location.pathname;
  if (path === '/admin/dashboard' || path === '/admin') {
    // On dashboard — no extra crumbs
    return (
      <div className="hidden sm:flex items-center gap-1.5 text-sm text-muted-foreground">
        <LayoutDashboard className="h-3.5 w-3.5" />
        <span className="text-foreground font-medium">{t('breadcrumb.dashboard')}</span>
      </div>
    );
  }

  // Parse: /admin/{section} or /admin/projects/{id}/{section}
  const afterAdmin = path.replace(/^\/admin\/?/, '');
  const parts = afterAdmin.split('/').filter(Boolean);

  if (parts[0] === 'projects' && parts.length === 1) {
    // /admin/projects
    const seg = BREADCRUMB_SEGMENTS.projects;
    crumbs.push({ label: t(seg.key), icon: seg.icon });
  } else if (parts[0] === 'projects' && parts.length >= 2) {
    // /admin/projects/:projectId/...
    const seg = BREADCRUMB_SEGMENTS.projects;
    crumbs.push({ label: t(seg.key), to: '/admin/projects', icon: seg.icon });
    crumbs.push({
      label: project?.name || '…',
      to: projectId ? `/admin/projects/${projectId}/endpoints` : undefined,
      icon: FolderKanban,
    });
    if (parts[2]) {
      const segment = BREADCRUMB_SEGMENTS[parts[2]];
      crumbs.push({
        label: segment ? t(segment.key) : parts[2],
        icon: segment?.icon,
      });
    }
  } else {
    // /admin/members, /admin/settings, etc.
    const segment = BREADCRUMB_SEGMENTS[parts[0]];
    crumbs.push({
      label: segment ? t(segment.key) : parts[0],
      icon: segment?.icon,
    });
  }

  return (
    <div className="hidden sm:flex items-center gap-1.5 text-sm text-muted-foreground min-w-0">
      <Link to="/admin/dashboard" className="hover:text-foreground transition-colors flex-shrink-0">
        {t('nav.home')}
      </Link>
      {crumbs.map((crumb, i) => {
        const Icon = crumb.icon;
        const isLast = i === crumbs.length - 1;
        return (
          <span key={i} className="flex items-center gap-1.5 min-w-0">
            <ChevronRight className="h-3.5 w-3.5 flex-shrink-0" />
            {crumb.to && !isLast ? (
              <Link to={crumb.to} className="flex items-center gap-1 hover:text-foreground transition-colors truncate max-w-[160px]">
                {Icon && <Icon className="h-3.5 w-3.5 flex-shrink-0" />}
                {crumb.label}
              </Link>
            ) : (
              <span className="flex items-center gap-1 text-foreground font-medium truncate max-w-[180px]">
                {Icon && isLast && <Icon className="h-3.5 w-3.5 flex-shrink-0" />}
                {crumb.label}
              </span>
            )}
          </span>
        );
      })}
    </div>
  );
}

export default function AppLayout() {
  const { t } = useTranslation();
  const { user, logout, updateUser } = useAuth();
  const { role } = usePermissions();
  const navigate = useNavigate();
  const location = useLocation();
  const params = useParams();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [isDark, setIsDark] = useState(() => document.documentElement.classList.contains('dark'));

  const projectId = params.projectId || location.pathname.match(/\/admin\/projects\/([^/]+)/)?.[1];
  const [resending, setResending] = useState(false);
  const needsVerification = user?.user?.status === 'PENDING_VERIFICATION';

  useEffect(() => {
    authApi.getCurrentUser().then((freshUser) => {
      if (freshUser.user?.status !== user?.user?.status) {
        updateUser(freshUser);
      }
    }).catch(() => { });
  }, [location.pathname]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleResendVerification = async () => {
    if (!user?.user?.email) return;
    setResending(true);
    try {
      await authApi.resendVerification(user.user.email);
      showSuccess(t('auth.verification.sent'));
    } catch (err: any) {
      showApiError(err, 'auth.verification.failed');
    } finally {
      setResending(false);
    }
  };

  const handleLogout = () => {
    logout();
    showSuccess(t('nav.loggedOut'));
    navigate('/login');
  };

  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  if (!user) {
    return null;
  }

  const sidebarContent = (isMobile = false) => (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className={cn("flex items-center h-16 border-b border-border/50 px-4", collapsed && !isMobile && "justify-center px-2")}>
        <Link to="/" className="flex items-center gap-2.5 hover:opacity-80 transition-opacity">
          <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center flex-shrink-0">
            <HookflowIcon className="h-4 w-4 text-primary-foreground" />
          </div>
          {(!collapsed || isMobile) && (
            <span className="text-base font-bold tracking-tight">Hookflow</span>
          )}
        </Link>
        {isMobile && (
          <Button variant="ghost" size="icon-sm" onClick={() => setSidebarOpen(false)} className="ml-auto">
            <X className="h-4 w-4" />
          </Button>
        )}
        {!isMobile && (
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setCollapsed(!collapsed)}
            className={cn("ml-auto text-muted-foreground hover:text-foreground", collapsed && "ml-0 mt-2")}
            title={collapsed ? t('nav.expandSidebar') : t('nav.collapseSidebar')}
          >
            <ChevronsLeft className={cn("h-4 w-4 transition-transform", collapsed && "rotate-180")} />
          </Button>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-4">
        <SidebarSection label={collapsed && !isMobile ? "" : t('nav.navigation')}>
          {mainNav.map((item) => (
            <NavLink key={item.path} item={item} collapsed={collapsed && !isMobile} onClick={isMobile ? () => setSidebarOpen(false) : undefined} />
          ))}
        </SidebarSection>

        <ProjectSwitcher currentProjectId={projectId} collapsed={collapsed && !isMobile} />

        {projectId && !collapsed && (
          <>
            {/* Core delivery — always visible */}
            <SidebarSection label={t('nav.outgoing')} collapsible storageKey="outgoing" defaultOpen>
              {getProjectOutgoingNav(projectId).map((item) => (
                <NavLink key={item.path} item={item} onClick={isMobile ? () => setSidebarOpen(false) : undefined} />
              ))}
            </SidebarSection>

            <SidebarSection label={t('nav.incoming')} collapsible storageKey="incoming" defaultOpen>
              {getProjectIncomingNav(projectId).map((item) => (
                <NavLink key={item.path} item={item} onClick={isMobile ? () => setSidebarOpen(false) : undefined} />
              ))}
            </SidebarSection>

            {/* Pipeline & processing */}
            <SidebarSection label={t('nav.pipeline')} collapsible storageKey="pipeline" defaultOpen>
              {getProjectPipelineNav(projectId).map((item) => (
                <NavLink key={item.path} item={item} onClick={isMobile ? () => setSidebarOpen(false) : undefined} />
              ))}
            </SidebarSection>

            {/* Observability + Recovery */}
            <SidebarSection label={t('nav.observability')} collapsible storageKey="observability" defaultOpen>
              {getProjectObservabilityNav(projectId).map((item) => (
                <NavLink key={item.path} item={item} onClick={isMobile ? () => setSidebarOpen(false) : undefined} />
              ))}
            </SidebarSection>

            <SidebarSection label={t('nav.recovery')} collapsible storageKey="recovery" defaultOpen={false}>
              {getProjectRecoveryNav(projectId).map((item) => (
                <NavLink key={item.path} item={item} onClick={isMobile ? () => setSidebarOpen(false) : undefined} />
              ))}
            </SidebarSection>

            {/* Security & Dev Tools — collapsed by default */}
            <SidebarSection label={t('nav.security')} collapsible storageKey="security" defaultOpen={false}>
              {getProjectSecurityNav(projectId).map((item) => (
                <NavLink key={item.path} item={item} onClick={isMobile ? () => setSidebarOpen(false) : undefined} />
              ))}
            </SidebarSection>

            <SidebarSection label={t('nav.devTools')} collapsible storageKey="devtools" defaultOpen={false}>
              {getProjectDevToolsNav(projectId).map((item) => (
                <NavLink key={item.path} item={item} onClick={isMobile ? () => setSidebarOpen(false) : undefined} />
              ))}
            </SidebarSection>
          </>
        )}

        {projectId && collapsed && !isMobile && (
          <>
            {/* Collapsed mode — show all items as icons without sections */}
            {[
              ...getProjectOutgoingNav(projectId),
              ...getProjectIncomingNav(projectId),
              ...getProjectPipelineNav(projectId),
              ...getProjectObservabilityNav(projectId),
              ...getProjectRecoveryNav(projectId),
              ...getProjectSecurityNav(projectId),
              ...getProjectDevToolsNav(projectId),
            ].map((item) => (
              <NavLink key={item.path} item={item} collapsed onClick={undefined} />
            ))}
          </>
        )}

        <SidebarSection label={collapsed && !isMobile ? "" : t('nav.organization')}>
          {orgNav.filter((item) => !item.requiredRole || hasMinRole(role, item.requiredRole)).map((item) => (
            <NavLink key={item.path} item={item} collapsed={collapsed && !isMobile} onClick={isMobile ? () => setSidebarOpen(false) : undefined} />
          ))}
        </SidebarSection>

        {(!collapsed || isMobile) && (
          <SidebarSection label={t('nav.resources')}>
            <NavLink
              item={{ nameKey: 'nav.documentation', path: '/docs', icon: BookOpen }}
              onClick={isMobile ? () => setSidebarOpen(false) : undefined}
            />
          </SidebarSection>
        )}
      </nav>

      {/* Search shortcut hint */}
      {(!collapsed || isMobile) && (
        <div className="px-3 pb-2">
          <button
            onClick={() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true }))}
            className="w-full flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border/50 text-xs text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors"
          >
            <Search className="h-3.5 w-3.5" />
            <span className="flex-1 text-left">{t('nav.search')}</span>
            <kbd className="rounded border bg-muted px-1.5 py-0.5 text-[10px] font-mono">⌘K</kbd>
          </button>
        </div>
      )}

      {/* User section */}
      <div className="border-t border-border/50 p-3">
        <div className={cn("flex items-center gap-3", collapsed && !isMobile && "justify-center")}>
          <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
            <span className="text-xs font-semibold text-primary">
              {user.user?.email?.charAt(0).toUpperCase() || 'U'}
            </span>
          </div>
          {(!collapsed || isMobile) && (
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{user.user?.email}</p>
              {user.organization && (
                <p className="text-[11px] text-muted-foreground truncate">
                  {user.organization.name}
                </p>
              )}
            </div>
          )}
          {(!collapsed || isMobile) && (
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={handleLogout}
              className="text-muted-foreground hover:text-destructive flex-shrink-0"
              title={t('nav.logout')}
            >
              <LogOut className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-background">
      <div className="flex h-screen overflow-hidden">
        {/* Sidebar - Desktop */}
        <aside
          className={cn(
            "hidden lg:flex lg:flex-col border-r border-border/50 bg-card/50 transition-all duration-300",
            collapsed ? "lg:w-[68px]" : "lg:w-[var(--sidebar-width)]"
          )}
        >
          {sidebarContent()}
        </aside>

        {/* Mobile sidebar overlay */}
        {sidebarOpen && (
          <div className="fixed inset-0 z-50 lg:hidden">
            <div
              className="fixed inset-0 bg-black/40 backdrop-blur-sm"
              onClick={() => setSidebarOpen(false)}
            />
            <aside className="fixed inset-y-0 left-0 w-72 bg-card border-r shadow-elevated animate-slide-in-left">
              {sidebarContent(true)}
            </aside>
          </div>
        )}

        {/* Main content area */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Top header bar */}
          <header className="h-16 border-b border-border/50 bg-card/80 glass flex items-center px-4 lg:px-6 gap-4 sticky top-0 z-30">
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden"
            >
              <Menu className="h-5 w-5" />
            </Button>

            {/* Breadcrumb */}
            <Breadcrumb projectId={projectId} />

            <div className="flex-1" />

            {/* Header actions */}
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground gap-2 hidden sm:inline-flex"
                onClick={() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true }))}
              >
                <Search className="h-4 w-4" />
                <span className="text-xs">{t('nav.search')}</span>
                <kbd className="ml-1 rounded border bg-muted px-1.5 py-0.5 text-[10px] font-mono">⌘K</kbd>
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                className="text-muted-foreground sm:hidden"
                onClick={() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true }))}
              >
                <Search className="h-4 w-4" />
              </Button>
              <LanguageSwitcher />
              <Link to="/docs">
                <Button variant="ghost" size="icon-sm" className="text-muted-foreground" title={t('nav.documentation')}>
                  <BookOpen className="h-4 w-4" />
                </Button>
              </Link>
              <Button
                variant="ghost"
                size="icon-sm"
                className="text-muted-foreground"
                title={t('nav.toggleTheme')}
                onClick={() => {
                  const current = getTheme();
                  const next = current === 'dark' ? 'light' : 'dark';
                  setTheme(next);
                  setIsDark(next === 'dark');
                }}
              >
                {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </Button>
            </div>
          </header>

          {/* Email verification banner */}
          {needsVerification && (
            <div className="bg-amber-50 dark:bg-amber-950/40 border-b border-amber-200 dark:border-amber-800/40 px-4 lg:px-6 py-2.5 flex items-center justify-between gap-4">
              <div className="flex items-center gap-2 text-amber-800 dark:text-amber-200 text-sm">
                <Mail className="h-4 w-4 flex-shrink-0" />
                <span dangerouslySetInnerHTML={{ __html: t('auth.verification.banner', { email: user?.user?.email }) }} />
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleResendVerification}
                disabled={resending}
                className="flex-shrink-0 border-amber-300 dark:border-amber-700 text-amber-800 dark:text-amber-200 hover:bg-amber-100 dark:hover:bg-amber-900/40"
              >
                {resending && <Loader2 className="h-3 w-3 animate-spin mr-1" />}
                {resending ? t('auth.verification.resending') : t('auth.verification.resend')}
              </Button>
            </div>
          )}

          {/* Page content */}
          <main className="flex-1 overflow-y-auto bg-muted/30">
            <div className="animate-fade-in">
              <Outlet />
            </div>
          </main>
        </div>
      </div>
      <CommandPalette />
    </div>
  );
}
