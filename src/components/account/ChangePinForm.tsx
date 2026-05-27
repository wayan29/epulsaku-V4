// src/components/account/ChangePinForm.tsx
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
import { KeyRound, Loader2, Lock, ShieldCheck } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { changePin } from "@/lib/user-utils";

const formSchema = z
  .object({
    newPin: z.string().length(6, "PIN baru harus 6 digit").regex(/^\d+$/, "PIN baru hanya boleh berisi angka"),
    confirmNewPin: z.string().length(6, "Konfirmasi PIN harus 6 digit").regex(/^\d+$/, "Konfirmasi PIN hanya boleh berisi angka"),
    currentPassword: z.string().min(1, "Password akun wajib diisi untuk otorisasi perubahan PIN"),
  })
  .refine((data) => data.newPin === data.confirmNewPin, {
    message: "Konfirmasi PIN baru tidak cocok",
    path: ["confirmNewPin"],
  });

type ChangePinFormValues = z.infer<typeof formSchema>;

export default function ChangePinForm() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [isLoading, setIsLoading] = useState(false);

  const form = useForm<ChangePinFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      newPin: "",
      confirmNewPin: "",
      currentPassword: "",
    },
  });

  async function onSubmit(values: ChangePinFormValues) {
    if (!user) {
      toast({
        title: "Akses ditolak",
        description: "Anda harus login untuk mengganti PIN transaksi.",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    try {
      const result = await changePin(user.username, values.currentPassword, values.newPin);

      if (result.success) {
        toast({
          title: "PIN berhasil diperbarui",
          description: "PIN transaksi Anda sudah diperbarui dan penghitung gagal coba telah direset.",
        });
        form.reset();
      } else {
        toast({
          title: "Gagal mengganti PIN",
          description: result.message || "Terjadi kesalahan saat memperbarui PIN.",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error("Change PIN error:", error);
      toast({
        title: "Terjadi kesalahan",
        description: "Terjadi kesalahan tak terduga saat mengganti PIN.",
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
                Perbarui otorisasi transaksi
              </h3>
              <p className="mt-1 text-sm leading-6 text-[var(--ui-text-muted)] dark:text-zinc-400">
                Gunakan PIN 6 digit yang mudah Anda ingat tetapi tidak mudah ditebak. Password akun diperlukan untuk mengonfirmasi perubahan ini.
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-5 px-5 py-5 sm:px-6 sm:py-6">
          <FormField
            control={form.control}
            name="newPin"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="flex items-center text-sm font-medium text-[var(--ui-text)] dark:text-zinc-300">
                  <KeyRound className="mr-2 h-4 w-4 text-[var(--ui-accent)]" />
                  PIN baru 6 digit
                </FormLabel>
                <FormControl>
                  <Input
                    type="password"
                    placeholder="Masukkan 6 digit PIN baru"
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
            name="confirmNewPin"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="flex items-center text-sm font-medium text-[var(--ui-text)] dark:text-zinc-300">
                  <KeyRound className="mr-2 h-4 w-4 text-[var(--ui-accent)]" />
                  Konfirmasi PIN baru
                </FormLabel>
                <FormControl>
                  <Input
                    type="password"
                    placeholder="Ulangi 6 digit PIN baru"
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
            name="currentPassword"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="flex items-center text-sm font-medium text-[var(--ui-text)] dark:text-zinc-300">
                  <Lock className="mr-2 h-4 w-4 text-[var(--ui-accent)]" />
                  Password akun saat ini
                </FormLabel>
                <FormControl>
                  <Input
                    type="password"
                    placeholder="Masukkan password akun"
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
                Menyimpan PIN...
              </>
            ) : (
              "Simpan PIN baru"
            )}
          </Button>
        </div>
      </form>
    </Form>
  );
}
