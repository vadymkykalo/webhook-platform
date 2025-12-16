import { useState } from 'react';
import { Outlet, useNavigate, useLocation, Link } from 'react-router-dom';
import { Menu, X, LogOut, FolderKanban, Webhook, Radio, Send, Users } from 'lucide-react';
import { useAuth } from '../auth/auth.store';
import { Button } from '../components/ui/button';
import { cn } from '../lib/utils';
import { toast } from 'sonner';

const navItems = [
  { name: 'Projects', path: '/projects', icon: FolderKanban, disabled: false },
  { name: 'Members', path: '/members', icon: Users, disabled: false },
  { name: 'Endpoints', path: '/endpoints', icon: Webhook, disabled: true },
  { name: 'Events', path: '/events', icon: Radio, disabled: true },
  { name: 'Deliveries', path: '/deliveries', icon: Send, disabled: true },
];

export default function AppLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const handleLogout = () => {
    logout();
    toast.success('Logged out successfully');
    navigate('/login');
  };

  if (!user) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="flex h-screen overflow-hidden">
        {/* Sidebar - Desktop */}
        <aside className="hidden lg:flex lg:flex-col lg:w-64 lg:border-r bg-card">
          <div className="flex items-center h-16 px-6 border-b">
            <Webhook className="h-6 w-6 text-primary mr-2" />
            <span className="text-lg font-semibold">Webhook Platform</span>
          </div>
          
          <nav className="flex-1 px-3 py-4 space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname === item.path;
              
              return (
                <Link
                  key={item.path}
                  to={item.disabled ? '#' : item.path}
                  className={cn(
                    "flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors",
                    isActive
                      ? "bg-primary text-primary-foreground"
                      : item.disabled
                      ? "text-muted-foreground cursor-not-allowed opacity-50"
                      : "text-foreground hover:bg-accent hover:text-accent-foreground"
                  )}
                  onClick={(e) => {
                    if (item.disabled) {
                      e.preventDefault();
                    }
                  }}
                >
                  <Icon className="mr-3 h-5 w-5" />
                  {item.name}
                </Link>
              );
            })}
          </nav>

          <div className="p-4 border-t">
            <div className="flex items-center justify-between">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{user.fullName}</p>
                {user.currentOrganization && (
                  <p className="text-xs text-muted-foreground truncate">
                    {user.currentOrganization.name}
                  </p>
                )}
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={handleLogout}
                className="ml-2"
                title="Logout"
              >
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </aside>

        {/* Mobile sidebar */}
        {sidebarOpen && (
          <div className="fixed inset-0 z-50 lg:hidden">
            <div
              className="fixed inset-0 bg-black/50"
              onClick={() => setSidebarOpen(false)}
            />
            <aside className="fixed inset-y-0 left-0 w-64 bg-card border-r flex flex-col">
              <div className="flex items-center justify-between h-16 px-6 border-b">
                <div className="flex items-center">
                  <Webhook className="h-6 w-6 text-primary mr-2" />
                  <span className="text-lg font-semibold">Webhook Platform</span>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setSidebarOpen(false)}
                >
                  <X className="h-5 w-5" />
                </Button>
              </div>
              
              <nav className="flex-1 px-3 py-4 space-y-1">
                {navItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = location.pathname === item.path;
                  
                  return (
                    <Link
                      key={item.path}
                      to={item.disabled ? '#' : item.path}
                      className={cn(
                        "flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors",
                        isActive
                          ? "bg-primary text-primary-foreground"
                          : item.disabled
                          ? "text-muted-foreground cursor-not-allowed opacity-50"
                          : "text-foreground hover:bg-accent hover:text-accent-foreground"
                      )}
                      onClick={(e) => {
                        if (item.disabled) {
                          e.preventDefault();
                        } else {
                          setSidebarOpen(false);
                        }
                      }}
                    >
                      <Icon className="mr-3 h-5 w-5" />
                      {item.name}
                    </Link>
                  );
                })}
              </nav>

              <div className="p-4 border-t">
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{user.fullName}</p>
                    {user.currentOrganization && (
                      <p className="text-xs text-muted-foreground truncate">
                        {user.currentOrganization.name}
                      </p>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleLogout}
                    className="ml-2"
                    title="Logout"
                  >
                    <LogOut className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </aside>
          </div>
        )}

        {/* Main content */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Mobile header */}
          <header className="lg:hidden h-16 border-b bg-card flex items-center px-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setSidebarOpen(true)}
            >
              <Menu className="h-5 w-5" />
            </Button>
            <div className="flex items-center ml-4">
              <Webhook className="h-6 w-6 text-primary mr-2" />
              <span className="text-lg font-semibold">Webhook Platform</span>
            </div>
          </header>

          {/* Page content */}
          <main className="flex-1 overflow-y-auto bg-muted/40">
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  );
}
