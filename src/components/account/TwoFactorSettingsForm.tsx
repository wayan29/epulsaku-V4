"use client";

import { useEffect, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { QRCodeSVG } from "qrcode.react";
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
import { useToast } from "@/hooks/use-toast";
import { authClient } from "@/lib/auth-client";
import { getCurrentUserTwoFactorStatus, markCurrentUserTwoFactorEnabled } from "@/lib/user-utils";
import { Copy, Loader2, Lock, ShieldAlert, ShieldCheck, ShieldOff } from "lucide-react";

const enableSchema = z.object({
  password: z.string().min(1, "Password wajib diisi"),
});

const verifySetupSchema = z.object({
  code: z.string().length(6, "Kode harus 6 digit").regex(/^\d+$/, "Kode hanya boleh berisi angka"),
});

const disableSchema = z.object({
  password: z.string().min(1, "Password wajib diisi"),
});

const regenerateSchema = z.object({
  password: z.string().min(1, "Password wajib diisi"),
});

type EnableValues = z.infer<typeof enableSchema>;
type VerifySetupValues = z.infer<typeof verifySetupSchema>;
type DisableValues = z.infer<typeof disableSchema>;
type RegenerateValues = z.infer<typeof regenerateSchema>;

function getTotpSecret(totpURI: string): string {
  try {
    return new URL(totpURI).searchParams.get("secret") || "";
  } catch {
    return "";
  }
}

export default function TwoFactorSettingsForm() {
  const { toast } = useToast();
  const [isEnabling, setIsEnabling] = useState(false);
  const [isVerifyingSetup, setIsVerifyingSetup] = useState(false);
  const [isDisabling, setIsDisabling] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [isLoadingStatus, setIsLoadingStatus] = useState(true);
  const [twoFactorStatus, setTwoFactorStatus] = useState({ enabled: false, configured: false });
  const [totpURI, setTotpURI] = useState("");
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [regeneratedBackupCodes, setRegeneratedBackupCodes] = useState<string[]>([]);

  const enableForm = useForm<EnableValues>({
    resolver: zodResolver(enableSchema),
    defaultValues: { password: "" },
  });

  const verifySetupForm = useForm<VerifySetupValues>({
    resolver: zodResolver(verifySetupSchema),
    defaultValues: { code: "" },
  });

  const disableForm = useForm<DisableValues>({
    resolver: zodResolver(disableSchema),
    defaultValues: { password: "" },
  });

  const regenerateForm = useForm<RegenerateValues>({
    resolver: zodResolver(regenerateSchema),
    defaultValues: { password: "" },
  });

  async function refreshTwoFactorStatus() {
    setIsLoadingStatus(true);
    try {
      const status = await getCurrentUserTwoFactorStatus();
      setTwoFactorStatus(status);
    } finally {
      setIsLoadingStatus(false);
    }
  }

  useEffect(() => {
    refreshTwoFactorStatus();
  }, []);

  async function onEnable(values: EnableValues) {
    setIsEnabling(true);
    try {
      const { data, error } = await authClient.twoFactor.enable({
        password: values.password,
        issuer: "ePulsaku",
      });

      if (error) {
        throw new Error(error.message || "Gagal mengaktifkan 2FA.");
      }

      setTotpURI(data?.totpURI || "");
      setBackupCodes(data?.backupCodes || []);
      verifySetupForm.reset();
      enableForm.reset();
      toast({
        title: "Scan QR code 2FA",
        description: "Masukkan kode 6 digit dari aplikasi authenticator untuk mengaktifkan 2FA.",
      });
    } catch (error) {
      toast({
        title: "Gagal mengaktifkan 2FA",
        description: error instanceof Error ? error.message : "Terjadi kesalahan.",
        variant: "destructive",
      });
    } finally {
      setIsEnabling(false);
    }
  }

  const manualSecret = getTotpSecret(totpURI);

  async function copyManualSecret() {
    const valueToCopy = manualSecret || totpURI;
    if (!valueToCopy) return;

    try {
      await navigator.clipboard.writeText(valueToCopy);
      toast({
        title: "Secret disalin",
        description: "Tempel secret ini di aplikasi authenticator jika QR tidak bisa dipakai.",
      });
    } catch {
      toast({
        title: "Gagal menyalin secret",
        description: "Salin manual dari teks yang tersedia.",
        variant: "destructive",
      });
    }
  }

  async function onVerifySetup(values: VerifySetupValues) {
    setIsVerifyingSetup(true);
    try {
      const { error } = await authClient.twoFactor.verifyTotp({
        code: values.code,
        trustDevice: true,
      });

      if (error) {
        throw new Error(error.message || "Kode authenticator tidak valid.");
      }

      const activationResult = await markCurrentUserTwoFactorEnabled();
      if (!activationResult.success) {
        throw new Error(activationResult.message || "Gagal menyelesaikan aktivasi 2FA.");
      }

      setTwoFactorStatus({ enabled: true, configured: true });
      verifySetupForm.reset();
      toast({
        title: "2FA aktif",
        description: "Authenticator app berhasil diverifikasi. Simpan backup codes dengan aman.",
      });
    } catch (error) {
      toast({
        title: "Verifikasi kode gagal",
        description: error instanceof Error ? error.message : "Kode authenticator tidak valid.",
        variant: "destructive",
      });
    } finally {
      setIsVerifyingSetup(false);
    }
  }

  async function onDisable(values: DisableValues) {
    setIsDisabling(true);
    try {
      const { error } = await authClient.twoFactor.disable({
        password: values.password,
      });

      if (error) {
        throw new Error(error.message || "Gagal menonaktifkan 2FA.");
      }

      setTotpURI("");
      setBackupCodes([]);
      setTwoFactorStatus({ enabled: false, configured: false });
      disableForm.reset();
      toast({
        title: "2FA dinonaktifkan",
        description: "Login berikutnya tidak akan meminta kode authenticator.",
      });
    } catch (error) {
      toast({
        title: "Gagal menonaktifkan 2FA",
        description: error instanceof Error ? error.message : "Terjadi kesalahan.",
        variant: "destructive",
      });
    } finally {
      setIsDisabling(false);
    }
  }

  async function onRegenerateBackupCodes(values: RegenerateValues) {
    setIsRegenerating(true);
    try {
      const { data, error } = await authClient.twoFactor.generateBackupCodes({
        password: values.password,
      });

      if (error) {
        throw new Error(error.message || "Gagal generate ulang backup codes.");
      }

      setRegeneratedBackupCodes(data?.backupCodes || []);
      regenerateForm.reset();
      toast({
        title: "Backup codes baru tersedia",
        description: "Backup codes lama sudah tidak valid. Simpan codes baru dengan aman.",
      });
    } catch (error) {
      toast({
        title: "Gagal generate ulang backup codes",
        description: error instanceof Error ? error.message : "Terjadi kesalahan.",
        variant: "destructive",
      });
    } finally {
      setIsRegenerating(false);
    }
  }

  async function copyRegeneratedCodes() {
    if (regeneratedBackupCodes.length === 0) return;
    try {
      await navigator.clipboard.writeText(regeneratedBackupCodes.join("\n"));
      toast({
        title: "Backup codes disalin",
        description: "Tempel di tempat aman seperti password manager.",
      });
    } catch {
      toast({
        title: "Gagal menyalin",
        description: "Salin manual dari daftar di bawah.",
        variant: "destructive",
      });
    }
  }

  return (
    <div className="space-y-5">
      <div className="rounded-[26px] border border-[var(--ui-border)] bg-[var(--ui-card)] px-5 py-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950 sm:px-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <div className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl ${twoFactorStatus.enabled ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-300" : "bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-300"}`}>
              {twoFactorStatus.enabled ? <ShieldCheck className="h-5 w-5" /> : <ShieldAlert className="h-5 w-5" />}
            </div>
            <div>
              <p className="text-sm font-semibold text-[var(--ui-text)] dark:text-zinc-100">Status 2FA</p>
              <p className="mt-1 text-sm leading-6 text-[var(--ui-text-muted)] dark:text-zinc-400">
                {isLoadingStatus
                  ? "Memeriksa status autentikasi 2 faktor..."
                  : twoFactorStatus.enabled
                    ? "2FA sudah aktif. Login berikutnya akan meminta kode authenticator."
                    : twoFactorStatus.configured
                      ? "Setup 2FA belum selesai. Verifikasi kode authenticator untuk mengaktifkan."
                      : "2FA belum aktif. Aktifkan authenticator app untuk menambah keamanan login."}
              </p>
            </div>
          </div>
          <div className={`rounded-full border px-3 py-1 text-sm font-semibold ${twoFactorStatus.enabled ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-200" : "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-100"}`}>
            {isLoadingStatus ? "Memuat..." : twoFactorStatus.enabled ? "Aktif" : "Belum aktif"}
          </div>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
        <Form {...enableForm}>
        <form
          onSubmit={enableForm.handleSubmit(onEnable)}
          className="overflow-hidden rounded-[26px] border border-[var(--ui-border)] bg-[var(--ui-card)] shadow-sm dark:border-zinc-800 dark:bg-zinc-950"
        >
          <div className="border-b border-[var(--ui-border)] bg-[var(--ui-card-alt)]/70 px-5 py-5 dark:border-zinc-800 dark:bg-zinc-900/60 sm:px-6">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl bg-[var(--ui-accent-bg)] text-[var(--ui-accent)] dark:bg-[var(--ui-accent)]/10">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-[var(--ui-text)] dark:text-zinc-100 sm:text-lg">
                  Aktifkan authenticator app
                </h3>
                <p className="mt-1 text-sm leading-6 text-[var(--ui-text-muted)] dark:text-zinc-400">
                  Masukkan password, lalu scan QR code dengan Google Authenticator, Authy, atau aplikasi TOTP lain.
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-5 px-5 py-5 sm:px-6">
            <FormField
              control={enableForm.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="flex items-center text-sm font-medium text-[var(--ui-text)] dark:text-zinc-300">
                    <Lock className="mr-2 h-4 w-4 text-[var(--ui-accent)]" />
                    Password akun
                  </FormLabel>
                  <FormControl>
                    <Input
                      type="password"
                      placeholder="Masukkan password"
                      autoComplete="current-password"
                      {...field}
                      disabled={isEnabling}
                      className="h-12 rounded-2xl border-[var(--ui-input-border)] bg-[var(--ui-input-bg)] text-[var(--ui-text)] shadow-sm focus-visible:ring-[var(--ui-accent)] dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <Button
              type="submit"
              className="min-h-12 w-full rounded-2xl bg-gradient-to-r from-[var(--ui-accent-gradient-to)] to-[var(--ui-accent-gradient-from)] px-4 py-3 text-white shadow-md"
              disabled={isEnabling}
            >
              {isEnabling ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Menyiapkan 2FA...
                </>
              ) : (
                "Aktifkan 2FA"
              )}
            </Button>

            {totpURI ? (
              <div className="space-y-4 rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-card-alt)] p-4 dark:border-zinc-800 dark:bg-zinc-900/60">
                <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-100">
                  2FA belum aktif sampai kode dari aplikasi authenticator berhasil diverifikasi.
                </div>
                <div className="flex justify-center rounded-2xl bg-white p-4">
                  <QRCodeSVG value={totpURI} size={190} />
                </div>
                <div className="space-y-3">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-sm font-semibold text-[var(--ui-text)] dark:text-zinc-100">Manual setup secret</p>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="rounded-xl"
                      onClick={copyManualSecret}
                    >
                      <Copy className="mr-2 h-4 w-4" />
                      Salin secret
                    </Button>
                  </div>
                  <p className="break-all rounded-xl bg-[var(--ui-card)] p-3 font-mono text-sm text-[var(--ui-text)] dark:bg-zinc-950 dark:text-zinc-100">
                    {manualSecret || totpURI}
                  </p>
                  <details className="rounded-xl border border-[var(--ui-border)] bg-[var(--ui-card)] p-3 text-xs text-[var(--ui-text-muted)] dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400">
                    <summary className="cursor-pointer font-medium text-[var(--ui-text)] dark:text-zinc-200">Lihat URI lengkap</summary>
                    <p className="mt-2 break-all">{totpURI}</p>
                  </details>
                </div>
                <Form {...verifySetupForm}>
                  <form onSubmit={verifySetupForm.handleSubmit(onVerifySetup)} autoComplete="off" className="space-y-3">
                    <FormField
                      control={verifySetupForm.control}
                      name="code"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-sm font-medium text-[var(--ui-text)] dark:text-zinc-300">
                            Kode dari authenticator app
                          </FormLabel>
                          <FormControl>
                            <Input
                              inputMode="numeric"
                              pattern="[0-9]*"
                              maxLength={6}
                              placeholder="123456"
                              autoComplete="off"
                              name="setup-two-factor-code"
                              value={field.value || ""}
                              onChange={(event) => field.onChange(event.target.value.replace(/\D/g, "").slice(0, 6))}
                              onBlur={field.onBlur}
                              ref={field.ref}
                              disabled={isVerifyingSetup}
                              className="h-12 rounded-2xl border-[var(--ui-input-border)] bg-[var(--ui-input-bg)] text-center text-lg tracking-[0.35em] text-[var(--ui-text)] shadow-sm focus-visible:ring-[var(--ui-accent)] dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <Button
                      type="submit"
                      className="min-h-12 w-full rounded-2xl bg-gradient-to-r from-[var(--ui-accent-gradient-to)] to-[var(--ui-accent-gradient-from)] px-4 py-3 text-white shadow-md"
                      disabled={isVerifyingSetup}
                    >
                      {isVerifyingSetup ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Memverifikasi kode...
                        </>
                      ) : (
                        "Verifikasi kode & aktifkan"
                      )}
                    </Button>
                  </form>
                </Form>
                {backupCodes.length > 0 ? (
                  <div>
                    <p className="text-sm font-semibold text-[var(--ui-text)] dark:text-zinc-100">Backup codes</p>
                    <p className="mt-1 text-xs text-[var(--ui-text-muted)] dark:text-zinc-400">
                      Simpan codes ini setelah verifikasi berhasil. Jangan bagikan ke siapa pun.
                    </p>
                    <div className="mt-2 grid gap-2 sm:grid-cols-2">
                      {backupCodes.map((code) => (
                        <code key={code} className="rounded-xl bg-[var(--ui-card)] px-3 py-2 text-center text-sm dark:bg-zinc-950">
                          {code}
                        </code>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </form>
      </Form>

      <Form {...disableForm}>
        <form
          onSubmit={disableForm.handleSubmit(onDisable)}
          className="overflow-hidden rounded-[26px] border border-[var(--ui-border)] bg-[var(--ui-card)] shadow-sm dark:border-zinc-800 dark:bg-zinc-950"
        >
          <div className="border-b border-[var(--ui-border)] bg-[var(--ui-card-alt)]/70 px-5 py-5 dark:border-zinc-800 dark:bg-zinc-900/60 sm:px-6">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl bg-red-50 text-red-600 dark:bg-red-950/40 dark:text-red-300">
                <ShieldOff className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-[var(--ui-text)] dark:text-zinc-100 sm:text-lg">
                  Nonaktifkan 2FA
                </h3>
                <p className="mt-1 text-sm leading-6 text-[var(--ui-text-muted)] dark:text-zinc-400">
                  Gunakan hanya jika perangkat authenticator sudah dipindahkan atau kebijakan akun berubah.
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-5 px-5 py-5 sm:px-6">
            <FormField
              control={disableForm.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="flex items-center text-sm font-medium text-[var(--ui-text)] dark:text-zinc-300">
                    <Lock className="mr-2 h-4 w-4 text-red-500" />
                    Password akun
                  </FormLabel>
                  <FormControl>
                    <Input
                      type="password"
                      placeholder="Masukkan password"
                      autoComplete="current-password"
                      {...field}
                      disabled={isDisabling}
                      className="h-12 rounded-2xl border-[var(--ui-input-border)] bg-[var(--ui-input-bg)] text-[var(--ui-text)] shadow-sm focus-visible:ring-red-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <Button
              type="submit"
              variant="destructive"
              className="min-h-12 w-full rounded-2xl px-4 py-3 shadow-md"
              disabled={isDisabling}
            >
              {isDisabling ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Menonaktifkan...
                </>
              ) : (
                "Nonaktifkan 2FA"
              )}
            </Button>
          </div>
        </form>
      </Form>
      </div>

      {twoFactorStatus.enabled ? (
        <Form {...regenerateForm}>
          <form
            onSubmit={regenerateForm.handleSubmit(onRegenerateBackupCodes)}
            className="overflow-hidden rounded-[26px] border border-[var(--ui-border)] bg-[var(--ui-card)] shadow-sm dark:border-zinc-800 dark:bg-zinc-950"
          >
            <div className="border-b border-[var(--ui-border)] bg-[var(--ui-card-alt)]/70 px-5 py-5 dark:border-zinc-800 dark:bg-zinc-900/60 sm:px-6">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-300">
                  <Lock className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-[var(--ui-text)] dark:text-zinc-100 sm:text-lg">
                    Generate ulang backup codes
                  </h3>
                  <p className="mt-1 text-sm leading-6 text-[var(--ui-text-muted)] dark:text-zinc-400">
                    Pakai bila backup codes lama hilang atau sudah habis terpakai. Backup codes lama akan dibatalkan.
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-5 px-5 py-5 sm:px-6">
              <FormField
                control={regenerateForm.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="flex items-center text-sm font-medium text-[var(--ui-text)] dark:text-zinc-300">
                      <Lock className="mr-2 h-4 w-4 text-amber-500" />
                      Password akun
                    </FormLabel>
                    <FormControl>
                      <Input
                        type="password"
                        placeholder="Masukkan password"
                        autoComplete="current-password"
                        {...field}
                        disabled={isRegenerating}
                        className="h-12 rounded-2xl border-[var(--ui-input-border)] bg-[var(--ui-input-bg)] text-[var(--ui-text)] shadow-sm focus-visible:ring-amber-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Button
                type="submit"
                className="min-h-12 w-full rounded-2xl bg-amber-500 px-4 py-3 text-white shadow-md hover:bg-amber-600"
                disabled={isRegenerating}
              >
                {isRegenerating ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Membuat backup codes baru...
                  </>
                ) : (
                  "Generate ulang backup codes"
                )}
              </Button>

              {regeneratedBackupCodes.length > 0 ? (
                <div className="space-y-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900/50 dark:bg-amber-950/30">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-sm font-semibold text-amber-900 dark:text-amber-100">
                        Backup codes baru
                      </p>
                      <p className="mt-1 text-xs text-amber-800/90 dark:text-amber-200/80">
                        Codes ini hanya tampil sekarang. Simpan sebelum keluar dari halaman.
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="rounded-xl"
                      onClick={copyRegeneratedCodes}
                    >
                      <Copy className="mr-2 h-4 w-4" />
                      Salin semua
                    </Button>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {regeneratedBackupCodes.map((code) => (
                      <code
                        key={code}
                        className="rounded-xl bg-white px-3 py-2 text-center text-sm font-mono text-amber-900 dark:bg-zinc-950 dark:text-amber-100"
                      >
                        {code}
                      </code>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          </form>
        </Form>
      ) : null}
    </div>
  );
}
