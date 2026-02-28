import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './auth.store';

type Role = 'OWNER' | 'DEVELOPER' | 'VIEWER';

const ROLE_HIERARCHY: Record<Role, number> = {
  VIEWER: 0,
  DEVELOPER: 1,
  OWNER: 2,
};

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredRole?: Role;
}

export default function ProtectedRoute({ children, requiredRole }: ProtectedRouteProps) {
  const { isAuthenticated, user } = useAuth();
  const location = useLocation();

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }

  if (requiredRole) {
    const userRole = (user?.role || 'VIEWER') as Role;
    if (ROLE_HIERARCHY[userRole] < ROLE_HIERARCHY[requiredRole]) {
      return <Navigate to="/admin/dashboard" replace />;
    }
  }

  return <>{children}</>;
}
