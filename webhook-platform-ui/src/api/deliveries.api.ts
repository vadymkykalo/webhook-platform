import { http } from './http';
import type { DeliveryResponse, PageResponse } from '../types/api.types';

export interface DeliveryFilters {
  page?: number;
  size?: number;
}

export const deliveriesApi = {
  listByProject: (projectId: string, filters?: DeliveryFilters): Promise<PageResponse<DeliveryResponse>> => {
    const params = new URLSearchParams();
    
    if (filters?.page !== undefined) params.append('page', filters.page.toString());
    if (filters?.size !== undefined) params.append('size', filters.size.toString());
    
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
