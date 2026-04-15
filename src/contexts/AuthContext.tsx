// src/contexts/AuthContext.tsx
"use client";

import React, { createContext, useContext, useState, useEffect, type ReactNode, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import type { User } from '@/lib/auth-utils';
import { Loader2 } from 'lucide-react';

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (username: string, password: string, rememberMe?: boolean) => Promise<void>;
  logout: () => Promise<void>;
  checkAuth: (showLoader?: boolean) => Promise<boolean>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);
const AUTH_CHECK_TIMEOUT_MS = 8000;

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const authCheckIdRef = useRef(0);
  const router = useRouter();

  const checkAuth = useCallback(async (showLoader = true): Promise<boolean> => {
    const authCheckId = authCheckIdRef.current + 1;
    authCheckIdRef.current = authCheckId;

    if (showLoader) {
      setIsLoading(true);
    }

    const finishAuthCheck = (authStatus: boolean, authedUser: User | null): boolean => {
      if (authCheckIdRef.current !== authCheckId) {
        return authStatus;
      }

      setIsAuthenticated(authStatus);
      setUser(authedUser);
      setIsLoading(false);
      return authStatus;
    };

    let timeoutId: number | null = null;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = window.setTimeout(() => {
        reject(new Error('Auth verification timed out.'));
      }, AUTH_CHECK_TIMEOUT_MS);
    });

    const sessionRequest = async () => {
      const response = await fetch('/api/auth/session', {
        method: 'GET',
        credentials: 'include',
        cache: 'no-store',
        headers: {
          Accept: 'application/json',
        },
      });

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        const message = data?.message || `Session check failed with status ${response.status}.`;
        throw new Error(message);
      }

      return {
        isAuthenticated: Boolean(data?.isAuthenticated),
        user: (data?.user as User | null) ?? null,
      };
    };

    try {
      const { isAuthenticated: authStatus, user: authedUser } = await Promise.race([
        sessionRequest(),
        timeoutPromise,
      ]);

      return finishAuthCheck(authStatus, authedUser);
    } catch (error) {
      console.error('Auth check failed:', error instanceof Error ? error.message : error);
      return finishAuthCheck(false, null);
    } finally {
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }
    }
  }, []);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  const login = async (username: string, password: string, rememberMe?: boolean) => {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      credentials: 'include',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password, rememberMe }),
    });

    const data = await response.json();

    if (response.ok && data.success) {
      await checkAuth(false);
      window.location.assign('/dashboard');
      return;
    }

    // Throw a custom error object to pass status and data to the caller
    const error = new Error(data.message || 'Login failed.');
    (error as any).response = response;
    (error as any).data = data;
    throw error;
  };

  const logout = async () => {
    try {
      await fetch('/api/auth/sign-out', { method: 'POST' });
    } catch (error) {
      console.error("Error during logout API call:", error);
    } finally {
      setUser(null);
      setIsAuthenticated(false);
      router.replace('/login');
    }
  };
  
  if (isLoading) {
    return (
      <div className="flex h-screen w-full flex-col items-center justify-center bg-background">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="mt-4 text-muted-foreground">Initializing App...</p>
      </div>
    );
  }

  return (
    <AuthContext.Provider value={{ user, isAuthenticated, isLoading, login, logout, checkAuth }}>
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
