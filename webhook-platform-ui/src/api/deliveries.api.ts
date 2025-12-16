import { http } from './http';
import type { DeliveryResponse, PageResponse } from '../types/api.types';

export interface DeliveryFilters {
  page?: number;
  size?: number;
  status?: string;
  endpointId?: string;
  fromDate?: string;
  toDate?: string;
}

export const deliveriesApi = {
  listByProject: (projectId: string, filters?: DeliveryFilters): Promise<PageResponse<DeliveryResponse>> => {
    const params = new URLSearchParams();
    
    if (filters?.page !== undefined) params.append('page', filters.page.toString());
    if (filters?.size !== undefined) params.append('size', filters.size.toString());
    if (filters?.status) params.append('status', filters.status);
    if (filters?.endpointId) params.append('endpointId', filters.endpointId);
    if (filters?.fromDate) params.append('fromDate', filters.fromDate);
    if (filters?.toDate) params.append('toDate', filters.toDate);
    
    const queryString = params.toString();
    return http.get<PageResponse<DeliveryResponse>>(
      `/api/v1/deliveries/projects/${projectId}${queryString ? `?${queryString}` : ''}`
    );
  },

  get: (id: string): Promise<DeliveryResponse> => {
    return http.get<DeliveryResponse>(`/api/v1/deliveries/${id}`);
  },

  replay: (id: string): Promise<void> => {
    return http.post<void>(`/api/v1/deliveries/${id}/replay`);
  },
};
