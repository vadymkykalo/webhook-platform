import { http } from './http';
import type { EndpointRequest, EndpointResponse } from '../types/api.types';

export const endpointsApi = {
  list: (projectId: string): Promise<EndpointResponse[]> => {
    return http.get<EndpointResponse[]>(`/api/v1/projects/${projectId}/endpoints`);
  },

  create: (projectId: string, data: EndpointRequest): Promise<EndpointResponse> => {
    return http.post<EndpointResponse>(`/api/v1/projects/${projectId}/endpoints`, data);
  },

  get: (projectId: string, id: string): Promise<EndpointResponse> => {
    return http.get<EndpointResponse>(`/api/v1/projects/${projectId}/endpoints/${id}`);
  },

  update: (projectId: string, id: string, data: EndpointRequest): Promise<EndpointResponse> => {
    return http.put<EndpointResponse>(`/api/v1/projects/${projectId}/endpoints/${id}`, data);
  },

  delete: (projectId: string, id: string): Promise<void> => {
    return http.delete<void>(`/api/v1/projects/${projectId}/endpoints/${id}`);
  },

  rotateSecret: (projectId: string, id: string): Promise<EndpointResponse> => {
    return http.post<EndpointResponse>(`/api/v1/projects/${projectId}/endpoints/${id}/rotate-secret`);
  },
};
