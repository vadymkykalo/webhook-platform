import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import '../../i18n';
import { renderPage, TEST_PROJECT_ID } from '../../test/renderPage';
import type { ProjectResponse } from '../../types/api.types';
import type { DashboardStats } from '../../api/dashboard.api';

vi.mock('../../api/projects.api', () => ({
  projectsApi: { list: vi.fn(), get: vi.fn() },
}));
vi.mock('../../api/dashboard.api', () => ({
  dashboardApi: {
    getProjectStats: vi.fn(),
    getAnalytics: vi.fn(),
    getOnboardingStatus: vi.fn(),
  },
}));
vi.mock('../../api/endpoints.api', () => ({
  endpointsApi: { list: vi.fn() },
}));

import DashboardPage from '../DashboardPage';
import { projectsApi } from '../../api/projects.api';
import { dashboardApi } from '../../api/dashboard.api';
import { endpointsApi } from '../../api/endpoints.api';

const PROJECT: ProjectResponse = {
  id: TEST_PROJECT_ID,
  name: 'Test Project',
  organizationId: 'org-1',
  schemaValidationEnabled: false,
  schemaValidationPolicy: 'WARN',
  idempotencyPolicy: 'NONE',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const STATS: DashboardStats = {
  deliveryStats: {
    totalDeliveries: 42,
    successfulDeliveries: 40,
    failedDeliveries: 1,
    pendingDeliveries: 1,
    dlqDeliveries: 0,
    successRate: 95,
  },
  recentEvents: [],
  endpointHealth: [],
};

function renderDashboard() {
  return renderPage(<DashboardPage />, {
    path: '/',
    initialEntry: '/',
  });
}

describe('DashboardPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(endpointsApi.list).mockResolvedValue([]);
    vi.mocked(dashboardApi.getAnalytics).mockResolvedValue({} as any);
    vi.mocked(dashboardApi.getOnboardingStatus).mockResolvedValue({
      hasEndpoints: false, hasSubscriptions: false, hasApiKeys: false, hasEvents: false,
      hasDeliveries: false, hasIncomingSources: false, hasIncomingDestinations: false,
    });
  });

  it('renders a loading skeleton before the project list arrives', () => {
    vi.mocked(projectsApi.list).mockReturnValue(new Promise(() => {}));
    const { container } = renderDashboard();
    expect(container.querySelector('.animate-pulse')).toBeTruthy();
  });

  it('renders the "no projects" onboarding empty state when the account genuinely has none', async () => {
    vi.mocked(projectsApi.list).mockResolvedValue([]);
    renderDashboard();
    expect(await screen.findByText(/no projects yet/i)).toBeInTheDocument();
  });

  it('renders populated stat cards when a project with data exists', async () => {
    vi.mocked(projectsApi.list).mockResolvedValue([PROJECT]);
    vi.mocked(dashboardApi.getProjectStats).mockResolvedValue(STATS);
    renderDashboard();
    expect(await screen.findByText('42')).toBeInTheDocument();
  });

  it('renders an explicit error state — not "no projects yet" — when the API is unreachable', async () => {
    vi.mocked(projectsApi.list).mockRejectedValue({ request: {}, message: 'Network Error' });
    renderDashboard();

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(screen.queryByText(/no projects yet/i)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
  });
});
