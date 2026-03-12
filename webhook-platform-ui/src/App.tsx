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

  // Restore auth state on mount via silent refresh (cookie-based)
  useEffect(() => {
    const storedUser = localStorage.getItem('auth_user');
    
    if (storedUser) {
      // Try silent refresh to get new access token from httpOnly cookie
      authApi.refresh()
        .then((response) => {
          const parsedUser = JSON.parse(storedUser);
          setToken(response.accessToken);
          setUser(parsedUser);
          http.setToken(response.accessToken);
        })
        .catch(() => {
          // Refresh failed, clear stored user
          localStorage.removeItem('auth_user');
        })
        .finally(() => {
          setLoading(false);
        });
    } else {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (token) {
      http.setToken(token);
    }
  }, [token]);

  // refreshToken no longer used (httpOnly cookie handles it)
  useEffect(() => {
    if (refreshToken) {
      // Legacy cleanup
      setRefreshToken(null);
    }
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
    login: (newToken: string, _newRefreshToken: string, newUser: CurrentUserResponse) => {
      setToken(newToken);
      setUser(newUser);
      http.setToken(newToken);
      // refreshToken in httpOnly cookie, not stored in JS
      localStorage.setItem('auth_user', JSON.stringify(newUser));
    },
    logout: () => {
      authApi.logout('').catch(() => { });
      setToken(null);
      setRefreshToken(null);
      setUser(null);
      http.setToken(null);
      http.setRefreshToken(null);
      localStorage.removeItem('auth_user');
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
