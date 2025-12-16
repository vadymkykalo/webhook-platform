import { http } from './http';
import type { PageResponse } from '../types/api.types';

export interface SendEventRequest {
  type: string;
  data: any;
}

export interface EventResponse {
  id: string;
  projectId: string;
  eventType: string;
  payload: string;
  createdAt: string;
  deliveriesCreated?: number;
}

export interface EventFilters {
  page?: number;
  size?: number;
}

export const eventsApi = {
  listByProject: (projectId: string, filters?: EventFilters): Promise<PageResponse<EventResponse>> => {
    const params = new URLSearchParams();
    
    if (filters?.page !== undefined) params.append('page', filters.page.toString());
    if (filters?.size !== undefined) params.append('size', filters.size.toString());
    
    const queryString = params.toString();
    return http.get<PageResponse<EventResponse>>(
      `/api/v1/projects/${projectId}/events${queryString ? `?${queryString}` : ''}`
    );
  },

  get: (projectId: string, eventId: string): Promise<EventResponse> => {
    return http.get<EventResponse>(`/api/v1/projects/${projectId}/events/${eventId}`);
  },

  sendTestEvent: (projectId: string, payload: SendEventRequest): Promise<EventResponse> => {
    return http.post<EventResponse>(`/api/v1/projects/${projectId}/events/test`, payload);
  },
};
