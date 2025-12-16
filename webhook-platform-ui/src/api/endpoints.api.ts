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

  rotateSecret: (projectId: string, id: string, currentEndpoint: EndpointResponse): Promise<EndpointResponse> => {
    const newSecret = generateSecret();
    return http.put<EndpointResponse>(`/api/v1/projects/${projectId}/endpoints/${id}`, {
      url: currentEndpoint.url,
      description: currentEndpoint.description,
      enabled: currentEndpoint.enabled,
      rateLimitPerSecond: currentEndpoint.rateLimitPerSecond,
      secret: newSecret,
    });
  },
};

function generateSecret(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
}
