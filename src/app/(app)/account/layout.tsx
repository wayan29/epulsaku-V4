// src/app/(app)/account/layout.tsx
"use client";

import type { ReactNode } from "react";
import { usePathname } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent } from "@/components/ui/card";
import { UserCog, AlertTriangle } from "lucide-react";

export default function AccountLayout({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const pathname = usePathname();
  const isUiThemePage = pathname === '/account/ui-theme';

  if (!user) {
    return (
        <div className="text-center py-10">
            <AlertTriangle className="mx-auto h-12 w-12 text-destructive" />
            <h2 className="mt-4 text-2xl font-bold">User Not Found</h2>
            <p className="mt-2 text-muted-foreground">Could not find user data. Please try logging in again.</p>
        </div>
    );
  }

  return (
     <div className={`space-y-6 mx-auto ${isUiThemePage ? 'max-w-[1480px]' : 'max-w-4xl'}`}>
        <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-[var(--ui-accent-gradient-from)] to-[var(--ui-accent-gradient-to)] text-white shadow-lg">
                <UserCog className="h-6 w-6" />
            </div>
            <div>
                <h1 className="text-2xl sm:text-3xl font-serif font-bold text-[var(--ui-text)] tracking-tight">Akun & Pengaturan</h1>
                <p className="text-[var(--ui-text-muted)]">Kelola akun, keamanan, dan pengaturan aplikasi Anda.</p>
            </div>
        </div>
        <Card className="bg-[var(--ui-card)] border-[var(--ui-border)] rounded-2xl shadow-md overflow-hidden">
          <CardContent className="pt-6">
            {children}
          </CardContent>
        </Card>
    </div>
  );
}
