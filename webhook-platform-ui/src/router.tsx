import { createBrowserRouter, Navigate } from 'react-router-dom';
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

export const router = createBrowserRouter([
  {
    path: '/',
    element: <Navigate to="/dashboard" replace />,
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
        path: 'members',
        element: <MembersPage />,
      },
      {
        path: 'settings',
        element: <SettingsPage />,
      },
      {
        path: 'docs',
        element: <DocumentationPage />,
      },
    ],
  },
]);
