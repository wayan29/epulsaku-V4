// src/components/account/ChangePasswordForm.tsx
"use client";

import { useState } from "react";
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
import { Loader2, Lock, ShieldCheck } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { changePassword } from "@/lib/user-utils";

const formSchema = z
  .object({
    oldPassword: z.string().min(1, "Password lama wajib diisi"),
    newPassword: z.string().min(6, "Password baru minimal 6 karakter"),
    confirmNewPassword: z.string().min(1, "Konfirmasi password baru wajib diisi"),
  })
  .refine((data) => data.newPassword === data.confirmNewPassword, {
    message: "Konfirmasi password baru tidak cocok",
    path: ["confirmNewPassword"],
  });

type ChangePasswordFormValues = z.infer<typeof formSchema>;

export default function ChangePasswordForm() {
  const { toast } = useToast();
  const { user, logout } = useAuth();
  const [isLoading, setIsLoading] = useState(false);

  const form = useForm<ChangePasswordFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      oldPassword: "",
      newPassword: "",
      confirmNewPassword: "",
    },
  });

  async function onSubmit(values: ChangePasswordFormValues) {
    if (!user) {
      toast({
        title: "Akses ditolak",
        description: "Anda harus login untuk mengganti password.",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    try {
      const result = await changePassword(user.username, values.oldPassword, values.newPassword);

      if (result.success) {
        toast({
          title: "Password berhasil diperbarui",
          description: "Silakan login kembali menggunakan password baru Anda.",
          duration: 5000,
        });
        await logout();
      } else {
        toast({
          title: "Gagal mengganti password",
          description: result.message || "Terjadi kesalahan saat memperbarui password.",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error("Change password error:", error);
      toast({
        title: "Terjadi kesalahan",
        description: "Terjadi kesalahan tak terduga saat mengganti password.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className="overflow-hidden rounded-[26px] border border-[var(--ui-border)] bg-[var(--ui-card)] shadow-sm dark:border-zinc-800 dark:bg-zinc-950"
      >
        <div className="border-b border-[var(--ui-border)] bg-[var(--ui-card-alt)]/70 px-5 py-5 dark:border-zinc-800 dark:bg-zinc-900/60 sm:px-6 sm:py-6">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl bg-[var(--ui-accent-bg)] text-[var(--ui-accent)] dark:bg-[var(--ui-accent)]/10">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-[var(--ui-text)] dark:text-zinc-100 sm:text-lg">
                Perbarui kredensial login
              </h3>
              <p className="mt-1 text-sm leading-6 text-[var(--ui-text-muted)] dark:text-zinc-400">
                Setelah password berhasil diperbarui, sesi akun akan dimuat ulang dan Anda perlu login kembali.
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-5 px-5 py-5 sm:px-6 sm:py-6">
          <FormField
            control={form.control}
            name="oldPassword"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="flex items-center text-sm font-medium text-[var(--ui-text)] dark:text-zinc-300">
                  <Lock className="mr-2 h-4 w-4 text-[var(--ui-accent)]" />
                  Password lama
                </FormLabel>
                <FormControl>
                  <Input
                    type="password"
                    placeholder="Masukkan password lama"
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
            name="newPassword"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="flex items-center text-sm font-medium text-[var(--ui-text)] dark:text-zinc-300">
                  <Lock className="mr-2 h-4 w-4 text-[var(--ui-accent)]" />
                  Password baru
                </FormLabel>
                <FormControl>
                  <Input
                    type="password"
                    placeholder="Masukkan password baru"
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
            name="confirmNewPassword"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="flex items-center text-sm font-medium text-[var(--ui-text)] dark:text-zinc-300">
                  <Lock className="mr-2 h-4 w-4 text-[var(--ui-accent)]" />
                  Konfirmasi password baru
                </FormLabel>
                <FormControl>
                  <Input
                    type="password"
                    placeholder="Ulangi password baru"
                    {...field}
                    disabled={isLoading}
                    className="h-12 rounded-2xl border-[var(--ui-input-border)] bg-[var(--ui-input-bg)] text-[var(--ui-text)] shadow-sm focus-visible:ring-[var(--ui-accent)] dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <Button
            type="submit"
            className="min-h-12 w-full rounded-2xl bg-gradient-to-r from-[var(--ui-accent-gradient-to)] to-[var(--ui-accent-gradient-from)] px-4 py-3 text-white shadow-md transition-all duration-300 hover:from-[var(--ui-accent-hover)] hover:to-[var(--ui-accent-gradient-to)] hover:shadow-lg"
            disabled={isLoading}
          >
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Menyimpan password...
              </>
            ) : (
              "Simpan password baru"
            )}
          </Button>
        </div>
      </form>
    </Form>
  );
}
