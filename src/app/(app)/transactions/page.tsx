// src/app/(app)/transactions/page.tsx
"use client";

import TransactionItem, {
  Transaction,
  TransactionStatus,
} from "@/components/transactions/TransactionItem";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  AlertTriangle,
  Building,
  CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Copy,
  Filter,
  FilterX,
  Flag,
  Hand,
  ListFilter,
  Loader2,
  RefreshCw,
  Search,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DateRange } from "react-day-picker";
import { format } from "date-fns";
import {
  listTransactionsFromDB,
  refreshPendingTransactionsFromDB,
  type TransactionOperationalFilter,
} from "@/lib/transaction-utils";
import { useToast } from "@/hooks/use-toast";
import ProtectedRoute from "@/components/core/ProtectedRoute";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

const ALL_CATEGORIES = "all_categories";
const ALL_STATUSES = "all_statuses";
const ALL_PROVIDERS = "all_providers";
const ALL_OPERATIONAL_FILTERS = "all";

type ProviderFilter = "all_providers" | "digiflazz" | "tokovoucher";

const ITEMS_PER_PAGE_OPTIONS = [10, 25, 50, 100];
const DEFAULT_ITEMS_PER_PAGE = ITEMS_PER_PAGE_OPTIONS[0];
const AVAILABLE_STATUSES: { label: string; value: string }[] = [
  { label: "Semua Status", value: ALL_STATUSES },
  { label: "Sukses", value: "Sukses" },
  { label: "Pending", value: "Pending" },
  { label: "Gagal", value: "Gagal" },
];
const AVAILABLE_PROVIDERS: { label: string; value: ProviderFilter }[] = [
  { label: "Semua Provider", value: ALL_PROVIDERS },
  { label: "Digiflazz", value: "digiflazz" },
  { label: "TokoVoucher", value: "tokovoucher" },
];
const AVAILABLE_OPERATIONAL_FILTERS: {
  label: string;
  value: TransactionOperationalFilter;
}[] = [
  { label: "Semua Pending", value: "all" },
  { label: "Belum Diklaim", value: "unclaimed" },
  { label: "Klaim Saya", value: "mine" },
  { label: "Diklaim Staf Lain", value: "others" },
  { label: "Perlu handover", value: "handover" },
];

function normalizeOperationalFilter(
  value: string | null | undefined
): TransactionOperationalFilter {
  if (AVAILABLE_OPERATIONAL_FILTERS.some((option) => option.value === value)) {
    return value as TransactionOperationalFilter;
  }

  return "all";
}

function normalizeProviderFilter(value: string | null | undefined): ProviderFilter {
  if (AVAILABLE_PROVIDERS.some((option) => option.value === value)) {
    return value as ProviderFilter;
  }

  return ALL_PROVIDERS;
}

function normalizeStatusFilter(value: string | null | undefined): string {
  if (AVAILABLE_STATUSES.some((option) => option.value === value) && value) {
    return value;
  }

  return ALL_STATUSES;
}

function normalizePageNumber(value: string | null | undefined): number {
  const parsed = Number(value);
  if (Number.isInteger(parsed) && parsed > 0) {
    return parsed;
  }

  return 1;
}

function normalizeItemsPerPage(value: string | null | undefined): number {
  const parsed = Number(value);
  if (ITEMS_PER_PAGE_OPTIONS.includes(parsed)) {
    return parsed;
  }

  return DEFAULT_ITEMS_PER_PAGE;
}

function normalizeCategoryFilter(value: string | null | undefined): string {
  const trimmed = value?.trim();
  if (!trimmed || trimmed === ALL_CATEGORIES) {
    return ALL_CATEGORIES;
  }

  return trimmed;
}

function normalizeDateParam(value: string | null | undefined): Date | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return undefined;
  }

  return parsed;
}

function normalizeDateRange(
  fromValue: string | null | undefined,
  toValue: string | null | undefined
): DateRange | undefined {
  const from = normalizeDateParam(fromValue);
  const to = normalizeDateParam(toValue);

  if (!from && !to) {
    return undefined;
  }

  if (from && to) {
    return { from, to };
  }

  if (from) {
    return { from, to: from };
  }

  if (to) {
    return { from: to, to };
  }

  return undefined;
}

