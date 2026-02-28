import { useState, useEffect } from 'react';
import { RouterProvider } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import { AuthContext, AuthState } from './auth/auth.store';
import { router } from './router';
import { http } from './api/http';
import { authApi } from './api/auth.api';
import { ErrorBoundary } from './components/ErrorBoundary';
import type { CurrentUserResponse } from './types/api.types';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      gcTime: 10 * 60 * 1000,
      retry: 1,
      refetchOnWindowFocus: true,
    },
    mutations: {
      onError: (error: unknown) => {
        const err = error as { response?: { data?: { message?: string } } };
        const message = err?.response?.data?.message || 'An unexpected error occurred';
        import('sonner').then(({ toast }) => toast.error(message));
      },
    },
  },
});

export default function App() {
  const [user, setUser] = useState<CurrentUserResponse | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Restore auth state on mount
  useEffect(() => {
    const storedToken = localStorage.getItem('auth_token');
    const storedUser = localStorage.getItem('auth_user');

    const storedRefreshToken = localStorage.getItem('refresh_token');
    if (storedToken && storedUser) {
      try {
        const parsedUser = JSON.parse(storedUser);
        setToken(storedToken);
        setRefreshToken(storedRefreshToken);
        setUser(parsedUser);
        http.setToken(storedToken);
        http.setRefreshToken(storedRefreshToken);
      } catch (err) {
        console.error('Failed to restore auth state:', err);
        localStorage.removeItem('auth_token');
        localStorage.removeItem('auth_user');
        localStorage.removeItem('refresh_token');
      }
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (token) {
      http.setToken(token);
    }
  }, [token]);

  useEffect(() => {
    http.setRefreshToken(refreshToken);
  }, [refreshToken]);

  useEffect(() => {
    http.setOnLogout(() => {
      setToken(null);
      setRefreshToken(null);
      setUser(null);
    });
    return () => http.setOnLogout(null);
  }, []);

  const authState: AuthState = {
    user,
    token,
    refreshToken,
    isAuthenticated: !!user && !!token,
    login: (newToken: string, newRefreshToken: string, newUser: CurrentUserResponse) => {
      setToken(newToken);
      setRefreshToken(newRefreshToken);
      setUser(newUser);
      http.setToken(newToken);
      http.setRefreshToken(newRefreshToken);
      localStorage.setItem('auth_token', newToken);
      localStorage.setItem('refresh_token', newRefreshToken);
      localStorage.setItem('auth_user', JSON.stringify(newUser));
    },
    logout: () => {
      authApi.logout(refreshToken || '').catch(() => { });
      setToken(null);
      setRefreshToken(null);
      setUser(null);
      http.setToken(null);
      http.setRefreshToken(null);
      localStorage.removeItem('auth_token');
      localStorage.removeItem('auth_user');
      localStorage.removeItem('refresh_token');
    },
    updateUser: (newUser: CurrentUserResponse) => {
      setUser(newUser);
      localStorage.setItem('auth_user', JSON.stringify(newUser));
    },
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <AuthContext.Provider value={authState}>
          <RouterProvider router={router} />
          <Toaster position="top-right" richColors />
        </AuthContext.Provider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
