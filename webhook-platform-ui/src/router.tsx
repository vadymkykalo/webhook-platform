import { createBrowserRouter } from 'react-router-dom';
import AppLayout from './layout/AppLayout';
import LoginPage from './auth/LoginPage';
import RegisterPage from './auth/RegisterPage';
import ProtectedRoute from './auth/ProtectedRoute';
import DashboardPage from './pages/DashboardPage';
import ProjectsPage from './pages/ProjectsPage';
import EndpointsPage from './pages/EndpointsPage';
import DeliveriesPage from './pages/DeliveriesPage';
import EventsPage from './pages/EventsPage';
import SubscriptionsPage from './pages/SubscriptionsPage';
import MembersPage from './pages/MembersPage';
import ApiKeysPage from './pages/ApiKeysPage';
import SettingsPage from './pages/SettingsPage';
import DocumentationPage from './pages/DocumentationPage';
import LandingPage from './pages/LandingPage';
import QuickstartPage from './pages/QuickstartPage';
import AnalyticsPage from './pages/AnalyticsPage';
import DlqPage from './pages/DlqPage';
import TestEndpointsPage from './pages/TestEndpointsPage';

export const router = createBrowserRouter([
  {
    path: '/',
    element: <LandingPage />,
  },
  {
    path: '/quickstart',
    element: <QuickstartPage />,
  },
  {
    path: '/docs',
    element: <DocumentationPage />,
  },
  {
    path: '/login',
    element: <LoginPage />,
  },
  {
    path: '/register',
    element: <RegisterPage />,
  },
  {
    path: '/',
    element: (
      <ProtectedRoute>
        <AppLayout />
      </ProtectedRoute>
    ),
    children: [
      {
        path: 'dashboard',
        element: <DashboardPage />,
      },
      {
        path: 'projects',
        element: <ProjectsPage />,
      },
      {
        path: 'projects/:projectId/endpoints',
        element: <EndpointsPage />,
      },
      {
        path: 'projects/:projectId/deliveries',
        element: <DeliveriesPage />,
      },
      {
        path: 'projects/:projectId/events',
        element: <EventsPage />,
      },
      {
        path: 'projects/:projectId/subscriptions',
        element: <SubscriptionsPage />,
      },
      {
        path: 'projects/:projectId/api-keys',
        element: <ApiKeysPage />,
      },
      {
        path: 'projects/:projectId/analytics',
        element: <AnalyticsPage />,
      },
      {
        path: 'projects/:projectId/dlq',
        element: <DlqPage />,
      },
      {
        path: 'projects/:projectId/test-endpoints',
        element: <TestEndpointsPage />,
      },
      {
        path: 'members',
        element: <MembersPage />,
      },
      {
        path: 'settings',
        element: <SettingsPage />,
      },
    ],
  },
]);
