// src/app/(app)/account/login-activity/page.tsx
"use client";

import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { getLoginHistory, type LoginActivity, deleteLoginActivityEntry } from "@/lib/user-utils";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertTriangle, CalendarClock, Loader2, Network, Server, ShieldAlert, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { formatDateInTimezone } from "@/lib/timezone";

export default function LoginActivityPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [loginActivities, setLoginActivities] = useState<LoginActivity[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const [selectedActivityId, setSelectedActivityId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const themedCardClass =
    "w-full overflow-hidden rounded-[26px] border-[var(--ui-border)] bg-[var(--ui-card)] text-[var(--ui-text)] shadow-sm dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100";
  const themedMutedTextClass = "text-[var(--ui-text-muted)] dark:text-zinc-400";
  const themedOutlineButtonClass =
    "rounded-xl border-[var(--ui-border)] bg-[var(--ui-card-alt)] text-[var(--ui-text)] hover:bg-[var(--ui-accent-bg)] hover:text-[var(--ui-accent)] dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100";

  const fetchActivities = useCallback(async () => {
    if (user?.username) {
      setIsLoading(true);
      setError(null);
      try {
        const activities = await getLoginHistory(user.username);
        setLoginActivities(activities);
      } catch (err) {
        setError("Aktivitas login tidak dapat dimuat. Silakan coba lagi beberapa saat lagi.");
        console.error("Error fetching login activity:", err);
      } finally {
        setIsLoading(false);
      }
    } else {
      setIsLoading(false);
      setError("Sesi pengguna tidak ditemukan.");
    }
  }, [user?.username]);

  useEffect(() => {
    fetchActivities();
  }, [fetchActivities]);

  const handleDeleteActivity = async () => {
    if (!selectedActivityId) return;

    setIsDeleting(true);
    const result = await deleteLoginActivityEntry(selectedActivityId);

    if (result.success) {
      toast({
        title: "Aktivitas berhasil dihapus",
        description: "Catatan aktivitas login telah dihapus dari riwayat akun Anda.",
      });
      fetchActivities();
    } else {
      toast({
        title: "Gagal menghapus aktivitas",
        description: result.message || "Catatan aktivitas login tidak dapat dihapus.",
        variant: "destructive",
      });
    }

    setIsDeleting(false);
    setIsConfirmingDelete(false);
    setSelectedActivityId(null);
  };

  return (
    <div className="space-y-5">
      <div className="overflow-hidden rounded-[26px] border border-[var(--ui-border)] bg-[var(--ui-card-alt)]/75 dark:border-zinc-800 dark:bg-zinc-900/60">
        <div className="h-1 w-full bg-gradient-to-r from-[var(--ui-top-bar-from)] via-[var(--ui-top-bar-via)] to-[var(--ui-top-bar-to)] opacity-80" />
        <div className="px-5 py-5 sm:px-6 sm:py-6">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[var(--ui-accent-gradient-from)] to-[var(--ui-accent-gradient-to)] text-white shadow-md">
              <ShieldAlert className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--ui-text-secondary)] dark:text-zinc-500">
                Audit keamanan
              </p>
              <h2 className="mt-2 text-xl font-bold tracking-tight text-[var(--ui-text)] dark:text-zinc-100 sm:text-2xl">
                Aktivitas login akun
              </h2>
              <p className={`mt-3 max-w-3xl text-sm leading-6 sm:text-base ${themedMutedTextClass}`}>
                Tinjau perangkat, browser, alamat IP, dan waktu login terakhir untuk akun Anda. Jika ada aktivitas yang terasa asing, segera ganti password agar akses tetap aman.
              </p>
            </div>
          </div>
        </div>
      </div>

      <Card className={themedCardClass}>
        <CardContent className="px-0 py-0">
          {isLoading ? (
            <div className="flex items-center justify-center gap-3 px-6 py-12">
              <Loader2 className="h-6 w-6 animate-spin text-[var(--ui-accent)]" />
              <p className={themedMutedTextClass}>Memuat riwayat login akun...</p>
            </div>
          ) : error ? (
            <div className="px-5 py-5 sm:px-6 sm:py-6">
              <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-4 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-200">
                {error}
              </div>
            </div>
          ) : loginActivities.length === 0 ? (
            <div className="px-6 py-12 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--ui-accent-bg)] text-[var(--ui-accent)] dark:bg-[var(--ui-accent)]/10">
                <ShieldAlert className="h-5 w-5" />
              </div>
              <h3 className="mt-4 text-lg font-semibold text-[var(--ui-text)] dark:text-zinc-100">
                Belum ada riwayat login
              </h3>
              <p className={`mt-2 text-sm leading-6 ${themedMutedTextClass}`}>
                Sistem belum menemukan aktivitas login yang tersimpan untuk akun ini.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-[var(--ui-border)] bg-[var(--ui-card-alt)]/80 hover:bg-[var(--ui-card-alt)]/80 dark:border-zinc-800 dark:bg-zinc-900/80">
                    <TableHead className="min-w-[190px] text-[var(--ui-text)] dark:text-zinc-100">
                      <CalendarClock className={`mr-1 inline-block h-4 w-4 ${themedMutedTextClass}`} />
                      Tanggal & waktu
                    </TableHead>
                    <TableHead className="min-w-[260px] text-[var(--ui-text)] dark:text-zinc-100">
                      <Server className={`mr-1 inline-block h-4 w-4 ${themedMutedTextClass}`} />
                      Perangkat / browser
                    </TableHead>
                    <TableHead className="min-w-[150px] text-[var(--ui-text)] dark:text-zinc-100">
                      <Network className={`mr-1 inline-block h-4 w-4 ${themedMutedTextClass}`} />
                      Alamat IP
                    </TableHead>
                    <TableHead className="min-w-[92px] text-right text-[var(--ui-text)] dark:text-zinc-100">
                      Aksi
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loginActivities.map((activity) => (
                    <TableRow
                      key={activity._id?.toString() || activity.loginTimestamp.toString() + activity.ipAddress}
                      className="border-[var(--ui-border)] hover:bg-[var(--ui-accent-bg)]/50 dark:border-zinc-800 dark:hover:bg-zinc-900/70"
                    >
                      <TableCell className="text-[var(--ui-text)] dark:text-zinc-100">
                        {formatDateInTimezone(activity.loginTimestamp)}
                      </TableCell>
                      <TableCell
                        className="max-w-xs truncate text-xs text-[var(--ui-text)] dark:text-zinc-100"
                        title={activity.userAgent || "N/A"}
                      >
                        {activity.userAgent || "N/A"}
                      </TableCell>
                      <TableCell className={themedMutedTextClass}>{activity.ipAddress || "N/A"}</TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            setSelectedActivityId(activity._id || null);
                            setIsConfirmingDelete(true);
                          }}
                          disabled={!activity._id || isDeleting}
                          title="Hapus catatan login ini"
                          className="text-[var(--ui-text)] hover:bg-destructive/10 dark:text-zinc-100"
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                          <span className="sr-only">Hapus catatan login</span>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={isConfirmingDelete} onOpenChange={setIsConfirmingDelete}>
        <AlertDialogContent className="border-[var(--ui-border)] bg-[var(--ui-card)] text-[var(--ui-text)] dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-[var(--ui-text)] dark:text-zinc-100">
              <AlertTriangle className="h-6 w-6 text-destructive" />
              Hapus catatan aktivitas
            </AlertDialogTitle>
            <AlertDialogDescription className={themedMutedTextClass}>
              Apakah Anda yakin ingin menghapus catatan aktivitas login ini? Tindakan ini tidak bisa dibatalkan dan hanya menghapus riwayat, bukan mengakhiri sesi yang sedang aktif.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting} className={themedOutlineButtonClass}>
              Batal
            </AlertDialogCancel>
            <Button variant="destructive" onClick={handleDeleteActivity} disabled={isDeleting}>
              {isDeleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Hapus
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