export default function TransactionsPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const highlightedTransactionId = searchParams.get("highlight")?.trim() || "";
  const queuedOperationalFilter = normalizeOperationalFilter(
    searchParams.get("queue")?.trim()
  );
  const queuedProviderFilter = normalizeProviderFilter(
    searchParams.get("provider")?.trim()
  );
  const queuedStatusFilter = normalizeStatusFilter(searchParams.get("status")?.trim());
  const queuedSearch = searchParams.get("search")?.trim() || "";
  const queuedCategory = normalizeCategoryFilter(searchParams.get("category"));
  const queuedDateRange = normalizeDateRange(
    searchParams.get("from")?.trim(),
    searchParams.get("to")?.trim()
  );
  const queuedPage = normalizePageNumber(searchParams.get("page")?.trim());
  const queuedItemsPerPage = normalizeItemsPerPage(searchParams.get("limit")?.trim());

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [availableCategories, setAvailableCategories] = useState<string[]>([
    ALL_CATEGORIES,
  ]);
  const [totalTransactions, setTotalTransactions] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshingPending, setIsRefreshingPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  const [selectedCategory, setSelectedCategory] = useState<string>(queuedCategory);
  const [selectedStatus, setSelectedStatus] = useState<string>(queuedStatusFilter);
  const [dateRange, setDateRange] = useState<DateRange | undefined>(queuedDateRange);
  const [selectedProvider, setSelectedProvider] =
    useState<ProviderFilter>(queuedProviderFilter);
  const [selectedOperationalFilter, setSelectedOperationalFilter] =
    useState<TransactionOperationalFilter>(queuedOperationalFilter);
  const [searchInput, setSearchInput] = useState(queuedSearch);
  const [appliedSearch, setAppliedSearch] = useState(queuedSearch);

  const [itemsPerPage, setItemsPerPage] = useState<number>(queuedItemsPerPage);
  const [currentPage, setCurrentPage] = useState<number>(queuedPage);

  const requestIdRef = useRef(0);
  const lastAutoScrolledHighlightRef = useRef<string | null>(null);

  const loadTransactions = useCallback(async () => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;

    setIsLoading(true);
    setError(null);

    try {
      const response = await listTransactionsFromDB({
        page: currentPage,
        limit: itemsPerPage,
        search: appliedSearch || undefined,
        category:
          selectedCategory !== ALL_CATEGORIES ? selectedCategory : undefined,
        status:
          selectedStatus !== ALL_STATUSES
            ? (selectedStatus as TransactionStatus)
            : undefined,
        provider:
          selectedProvider !== ALL_PROVIDERS ? selectedProvider : undefined,
        operationalFilter:
          selectedOperationalFilter !== ALL_OPERATIONAL_FILTERS
            ? selectedOperationalFilter
            : undefined,
        from: dateRange?.from?.toISOString(),
        to: dateRange?.to?.toISOString(),
      });

      if (requestId !== requestIdRef.current) return;

      setTransactions(response.transactions);
      setTotalTransactions(response.total);
      setTotalPages(response.totalPages);
      setAvailableCategories([ALL_CATEGORIES, ...response.availableCategories]);

      if (response.page !== currentPage) {
        setCurrentPage(response.page);
      }
    } catch (loadError) {
      if (requestId !== requestIdRef.current) return;

      const msg =
        loadError instanceof Error
          ? loadError.message
          : "Tidak dapat memuat transaksi.";
      console.error("Gagal memuat transaksi dari DB:", loadError);
      setError(msg);
      toast({ title: "Gagal memuat", description: msg, variant: "destructive" });
    } finally {
      if (requestId === requestIdRef.current) {
        setIsLoading(false);
      }
    }
  }, [
    appliedSearch,
    currentPage,
    dateRange?.from?.getTime(),
    dateRange?.to?.getTime(),
    itemsPerPage,
    selectedCategory,
    selectedOperationalFilter,
    selectedProvider,
    selectedStatus,
    toast,
  ]);

  useEffect(() => {
    setSelectedCategory((current) => (current === queuedCategory ? current : queuedCategory));
    setSelectedOperationalFilter((current) =>
      current === queuedOperationalFilter ? current : queuedOperationalFilter
    );
    setSelectedProvider((current) =>
      current === queuedProviderFilter ? current : queuedProviderFilter
    );
    setSelectedStatus((current) =>
      current === queuedStatusFilter ? current : queuedStatusFilter
    );
    setDateRange((current) => {
      const currentFrom = current?.from?.toISOString() || "";
      const currentTo = current?.to?.toISOString() || "";
      const queuedFrom = queuedDateRange?.from?.toISOString() || "";
      const queuedTo = queuedDateRange?.to?.toISOString() || "";

      if (currentFrom === queuedFrom && currentTo === queuedTo) {
        return current;
      }

      return queuedDateRange;
    });
    setSearchInput((current) => (current === queuedSearch ? current : queuedSearch));
    setAppliedSearch((current) => (current === queuedSearch ? current : queuedSearch));
    setItemsPerPage((current) =>
      current === queuedItemsPerPage ? current : queuedItemsPerPage
    );
    setCurrentPage((current) => (current === queuedPage ? current : queuedPage));
  }, [
    queuedCategory,
    queuedDateRange,
    queuedItemsPerPage,
    queuedOperationalFilter,
    queuedPage,
    queuedProviderFilter,
    queuedSearch,
    queuedStatusFilter,
  ]);

  useEffect(() => {
    const params = new URLSearchParams(searchParams.toString());

    if (highlightedTransactionId) {
      params.set("highlight", highlightedTransactionId);
    } else {
      params.delete("highlight");
    }

    if (selectedCategory !== ALL_CATEGORIES) {
      params.set("category", selectedCategory);
    } else {
      params.delete("category");
    }

    if (selectedOperationalFilter !== ALL_OPERATIONAL_FILTERS) {
      params.set("queue", selectedOperationalFilter);
    } else {
      params.delete("queue");
    }

    if (selectedProvider !== ALL_PROVIDERS) {
      params.set("provider", selectedProvider);
    } else {
      params.delete("provider");
    }

    if (selectedStatus !== ALL_STATUSES) {
      params.set("status", selectedStatus);
    } else {
      params.delete("status");
    }

    if (appliedSearch) {
      params.set("search", appliedSearch);
    } else {
      params.delete("search");
    }

    if (dateRange?.from) {
      params.set("from", dateRange.from.toISOString());
    } else {
      params.delete("from");
    }

    if (dateRange?.to) {
      params.set("to", dateRange.to.toISOString());
    } else {
      params.delete("to");
    }

    if (itemsPerPage !== DEFAULT_ITEMS_PER_PAGE) {
      params.set("limit", String(itemsPerPage));
    } else {
      params.delete("limit");
    }

    if (currentPage > 1) {
      params.set("page", String(currentPage));
    } else {
      params.delete("page");
    }

    const nextQuery = params.toString();
    const currentQuery = searchParams.toString();

    if (nextQuery !== currentQuery) {
      router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname, {
        scroll: false,
      });
    }
  }, [
    appliedSearch,
    currentPage,
    dateRange?.from?.getTime(),
    dateRange?.to?.getTime(),
    highlightedTransactionId,
    itemsPerPage,
    pathname,
    router,
    searchParams,
    selectedCategory,
    selectedOperationalFilter,
    selectedProvider,
    selectedStatus,
  ]);

  useEffect(() => {
    void loadTransactions();
  }, [loadTransactions]);

  const handleRefresh = () => {
    void loadTransactions();
  };

  const handleCopyActiveFilterLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      toast({
        title: "Tautan filter disalin",
        description: "Tautan filter transaksi aktif sudah disalin ke clipboard.",
      });
    } catch {
      toast({
        title: "Gagal menyalin tautan",
        description: "Clipboard tidak tersedia di browser ini.",
        variant: "destructive",
      });
    }
  };

  const pendingTransactionIds = transactions
    .filter((transaction) => transaction.status === "Pending")
    .map((transaction) => transaction.id);

  const highlightedTransaction = useMemo(
    () => transactions.find((transaction) => transaction.id === highlightedTransactionId),
    [transactions, highlightedTransactionId]
  );

  useEffect(() => {
    if (!highlightedTransactionId) {
      lastAutoScrolledHighlightRef.current = null;
      return;
    }

    if (!highlightedTransaction) {
      return;
    }

    if (lastAutoScrolledHighlightRef.current === highlightedTransactionId) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      const element = document.getElementById(`transaction-card-${highlightedTransactionId}`);
      element?.scrollIntoView({ behavior: "smooth", block: "center" });
      lastAutoScrolledHighlightRef.current = highlightedTransactionId;
    }, 180);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [highlightedTransaction, highlightedTransactionId]);

  const handleRefreshPending = async () => {
    if (pendingTransactionIds.length === 0) {
      toast({
        title: "Tidak ada transaksi pending",
        description: "Tidak ada transaksi pending di halaman ini untuk direfresh.",
      });
      return;
    }

    setIsRefreshingPending(true);

    try {
      const result = await refreshPendingTransactionsFromDB(pendingTransactionIds);

      if (!result.success) {
        toast({
          title: "Refresh pending gagal",
          description:
            result.message || "Tidak dapat merefresh transaksi pending.",
          variant: "destructive",
        });
        return;
      }

      const unchangedCount = result.checkedCount - result.changedCount;
      const hasWebhookSkips = result.items.some(
        (item) => item.provider === "digiflazz" && item.skipped
      );
      const summaryParts = [
        `${result.changedCount} berubah`,
        `${unchangedCount} masih pending`,
      ];

      if (result.skippedCount > 0) {
        summaryParts.push(`${result.skippedCount} dilewati`);
      }

      toast({
        title: "Refresh pending selesai",
        description: `${summaryParts.join(", ")}.${
          hasWebhookSkips
            ? " Transaksi pending Digiflazz tetap menunggu webhook."
            : ""
        }`,
      });

      await loadTransactions();
    } catch (refreshError) {
      console.error("Gagal merefresh transaksi pending:", refreshError);
      toast({
        title: "Refresh pending gagal",
        description:
          refreshError instanceof Error
            ? refreshError.message
            : "Terjadi error yang tidak diketahui saat merefresh transaksi pending.",
        variant: "destructive",
      });
    } finally {
      setIsRefreshingPending(false);
    }
  };

  const handleApplySearch = () => {
    const nextSearch = searchInput.trim();
    const shouldResetPage = currentPage !== 1;
    const shouldUpdateSearch = nextSearch !== appliedSearch;

    if (shouldResetPage) {
      setCurrentPage(1);
    }

    if (shouldUpdateSearch) {
      setAppliedSearch(nextSearch);
      return;
    }

    if (!shouldResetPage) {
      void loadTransactions();
    }
  };

  const handleClearSearch = () => {
    const shouldResetPage = currentPage !== 1;
    const shouldUpdateSearch = appliedSearch !== "" || searchInput !== "";

    setSearchInput("");
    if (shouldResetPage) {
      setCurrentPage(1);
    }
    if (shouldUpdateSearch) {
      setAppliedSearch("");
      return;
    }

    if (!shouldResetPage) {
      void loadTransactions();
    }
  };

  const resetFilters = () => {
    setSelectedCategory(ALL_CATEGORIES);
    setSelectedStatus(ALL_STATUSES);
    setDateRange(undefined);
    setSelectedProvider(ALL_PROVIDERS);
    setSelectedOperationalFilter(ALL_OPERATIONAL_FILTERS);
    setSearchInput("");
    setAppliedSearch("");
    setItemsPerPage(DEFAULT_ITEMS_PER_PAGE);
    setCurrentPage(1);
  };

  const hasActiveFilters =
    selectedCategory !== ALL_CATEGORIES ||
    selectedStatus !== ALL_STATUSES ||
    dateRange !== undefined ||
    selectedProvider !== ALL_PROVIDERS ||
    selectedOperationalFilter !== ALL_OPERATIONAL_FILTERS ||
    appliedSearch !== "" ||
    itemsPerPage !== DEFAULT_ITEMS_PER_PAGE;

  const activeFilterCount = [
    selectedCategory !== ALL_CATEGORIES,
    selectedStatus !== ALL_STATUSES,
    dateRange !== undefined,
    selectedProvider !== ALL_PROVIDERS,
    selectedOperationalFilter !== ALL_OPERATIONAL_FILTERS,
    appliedSearch !== "",
  ].filter(Boolean).length;

  return (
    <ProtectedRoute requiredPermission="riwayat_transaksi">
      <div className="mx-auto max-w-7xl space-y-8 pb-10">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-[var(--ui-accent-gradient-from)] to-[var(--ui-accent-gradient-to)] text-white shadow-lg">
              <Building className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-2xl font-serif font-bold tracking-tight text-[var(--ui-text)] dark:text-zinc-100 sm:text-3xl">
                Riwayat Transaksi
              </h1>
              <p className="mt-1 text-sm text-[var(--ui-text-muted)] dark:text-zinc-400">
                Riwayat sekarang difilter dan dipaginasi dari server, jadi lebih
                ringan saat histori bertambah besar. Refresh pending juga sudah
                dipindah ke server agar tidak polling dari setiap tab browser.
              </p>
            </div>
          </div>
          <div className="flex w-full flex-col items-center gap-2 sm:w-auto sm:flex-row">
            <div className="w-full space-y-1 sm:w-auto">
              <Button
                variant="outline"
                onClick={() => void handleCopyActiveFilterLink()}
                className="w-full rounded-xl border-[var(--ui-border)] text-[var(--ui-text)] hover:bg-[var(--ui-accent-bg)] hover:text-[var(--ui-accent)] sm:w-auto"
              >
                <Copy className="mr-2 h-4 w-4" />
                Salin Tautan
              </Button>
              <p className="text-center text-[11px] text-[var(--ui-text-secondary)] dark:text-zinc-500 sm:text-left">
                Bagikan tautan ini agar staf lain membuka filter yang sama.
              </p>
            </div>
            <Sheet>
              <SheetTrigger asChild>
                <Button
                  variant="outline"
                  className="w-full rounded-xl border-[var(--ui-accent)]/20 text-[var(--ui-accent)] hover:bg-[var(--ui-accent)]/10 hover:text-[var(--ui-accent-hover)] sm:w-auto"
                >
                  <Filter className="mr-2 h-4 w-4" />
                  Filter
                  {activeFilterCount > 0 && (
                    <span className="ml-2 inline-flex items-center justify-center rounded-full bg-[var(--ui-accent)] px-2 py-1 text-xs font-bold leading-none text-white">
                      {activeFilterCount}
                    </span>
                  )}
                </Button>
              </SheetTrigger>
              <SheetContent className="w-[300px] border-[var(--ui-border)] bg-[var(--ui-card)] text-[var(--ui-text)] sm:w-[400px] dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100">
                <SheetHeader>
                  <SheetTitle className="flex items-center gap-2 text-[var(--ui-text)] dark:text-zinc-100">
                    <ListFilter className="h-5 w-5 text-[var(--ui-accent)]" />
                    Filter Transaksi
                  </SheetTitle>
                  <SheetDescription className="text-[var(--ui-text-muted)] dark:text-zinc-400">
                    Saring daftar transaksi berdasarkan kategori, status,
                    provider, atau tanggal.
                  </SheetDescription>
                </SheetHeader>
                <div className="space-y-4 py-4">
                  <div>
                    <Label
                      htmlFor="category-filter-sheet"
                      className="text-sm font-medium text-[var(--ui-text)] dark:text-zinc-100"
                    >
                      Kategori
                    </Label>
                    <Select
                      value={selectedCategory}
                      onValueChange={(value) => {
                        setSelectedCategory(value);
                        setCurrentPage(1);
                      }}
                    >
                      <SelectTrigger
                        id="category-filter-sheet"
                        className="rounded-xl border-[var(--ui-input-border)] bg-[var(--ui-input-bg)] text-[var(--ui-text)] focus:ring-[var(--ui-accent)] dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                      >
                        <SelectValue placeholder="Pilih kategori" />
                      </SelectTrigger>
                      <SelectContent>
                        {availableCategories.map((cat) => (
                          <SelectItem key={cat} value={cat}>
                            {cat === ALL_CATEGORIES ? "Semua Kategori" : cat}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label
                      htmlFor="status-filter-sheet"
                      className="text-sm font-medium text-[var(--ui-text)] dark:text-zinc-100"
                    >
                      Status
                    </Label>
                    <Select
                      value={selectedStatus}
                      onValueChange={(value) => {
                        setSelectedStatus(value);
                        setCurrentPage(1);
                      }}
                    >
                      <SelectTrigger
                        id="status-filter-sheet"
                        className="rounded-xl border-[var(--ui-input-border)] bg-[var(--ui-input-bg)] text-[var(--ui-text)] focus:ring-[var(--ui-accent)] dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                      >
                        <SelectValue placeholder="Pilih status" />
                      </SelectTrigger>
                      <SelectContent>
                        {AVAILABLE_STATUSES.map((stat) => (
                          <SelectItem key={stat.value} value={stat.value}>
                            {stat.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label
                      htmlFor="provider-filter-sheet"
                      className="text-sm font-medium text-[var(--ui-text)] dark:text-zinc-100"
                    >
                      Provider
                    </Label>
                    <Select
                      value={selectedProvider}
                      onValueChange={(value) => {
                        setSelectedProvider(value as ProviderFilter);
                        setCurrentPage(1);
                      }}
                    >
                      <SelectTrigger
                        id="provider-filter-sheet"
                        className="rounded-xl border-[var(--ui-input-border)] bg-[var(--ui-input-bg)] text-[var(--ui-text)] focus:ring-[var(--ui-accent)] dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                      >
                        <div className="flex items-center gap-2">
                          <Building className="h-4 w-4 text-[var(--ui-text-secondary)] dark:text-zinc-500" />
                          <SelectValue placeholder="Pilih provider" />
                        </div>
                      </SelectTrigger>
                      <SelectContent>
                        {AVAILABLE_PROVIDERS.map((prov) => (
                          <SelectItem key={prov.value} value={prov.value}>
                            {prov.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label
                      htmlFor="operational-filter-sheet"
                      className="text-sm font-medium text-[var(--ui-text)] dark:text-zinc-100"
                    >
                      Antrean Operasional
                    </Label>
                    <Select
                      value={selectedOperationalFilter}
                      onValueChange={(value) => {
                        setSelectedOperationalFilter(value as TransactionOperationalFilter);
                        setCurrentPage(1);
                      }}
                    >
                      <SelectTrigger
                        id="operational-filter-sheet"
                        className="rounded-xl border-[var(--ui-input-border)] bg-[var(--ui-input-bg)] text-[var(--ui-text)] focus:ring-[var(--ui-accent)] dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                      >
                        <div className="flex items-center gap-2">
                          <Hand className="h-4 w-4 text-[var(--ui-text-secondary)] dark:text-zinc-500" />
                          <SelectValue placeholder="Pilih mode antrean" />
                        </div>
                      </SelectTrigger>
                      <SelectContent>
                        {AVAILABLE_OPERATIONAL_FILTERS.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label
                      htmlFor="date-filter-popover-sheet"
                      className="text-sm font-medium text-[var(--ui-text)] dark:text-zinc-100"
                    >
                      Rentang Tanggal
                    </Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          id="date-filter-popover-sheet"
                          variant="outline"
                          className={`w-full justify-start rounded-xl border-[var(--ui-input-border)] bg-[var(--ui-input-bg)] text-left font-normal text-[var(--ui-text)] hover:bg-[var(--ui-accent-bg)] hover:text-[var(--ui-accent)] dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 ${!dateRange?.from ? "text-[var(--ui-text-secondary)] dark:text-zinc-500" : ""}`}
                        >
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {dateRange?.from ? (
                            dateRange.to ? (
                              <>
                                {format(dateRange.from, "LLL dd, y")} -{" "}
                                {format(dateRange.to, "LLL dd, y")}
                              </>
                            ) : (
                              format(dateRange.from, "LLL dd, y")
                            )
                          ) : (
                            <span>Pilih rentang tanggal</span>
                          )}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent
                        className="w-auto border-[var(--ui-border)] bg-[var(--ui-card)] p-0 dark:border-zinc-800 dark:bg-zinc-950"
                        align="start"
                      >
                        <Calendar
                          initialFocus
                          mode="range"
                          defaultMonth={dateRange?.from}
                          selected={dateRange}
                          onSelect={(nextRange) => {
                            setDateRange(nextRange);
                            setCurrentPage(1);
                          }}
                          numberOfMonths={1}
                        />
                      </PopoverContent>
                    </Popover>
                  </div>

                  <div>
                    <Label
                      htmlFor="items-per-page-filter-sheet"
                      className="text-sm font-medium text-[var(--ui-text)] dark:text-zinc-100"
                    >
                      Tampilkan
                    </Label>
                    <Select
                      value={String(itemsPerPage)}
                      onValueChange={(value) => {
                        setItemsPerPage(Number(value));
                        setCurrentPage(1);
                      }}
                    >
                      <SelectTrigger
                        id="items-per-page-filter-sheet"
                        className="rounded-xl border-[var(--ui-input-border)] bg-[var(--ui-input-bg)] text-[var(--ui-text)] focus:ring-[var(--ui-accent)] dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                      >
                        <SelectValue placeholder="Item per halaman" />
                      </SelectTrigger>
                      <SelectContent>
                        {ITEMS_PER_PAGE_OPTIONS.map((option) => (
                          <SelectItem key={option} value={String(option)}>
                            {option} per halaman
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <SheetFooter className="mt-auto border-t border-[var(--ui-border)] pt-4 dark:border-zinc-800">
                  <SheetClose asChild>
                    <Button
                      variant="outline"
                      className="w-full rounded-xl border-[var(--ui-border)] bg-[var(--ui-card-alt)] text-[var(--ui-text)] hover:bg-[var(--ui-accent-bg)] dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
                    >
                      Tutup
                    </Button>
                  </SheetClose>
                  {hasActiveFilters && (
                    <Button
                      onClick={resetFilters}
                      variant="destructive"
                      className="w-full"
                    >
                      <FilterX className="mr-2 h-4 w-4" />
                      Reset Semua Filter
                    </Button>
                  )}
                </SheetFooter>
              </SheetContent>
            </Sheet>
            <Button
              onClick={handleRefreshPending}
              variant="outline"
              disabled={isLoading || isRefreshingPending || pendingTransactionIds.length === 0}
              className="w-full flex-shrink-0 rounded-xl border-amber-500/30 text-amber-700 hover:bg-amber-500/10 hover:text-amber-800 disabled:cursor-not-allowed disabled:opacity-60 dark:text-amber-300 sm:w-auto"
            >
              <RefreshCw
                className={`mr-2 h-4 w-4 ${
                  isRefreshingPending ? "animate-spin" : ""
                }`}
              />
              Refresh Pending Sekarang
            </Button>
            <Button
              onClick={handleRefresh}
              variant="outline"
              disabled={isLoading}
              className="w-full flex-shrink-0 rounded-xl border-[var(--ui-accent-light)]/30 text-[var(--ui-accent)] hover:bg-[var(--ui-accent)]/10 hover:text-[var(--ui-accent-hover)] sm:w-auto"
            >
              <RefreshCw
                className={`mr-2 h-4 w-4 ${isLoading ? "animate-spin" : ""}`}
              />
              Muat Ulang
            </Button>
          </div>
        </div>

        <Card className="rounded-3xl border-[var(--ui-border)] bg-[var(--ui-surface)] shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          <CardContent className="grid gap-4 p-6 lg:grid-cols-[minmax(0,1fr)_240px] lg:items-end">
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                {AVAILABLE_OPERATIONAL_FILTERS.map((option) => {
                  const isActive = selectedOperationalFilter === option.value;
                  const Icon = option.value === "mine" ? Hand : option.value === "handover" ? Flag : Filter;

                  return (
                    <Button
                      key={option.value}
                      type="button"
                      variant="outline"
                      onClick={() => {
                        setSelectedOperationalFilter(option.value);
                        setCurrentPage(1);
                      }}
                      className={`rounded-full px-4 ${
                        isActive
                          ? "border-[var(--ui-accent)]/25 bg-[var(--ui-accent-bg)] text-[var(--ui-accent)] hover:bg-[var(--ui-accent-bg)]"
                          : "border-[var(--ui-border)] bg-[var(--ui-card-alt)] text-[var(--ui-text-muted)] hover:bg-[var(--ui-accent-bg)] hover:text-[var(--ui-text)]"
                      }`}
                    >
                      <Icon className="mr-2 h-4 w-4" />
                      {option.label}
                    </Button>
                  );
                })}
              </div>
              <div>
                <Label
                  htmlFor="transaction-search"
                  className="text-sm font-medium text-[var(--ui-text)] dark:text-zinc-100"
                >
                  Cari Transaksi
                </Label>
                <p className="mt-1 text-xs text-[var(--ui-text-secondary)] dark:text-zinc-500">
                  Cari ID referensi, nomor pelanggan, produk, SN, ID transaksi provider,
                  merek, atau SKU.
                </p>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <div className="relative flex-1">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--ui-text-secondary)] dark:text-zinc-500" />
                  <Input
                    id="transaction-search"
                    value={searchInput}
                    onChange={(event) => setSearchInput(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        handleApplySearch();
                      }
                    }}
                    placeholder="REF123, player ID, SN, SKU, ID transaksi provider..."
                    className="rounded-xl border-[var(--ui-input-border)] bg-[var(--ui-input-bg)] pl-10 text-[var(--ui-text)] placeholder:text-[var(--ui-text-secondary)] focus-visible:ring-[var(--ui-accent)] dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                  />
                </div>
                <div className="flex gap-2">
                  {searchInput !== "" && (
                    <Button
                      variant="outline"
                      onClick={handleClearSearch}
                      className="rounded-xl border-[var(--ui-border)] bg-[var(--ui-card-alt)] text-[var(--ui-text)] hover:bg-[var(--ui-accent-bg)] dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
                    >
                      <X className="mr-2 h-4 w-4" />
                      Hapus
                    </Button>
                  )}
                  <Button
                    onClick={handleApplySearch}
                    className="rounded-xl bg-[var(--ui-accent)] text-white hover:bg-[var(--ui-accent-hover)]"
                  >
                    <Search className="mr-2 h-4 w-4" />
                    Cari
                  </Button>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-card-alt)] p-4 dark:border-zinc-800 dark:bg-zinc-900">
              <p className="text-xs font-medium uppercase tracking-[0.18em] text-[var(--ui-text-secondary)] dark:text-zinc-500">
                Ringkasan Hasil
              </p>
              <p className="mt-2 text-2xl font-semibold text-[var(--ui-text)] dark:text-zinc-100">
                {totalTransactions.toLocaleString("id-ID")}
              </p>
              <p className="mt-1 text-sm text-[var(--ui-text-muted)] dark:text-zinc-400">
                {transactions.length.toLocaleString("id-ID")} baris di halaman
                {" "}{currentPage} dari {totalPages}
              </p>
              <div className="mt-4 grid gap-2 text-xs text-[var(--ui-text-secondary)] dark:text-zinc-500">
                <div className="flex items-center justify-between rounded-xl border border-[var(--ui-border)] bg-[var(--ui-card)] px-3 py-2 dark:border-zinc-800 dark:bg-zinc-950">
                  <span>Pending di halaman</span>
                  <span className="font-semibold text-[var(--ui-text)] dark:text-zinc-100">
                    {transactions.filter((transaction) => transaction.status === "Pending").length}
                  </span>
                </div>
                <div className="flex items-center justify-between rounded-xl border border-[var(--ui-border)] bg-[var(--ui-card)] px-3 py-2 dark:border-zinc-800 dark:bg-zinc-950">
                  <span>Diklaim di halaman</span>
                  <span className="font-semibold text-[var(--ui-text)] dark:text-zinc-100">
                    {transactions.filter((transaction) => !!transaction.claimedByUserId).length}
                  </span>
                </div>
                <div className="flex items-center justify-between rounded-xl border border-[var(--ui-border)] bg-[var(--ui-card)] px-3 py-2 dark:border-zinc-800 dark:bg-zinc-950">
                  <span>Perlu handover</span>
                  <span className="font-semibold text-[var(--ui-text)] dark:text-zinc-100">
                    {transactions.filter((transaction) => transaction.internalPriority === "handover").length}
                  </span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-3xl border-[var(--ui-border)] bg-[var(--ui-card)] shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          <CardContent className="flex flex-col gap-2 p-5 text-sm text-[var(--ui-text-muted)] dark:text-zinc-400 sm:flex-row sm:items-center sm:justify-between">
            <p>
              Pending TokoVoucher bisa direfresh manual dari server. Pending
              Digiflazz menunggu update webhook supaya tidak memanggil endpoint
              transaksi lagi dari browser. Staf juga bisa mengklaim transaksi,
              menyimpan catatan internal, dan menandai item yang perlu handover
              ke sif berikutnya.
            </p>
            <p className="text-xs uppercase tracking-[0.18em] text-[var(--ui-text-secondary)] dark:text-zinc-500">
              Refresh dikendalikan server
            </p>
          </CardContent>
        </Card>

        {highlightedTransactionId && (
          <Card className={`rounded-3xl border shadow-sm ${highlightedTransaction ? "border-[var(--ui-accent)]/30 bg-[var(--ui-accent-bg)]/60 dark:border-sky-400/30 dark:bg-sky-500/10" : "border-amber-500/30 bg-amber-500/10 dark:border-amber-400/30 dark:bg-amber-500/10"}`}>
            <CardContent className="flex flex-col gap-2 p-5 text-sm sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-semibold text-[var(--ui-text)] dark:text-zinc-100">
                  {highlightedTransaction
                    ? `Transaksi ${highlightedTransactionId} ditemukan dari handover.`
                    : `Transaksi ${highlightedTransactionId} belum muncul di halaman ini.`}
                </p>
                <p className="text-[var(--ui-text-muted)] dark:text-zinc-400">
                  {highlightedTransaction
                    ? "Kartu transaksi terkait sudah diberi highlight agar mudah ditemukan."
                    : "Coba ubah filter, pencarian, atau halaman agar transaksi target terlihat."}
                </p>
              </div>
              {highlightedTransaction && (
                <Button
                  variant="outline"
                  onClick={() => {
                    const element = document.getElementById(`transaction-card-${highlightedTransactionId}`);
                    element?.scrollIntoView({ behavior: "smooth", block: "center" });
                  }}
                  className="rounded-xl border-[var(--ui-accent)]/25 text-[var(--ui-accent)] hover:bg-[var(--ui-accent-bg)] hover:text-[var(--ui-accent-hover)]"
                >
                  Fokus ke transaksi
                </Button>
              )}
            </CardContent>
          </Card>
        )}

        {isLoading && transactions.length === 0 ? (
          <div className="py-10 text-center text-[var(--ui-text-muted)] dark:text-zinc-400">
            <Loader2 className="mx-auto mb-4 h-10 w-10 animate-spin text-[var(--ui-accent)]" />
            <p>Memuat transaksi...</p>
          </div>
        ) : error ? (
          <Card className="border-destructive bg-destructive/10 py-10 text-center shadow">
            <CardHeader>
              <CardTitle className="flex items-center justify-center gap-2 text-destructive">
                <AlertTriangle className="h-6 w-6" />
                Gagal Memuat Transaksi
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-destructive/90">{error}</p>
              <Button onClick={handleRefresh} className="mt-4" variant="outline">
                Coba Lagi
              </Button>
            </CardContent>
          </Card>
        ) : !isLoading && totalTransactions === 0 ? (
          <Card className="rounded-3xl border-[var(--ui-border)] bg-[var(--ui-surface)] py-10 text-center shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
            <CardContent className="space-y-2">
              <p className="text-lg text-[var(--ui-text-muted)] dark:text-zinc-400">
                {hasActiveFilters
                  ? "Tidak ada transaksi yang cocok dengan filter server saat ini."
                  : "Belum ada transaksi."}
              </p>
              <p className="mt-2 text-sm text-[var(--ui-text-secondary)] dark:text-zinc-500">
                {hasActiveFilters
                  ? "Coba ubah pencarian, rentang tanggal, atau filter status."
                  : "Coba buat transaksi terlebih dahulu agar muncul di sini."}
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {transactions.map((transaction) => (
              <div id={`transaction-card-${transaction.id}`} key={transaction.id}>
                <TransactionItem
                  transaction={transaction}
                  onTransactionUpdate={loadTransactions}
                  isHighlighted={transaction.id === highlightedTransactionId}
                />
              </div>
            ))}
          </div>
        )}

        {!isLoading && totalTransactions > 0 && totalPages > 1 && (
          <div className="mt-6 flex items-center justify-between border-t border-[var(--ui-border)] pt-4 dark:border-zinc-800">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
              disabled={currentPage === 1}
              className="rounded-xl border-[var(--ui-border)] bg-[var(--ui-card-alt)] text-[var(--ui-text)] hover:bg-[var(--ui-accent-bg)] hover:text-[var(--ui-accent)] dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
            >
              <ChevronLeft className="mr-1 h-4 w-4" />
              Previous
            </Button>
            <span className="text-sm text-[var(--ui-text-muted)] dark:text-zinc-400">
              Page {currentPage} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                setCurrentPage((prev) => Math.min(totalPages, prev + 1))
              }
              disabled={currentPage === totalPages}
              className="rounded-xl border-[var(--ui-border)] bg-[var(--ui-card-alt)] text-[var(--ui-text)] hover:bg-[var(--ui-accent-bg)] hover:text-[var(--ui-accent)] dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
            >
              Next
              <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          </div>
        )}
      </div>
    </ProtectedRoute>
  );
}
