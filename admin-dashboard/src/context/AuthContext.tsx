import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { AdminUser } from '../types';

interface AuthContextType {
  user: AdminUser | null;
  token: string | null;
  login: (email: string, password: string) => Promise<boolean>;
  logout: () => void;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AdminUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Simulate token persistence
  useEffect(() => {
    const savedToken = localStorage.getItem('adminToken');
    if (savedToken) {
      // In real app, validate token with backend
      setToken(savedToken);
      setUser({
        id: 'admin-1',
        email: 'supervisor@gasbot.app',
        role: 'ADMIN',
      });
    }
    setIsLoading(false);
  }, []);

  const login = async (email: string, password: string): Promise<boolean> => {
    setIsLoading(true);
    // Mock authentication - in production call /api/auth/login
    if (email === 'admin@gasbot.app' && password === 'demo123') {
      const mockToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'; // placeholder
      const mockUser: AdminUser = {
        id: 'admin-1',
        email,
        role: 'ADMIN',
      };
      setUser(mockUser);
      setToken(mockToken);
      localStorage.setItem('adminToken', mockToken);
      setIsLoading(false);
      return true;
    }
    setIsLoading(false);
    return false;
  };

  const logout = () => {
    setUser(null);
    setToken(null);
    localStorage.removeItem('adminToken');
  };

  return (
    <AuthContext.Provider value={{ user, token, login, logout, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
