// src/app/(app)/layout.tsx
"use client";
import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import React, { useEffect } from 'react';
import Header from '@/components/core/Header';
import { useAuth } from "@/contexts/AuthContext";
import { Loader2 } from "lucide-react";

export default function AppLayout({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace('/login');
    }
  }, [isLoading, isAuthenticated, router]);

  // AuthProvider will now handle the initial loading state,
  // but we still show a loader here while the check is happening after initial load.
  if (isLoading) {
    return (
      <div className="flex h-screen w-full flex-col items-center justify-center bg-[var(--ui-surface)] text-[var(--ui-text)] dark:bg-zinc-950 dark:text-zinc-100">
        <Loader2 className="h-12 w-12 animate-spin text-[var(--ui-accent)]" />
        <p className="mt-4 text-[var(--ui-text-muted)] dark:text-zinc-400">Checking session...</p>
      </div>
    );
  }

  // Only render the layout if authenticated.
  if (isAuthenticated) {
    return (
      <div className="flex min-h-screen flex-col bg-[var(--ui-surface)] text-[var(--ui-text)] dark:bg-zinc-950 dark:text-zinc-100">
        <Header />
        <main className="container mx-auto flex-grow px-3 py-4 sm:px-4 sm:py-6 lg:py-8">
          {children}
        </main>
        <footer className="border-t border-[var(--ui-border)] py-6 text-center text-sm text-[var(--ui-text-muted)] dark:border-zinc-800 dark:text-zinc-400">
          © {new Date().getFullYear()} ePulsaku. All rights reserved.
        </footer>
      </div>
    );
  }

  // Return null or a loader while redirecting
  return null;
}
