// src/app/(auth)/signup/page.tsx
import SignupForm from "@/components/auth/SignupForm";
import { checkIfUsersExist } from "@/lib/user-utils";
import { AlertTriangle, ArrowRight } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default async function SignupPage() {
  const usersExist = await checkIfUsersExist();

  if (usersExist) {
    return (
      <div className="mx-auto w-full max-w-md">
        <div className="overflow-hidden rounded-[24px] border border-[var(--ui-border)] bg-[var(--ui-card)] text-[var(--ui-text)] shadow-[0_24px_70px_rgba(15,23,42,0.10)] dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100">
          <div className="h-1 w-full bg-gradient-to-r from-[var(--ui-top-bar-from)] via-[var(--ui-top-bar-via)] to-[var(--ui-top-bar-to)]" />
          <div className="px-5 py-6 text-center sm:px-7 sm:py-7">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-red-500/10 text-red-600 dark:bg-red-500/15 dark:text-red-300">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <h1 className="mt-4 text-xl font-bold tracking-tight text-[var(--ui-text)] dark:text-zinc-100">
              Signup tidak tersedia
            </h1>
            <p className="mt-2 text-sm leading-6 text-[var(--ui-text-muted)] dark:text-zinc-400">
              Akun awal sudah dibuat. Silakan login dengan akun internal.
            </p>
            <Button
              asChild
              className="mt-6 h-12 w-full rounded-2xl bg-gradient-to-r from-[var(--ui-accent-gradient-to)] to-[var(--ui-accent-gradient-from)] text-white shadow-md transition-all duration-300 hover:from-[var(--ui-accent-hover)] hover:to-[var(--ui-accent-gradient-to)] hover:shadow-lg"
            >
              <Link href="/login">
                Ke login
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-md">
      <SignupForm />
    </div>
  );
}
