import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { BookOpen, ChevronsLeft, LogOut, Search, Settings, X } from 'lucide-react';
import { HookflowIcon } from '../components/icons/HookflowIcon';
import { Button } from '../components/ui/button';
import { cn } from '../lib/utils';
import { hasMinRole, type Role } from '../auth/ProtectedRoute';
import ProjectSwitcher from '../components/ProjectSwitcher';
import { PROJECT_SECTIONS, SETTINGS_SECTION, segmentOf, type NavSection } from './nav.config';
import type { CurrentUserResponse } from '../types/api.types';

interface SidebarProps {
  projectId?: string;
  role: Role;
  user: CurrentUserResponse;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  isMobile?: boolean;
  onNavigate?: () => void;
  onLogout: () => void;
}

function RailLink({
  section, projectId, active, collapsed, onNavigate,
}: {
  section: NavSection;
  projectId?: string;
  active: boolean;
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  const { t } = useTranslation();
  const Icon = section.icon;
  const name = t(section.nameKey);

  return (
    <Link
      to={section.path(projectId)}
      onClick={onNavigate}
      aria-current={active ? 'page' : undefined}
      title={collapsed ? name : undefined}
      className={cn(
        'relative flex items-center gap-3 rounded-md px-2.5 py-2 text-sm transition-colors',
        collapsed && 'justify-center px-2',
        active
          ? 'bg-secondary font-medium text-foreground'
          : 'text-muted-foreground hover:bg-secondary/60 hover:text-foreground'
      )}
    >
      {/* The active marker is a rail, matching the tick rails used throughout. */}
      {active && (
        <span className="absolute inset-y-1.5 left-0 w-0.5 rounded-full bg-primary" aria-hidden />
      )}
      <Icon className={cn('h-4 w-4 flex-shrink-0', active && 'text-primary')} />
      {!collapsed && <span className="truncate">{name}</span>}
    </Link>
  );
}

export default function Sidebar({
  projectId, role, user, collapsed, onToggleCollapsed, isMobile = false, onNavigate, onLogout,
}: SidebarProps) {
  const { t } = useTranslation();
  const location = useLocation();
  const segment = segmentOf(location.pathname);
  const narrow = collapsed && !isMobile;

  const openPalette = () =>
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true }));

  return (
    <div className="flex h-full flex-col bg-background">
      <div className={cn('flex h-14 items-center border-b border-rail px-3', narrow && 'justify-center px-2')}>
        <Link to="/" className="flex items-center gap-2 transition-opacity hover:opacity-70">
          <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md bg-primary">
            <HookflowIcon className="h-3.5 w-3.5 text-primary-foreground" />
          </div>
          {!narrow && <span className="text-[15px] font-semibold tracking-tight">Hookflow</span>}
        </Link>
        {isMobile ? (
          <Button variant="ghost" size="icon-sm" onClick={onNavigate} className="ml-auto"
            title={t('common.close')} aria-label={t('common.close')}>
            <X className="h-4 w-4" />
          </Button>
        ) : (
          <Button variant="ghost" size="icon-sm" onClick={onToggleCollapsed}
            className={cn('ml-auto text-muted-foreground', narrow && 'ml-0')}
            title={t(collapsed ? 'nav.expandSidebar' : 'nav.collapseSidebar')}
            aria-label={t(collapsed ? 'nav.expandSidebar' : 'nav.collapseSidebar')}>
            <ChevronsLeft className={cn('h-4 w-4 transition-transform', collapsed && 'rotate-180')} />
          </Button>
        )}
      </div>

      {!narrow && (
        <div className="border-b border-rail px-3 py-2.5">
          <ProjectSwitcher currentProjectId={projectId} />
        </div>
      )}

      <nav aria-label={t('nav.navigation')} className="flex-1 space-y-0.5 overflow-y-auto p-2">
        {PROJECT_SECTIONS.map((section) => (
          <RailLink
            key={section.nameKey}
            section={section}
            projectId={projectId}
            active={section.owns.includes(segment)}
            collapsed={narrow}
            onNavigate={isMobile ? onNavigate : undefined}
          />
        ))}
      </nav>

      <div className="space-y-0.5 border-t border-rail p-2">
        {!narrow && (
          <button
            onClick={openPalette}
            className="flex w-full items-center gap-3 rounded-md px-2.5 py-2 text-sm text-muted-foreground transition-colors hover:bg-secondary/60 hover:text-foreground"
          >
            <Search className="h-4 w-4 flex-shrink-0" />
            <span className="flex-1 text-left">{t('nav.search')}</span>
            <kbd className="rounded border border-rail bg-secondary px-1.5 py-0.5 font-mono text-[10px]">⌘K</kbd>
          </button>
        )}
        <Link
          to="/docs"
          onClick={isMobile ? onNavigate : undefined}
          title={narrow ? t('nav.documentation') : undefined}
          className={cn(
            'flex items-center gap-3 rounded-md px-2.5 py-2 text-sm text-muted-foreground transition-colors hover:bg-secondary/60 hover:text-foreground',
            narrow && 'justify-center px-2'
          )}
        >
          <BookOpen className="h-4 w-4 flex-shrink-0" />
          {!narrow && <span>{t('nav.documentation')}</span>}
        </Link>
        {hasMinRole(role, 'VIEWER') && (
          <Link
            to={SETTINGS_SECTION.path()}
            onClick={isMobile ? onNavigate : undefined}
            aria-current={SETTINGS_SECTION.owns.includes(segment) ? 'page' : undefined}
            title={narrow ? t('nav.settings') : undefined}
            className={cn(
              'relative flex items-center gap-3 rounded-md px-2.5 py-2 text-sm transition-colors',
              narrow && 'justify-center px-2',
              SETTINGS_SECTION.owns.includes(segment)
                ? 'bg-secondary font-medium text-foreground'
                : 'text-muted-foreground hover:bg-secondary/60 hover:text-foreground'
            )}
          >
            <Settings className="h-4 w-4 flex-shrink-0" />
            {!narrow && <span>{t('nav.settings')}</span>}
          </Link>
        )}
      </div>

      <div className="border-t border-rail p-2">
        <div className={cn('flex items-center gap-2.5 px-1 py-1', narrow && 'justify-center px-0')}>
          <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-accent">
            <span className="font-mono text-[11px] font-medium text-accent-foreground">
              {user.user?.email?.charAt(0).toUpperCase() || 'U'}
            </span>
          </div>
          {!narrow && (
            <>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] leading-tight">{user.user?.email}</p>
                {user.organization && (
                  <p className="truncate text-[11px] leading-tight text-muted-foreground">
                    {user.organization.name}
                  </p>
                )}
              </div>
              <Button variant="ghost" size="icon-sm" onClick={onLogout}
                className="flex-shrink-0 text-muted-foreground hover:text-halt"
                title={t('nav.logout')} aria-label={t('nav.logout')}>
                <LogOut className="h-3.5 w-3.5" />
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
