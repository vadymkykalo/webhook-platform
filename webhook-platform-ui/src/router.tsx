import { lazy, Suspense } from 'react';
import { createBrowserRouter, Navigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import AppLayout from './layout/AppLayout';
import PublicLayout from './layout/PublicLayout';
import ProtectedRoute from './auth/ProtectedRoute';

// Lazy-loaded pages — each becomes its own chunk
const LandingPage = lazy(() => import('./pages/LandingPage'));
const QuickstartPage = lazy(() => import('./pages/QuickstartPage'));
const LoginPage = lazy(() => import('./auth/LoginPage'));
const RegisterPage = lazy(() => import('./auth/RegisterPage'));
const VerifyEmailPage = lazy(() => import('./auth/VerifyEmailPage'));
const ForgotPasswordPage = lazy(() => import('./auth/ForgotPasswordPage'));
const ResetPasswordPage = lazy(() => import('./auth/ResetPasswordPage'));
const AcceptInvitePage = lazy(() => import('./auth/AcceptInvitePage'));
const DocumentationPage = lazy(() => import('./pages/DocumentationPage'));
const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const ProjectsPage = lazy(() => import('./pages/ProjectsPage'));
const EndpointsPage = lazy(() => import('./pages/EndpointsPage'));
const DeliveriesPage = lazy(() => import('./pages/DeliveriesPage'));
const EventsPage = lazy(() => import('./pages/EventsPage'));
const SubscriptionsPage = lazy(() => import('./pages/SubscriptionsPage'));
const MembersPage = lazy(() => import('./pages/MembersPage'));
const ApiKeysPage = lazy(() => import('./pages/ApiKeysPage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));
const AnalyticsPage = lazy(() => import('./pages/AnalyticsPage'));
const ReplayPage = lazy(() => import('./pages/ReplayPage'));
const DlqPage = lazy(() => import('./pages/DlqPage'));
const TestEndpointsPage = lazy(() => import('./pages/TestEndpointsPage'));
const AuditLogPage = lazy(() => import('./pages/AuditLogPage'));
const IncomingSourcesPage = lazy(() => import('./pages/IncomingSourcesPage'));
const IncomingSourceDetailPage = lazy(() => import('./pages/IncomingSourceDetailPage'));
const IncomingEventsPage = lazy(() => import('./pages/IncomingEventsPage'));
const SchemasPage = lazy(() => import('./pages/SchemasPage'));
const PiiRulesPage = lazy(() => import('./pages/PiiRulesPage'));
const EventDiffPage = lazy(() => import('./pages/EventDiffPage'));
const DevWorkspacePage = lazy(() => import('./pages/DevWorkspacePage'));
const AlertsPage = lazy(() => import('./pages/AlertsPage'));
const UsagePage = lazy(() => import('./pages/UsagePage'));
const EventDetailPage = lazy(() => import('./pages/EventDetailPage'));
const IncidentsPage = lazy(() => import('./pages/IncidentsPage'));
const TransformationsPage = lazy(() => import('./pages/TransformationsPage'));
const TransformStudioPage = lazy(() => import('./pages/TransformStudioPage'));
const ConnectionSetupPage = lazy(() => import('./pages/ConnectionSetupPage'));
const SharedDebugPage = lazy(() => import('./pages/SharedDebugPage'));
const NotFoundPage = lazy(() => import('./pages/NotFoundPage'));

function PageLoader() {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <Loader2 className="h-6 w-6 animate-spin text-primary" />
    </div>
  );
}

function S({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<PageLoader />}>{children}</Suspense>;
}

export const router = createBrowserRouter([
  {
    element: <PublicLayout />,
    children: [
      {
        path: '/',
        element: <S><LandingPage /></S>,
      },
      {
        path: '/quickstart',
        element: <S><QuickstartPage /></S>,
      },
    ],
  },
  {
    path: '/login',
    element: <S><LoginPage /></S>,
  },
  {
    path: '/register',
    element: <S><RegisterPage /></S>,
  },
  {
    path: '/verify-email',
    element: <S><VerifyEmailPage /></S>,
  },
  {
    path: '/forgot-password',
    element: <S><ForgotPasswordPage /></S>,
  },
  {
    path: '/reset-password',
    element: <S><ResetPasswordPage /></S>,
  },
  {
    path: '/accept-invite',
    element: <S><AcceptInvitePage /></S>,
  },
  {
    path: '/docs',
    element: <S><DocumentationPage /></S>,
  },
  {
    path: '/admin',
    element: (
      <ProtectedRoute>
        <AppLayout />
      </ProtectedRoute>
    ),
    children: [
      {
        index: true,
        element: <Navigate to="dashboard" replace />,
      },
      {
        path: 'dashboard',
        element: <S><DashboardPage /></S>,
      },
      {
        path: 'projects',
        element: <S><ProjectsPage /></S>,
      },
      {
        path: 'projects/:projectId/endpoints',
        element: <S><EndpointsPage /></S>,
      },
      {
        path: 'projects/:projectId/deliveries',
        element: <S><DeliveriesPage /></S>,
      },
      {
        path: 'projects/:projectId/events',
        element: <S><EventsPage /></S>,
      },
      {
        path: 'projects/:projectId/subscriptions',
        element: <S><SubscriptionsPage /></S>,
      },
      {
        path: 'projects/:projectId/api-keys',
        element: <S><ApiKeysPage /></S>,
      },
      {
        path: 'projects/:projectId/analytics',
        element: <S><AnalyticsPage /></S>,
      },
      {
        path: 'projects/:projectId/replay',
        element: <S><ReplayPage /></S>,
      },
      {
        path: 'projects/:projectId/dlq',
        element: <S><DlqPage /></S>,
      },
      {
        path: 'projects/:projectId/test-endpoints',
        element: <S><TestEndpointsPage /></S>,
      },
      {
        path: 'projects/:projectId/dev-workspace',
        element: <S><DevWorkspacePage /></S>,
      },
      {
        path: 'projects/:projectId/incoming-sources',
        element: <S><IncomingSourcesPage /></S>,
      },
      {
        path: 'projects/:projectId/incoming-sources/:sourceId',
        element: <S><IncomingSourceDetailPage /></S>,
      },
      {
        path: 'projects/:projectId/incoming-events',
        element: <S><IncomingEventsPage /></S>,
      },
      {
        path: 'projects/:projectId/schemas',
        element: <S><SchemasPage /></S>,
      },
      {
        path: 'projects/:projectId/pii-rules',
        element: <S><PiiRulesPage /></S>,
      },
      {
        path: 'projects/:projectId/event-diff',
        element: <S><EventDiffPage /></S>,
      },
      {
        path: 'projects/:projectId/alerts',
        element: <S><AlertsPage /></S>,
      },
      {
        path: 'projects/:projectId/usage',
        element: <S><UsagePage /></S>,
      },
      {
        path: 'projects/:projectId/events/:eventId',
        element: <S><EventDetailPage /></S>,
      },
      {
        path: 'projects/:projectId/incidents',
        element: <S><IncidentsPage /></S>,
      },
      {
        path: 'projects/:projectId/transformations',
        element: <S><TransformationsPage /></S>,
      },
      {
        path: 'projects/:projectId/transform-studio',
        element: <S><TransformStudioPage /></S>,
      },
      {
        path: 'projects/:projectId/connection-setup',
        element: <S><ConnectionSetupPage /></S>,
      },
      {
        path: 'members',
        element: <ProtectedRoute requiredRole="OWNER"><S><MembersPage /></S></ProtectedRoute>,
      },
      {
        path: 'audit-log',
        element: <S><AuditLogPage /></S>,
      },
      {
        path: 'settings',
        element: <ProtectedRoute requiredRole="OWNER"><S><SettingsPage /></S></ProtectedRoute>,
      },
      {
        path: '*',
        element: <S><NotFoundPage /></S>,
      },
    ],
  },
  {
    path: '/shared/debug/:token',
    element: <S><SharedDebugPage /></S>,
  },
  {
    path: '*',
    element: <S><NotFoundPage /></S>,
  },
]);
