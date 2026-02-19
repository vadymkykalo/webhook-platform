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

  verifyEmail: (token: string): Promise<void> => {
    return http.post<void>(`/api/v1/auth/verify-email?token=${encodeURIComponent(token)}`);
  },

  resendVerification: (email: string): Promise<void> => {
    return http.post<void>(`/api/v1/auth/resend-verification?email=${encodeURIComponent(email)}`);
  },
};
