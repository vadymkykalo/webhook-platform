import { useState, useEffect } from 'react';
import { RouterProvider } from 'react-router-dom';
import { Toaster } from 'sonner';
import { AuthContext, AuthState } from './auth/auth.store';
import { router } from './router';
import { http } from './api/http';
import { authApi } from './api/auth.api';
import { ErrorBoundary } from './components/ErrorBoundary';
import type { CurrentUserResponse } from './types/api.types';

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
      authApi.logout(refreshToken || '').catch(() => {});
      setToken(null);
      setRefreshToken(null);
      setUser(null);
      http.setToken(null);
      http.setRefreshToken(null);
      localStorage.removeItem('auth_token');
      localStorage.removeItem('auth_user');
      localStorage.removeItem('refresh_token');
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
      <AuthContext.Provider value={authState}>
        <RouterProvider router={router} />
        <Toaster position="top-right" richColors />
      </AuthContext.Provider>
    </ErrorBoundary>
  );
}
