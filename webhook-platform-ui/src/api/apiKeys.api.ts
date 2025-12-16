import { http } from './http';

export interface ApiKeyRequest {
  name: string;
}

export interface ApiKeyResponse {
  id: string;
  projectId: string;
  name: string;
  keyPrefix: string;
  lastUsedAt: string | null;
  createdAt: string;
  revokedAt: string | null;
  expiresAt: string | null;
  key?: string;
}

export const apiKeysApi = {
  list: (projectId: string): Promise<ApiKeyResponse[]> => {
    return http.get<ApiKeyResponse[]>(`/api/v1/projects/${projectId}/api-keys`);
  },

  create: (projectId: string, data: ApiKeyRequest): Promise<ApiKeyResponse> => {
    return http.post<ApiKeyResponse>(`/api/v1/projects/${projectId}/api-keys`, data);
  },

  revoke: (projectId: string, apiKeyId: string): Promise<void> => {
    return http.delete<void>(`/api/v1/projects/${projectId}/api-keys/${apiKeyId}`);
  },
};
