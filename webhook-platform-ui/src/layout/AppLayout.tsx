import { useState, useEffect } from 'react';
import { Outlet, useNavigate, useLocation, Link, useParams } from 'react-router-dom';
import {
  Menu, X, LogOut, FolderKanban, Webhook, Users, LayoutDashboard, Settings,
  BookOpen, ChevronRight, Radio, Send, Key, BarChart3, AlertTriangle, TestTube,
  Bell, Search, ChevronsLeft, FileText, Mail, Loader2, Moon, Sun
} from 'lucide-react';
import { useAuth } from '../auth/auth.store';
import { authApi } from '../api/auth.api';
import { Button } from '../components/ui/button';
import { cn } from '../lib/utils';
import { toast } from 'sonner';
import { CommandPalette } from '../components/CommandPalette';
import { getTheme, setTheme } from '../lib/theme';

interface NavItem {
  name: string;
  path: string;
  icon: React.ElementType;
  badge?: string;
}

const mainNav: NavItem[] = [
  { name: 'Dashboard', path: '/admin/dashboard', icon: LayoutDashboard },
  { name: 'Projects', path: '/admin/projects', icon: FolderKanban },
];

const orgNav: NavItem[] = [
  { name: 'Members', path: '/admin/members', icon: Users },
  { name: 'Audit Log', path: '/admin/audit-log', icon: FileText },
  { name: 'Settings', path: '/admin/settings', icon: Settings },
];

const getProjectNav = (projectId: string): NavItem[] => [
  { name: 'Endpoints', path: `/admin/projects/${projectId}/endpoints`, icon: Webhook },
  { name: 'Events', path: `/admin/projects/${projectId}/events`, icon: Radio },
  { name: 'Deliveries', path: `/admin/projects/${projectId}/deliveries`, icon: Send },
  { name: 'Subscriptions', path: `/admin/projects/${projectId}/subscriptions`, icon: Bell },
  { name: 'API Keys', path: `/admin/projects/${projectId}/api-keys`, icon: Key },
  { name: 'Analytics', path: `/admin/projects/${projectId}/analytics`, icon: BarChart3 },
  { name: 'Dead Letter Queue', path: `/admin/projects/${projectId}/dlq`, icon: AlertTriangle },
  { name: 'Test Endpoints', path: `/admin/projects/${projectId}/test-endpoints`, icon: TestTube },
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
  const isActive = location.pathname === item.path;
  const Icon = item.icon;

  return (
    <Link
      to={item.path}
      onClick={onClick}
      title={collapsed ? item.name : undefined}
      className={cn(
        "flex items-center gap-3 px-3 py-2 text-[13px] font-medium rounded-lg transition-all duration-150",
        collapsed && "justify-center px-2",
        isActive
          ? "bg-primary/10 text-primary shadow-sm"
          : "text-muted-foreground hover:bg-accent hover:text-foreground"
      )}
    >
      <Icon className={cn("h-4 w-4 flex-shrink-0", isActive && "text-primary")} />
      {!collapsed && <span className="truncate">{item.name}</span>}
      {!collapsed && item.badge && (
        <span className="ml-auto text-[10px] font-semibold bg-primary/10 text-primary px-1.5 py-0.5 rounded-full">
          {item.badge}
        </span>
      )}
    </Link>
  );
}

export default function AppLayout() {
  const { user, logout, updateUser } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const params = useParams();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [, setThemeIcon] = useState(false);

  const projectId = params.projectId || location.pathname.match(/\/admin\/projects\/([^/]+)/)?.[1];
  const [resending, setResending] = useState(false);
  const needsVerification = user?.user?.status === 'PENDING_VERIFICATION';

  useEffect(() => {
    authApi.getCurrentUser().then((freshUser) => {
      if (freshUser.user?.status !== user?.user?.status) {
        updateUser(freshUser);
      }
    }).catch(() => {});
  }, [location.pathname]);

  const handleResendVerification = async () => {
    if (!user?.user?.email) return;
    setResending(true);
    try {
      await authApi.resendVerification(user.user.email);
      toast.success('Verification email sent!');
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to resend');
    } finally {
      setResending(false);
    }
  };

  const handleLogout = () => {
    logout();
    toast.success('Logged out successfully');
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
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            <ChevronsLeft className={cn("h-4 w-4 transition-transform", collapsed && "rotate-180")} />
          </Button>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-4">
        <SidebarSection label={collapsed && !isMobile ? "" : "Navigation"}>
          {mainNav.map((item) => (
            <NavLink key={item.path} item={item} collapsed={collapsed && !isMobile} onClick={isMobile ? () => setSidebarOpen(false) : undefined} />
          ))}
        </SidebarSection>

        {projectId && (
          <SidebarSection label={collapsed && !isMobile ? "" : "Project"}>
            {getProjectNav(projectId).map((item) => (
              <NavLink key={item.path} item={item} collapsed={collapsed && !isMobile} onClick={isMobile ? () => setSidebarOpen(false) : undefined} />
            ))}
          </SidebarSection>
        )}

        <SidebarSection label={collapsed && !isMobile ? "" : "Organization"}>
          {orgNav.map((item) => (
            <NavLink key={item.path} item={item} collapsed={collapsed && !isMobile} onClick={isMobile ? () => setSidebarOpen(false) : undefined} />
          ))}
        </SidebarSection>

        {(!collapsed || isMobile) && (
          <SidebarSection label="Resources">
            <NavLink
              item={{ name: 'Documentation', path: '/docs', icon: BookOpen }}
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
              title="Logout"
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
            <div className="hidden sm:flex items-center gap-1.5 text-sm text-muted-foreground">
              <Link to="/admin/dashboard" className="hover:text-foreground transition-colors">Home</Link>
              {location.pathname !== '/admin/dashboard' && (
                <>
                  <ChevronRight className="h-3.5 w-3.5" />
                  <span className="text-foreground font-medium capitalize">
                    {location.pathname.split('/').filter(Boolean).pop()?.replace(/-/g, ' ')}
                  </span>
                </>
              )}
            </div>

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
                <span className="text-xs">Search</span>
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
              <Link to="/docs">
                <Button variant="ghost" size="icon-sm" className="text-muted-foreground" title="Documentation">
                  <BookOpen className="h-4 w-4" />
                </Button>
              </Link>
              <Button
                variant="ghost"
                size="icon-sm"
                className="text-muted-foreground"
                title="Toggle theme"
                onClick={() => {
                  const current = getTheme();
                  const next = current === 'dark' ? 'light' : 'dark';
                  setTheme(next);
                  setThemeIcon(prev => !prev);
                }}
              >
                {document.documentElement.classList.contains('dark') ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </Button>
            </div>
          </header>

          {/* Email verification banner */}
          {needsVerification && (
            <div className="bg-amber-50 dark:bg-amber-950/40 border-b border-amber-200 dark:border-amber-800/40 px-4 lg:px-6 py-2.5 flex items-center justify-between gap-4">
              <div className="flex items-center gap-2 text-amber-800 dark:text-amber-200 text-sm">
                <Mail className="h-4 w-4 flex-shrink-0" />
                <span>Please verify your email <strong>{user?.user?.email}</strong> to unlock all features.</span>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleResendVerification}
                disabled={resending}
                className="flex-shrink-0 border-amber-300 dark:border-amber-700 text-amber-800 dark:text-amber-200 hover:bg-amber-100 dark:hover:bg-amber-900/40"
              >
                {resending && <Loader2 className="h-3 w-3 animate-spin mr-1" />}
                {resending ? 'Sending...' : 'Resend email'}
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
