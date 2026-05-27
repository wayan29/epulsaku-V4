// src/app/(app)/account/layout.tsx
"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { AlertTriangle, ShieldCheck, Sparkles, UserCog } from "lucide-react";

function formatRoleLabel(role?: string) {
  if (!role) return "Pengguna aktif";
  return role.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

export default function AccountLayout({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const pathname = usePathname();
  const isUiThemePage = pathname === "/account/ui-theme";

  if (!user) {
    return (
      <div className="mx-auto max-w-2xl">
        <div className="overflow-hidden rounded-[28px] border border-amber-200 bg-amber-50 text-amber-950 shadow-[0_24px_70px_rgba(120,53,15,0.12)] dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-100">
          <div className="h-1 w-full bg-gradient-to-r from-amber-400 via-orange-400 to-red-400" />
          <div className="px-6 py-8 text-center sm:px-8 sm:py-10">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-500/15 text-amber-600 dark:bg-amber-500/10 dark:text-amber-300">
              <AlertTriangle className="h-7 w-7" />
            </div>
            <h2 className="mt-5 text-2xl font-bold tracking-tight">Data akun tidak ditemukan</h2>
            <p className="mt-3 text-sm leading-6 text-amber-800/90 dark:text-amber-200/80 sm:text-base">
              Sesi akun Anda belum tersedia. Silakan login kembali untuk memuat ulang akses ke halaman pengaturan.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`mx-auto space-y-5 ${isUiThemePage ? "max-w-[1560px]" : "max-w-5xl"}`}>
      <section className="flex flex-col gap-4 rounded-[26px] border border-[var(--ui-border)] bg-[var(--ui-card)] px-5 py-5 dark:border-zinc-800 dark:bg-zinc-950 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[var(--ui-accent-gradient-from)] to-[var(--ui-accent-gradient-to)] text-white shadow-md">
            <UserCog className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight text-[var(--ui-text)] dark:text-zinc-100">
              Akun & pengaturan
            </h1>
            <p className="mt-0.5 text-sm text-[var(--ui-text-muted)] dark:text-zinc-400">
              @{user.username} &middot; {formatRoleLabel(user.role)}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 rounded-full border border-[var(--ui-border)] bg-[var(--ui-card-alt)]/75 px-3 py-1.5 dark:border-zinc-800 dark:bg-zinc-900/70">
          <ShieldCheck className="h-3.5 w-3.5 text-[var(--ui-accent)]" />
          <span className="text-sm font-medium text-[var(--ui-text)] dark:text-zinc-200">{formatRoleLabel(user.role)}</span>
        </div>
      </section>

      {isUiThemePage ? (
        children
      ) : (
        <section className="rounded-[26px] border border-[var(--ui-border)] bg-[var(--ui-card)] px-4 py-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950 sm:px-5 sm:py-5">
          {children}
        </section>
      )}
    </div>
  );
}
