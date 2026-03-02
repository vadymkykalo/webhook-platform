import { useState, useRef, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ChevronsUpDown, Check, FolderKanban } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useProjects } from '../api/queries';
import { cn } from '../lib/utils';

interface ProjectSwitcherProps {
  currentProjectId?: string;
  collapsed?: boolean;
}

export default function ProjectSwitcher({ currentProjectId, collapsed }: ProjectSwitcherProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const { data: projects = [] } = useProjects();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const currentProject = projects.find(p => p.id === currentProjectId);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSwitch = (newProjectId: string) => {
    if (newProjectId === currentProjectId) {
      setOpen(false);
      return;
    }
    // Keep the same sub-section when switching projects
    const subSection = location.pathname.match(/\/admin\/projects\/[^/]+\/(.+)/)?.[1] || 'endpoints';
    navigate(`/admin/projects/${newProjectId}/${subSection}`);
    setOpen(false);
  };

  if (projects.length === 0) return null;

  if (collapsed) {
    return (
      <div className="px-2 mb-2">
        <button
          onClick={() => setOpen(!open)}
          className="w-full h-9 rounded-lg bg-accent/50 flex items-center justify-center hover:bg-accent transition-colors"
          title={currentProject?.name || t('nav.project')}
        >
          <FolderKanban className="h-4 w-4 text-muted-foreground" />
        </button>
      </div>
    );
  }

  return (
    <div ref={ref} className="relative px-3 mb-2">
      <button
        onClick={() => setOpen(!open)}
        className={cn(
          "w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
          "border border-border/50 hover:bg-accent/50",
          open && "bg-accent/50 border-border"
        )}
      >
        <FolderKanban className="h-4 w-4 text-primary flex-shrink-0" />
        <span className="truncate flex-1 text-left">
          {currentProject?.name || t('nav.selectProject')}
        </span>
        <ChevronsUpDown className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
      </button>

      {open && (
        <div className="absolute z-50 top-full left-3 right-3 mt-1 rounded-lg border bg-popover shadow-lg overflow-hidden animate-in fade-in-0 zoom-in-95">
          <div className="max-h-[240px] overflow-y-auto p-1">
            {projects.map((project) => (
              <button
                key={project.id}
                onClick={() => handleSwitch(project.id)}
                className={cn(
                  "w-full flex items-center gap-2 px-2.5 py-2 rounded-md text-sm transition-colors text-left",
                  project.id === currentProjectId
                    ? "bg-primary/10 text-primary font-medium"
                    : "text-foreground hover:bg-accent"
                )}
              >
                <FolderKanban className="h-3.5 w-3.5 flex-shrink-0" />
                <span className="truncate flex-1">{project.name}</span>
                {project.id === currentProjectId && (
                  <Check className="h-3.5 w-3.5 flex-shrink-0 text-primary" />
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
