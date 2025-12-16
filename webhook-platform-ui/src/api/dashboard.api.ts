import { http } from './http';

export interface DashboardStats {
  deliveryStats: DeliveryStats;
  recentEvents: RecentEvent[];
  endpointHealth: EndpointHealth[];
}

export interface DeliveryStats {
  totalDeliveries: number;
  successfulDeliveries: number;
  failedDeliveries: number;
  pendingDeliveries: number;
  successRate: number;
}

export interface RecentEvent {
  id: string;
  type: string;
  createdAt: string;
  deliveryCount: number;
}

export interface EndpointHealth {
  id: string;
  url: string;
  enabled: boolean;
  totalDeliveries: number;
  successfulDeliveries: number;
  successRate: number;
}

export const dashboardApi = {
  getProjectStats: (projectId: string): Promise<DashboardStats> => {
    return http.get<DashboardStats>(`/api/v1/dashboard/projects/${projectId}`);
  },
};
