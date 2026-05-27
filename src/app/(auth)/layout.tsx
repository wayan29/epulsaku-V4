// src/app/(auth)/layout.tsx
import type { ReactNode } from "react";
import { ModeToggle } from "@/components/core/ModeToggle";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="relative min-h-screen overflow-x-hidden bg-[var(--ui-surface)] text-[var(--ui-text)] dark:bg-zinc-950 dark:text-zinc-100">
      <div className="absolute inset-0 bg-[linear-gradient(180deg,var(--ui-surface)_0%,var(--ui-card-alt)_100%)] dark:bg-[linear-gradient(180deg,#09090b_0%,#18181b_100%)]" />
      <div className="absolute inset-x-0 top-0 h-40 bg-gradient-to-r from-[var(--ui-top-bar-from)] via-[var(--ui-top-bar-via)] to-[var(--ui-top-bar-to)] opacity-10 dark:opacity-20" />
      <div className="absolute left-0 top-24 h-56 w-56 rounded-full bg-[var(--ui-accent-bg)] blur-3xl dark:bg-[var(--ui-accent)]/10" />
      <div className="absolute bottom-0 right-0 h-72 w-72 rounded-full bg-[var(--ui-accent-bg)] blur-3xl dark:bg-[var(--ui-accent)]/10" />

      <div className="absolute right-4 top-4 z-20 sm:right-6 sm:top-6">
        <ModeToggle />
      </div>

      <div className="relative z-10 flex min-h-screen items-start justify-center px-4 pb-10 pt-20 sm:items-center sm:px-6 sm:py-10 lg:px-8">
        <div className="w-full max-w-md">{children}</div>
      </div>
    </div>
  );
}
