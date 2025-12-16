import { http } from './http';

export type MembershipRole = 'OWNER' | 'DEVELOPER' | 'VIEWER';
export type MembershipStatus = 'ACTIVE' | 'DISABLED';

export interface MemberResponse {
  userId: string;
  email: string;
  role: MembershipRole;
  status: MembershipStatus;
  createdAt: string;
  temporaryPassword?: string;
}

export interface AddMemberRequest {
  email: string;
  role: MembershipRole;
}

export interface ChangeMemberRoleRequest {
  role: MembershipRole;
}

export const membersApi = {
  list: (orgId: string): Promise<MemberResponse[]> => {
    return http.get<MemberResponse[]>(`/api/v1/orgs/${orgId}/members`);
  },

  add: (orgId: string, request: AddMemberRequest): Promise<MemberResponse> => {
    return http.post<MemberResponse>(`/api/v1/orgs/${orgId}/members`, request);
  },

  changeRole: (orgId: string, userId: string, request: ChangeMemberRoleRequest): Promise<MemberResponse> => {
    return http.patch<MemberResponse>(`/api/v1/orgs/${orgId}/members/${userId}`, request);
  },

  remove: (orgId: string, userId: string): Promise<void> => {
    return http.delete<void>(`/api/v1/orgs/${orgId}/members/${userId}`);
  },
};
