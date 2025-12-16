import { createBrowserRouter, Navigate } from 'react-router-dom';
import AppLayout from './layout/AppLayout';
import LoginPage from './auth/LoginPage';
import RegisterPage from './auth/RegisterPage';
import ProtectedRoute from './auth/ProtectedRoute';
import ProjectsPage from './pages/ProjectsPage';
import EndpointsPage from './pages/EndpointsPage';
import DeliveriesPage from './pages/DeliveriesPage';
import EventsPage from './pages/EventsPage';

export const router = createBrowserRouter([
  {
    path: '/',
    element: <Navigate to="/login" replace />,
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
    ],
  },
]);
