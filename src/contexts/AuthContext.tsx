// src/contexts/AuthContext.tsx
"use client";

import React, { createContext, useContext, useState, useEffect, type ReactNode, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import type { User } from '@/lib/auth-utils';
import { authClient } from '@/lib/auth-client';
import { Loader2, Zap } from 'lucide-react';

interface LoginResult {
  requiresTwoFactor?: boolean;
}

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (username: string, password: string, rememberMe?: boolean) => Promise<LoginResult>;
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
        reject(new Error('Pemeriksaan sesi melebihi batas waktu.'));
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
        const message = data?.message || `Pemeriksaan sesi gagal dengan status ${response.status}.`;
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

    if (response.ok && data?.requiresTwoFactor) {
      return { requiresTwoFactor: true };
    }

    if (response.ok && data.success) {
      await checkAuth(false);
      window.location.assign('/dashboard');
      return {};
    }

    // Throw a custom error object to pass status and data to the caller
    const error = new Error(data.message || 'Login gagal.');
    (error as any).response = response;
    (error as any).data = data;
    throw error;
  };

  const logout = async () => {
    try {
      const { error } = await authClient.signOut();
      if (error) {
        throw new Error(error.message || 'Logout gagal.');
      }
    } catch (error) {
      console.error("Error saat memanggil API logout:", error);
    } finally {
      setUser(null);
      setIsAuthenticated(false);
      router.replace('/login');
      router.refresh();
    }
  };
  
  if (isLoading) {
    return (
      <div className="relative flex min-h-screen w-full items-center justify-center overflow-hidden bg-[var(--ui-surface)] px-4 text-[var(--ui-text)] dark:bg-zinc-950 dark:text-zinc-100">
        <div className="absolute inset-0 bg-[linear-gradient(180deg,var(--ui-surface)_0%,var(--ui-card-alt)_100%)] dark:bg-[linear-gradient(180deg,#09090b_0%,#18181b_100%)]" />
        <div className="absolute inset-x-0 top-0 h-40 bg-gradient-to-r from-[var(--ui-top-bar-from)] via-[var(--ui-top-bar-via)] to-[var(--ui-top-bar-to)] opacity-10 dark:opacity-20" />
        <div className="absolute left-0 top-24 h-56 w-56 rounded-full bg-[var(--ui-accent-bg)] blur-3xl dark:bg-[var(--ui-accent)]/10" />
        <div className="absolute bottom-0 right-0 h-72 w-72 rounded-full bg-[var(--ui-accent-bg)] blur-3xl dark:bg-[var(--ui-accent)]/10" />

        <div className="relative z-10 w-full max-w-md overflow-hidden rounded-[28px] border border-[var(--ui-border)] bg-[var(--ui-card)] text-center shadow-[0_24px_70px_rgba(15,23,42,0.10)] dark:border-zinc-800 dark:bg-zinc-950">
          <div className="h-1 w-full bg-gradient-to-r from-[var(--ui-top-bar-from)] via-[var(--ui-top-bar-via)] to-[var(--ui-top-bar-to)]" />
          <div className="space-y-5 px-6 py-10 sm:px-8">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-[var(--ui-accent-gradient-from)] to-[var(--ui-accent-gradient-to)] text-white shadow-lg">
              <Zap className="h-6 w-6" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--ui-text-secondary)] dark:text-zinc-500">
                ePulsaku
              </p>
              <h2 className="mt-2 text-2xl font-bold tracking-tight text-[var(--ui-text)] dark:text-zinc-100">
                Menyiapkan sesi Anda
              </h2>
              <p className="mt-3 text-sm leading-6 text-[var(--ui-text-muted)] dark:text-zinc-400">
                Memeriksa autentikasi dan memuat akses dashboard operasional.
              </p>
            </div>
            <div className="flex items-center justify-center gap-3 rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-card-alt)]/70 px-4 py-3 text-sm text-[var(--ui-text-muted)] dark:border-zinc-800 dark:bg-zinc-900/60 dark:text-zinc-400">
              <Loader2 className="h-5 w-5 animate-spin text-[var(--ui-accent)]" />
              <span>Mohon tunggu sebentar...</span>
            </div>
          </div>
        </div>
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
