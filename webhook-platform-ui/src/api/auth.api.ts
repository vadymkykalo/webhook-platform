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

  changePassword: (currentPassword: string, newPassword: string): Promise<void> => {
    return http.post<void>('/api/v1/auth/change-password', { currentPassword, newPassword });
  },

  logout: (refreshToken: string): Promise<void> => {
    return http.post<void>('/api/v1/auth/logout', { refreshToken });
  },

  forgotPassword: (email: string): Promise<void> => {
    return http.post<void>('/api/v1/auth/forgot-password', { email });
  },

  resetPassword: (token: string, newPassword: string): Promise<void> => {
    return http.post<void>('/api/v1/auth/reset-password', { token, newPassword });
  },

  updateProfile: (data: { fullName?: string }): Promise<{ id: string; email: string; fullName: string | null; status: string }> => {
    return http.put('/api/v1/auth/profile', data);
  },
};
