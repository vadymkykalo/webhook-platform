import { http } from './http';

export interface OrganizationResponse {
  id: string;
  name: string;
  createdAt: string;
}

export const organizationsApi = {
  get: (orgId: string): Promise<OrganizationResponse> => {
    return http.get<OrganizationResponse>(`/api/v1/orgs/${orgId}`);
  },

  update: (orgId: string, data: { name: string }): Promise<OrganizationResponse> => {
    return http.put<OrganizationResponse>(`/api/v1/orgs/${orgId}`, data);
  },
};
