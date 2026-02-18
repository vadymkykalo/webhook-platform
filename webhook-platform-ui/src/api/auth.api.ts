import { http } from './http';
import type { RegisterRequest, LoginRequest, AuthResponse, CurrentUserResponse } from '../types/api.types';

export const authApi = {
  register: (data: RegisterRequest): Promise<AuthResponse> => {
    return http.post<AuthResponse>('/api/v1/auth/register', data);
  },

  login: (data: LoginRequest): Promise<AuthResponse> => {
    return http.post<AuthResponse>('/api/v1/auth/login', data);
  },

  getCurrentUser: (): Promise<CurrentUserResponse> => {
    return http.get<CurrentUserResponse>('/api/v1/auth/me');
  },

  refresh: (refreshToken: string): Promise<AuthResponse> => {
    return http.post<AuthResponse>('/api/v1/auth/refresh', { refreshToken });
  },
};
