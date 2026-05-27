// src/components/auth/SignupForm.tsx
"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Loader2, Zap } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";
import { createUser } from "@/lib/user-utils";

const formSchema = z.object({
  username: z.string().min(3, "Username minimal 3 karakter"),
  email: z.string().email("Format email tidak valid"),
  password: z.string().min(6, "Password minimal 6 karakter"),
  confirmPassword: z.string().min(6, "Password minimal 6 karakter"),
  pin: z.string().length(6, "PIN harus 6 digit").regex(/^\d+$/, "PIN hanya boleh berisi angka"),
  confirmPin: z.string().length(6, "PIN harus 6 digit").regex(/^\d+$/, "PIN hanya boleh berisi angka"),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Konfirmasi password tidak cocok",
  path: ["confirmPassword"],
}).refine((data) => data.pin === data.confirmPin, {
  message: "Konfirmasi PIN tidak cocok",
  path: ["confirmPin"],
});

export default function SignupForm() {
  const router = useRouter();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      username: "",
      email: "",
      password: "",
      confirmPassword: "",
      pin: "",
      confirmPin: "",
    },
  });

  async function onSubmit(values: z.infer<typeof formSchema>) {
    setIsLoading(true);
    try {
      const result = await createUser({
        username: values.username,
        email: values.email,
        passwordPlain: values.password,
        pinPlain: values.pin,
      });

      if (result.success) {
        toast({
          title: "Akun admin awal berhasil dibuat",
          description: `Selamat datang, ${result.user?.username}. Silakan login untuk mulai menggunakan dashboard.`,
        });
        router.push("/login");
      } else {
        toast({
          title: "Pembuatan akun gagal",
          description: result.message || "Akun tidak dapat dibuat.",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error("Signup error:", error);
      toast({
        title: "Terjadi kesalahan saat signup",
        description: error instanceof Error ? error.message : "Terjadi kesalahan yang tidak diketahui.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="overflow-hidden rounded-[24px] border border-[var(--ui-border)] bg-[var(--ui-card)] text-[var(--ui-text)] shadow-[0_24px_70px_rgba(15,23,42,0.10)] dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100">
      <div className="h-1 w-full bg-gradient-to-r from-[var(--ui-top-bar-from)] via-[var(--ui-top-bar-via)] to-[var(--ui-top-bar-to)]" />
      <div className="px-5 py-6 sm:px-7 sm:py-7">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-[var(--ui-accent-gradient-from)] to-[var(--ui-accent-gradient-to)] text-white shadow-md">
            <Zap className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[var(--ui-text-secondary)] dark:text-zinc-500">
              ePulsaku
            </p>
            <h1 className="text-xl font-bold tracking-tight text-[var(--ui-text)] dark:text-zinc-100">
              Setup admin pertama
            </h1>
          </div>
        </div>

        <p className="mb-5 rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-card-alt)]/70 px-4 py-3 text-sm text-[var(--ui-text-muted)] dark:border-zinc-800 dark:bg-zinc-900/60 dark:text-zinc-400">
          Buat akun owner/admin awal untuk mulai menggunakan dashboard internal.
        </p>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="username"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm font-medium text-[var(--ui-text)] dark:text-zinc-300">
                    Username
                  </FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Username admin"
                      autoComplete="username"
                      {...field}
                      disabled={isLoading}
                      className="h-12 rounded-2xl border-[var(--ui-input-border)] bg-[var(--ui-input-bg)] text-[var(--ui-text)] shadow-sm focus-visible:ring-[var(--ui-accent)] dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm font-medium text-[var(--ui-text)] dark:text-zinc-300">
                    Email
                  </FormLabel>
                  <FormControl>
                    <Input
                      type="email"
                      placeholder="admin@perusahaan.com"
                      autoComplete="email"
                      {...field}
                      disabled={isLoading}
                      className="h-12 rounded-2xl border-[var(--ui-input-border)] bg-[var(--ui-input-bg)] text-[var(--ui-text)] shadow-sm focus-visible:ring-[var(--ui-accent)] dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm font-medium text-[var(--ui-text)] dark:text-zinc-300">
                    Password
                  </FormLabel>
                  <FormControl>
                    <Input
                      type="password"
                      placeholder="Password"
                      autoComplete="new-password"
                      {...field}
                      disabled={isLoading}
                      className="h-12 rounded-2xl border-[var(--ui-input-border)] bg-[var(--ui-input-bg)] text-[var(--ui-text)] shadow-sm focus-visible:ring-[var(--ui-accent)] dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="confirmPassword"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm font-medium text-[var(--ui-text)] dark:text-zinc-300">
                    Konfirmasi password
                  </FormLabel>
                  <FormControl>
                    <Input
                      type="password"
                      placeholder="Ulangi password"
                      autoComplete="new-password"
                      {...field}
                      disabled={isLoading}
                      className="h-12 rounded-2xl border-[var(--ui-input-border)] bg-[var(--ui-input-bg)] text-[var(--ui-text)] shadow-sm focus-visible:ring-[var(--ui-accent)] dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="pin"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-medium text-[var(--ui-text)] dark:text-zinc-300">
                      PIN transaksi
                    </FormLabel>
                    <FormControl>
                      <Input
                        type="password"
                        placeholder="6 digit"
                        autoComplete="off"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        {...field}
                        maxLength={6}
                        disabled={isLoading}
                        className="h-12 rounded-2xl border-[var(--ui-input-border)] bg-[var(--ui-input-bg)] text-[var(--ui-text)] shadow-sm focus-visible:ring-[var(--ui-accent)] dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="confirmPin"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-medium text-[var(--ui-text)] dark:text-zinc-300">
                      Konfirmasi PIN
                    </FormLabel>
                    <FormControl>
                      <Input
                        type="password"
                        placeholder="Ulangi PIN"
                        autoComplete="off"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        {...field}
                        maxLength={6}
                        disabled={isLoading}
                        className="h-12 rounded-2xl border-[var(--ui-input-border)] bg-[var(--ui-input-bg)] text-[var(--ui-text)] shadow-sm focus-visible:ring-[var(--ui-accent)] dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <Button
              type="submit"
              className="min-h-12 w-full rounded-2xl bg-gradient-to-r from-[var(--ui-accent-gradient-to)] to-[var(--ui-accent-gradient-from)] px-4 py-3 text-white shadow-md transition-all duration-300 hover:from-[var(--ui-accent-hover)] hover:to-[var(--ui-accent-gradient-to)] hover:shadow-lg"
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Membuat akun...
                </>
              ) : (
                <>
                  Buat admin pertama
                  <ArrowRight className="ml-2 h-4 w-4" />
                </>
              )}
            </Button>
          </form>
        </Form>

        <p className="mt-6 text-center text-sm text-[var(--ui-text-muted)] dark:text-zinc-400">
          Sudah punya akun?{" "}
          <Link
            href="/login"
            className="font-semibold text-[var(--ui-accent)] transition-colors hover:text-[var(--ui-accent-hover)]"
          >
            Login
          </Link>
        </p>
      </div>
    </div>
  );
}
