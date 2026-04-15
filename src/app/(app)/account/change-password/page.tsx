// src/app/(app)/account/change-password/page.tsx
"use client";
import ChangePasswordForm from "@/components/account/ChangePasswordForm";
import { ShieldCheck } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { redirect } from 'next/navigation';

export default function ChangePasswordPage() {
  const { user } = useAuth();
  if (!user) {
    // This case should ideally be handled by the layout, but as a safeguard:
    redirect('/login');
  }

  return (
    <>
      <div className="mb-6 max-w-xl rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-card-alt)]/70 p-5 dark:border-zinc-800 dark:bg-zinc-900/70">
        <div className="mb-3 flex items-center gap-4">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-[var(--ui-accent-gradient-from)] to-[var(--ui-accent-gradient-to)] text-white shadow-md">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <h2 className="text-xl font-semibold font-headline text-[var(--ui-text)] dark:text-zinc-100">Change Password</h2>
        </div>
        <p className="text-sm leading-6 text-[var(--ui-text-muted)] dark:text-zinc-400">Update your account password. For security, choose a strong, unique password that you don&apos;t use for other services.</p>
      </div>
      <ChangePasswordForm />
    </>
  );
}
