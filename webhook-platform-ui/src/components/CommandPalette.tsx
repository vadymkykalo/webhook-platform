import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, FolderKanban, Users, Settings, FileText,
  Webhook, Radio, Send, Bell, Key, BarChart3, AlertTriangle,
  TestTube, BookOpen, Search, Zap,
} from 'lucide-react';
import { Dialog, DialogContent } from './ui/dialog';
import { projectsApi } from '../api/projects.api';
import type { ProjectResponse } from '../types/api.types';

interface CommandItem {
  id: string;
  label: string;
  description?: string;
  icon: React.ElementType;
  action: () => void;
  group: string;
}

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [projects, setProjects] = useState<ProjectResponse[]>([]);
  const navigate = useNavigate();

  const go = useCallback((path: string) => {
    navigate(path);
    setOpen(false);
  }, [navigate]);

  useEffect(() => {
    if (open && projects.length === 0) {
      projectsApi.list().then(setProjects).catch(() => {});
    }
  }, [open, projects.length]);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen(prev => !prev);
      }
    };
    document.addEventListener('keydown', down);
    return () => document.removeEventListener('keydown', down);
  }, []);

  const items = useMemo<CommandItem[]>(() => {
    const nav: CommandItem[] = [
      { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, action: () => go('/admin/dashboard'), group: 'Navigation' },
      { id: 'projects', label: 'Projects', icon: FolderKanban, action: () => go('/admin/projects'), group: 'Navigation' },
      { id: 'members', label: 'Members', icon: Users, action: () => go('/admin/members'), group: 'Navigation' },
      { id: 'audit-log', label: 'Audit Log', icon: FileText, action: () => go('/admin/audit-log'), group: 'Navigation' },
      { id: 'settings', label: 'Settings', icon: Settings, action: () => go('/admin/settings'), group: 'Navigation' },
      { id: 'docs', label: 'Documentation', icon: BookOpen, action: () => go('/docs'), group: 'Navigation' },
    ];

    const projectItems: CommandItem[] = projects.flatMap(p => [
      { id: `p-${p.id}`, label: p.name, description: 'Open project endpoints', icon: FolderKanban, action: () => go(`/admin/projects/${p.id}/endpoints`), group: 'Projects' },
      { id: `p-${p.id}-ep`, label: `${p.name} → Endpoints`, icon: Webhook, action: () => go(`/admin/projects/${p.id}/endpoints`), group: 'Projects' },
      { id: `p-${p.id}-ev`, label: `${p.name} → Events`, icon: Radio, action: () => go(`/admin/projects/${p.id}/events`), group: 'Projects' },
      { id: `p-${p.id}-del`, label: `${p.name} → Deliveries`, icon: Send, action: () => go(`/admin/projects/${p.id}/deliveries`), group: 'Projects' },
      { id: `p-${p.id}-sub`, label: `${p.name} → Subscriptions`, icon: Bell, action: () => go(`/admin/projects/${p.id}/subscriptions`), group: 'Projects' },
      { id: `p-${p.id}-keys`, label: `${p.name} → API Keys`, icon: Key, action: () => go(`/admin/projects/${p.id}/api-keys`), group: 'Projects' },
      { id: `p-${p.id}-an`, label: `${p.name} → Analytics`, icon: BarChart3, action: () => go(`/admin/projects/${p.id}/analytics`), group: 'Projects' },
      { id: `p-${p.id}-dlq`, label: `${p.name} → Dead Letter Queue`, icon: AlertTriangle, action: () => go(`/admin/projects/${p.id}/dlq`), group: 'Projects' },
      { id: `p-${p.id}-test`, label: `${p.name} → Test Endpoints`, icon: TestTube, action: () => go(`/admin/projects/${p.id}/test-endpoints`), group: 'Projects' },
    ]);

    return [...nav, ...projectItems];
  }, [projects, go]);

  const filtered = useMemo(() => {
    if (!query) return items;
    const q = query.toLowerCase();
    return items.filter(item =>
      item.label.toLowerCase().includes(q) ||
      item.description?.toLowerCase().includes(q) ||
      item.group.toLowerCase().includes(q)
    );
  }, [items, query]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  const groups = useMemo(() => {
    const map = new Map<string, CommandItem[]>();
    filtered.forEach(item => {
      const group = map.get(item.group) || [];
      group.push(item);
      map.set(item.group, group);
    });
    return map;
  }, [filtered]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(i => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && filtered[selectedIndex]) {
      e.preventDefault();
      filtered[selectedIndex].action();
    }
  };

  const handleOpenChange = (value: boolean) => {
    setOpen(value);
    if (!value) {
      setQuery('');
      setSelectedIndex(0);
    }
  };

  let globalIndex = -1;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="p-0 gap-0 max-w-lg overflow-hidden [&>button]:hidden">
        <div className="flex items-center border-b px-4">
          <Search className="h-4 w-4 text-muted-foreground flex-shrink-0" />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search pages, projects..."
            className="flex-1 px-3 py-3 text-sm bg-transparent outline-none placeholder:text-muted-foreground"
            autoFocus
          />
          <kbd className="hidden sm:inline-flex items-center gap-0.5 rounded border bg-muted px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground">
            ESC
          </kbd>
        </div>

        <div className="max-h-[320px] overflow-y-auto p-2">
          {filtered.length === 0 ? (
            <div className="py-8 text-center">
              <Zap className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">No results found</p>
            </div>
          ) : (
            Array.from(groups.entries()).map(([group, groupItems]) => (
              <div key={group} className="mb-1">
                <div className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                  {group}
                </div>
                {groupItems.map(item => {
                  globalIndex++;
                  const idx = globalIndex;
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.id}
                      onClick={item.action}
                      onMouseEnter={() => setSelectedIndex(idx)}
                      className={`w-full flex items-center gap-3 px-3 py-2 text-sm rounded-lg transition-colors ${
                        selectedIndex === idx
                          ? 'bg-primary/10 text-primary'
                          : 'text-foreground hover:bg-accent'
                      }`}
                    >
                      <Icon className="h-4 w-4 flex-shrink-0" />
                      <span className="truncate">{item.label}</span>
                      {item.description && (
                        <span className="ml-auto text-xs text-muted-foreground truncate hidden sm:block">
                          {item.description}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>

        <div className="border-t px-4 py-2 flex items-center justify-between text-[10px] text-muted-foreground">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1"><kbd className="rounded border bg-muted px-1 py-0.5 font-mono">↑↓</kbd> navigate</span>
            <span className="flex items-center gap-1"><kbd className="rounded border bg-muted px-1 py-0.5 font-mono">↵</kbd> open</span>
            <span className="flex items-center gap-1"><kbd className="rounded border bg-muted px-1 py-0.5 font-mono">esc</kbd> close</span>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
