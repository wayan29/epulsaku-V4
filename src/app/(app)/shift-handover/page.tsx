"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import ProtectedRoute from "@/components/core/ProtectedRoute";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  acknowledgeShiftHandoverInDB,
  createShiftHandoverInDB,
  listShiftHandoversFromDB,
  listTransactionsFromDB,
  type ShiftHandoverRecord,
} from "@/lib/transaction-utils";
import { formatDateInTimezone } from "@/lib/timezone";
import { useToast } from "@/hooks/use-toast";
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardList,
  Copy,
  ExternalLink,
  Filter,
  Hand,
  Loader2,
  MessageSquare,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";

type HandoverListFilter = "all" | "mine" | "open" | "acknowledged_by_me";

const HANDOVER_FILTERS: { label: string; value: HandoverListFilter }[] = [
  { label: "Semua", value: "all" },
  { label: "Dibuat Saya", value: "mine" },
  { label: "Terbuka Saja", value: "open" },
  { label: "Saya Terima", value: "acknowledged_by_me" },
];

function normalizeHandoverFilter(value: string | null | undefined): HandoverListFilter {
  if (HANDOVER_FILTERS.some((option) => option.value === value)) {
    return value as HandoverListFilter;
  }

  return "all";
}

export default function ShiftHandoverPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const queuedFilter = normalizeHandoverFilter(searchParams.get("filter")?.trim());
  const { user } = useAuth();
  const { toast } = useToast();
  const [handovers, setHandovers] = useState<ShiftHandoverRecord[]>([]);
  const [pendingTransactions, setPendingTransactions] = useState<
    Awaited<ReturnType<typeof listTransactionsFromDB>>["transactions"]
  >([]);
  const [summary, setSummary] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [selectedFilter, setSelectedFilter] = useState<HandoverListFilter>(queuedFilter);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [acknowledgingId, setAcknowledgingId] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [handoverRows, pendingResponse] = await Promise.all([
        listShiftHandoversFromDB(),
        listTransactionsFromDB({ status: "Pending", limit: 100 }),
      ]);
      setHandovers(handoverRows);
      setPendingTransactions(pendingResponse.transactions);
    } catch (error) {
      toast({
        title: "Gagal memuat handover sif",
        description:
          error instanceof Error ? error.message : "Tidak dapat memuat data handover sif.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    setSelectedFilter((current) => (current === queuedFilter ? current : queuedFilter));
  }, [queuedFilter]);

  useEffect(() => {
    const params = new URLSearchParams(searchParams.toString());

    if (selectedFilter !== "all") {
      params.set("filter", selectedFilter);
    } else {
      params.delete("filter");
    }

    const nextQuery = params.toString();
    const currentQuery = searchParams.toString();

    if (nextQuery !== currentQuery) {
      router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname, {
        scroll: false,
      });
    }
  }, [pathname, router, searchParams, selectedFilter]);

  const selectedCount = selectedIds.length;
  const openHandovers = useMemo(
    () => handovers.filter((handover) => handover.status === "open"),
    [handovers]
  );
  const filteredHandovers = useMemo(() => {
    switch (selectedFilter) {
      case "mine":
        return handovers.filter((handover) => handover.createdByUserId === user?.id);
      case "open":
        return handovers.filter((handover) => handover.status === "open");
      case "acknowledged_by_me":
        return handovers.filter((handover) => handover.acknowledgedByUserId === user?.id);
      default:
        return handovers;
    }
  }, [handovers, selectedFilter, user?.id]);

  const toggleTransaction = (transactionId: string, checked: boolean) => {
    setSelectedIds((current) => {
      if (checked) {
        return current.includes(transactionId) ? current : [...current, transactionId];
      }
      return current.filter((id) => id !== transactionId);
    });
  };

  const handleCreateHandover = async () => {
    setIsSaving(true);
    try {
      const result = await createShiftHandoverInDB({
        summary,
        pendingTransactionIds: selectedIds,
      });

      toast({
        title: result.success ? "Handover sif tersimpan" : "Gagal menyimpan",
        description: result.message,
        variant: result.success ? "default" : "destructive",
      });

      if (result.success) {
        setSummary("");
        setSelectedIds([]);
        await loadData();
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleAcknowledge = async (handoverId: string) => {
    setAcknowledgingId(handoverId);
    try {
      const result = await acknowledgeShiftHandoverInDB(handoverId);
      toast({
        title: result.success ? "Handover sif diterima" : "Gagal menerima handover sif",
        description: result.message,
        variant: result.success ? "default" : "destructive",
      });
      if (result.success) {
        await loadData();
      }
    } finally {
      setAcknowledgingId(null);
    }
  };

  const handleCopyActiveFilterLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      toast({
        title: "Tautan handover disalin",
        description: "Tautan filter handover aktif sudah disalin ke clipboard.",
      });
    } catch {
      toast({
        title: "Gagal menyalin tautan",
        description: "Clipboard tidak tersedia di browser ini.",
        variant: "destructive",
      });
    }
  };

  return (
    <ProtectedRoute requiredPermission="shift_handover">
      <div className="mx-auto max-w-7xl space-y-8 pb-10">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-[var(--ui-accent-gradient-from)] to-[var(--ui-accent-gradient-to)] text-white shadow-lg">
              <ShieldCheck className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-2xl font-serif font-bold tracking-tight text-[var(--ui-text)] dark:text-zinc-100 sm:text-3xl">
                Handover Sif
              </h1>
              <p className="mt-1 text-sm text-[var(--ui-text-muted)] dark:text-zinc-400">
                Ringkas pending penting untuk staf berikutnya, termasuk transaksi yang sudah diklaim atau perlu dipantau saat pergantian sif.
              </p>
            </div>
          </div>
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-start">
            <div className="space-y-1">
              <Button
                variant="outline"
                onClick={() => void handleCopyActiveFilterLink()}
                className="rounded-xl border-[var(--ui-border)] text-[var(--ui-text)] hover:bg-[var(--ui-accent-bg)] hover:text-[var(--ui-accent)]"
              >
                <Copy className="mr-2 h-4 w-4" />
                Salin Tautan
              </Button>
              <p className="text-[11px] text-[var(--ui-text-secondary)] dark:text-zinc-500">
                Bagikan tautan ini agar staf lain membuka filter handover yang sama.
              </p>
            </div>
            <Button
              variant="outline"
              onClick={() => void loadData()}
              disabled={isLoading}
              className="rounded-xl border-[var(--ui-accent)]/25 text-[var(--ui-accent)] hover:bg-[var(--ui-accent-bg)] hover:text-[var(--ui-accent-hover)]"
            >
              <RefreshCw className={`mr-2 h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
              Muat Ulang
            </Button>
          </div>
        </div>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
          <Card className="rounded-3xl border-[var(--ui-border)] bg-[var(--ui-card)] shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-[var(--ui-text)] dark:text-zinc-100">
                <MessageSquare className="h-5 w-5 text-[var(--ui-accent)]" />
                Buat Catatan Handover Sif
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-card-alt)] p-4 dark:border-zinc-800 dark:bg-zinc-900">
                <Label htmlFor="handover-summary" className="text-sm font-medium text-[var(--ui-text)] dark:text-zinc-100">
                  Ringkasan operasional
                </Label>
                <Textarea
                  id="handover-summary"
                  value={summary}
                  onChange={(event) => setSummary(event.target.value)}
                  placeholder="Contoh: pending FF ref ABC masih menunggu webhook Digiflazz, pelanggan sudah menindaklanjuti 2x, lanjut pantau setelah jam 22.00."
                  className="mt-2 min-h-[140px] rounded-2xl border-[var(--ui-input-border)] bg-[var(--ui-input-bg)] text-[var(--ui-text)]"
                />
              </div>

              <div className="rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-card-alt)] p-4 dark:border-zinc-800 dark:bg-zinc-900">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <h2 className="font-semibold text-[var(--ui-text)] dark:text-zinc-100">Transaksi pending untuk dibawa handover</h2>
                    <p className="text-sm text-[var(--ui-text-muted)] dark:text-zinc-400">
                      Pilih transaksi yang perlu diteruskan ke sif berikutnya.
                    </p>
                  </div>
                  <div className="rounded-full bg-[var(--ui-accent-bg)] px-3 py-1 text-xs font-semibold text-[var(--ui-accent)]">
                    {selectedCount} dipilih
                  </div>
                </div>

                <div className="space-y-3">
                  {isLoading ? (
                    <div className="flex items-center justify-center py-10 text-[var(--ui-text-muted)] dark:text-zinc-400">
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Memuat antrean pending...
                    </div>
                  ) : pendingTransactions.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-[var(--ui-border)] p-6 text-center text-sm text-[var(--ui-text-muted)] dark:border-zinc-800 dark:text-zinc-400">
                      Tidak ada transaksi pending saat ini.
                    </div>
                  ) : (
                    pendingTransactions.map((transaction) => {
                      const checked = selectedIds.includes(transaction.id);
                      return (
                        <label
                          key={transaction.id}
                          className="flex cursor-pointer items-start gap-3 rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-card)] p-3 transition-colors hover:bg-[var(--ui-accent-bg)] dark:border-zinc-800 dark:bg-zinc-950"
                        >
                          <Checkbox
                            checked={checked}
                            onCheckedChange={(value) => toggleTransaction(transaction.id, value === true)}
                            className="mt-0.5"
                          />
                          <div className="min-w-0 flex-1 space-y-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-semibold text-[var(--ui-text)] dark:text-zinc-100">
                                {transaction.productName}
                              </span>
                              {transaction.claimedByUsername && (
                                <span className="inline-flex items-center gap-1 rounded-full border border-sky-500/30 bg-sky-500/10 px-2 py-0.5 text-xs text-sky-700 dark:text-sky-300">
                                  <Hand className="h-3 w-3" /> {transaction.claimedByUsername}
                                </span>
                              )}
                              {transaction.internalPriority === "handover" && (
                                <span className="inline-flex items-center gap-1 rounded-full border border-orange-500/30 bg-orange-500/10 px-2 py-0.5 text-xs text-orange-700 dark:text-orange-300">
                                  <AlertTriangle className="h-3 w-3" /> Ditandai
                                </span>
                              )}
                            </div>
                            <p className="line-clamp-2 text-sm text-[var(--ui-text-muted)] dark:text-zinc-400">
                              {transaction.details}
                            </p>
                            <div className="flex flex-wrap gap-3 text-xs text-[var(--ui-text-secondary)] dark:text-zinc-500">
                              <span>{transaction.id}</span>
                              <span>{formatDateInTimezone(transaction.timestamp)}</span>
                            </div>
                          </div>
                        </label>
                      );
                    })
                  )}
                </div>
              </div>

              <div className="flex justify-end">
                <Button
                  onClick={() => void handleCreateHandover()}
                  disabled={isSaving}
                  className="rounded-xl bg-[var(--ui-accent)] text-white hover:bg-[var(--ui-accent-hover)]"
                >
                  {isSaving ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <ClipboardList className="mr-2 h-4 w-4" />
                  )}
                  Simpan Catatan Handover
                </Button>
              </div>
            </CardContent>
          </Card>

          <div className="space-y-6">
            <Card className="rounded-3xl border-[var(--ui-border)] bg-[var(--ui-surface)] shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
              <CardContent className="grid gap-3 p-5 sm:grid-cols-3">
                <div className="rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-card)] p-4 dark:border-zinc-800 dark:bg-zinc-900">
                  <p className="text-xs uppercase tracking-[0.18em] text-[var(--ui-text-secondary)] dark:text-zinc-500">Handover terbuka</p>
                  <p className="mt-2 text-2xl font-semibold text-[var(--ui-text)] dark:text-zinc-100">{openHandovers.length}</p>
                </div>
                <div className="rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-card)] p-4 dark:border-zinc-800 dark:bg-zinc-900">
                  <p className="text-xs uppercase tracking-[0.18em] text-[var(--ui-text-secondary)] dark:text-zinc-500">Antrean pending</p>
                  <p className="mt-2 text-2xl font-semibold text-[var(--ui-text)] dark:text-zinc-100">{pendingTransactions.length}</p>
                </div>
                <div className="rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-card)] p-4 dark:border-zinc-800 dark:bg-zinc-900">
                  <p className="text-xs uppercase tracking-[0.18em] text-[var(--ui-text-secondary)] dark:text-zinc-500">Dipilih</p>
                  <p className="mt-2 text-2xl font-semibold text-[var(--ui-text)] dark:text-zinc-100">{selectedCount}</p>
                </div>
              </CardContent>
            </Card>

            <Card className="rounded-3xl border-[var(--ui-border)] bg-[var(--ui-card)] shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
              <CardHeader className="space-y-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <CardTitle className="flex items-center gap-2 text-[var(--ui-text)] dark:text-zinc-100">
                    <ClipboardList className="h-5 w-5 text-[var(--ui-accent)]" />
                    Riwayat Handover Terbaru
                  </CardTitle>
                  <div className="flex flex-wrap gap-2">
                    {HANDOVER_FILTERS.map((filterOption) => {
                      const isActive = selectedFilter === filterOption.value;
                      return (
                        <Button
                          key={filterOption.value}
                          type="button"
                          variant="outline"
                          onClick={() => setSelectedFilter(filterOption.value)}
                          className={`rounded-full px-4 ${
                            isActive
                              ? "border-[var(--ui-accent)]/25 bg-[var(--ui-accent-bg)] text-[var(--ui-accent)] hover:bg-[var(--ui-accent-bg)]"
                              : "border-[var(--ui-border)] bg-[var(--ui-card-alt)] text-[var(--ui-text-muted)] hover:bg-[var(--ui-accent-bg)] hover:text-[var(--ui-text)]"
                          }`}
                        >
                          <Filter className="mr-2 h-4 w-4" />
                          {filterOption.label}
                        </Button>
                      );
                    })}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {isLoading ? (
                  <div className="flex items-center justify-center py-10 text-[var(--ui-text-muted)] dark:text-zinc-400">
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Memuat handover...
                  </div>
                ) : filteredHandovers.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-[var(--ui-border)] p-6 text-center text-sm text-[var(--ui-text-muted)] dark:border-zinc-800 dark:text-zinc-400">
                    {selectedFilter === "all"
                      ? "Belum ada handover yang tersimpan."
                      : "Tidak ada handover yang cocok dengan filter ini."}
                  </div>
                ) : (
                  filteredHandovers.map((handover) => (
                    <div key={handover._id || `${handover.createdByUsername}-${handover.createdAt}`} className="rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-card-alt)] p-4 dark:border-zinc-800 dark:bg-zinc-900">
                      <div className="mb-2 flex flex-wrap items-center gap-2">
                        <span className="inline-flex items-center gap-1 rounded-full border border-[var(--ui-border)] bg-[var(--ui-card)] px-2 py-0.5 text-xs text-[var(--ui-text)] dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100">
                          {handover.createdByUsername}
                        </span>
                        <span className="text-xs text-[var(--ui-text-secondary)] dark:text-zinc-500">
                          {formatDateInTimezone(handover.createdAt)}
                        </span>
                        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs ${
                          handover.status === "open"
                            ? "border border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300"
                            : "border border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                        }`}>
                          {handover.status === "open" ? (
                            <AlertTriangle className="h-3 w-3" />
                          ) : (
                            <CheckCircle2 className="h-3 w-3" />
                          )}
                          {handover.status === "open" ? "Terbuka" : "Diterima"}
                        </span>
                      </div>
                      <p className="text-sm text-[var(--ui-text)] dark:text-zinc-100">{handover.summary}</p>
                      <div className="mt-3 flex flex-wrap gap-2 text-xs text-[var(--ui-text-secondary)] dark:text-zinc-500">
                        <span>{handover.pendingTransactionIds.length} transaksi ikut handover</span>
                        {handover.acknowledgedByUsername && (
                          <span>
                            Diterima oleh {handover.acknowledgedByUsername}
                            {handover.acknowledgedAt ? ` • ${formatDateInTimezone(handover.acknowledgedAt)}` : ""}
                          </span>
                        )}
                      </div>
                      {handover.pendingTransactionIds.length > 0 && (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {handover.pendingTransactionIds.map((transactionId) => (
                            <Link
                              key={`${handover._id || handover.createdAt}-${transactionId}`}
                              href={`/transactions?highlight=${encodeURIComponent(transactionId)}`}
                              className="inline-flex items-center gap-1 rounded-full border border-[var(--ui-border)] bg-[var(--ui-card)] px-3 py-1 text-xs text-[var(--ui-accent)] transition-colors hover:bg-[var(--ui-accent-bg)] hover:text-[var(--ui-accent-hover)] dark:border-zinc-800 dark:bg-zinc-950"
                            >
                              {transactionId.slice(-8)}
                              <ExternalLink className="h-3 w-3" />
                            </Link>
                          ))}
                        </div>
                      )}
                      {handover.status === "open" && handover._id && (
                        <div className="mt-3 flex justify-end">
                          <Button
                            variant="outline"
                            onClick={() => void handleAcknowledge(handover._id!)}
                            disabled={acknowledgingId === handover._id}
                            className="rounded-xl border-[var(--ui-accent)]/25 text-[var(--ui-accent)] hover:bg-[var(--ui-accent-bg)] hover:text-[var(--ui-accent-hover)]"
                          >
                            {acknowledgingId === handover._id ? (
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            ) : (
                              <CheckCircle2 className="mr-2 h-4 w-4" />
                            )}
                            Tandai Sudah Diterima
                          </Button>
                        </div>
                      )}
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </ProtectedRoute>
  );
}
