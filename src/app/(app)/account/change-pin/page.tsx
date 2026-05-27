// src/app/(app)/account/change-pin/page.tsx
"use client";

import ChangePinForm from "@/components/account/ChangePinForm";
import { KeyRound } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { redirect } from "next/navigation";

export default function ChangePinPage() {
  const { user } = useAuth();

  if (!user) {
    redirect("/login");
  }

  return (
    <div className="space-y-5">
      <div className="overflow-hidden rounded-[26px] border border-[var(--ui-border)] bg-[var(--ui-card-alt)]/75 dark:border-zinc-800 dark:bg-zinc-900/60">
        <div className="h-1 w-full bg-gradient-to-r from-[var(--ui-top-bar-from)] via-[var(--ui-top-bar-via)] to-[var(--ui-top-bar-to)] opacity-80" />
        <div className="px-5 py-5 sm:px-6 sm:py-6">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[var(--ui-accent-gradient-from)] to-[var(--ui-accent-gradient-to)] text-white shadow-md">
              <KeyRound className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--ui-text-secondary)] dark:text-zinc-500">
                Otorisasi transaksi
              </p>
              <h2 className="mt-2 text-xl font-bold tracking-tight text-[var(--ui-text)] dark:text-zinc-100 sm:text-2xl">
                Ganti PIN transaksi
              </h2>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--ui-text-muted)] dark:text-zinc-400 sm:text-base">
                Perbarui PIN 6 digit yang digunakan untuk otorisasi transaksi. Demi keamanan, perubahan ini harus dikonfirmasi dengan password akun Anda.
              </p>
            </div>
          </div>
        </div>
      </div>

      <ChangePinForm />
    </div>
  );
}
