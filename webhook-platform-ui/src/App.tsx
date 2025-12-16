import { useState, useEffect } from 'react';
import { RouterProvider } from 'react-router-dom';
import { AuthContext, AuthState } from './auth/auth.store';
import { router } from './router';
import { http } from './api/http';
import type { CurrentUserResponse } from './types/api.types';

export default function App() {
  const [user, setUser] = useState<CurrentUserResponse | null>(null);
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    if (token) {
      http.setToken(token);
    }
  }, [token]);

  const authState: AuthState = {
    user,
    token,
    isAuthenticated: !!user && !!token,
    login: (newToken: string, newUser: CurrentUserResponse) => {
      setToken(newToken);
      setUser(newUser);
    },
    logout: () => {
      setToken(null);
      setUser(null);
      http.setToken(null);
    },
  };

  return (
    <AuthContext.Provider value={authState}>
      <RouterProvider router={router} />
    </AuthContext.Provider>
  );
}
