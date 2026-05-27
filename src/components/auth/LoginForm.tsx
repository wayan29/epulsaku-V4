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
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";
import Link from "next/link";
import { ArrowRight, Loader2, Timer, Zap } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useRouter } from "next/navigation";
import { Alert, AlertDescription } from "@/components/ui/alert";

const formSchema = z.object({
  username: z.string().min(1, "Username wajib diisi"),
  password: z.string().min(1, "Password wajib diisi"),
  rememberMe: z.boolean().default(false).optional(),
});

const twoFactorSchema = z.object({
  code: z.string().length(6, "Kode harus 6 digit").regex(/^\d+$/, "Kode hanya boleh berisi angka"),
  trustDevice: z.boolean().default(false).optional(),
});

const backupCodeSchema = z.object({
  code: z.string().min(6, "Backup code minimal 6 karakter"),
  trustDevice: z.boolean().default(false).optional(),
});

export default function LoginForm() {
  const { toast } = useToast();
  const { login, isAuthenticated, checkAuth } = useAuth();
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isVerifyingTwoFactor, setIsVerifyingTwoFactor] = useState(false);
  const [isVerifyingBackupCode, setIsVerifyingBackupCode] = useState(false);
  const [requiresTwoFactor, setRequiresTwoFactor] = useState(false);
  const [useBackupCode, setUseBackupCode] = useState(false);
  const [lockoutTime, setLockoutTime] = useState(0);
  const isLockedOut = lockoutTime > 0;

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      username: "",
      password: "",
      rememberMe: true,
    },
  });

  const twoFactorForm = useForm<z.infer<typeof twoFactorSchema>>({
    resolver: zodResolver(twoFactorSchema),
    defaultValues: {
      code: "",
      trustDevice: false,
    },
  });

  const backupCodeForm = useForm<z.infer<typeof backupCodeSchema>>({
    resolver: zodResolver(backupCodeSchema),
    defaultValues: {
      code: "",
      trustDevice: false,
    },
  });

  useEffect(() => {
    if (isAuthenticated) {
      router.replace("/dashboard");
    }
  }, [isAuthenticated, router]);

  useEffect(() => {
    if (!requiresTwoFactor) return;

    twoFactorForm.reset({ code: "", trustDevice: false });
    const resetTimer = window.setTimeout(() => {
      twoFactorForm.setValue("code", "");
      twoFactorForm.setFocus("code");
    }, 0);

    return () => window.clearTimeout(resetTimer);
  }, [requiresTwoFactor, twoFactorForm]);

  useEffect(() => {
    let timer: NodeJS.Timeout | undefined;
    if (isLockedOut) {
      timer = setInterval(() => {
        setLockoutTime((prevTime) => prevTime - 1);
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [isLockedOut]);

  async function onSubmit(values: z.infer<typeof formSchema>) {
    setIsSubmitting(true);
    try {
      const result = await login(values.username, values.password, values.rememberMe);
      if (result.requiresTwoFactor) {
        twoFactorForm.reset({ code: "", trustDevice: false });
        form.reset({ username: values.username, password: "", rememberMe: values.rememberMe });
        setRequiresTwoFactor(true);
        toast({
          title: "Verifikasi 2FA diperlukan",
          description: "Masukkan kode dari aplikasi authenticator Anda.",
        });
        return;
      }
      toast({
        title: "Login berhasil",
        description: "Membuka dashboard operasional...",
      });
    } catch (error) {
      const err = error as Error & { response?: Response; data?: any };
      const errorMessage = err.data?.message || err.message || "Terjadi kesalahan yang tidak diketahui.";

      if (err.response?.status === 429) {
        const lockout = err.data?.lockoutTime || 120;
        setLockoutTime(lockout);
        toast({
          title: "Terlalu banyak percobaan",
          description: errorMessage,
          variant: "destructive",
        });
      } else {
        toast({
          title: err.data?.message?.includes("session dashboard belum tervalidasi")
            ? "Session belum siap"
            : "Login gagal",
          description: errorMessage,
          variant: "destructive",
        });
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  async function onSubmitTwoFactor(values: z.infer<typeof twoFactorSchema>) {
    setIsVerifyingTwoFactor(true);
    try {
      const { error } = await authClient.twoFactor.verifyTotp({
        code: values.code,
        trustDevice: values.trustDevice,
      });

      if (error) {
        throw new Error(error.message || "Kode authenticator tidak valid.");
      }

      await fetch("/api/auth/login-notification", {
        method: "POST",
        credentials: "include",
        cache: "no-store",
      });

      await checkAuth(false);
      toast({
        title: "Login berhasil",
        description: "Verifikasi 2FA berhasil. Membuka dashboard...",
      });
      window.location.assign("/dashboard");
    } catch (error) {
      toast({
        title: "Verifikasi 2FA gagal",
        description: error instanceof Error ? error.message : "Kode authenticator tidak valid.",
        variant: "destructive",
      });
    } finally {
      setIsVerifyingTwoFactor(false);
    }
  }

  async function onSubmitBackupCode(values: z.infer<typeof backupCodeSchema>) {
    setIsVerifyingBackupCode(true);
    try {
      const { error } = await authClient.twoFactor.verifyBackupCode({
        code: values.code.trim(),
        trustDevice: values.trustDevice,
      });

      if (error) {
        throw new Error(error.message || "Backup code tidak valid.");
      }

      await fetch("/api/auth/login-notification", {
        method: "POST",
        credentials: "include",
        cache: "no-store",
      });

      await checkAuth(false);
      toast({
        title: "Login berhasil",
        description: "Backup code berhasil. Membuka dashboard...",
      });
      window.location.assign("/dashboard");
    } catch (error) {
      toast({
        title: "Verifikasi backup code gagal",
        description: error instanceof Error ? error.message : "Backup code tidak valid.",
        variant: "destructive",
      });
    } finally {
      setIsVerifyingBackupCode(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-md">
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
                Login internal
              </h1>
            </div>
          </div>

          {isLockedOut && (
            <Alert
              variant="destructive"
              className="mb-5 rounded-2xl border-red-200 bg-red-50 text-red-800 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-200"
            >
              <Timer className="h-4 w-4" />
              <AlertDescription className="ml-2 text-sm leading-6">
                Coba lagi dalam <span className="font-bold">{lockoutTime}</span> detik.
              </AlertDescription>
            </Alert>
          )}

          {requiresTwoFactor ? (
            useBackupCode ? (
              <Form {...backupCodeForm}>
                <form key="backup-code-login-form" onSubmit={backupCodeForm.handleSubmit(onSubmitBackupCode)} autoComplete="off" className="space-y-4">
                  <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-100">
                    Masukkan salah satu backup code yang Anda simpan saat aktivasi 2FA. Setiap backup code hanya bisa dipakai sekali.
                  </div>
                  <FormField
                    control={backupCodeForm.control}
                    name="code"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-sm font-medium text-[var(--ui-text)] dark:text-zinc-300">
                          Backup code
                        </FormLabel>
                        <FormControl>
                          <Input
                            key="backup-code-input"
                            type="text"
                            placeholder="ABCD-EFGH"
                            autoComplete="off"
                            name="backup-code"
                            value={field.value || ""}
                            onChange={(event) => field.onChange(event.target.value)}
                            onBlur={field.onBlur}
                            ref={field.ref}
                            disabled={isVerifyingBackupCode}
                            className="h-12 rounded-2xl border-[var(--ui-input-border)] bg-[var(--ui-input-bg)] text-center text-base tracking-[0.18em] text-[var(--ui-text)] shadow-sm focus-visible:ring-[var(--ui-accent)] dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200"
                          />
                        </FormControl>
                        <FormMessage className="text-red-500" />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={backupCodeForm.control}
                    name="trustDevice"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center space-x-3 space-y-0 py-1">
                        <FormControl>
                          <Checkbox
                            checked={field.value}
                            onCheckedChange={field.onChange}
                            disabled={isVerifyingBackupCode}
                            id="trust-device-backup"
                            className="h-5 w-5 rounded-md border-[var(--ui-accent)] text-[var(--ui-accent)] data-[state=checked]:bg-[var(--ui-accent)] data-[state=checked]:text-white focus-visible:ring-[var(--ui-accent)]"
                          />
                        </FormControl>
                        <Label
                          htmlFor="trust-device-backup"
                          className="cursor-pointer select-none text-sm font-medium text-[var(--ui-text-muted)] dark:text-zinc-400"
                        >
                          Percaya perangkat ini
                        </Label>
                      </FormItem>
                    )}
                  />
                  <Button
                    type="submit"
                    className="min-h-12 w-full rounded-2xl bg-gradient-to-r from-[var(--ui-accent-gradient-to)] to-[var(--ui-accent-gradient-from)] px-4 py-3 text-white shadow-md transition-all duration-300 hover:from-[var(--ui-accent-hover)] hover:to-[var(--ui-accent-gradient-to)] hover:shadow-lg"
                    disabled={isVerifyingBackupCode}
                  >
                    {isVerifyingBackupCode ? (
                      <>
                        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                        Memverifikasi backup code...
                      </>
                    ) : (
                      "Verifikasi backup code & masuk"
                    )}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    className="w-full rounded-2xl text-sm text-[var(--ui-accent)] hover:bg-[var(--ui-accent-bg)]"
                    onClick={() => {
                      setUseBackupCode(false);
                      backupCodeForm.reset();
                    }}
                    disabled={isVerifyingBackupCode}
                  >
                    Kembali ke kode authenticator
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    className="w-full rounded-2xl"
                    onClick={() => {
                      setRequiresTwoFactor(false);
                      setUseBackupCode(false);
                      backupCodeForm.reset();
                      twoFactorForm.reset();
                    }}
                    disabled={isVerifyingBackupCode}
                  >
                    Ganti akun
                  </Button>
                </form>
              </Form>
            ) : (
            <Form {...twoFactorForm}>
              <form key="two-factor-login-form" onSubmit={twoFactorForm.handleSubmit(onSubmitTwoFactor)} autoComplete="off" className="space-y-4">
                <div className="rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-card-alt)]/70 px-4 py-3 text-sm leading-6 text-[var(--ui-text-muted)] dark:border-zinc-800 dark:bg-zinc-900/60 dark:text-zinc-400">
                  Password sudah benar. Masukkan kode 6 digit dari aplikasi authenticator untuk menyelesaikan login.
                </div>
                <FormField
                  control={twoFactorForm.control}
                  name="code"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-sm font-medium text-[var(--ui-text)] dark:text-zinc-300">
                        Kode authenticator
                      </FormLabel>
                      <FormControl>
                        <Input
                          key="two-factor-code-input"
                          type="text"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          maxLength={6}
                          placeholder="123456"
                          autoComplete="off"
                          name="two-factor-code"
                          value={field.value || ""}
                          onChange={(event) => field.onChange(event.target.value.replace(/\D/g, "").slice(0, 6))}
                          onBlur={field.onBlur}
                          ref={field.ref}
                          disabled={isVerifyingTwoFactor}
                          className="h-12 rounded-2xl border-[var(--ui-input-border)] bg-[var(--ui-input-bg)] text-center text-lg tracking-[0.35em] text-[var(--ui-text)] shadow-sm focus-visible:ring-[var(--ui-accent)] dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200"
                        />
                      </FormControl>
                      <FormMessage className="text-red-500" />
                    </FormItem>
                  )}
                />
                <FormField
                  control={twoFactorForm.control}
                  name="trustDevice"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center space-x-3 space-y-0 py-1">
                      <FormControl>
                        <Checkbox
                          checked={field.value}
                          onCheckedChange={field.onChange}
                          disabled={isVerifyingTwoFactor}
                          id="trust-device"
                          className="h-5 w-5 rounded-md border-[var(--ui-accent)] text-[var(--ui-accent)] data-[state=checked]:bg-[var(--ui-accent)] data-[state=checked]:text-white focus-visible:ring-[var(--ui-accent)]"
                        />
                      </FormControl>
                      <Label
                        htmlFor="trust-device"
                        className="cursor-pointer select-none text-sm font-medium text-[var(--ui-text-muted)] dark:text-zinc-400"
                      >
                        Percaya perangkat ini
                      </Label>
                    </FormItem>
                  )}
                />
                <Button
                  type="submit"
                  className="min-h-12 w-full rounded-2xl bg-gradient-to-r from-[var(--ui-accent-gradient-to)] to-[var(--ui-accent-gradient-from)] px-4 py-3 text-white shadow-md transition-all duration-300 hover:from-[var(--ui-accent-hover)] hover:to-[var(--ui-accent-gradient-to)] hover:shadow-lg"
                  disabled={isVerifyingTwoFactor}
                >
                  {isVerifyingTwoFactor ? (
                    <>
                      <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                      Memverifikasi...
                    </>
                  ) : (
                    "Verifikasi & masuk"
                  )}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  className="w-full rounded-2xl text-sm text-[var(--ui-accent)] hover:bg-[var(--ui-accent-bg)]"
                  onClick={() => {
                    setUseBackupCode(true);
                    twoFactorForm.reset();
                  }}
                  disabled={isVerifyingTwoFactor}
                >
                  Tidak bisa akses authenticator? Pakai backup code
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  className="w-full rounded-2xl"
                  onClick={() => {
                    setRequiresTwoFactor(false);
                    twoFactorForm.reset();
                  }}
                  disabled={isVerifyingTwoFactor}
                >
                  Ganti akun
                </Button>
              </form>
            </Form>
            )
          ) : (
            <Form {...form}>
              <form key="password-login-form" onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
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
                          placeholder="Masukkan username"
                          autoComplete="username"
                          {...field}
                          disabled={isSubmitting || isLockedOut}
                          className="h-12 rounded-2xl border-[var(--ui-input-border)] bg-[var(--ui-input-bg)] text-[var(--ui-text)] shadow-sm focus-visible:ring-[var(--ui-accent)] dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200"
                        />
                      </FormControl>
                      <FormMessage className="text-red-500" />
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
                          placeholder="Masukkan password"
                          autoComplete="current-password"
                          {...field}
                          disabled={isSubmitting || isLockedOut}
                          className="h-12 rounded-2xl border-[var(--ui-input-border)] bg-[var(--ui-input-bg)] text-[var(--ui-text)] shadow-sm focus-visible:ring-[var(--ui-accent)] dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200"
                        />
                      </FormControl>
                      <FormMessage className="text-red-500" />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="rememberMe"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center space-x-3 space-y-0 py-1">
                      <FormControl>
                        <Checkbox
                          checked={field.value}
                          onCheckedChange={field.onChange}
                          disabled={isSubmitting || isLockedOut}
                          id="remember-me"
                          className="h-5 w-5 rounded-md border-[var(--ui-accent)] text-[var(--ui-accent)] data-[state=checked]:bg-[var(--ui-accent)] data-[state=checked]:text-white focus-visible:ring-[var(--ui-accent)]"
                        />
                      </FormControl>
                      <Label
                        htmlFor="remember-me"
                        className="cursor-pointer select-none text-sm font-medium text-[var(--ui-text-muted)] dark:text-zinc-400"
                      >
                        Ingat perangkat ini
                      </Label>
                    </FormItem>
                  )}
                />

                <Button
                  type="submit"
                  className="min-h-12 w-full rounded-2xl bg-gradient-to-r from-[var(--ui-accent-gradient-to)] to-[var(--ui-accent-gradient-from)] px-4 py-3 text-white shadow-md transition-all duration-300 hover:from-[var(--ui-accent-hover)] hover:to-[var(--ui-accent-gradient-to)] hover:shadow-lg"
                  disabled={isSubmitting || isLockedOut}
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                      Masuk...
                    </>
                  ) : (
                    <>
                      {isLockedOut ? `Tunggu ${lockoutTime} detik` : "Masuk"}
                      {!isLockedOut && <ArrowRight className="ml-2 h-5 w-5" />}
                    </>
                  )}
                </Button>
              </form>
            </Form>
          )}

          <p className="mt-6 text-center text-sm text-[var(--ui-text-muted)] dark:text-zinc-400">
            Setup awal?{" "}
            <Link
              href="/signup"
              className="font-semibold text-[var(--ui-accent)] transition-colors hover:text-[var(--ui-accent-hover)]"
            >
              Buat admin pertama
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
