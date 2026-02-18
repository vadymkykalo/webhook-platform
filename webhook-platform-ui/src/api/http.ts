import axios, { AxiosInstance, AxiosError, InternalAxiosRequestConfig } from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080';

type OnRefreshedCallback = (token: string) => void;
type OnLogoutCallback = () => void;

class HttpClient {
  private client: AxiosInstance;
  private token: string | null = null;
  private refreshToken: string | null = null;
  private isRefreshing = false;
  private refreshSubscribers: OnRefreshedCallback[] = [];
  private onLogout: OnLogoutCallback | null = null;

  constructor() {
    this.client = axios.create({
      baseURL: API_URL,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    this.client.interceptors.request.use((config) => {
      if (this.token) {
        config.headers.Authorization = `Bearer ${this.token}`;
      }
      return config;
    });

    this.client.interceptors.response.use(
      (response) => response,
      async (error: AxiosError) => {
        const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };

        if (
          error.response?.status === 401 &&
          !originalRequest._retry &&
          this.refreshToken &&
          !originalRequest.url?.includes('/api/v1/auth/refresh') &&
          !originalRequest.url?.includes('/api/v1/auth/login')
        ) {
          if (this.isRefreshing) {
            return new Promise((resolve) => {
              this.refreshSubscribers.push((newToken: string) => {
                originalRequest.headers.Authorization = `Bearer ${newToken}`;
                resolve(this.client(originalRequest));
              });
            });
          }

          originalRequest._retry = true;
          this.isRefreshing = true;

          try {
            const response = await this.client.post('/api/v1/auth/refresh', {
              refreshToken: this.refreshToken,
            });

            const { accessToken, refreshToken: newRefreshToken } = response.data;

            this.token = accessToken;
            this.refreshToken = newRefreshToken;
            localStorage.setItem('auth_token', accessToken);
            localStorage.setItem('refresh_token', newRefreshToken);

            this.refreshSubscribers.forEach((cb) => cb(accessToken));
            this.refreshSubscribers = [];

            originalRequest.headers.Authorization = `Bearer ${accessToken}`;
            return this.client(originalRequest);
          } catch (refreshError) {
            this.refreshSubscribers = [];
            this.token = null;
            this.refreshToken = null;
            localStorage.removeItem('auth_token');
            localStorage.removeItem('auth_user');
            localStorage.removeItem('refresh_token');
            if (this.onLogout) {
              this.onLogout();
            }
            return Promise.reject(refreshError);
          } finally {
            this.isRefreshing = false;
          }
        }

        return Promise.reject(error);
      }
    );
  }

  setToken(token: string | null) {
    this.token = token;
  }

  getToken(): string | null {
    return this.token;
  }

  setRefreshToken(refreshToken: string | null) {
    this.refreshToken = refreshToken;
  }

  getRefreshToken(): string | null {
    return this.refreshToken;
  }

  setOnLogout(callback: OnLogoutCallback | null) {
    this.onLogout = callback;
  }

  async get<T>(url: string): Promise<T> {
    const response = await this.client.get<T>(url);
    return response.data;
  }

  async post<T>(url: string, data?: unknown, headers?: Record<string, string>): Promise<T> {
    const response = await this.client.post<T>(url, data, { headers });
    return response.data;
  }

  async put<T>(url: string, data?: unknown): Promise<T> {
    const response = await this.client.put<T>(url, data);
    return response.data;
  }

  async patch<T>(url: string, data?: unknown): Promise<T> {
    const response = await this.client.patch<T>(url, data);
    return response.data;
  }

  async delete<T>(url: string): Promise<T> {
    const response = await this.client.delete<T>(url);
    return response.data;
  }
}

export const http = new HttpClient();
