import { useState, useEffect } from 'react';
import { Outlet, useNavigate, useLocation, Link, useParams } from 'react-router-dom';
import {
  Menu, X, LogOut, FolderKanban, Webhook, Users, LayoutDashboard, Settings,
  BookOpen, ChevronRight, Radio, Send, Key, BarChart3, AlertTriangle, TestTube,
  Bell, Search, ChevronsLeft, FileText, Mail, Loader2, Moon, Sun
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../auth/auth.store';
import { useProject } from '../api/queries';
import { authApi } from '../api/auth.api';
import { Button } from '../components/ui/button';
import { cn } from '../lib/utils';
import { type Role, hasMinRole } from '../auth/ProtectedRoute';
import { usePermissions } from '../auth/usePermissions';
import { toast } from 'sonner';
import { CommandPalette } from '../components/CommandPalette';
import { getTheme, setTheme } from '../lib/theme';
import LanguageSwitcher from '../components/LanguageSwitcher';

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
  { nameKey: 'nav.settings', path: '/admin/settings', icon: Settings, requiredRole: 'OWNER' },
];

const getProjectNav = (projectId: string): NavItem[] => [
  { nameKey: 'nav.endpoints', path: `/admin/projects/${projectId}/endpoints`, icon: Webhook },
  { nameKey: 'nav.events', path: `/admin/projects/${projectId}/events`, icon: Radio },
  { nameKey: 'nav.deliveries', path: `/admin/projects/${projectId}/deliveries`, icon: Send },
  { nameKey: 'nav.subscriptions', path: `/admin/projects/${projectId}/subscriptions`, icon: Bell },
  { nameKey: 'nav.apiKeys', path: `/admin/projects/${projectId}/api-keys`, icon: Key },
  { nameKey: 'nav.analytics', path: `/admin/projects/${projectId}/analytics`, icon: BarChart3 },
  { nameKey: 'nav.dlq', path: `/admin/projects/${projectId}/dlq`, icon: AlertTriangle },
  { nameKey: 'nav.testEndpoints', path: `/admin/projects/${projectId}/test-endpoints`, icon: TestTube },
];

function SidebarSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-2">
      <p className="px-3 mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
        {label}
      </p>
      <div className="space-y-0.5">{children}</div>
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

const BREADCRUMB_SEGMENT_KEYS: Record<string, string> = {
  dashboard: 'breadcrumb.dashboard',
  projects: 'breadcrumb.projects',
  endpoints: 'breadcrumb.endpoints',
  events: 'breadcrumb.events',
  deliveries: 'breadcrumb.deliveries',
  subscriptions: 'breadcrumb.subscriptions',
  'api-keys': 'breadcrumb.api-keys',
  analytics: 'breadcrumb.analytics',
  dlq: 'breadcrumb.dlq',
  'test-endpoints': 'breadcrumb.test-endpoints',
  members: 'breadcrumb.members',
  'audit-log': 'breadcrumb.audit-log',
  settings: 'breadcrumb.settings',
};

function Breadcrumb({ projectId }: { projectId: string | undefined }) {
  const { t } = useTranslation();
  const location = useLocation();
  const { data: project } = useProject(projectId);

  const crumbs: { label: string; to?: string }[] = [];

  // Always start with Home
  const path = location.pathname;
  if (path === '/admin/dashboard' || path === '/admin') {
    // On dashboard — no extra crumbs
    return (
      <div className="hidden sm:flex items-center gap-1.5 text-sm text-muted-foreground">
        <span className="text-foreground font-medium">{t('breadcrumb.dashboard')}</span>
      </div>
    );
  }

  // Parse: /admin/{section} or /admin/projects/{id}/{section}
  const afterAdmin = path.replace(/^\/admin\/?/, '');
  const parts = afterAdmin.split('/').filter(Boolean);

  if (parts[0] === 'projects' && parts.length === 1) {
    // /admin/projects
    crumbs.push({ label: t('breadcrumb.projects') });
  } else if (parts[0] === 'projects' && parts.length >= 2) {
    // /admin/projects/:projectId/...
    crumbs.push({ label: t('breadcrumb.projects'), to: '/admin/projects' });
    crumbs.push({
      label: project?.name || '…',
      to: projectId ? `/admin/projects/${projectId}/endpoints` : undefined,
    });
    if (parts[2]) {
      const segmentKey = BREADCRUMB_SEGMENT_KEYS[parts[2]];
      crumbs.push({ label: segmentKey ? t(segmentKey) : parts[2] });
    }
  } else {
    // /admin/members, /admin/settings, etc.
    const segmentKey = BREADCRUMB_SEGMENT_KEYS[parts[0]];
    crumbs.push({ label: segmentKey ? t(segmentKey) : parts[0] });
  }

  return (
    <div className="hidden sm:flex items-center gap-1.5 text-sm text-muted-foreground min-w-0">
      <Link to="/admin/dashboard" className="hover:text-foreground transition-colors flex-shrink-0">
        {t('nav.home')}
      </Link>
      {crumbs.map((crumb, i) => (
        <span key={i} className="flex items-center gap-1.5 min-w-0">
          <ChevronRight className="h-3.5 w-3.5 flex-shrink-0" />
          {crumb.to && i < crumbs.length - 1 ? (
            <Link to={crumb.to} className="hover:text-foreground transition-colors truncate max-w-[140px]">
              {crumb.label}
            </Link>
          ) : (
            <span className="text-foreground font-medium truncate max-w-[160px]">{crumb.label}</span>
          )}
        </span>
      ))}
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
  }, [location.pathname]);

  const handleResendVerification = async () => {
    if (!user?.user?.email) return;
    setResending(true);
    try {
      await authApi.resendVerification(user.user.email);
      toast.success(t('auth.verification.sent'));
    } catch (err: any) {
      toast.error(err.response?.data?.message || t('auth.verification.failed'));
    } finally {
      setResending(false);
    }
  };

  const handleLogout = () => {
    logout();
    toast.success(t('nav.loggedOut'));
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
            <Webhook className="h-4 w-4 text-primary-foreground" />
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

        {projectId && (
          <SidebarSection label={collapsed && !isMobile ? "" : t('nav.project')}>
            {getProjectNav(projectId).map((item) => (
              <NavLink key={item.path} item={item} collapsed={collapsed && !isMobile} onClick={isMobile ? () => setSidebarOpen(false) : undefined} />
            ))}
          </SidebarSection>
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
