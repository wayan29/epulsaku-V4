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
import { Badge } from "@/components/ui/badge";
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
  BellRing,
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
  type TransactionPendingAgingFilter,
} from "@/lib/transaction-utils";
import {
  CLAIMED_STALE_MINUTES,
  FOLLOW_UP_DUE_SOON_MINUTES,
  formatElapsedMinutesCompact,
  getClaimedStaleMinutes,
  getElapsedMinutes,
  getFollowUpState,
  getMinutesUntil,
  getPendingSlaState,
  isClaimedStale,
} from "@/lib/date-utils";
import { useToast } from "@/hooks/use-toast";
import ProtectedRoute from "@/components/core/ProtectedRoute";
import { useAuth } from "@/contexts/AuthContext";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

const ALL_CATEGORIES = "all_categories";
const ALL_STATUSES = "all_statuses";
const ALL_PROVIDERS = "all_providers";
const ALL_OPERATIONAL_FILTERS = "all";
const ALL_PENDING_AGING_FILTERS = "all";

type ProviderFilter = "all_providers" | "digiflazz" | "tokovoucher";

type NextActionReason =
  | "followup_overdue"
  | "breached"
  | "followup_due"
  | "warning"
  | "handover"
  | "claimed_stale"
  | "unclaimed"
  | "mine"
  | "no_note"
  | "stale_note";

type NextActionItem = {
  transaction: Transaction;
  reason: NextActionReason;
  helperText: string;
  score: number;
  pendingAgeMinutes: number | null;
  noteAgeMinutes: number | null;
};

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
  { label: "Klaim macet", value: "claimed_stale" },
  { label: "Klaim macet saya", value: "my_claimed_stale" },
  { label: "Perlu handover", value: "handover" },
  { label: "Follow-up segera", value: "followup_due" },
  { label: "Follow-up terlambat", value: "followup_overdue" },
  { label: "Follow-up saya segera", value: "my_followup_due" },
  { label: "Follow-up saya terlambat", value: "my_followup_overdue" },
];
const AVAILABLE_PENDING_AGING_FILTERS: {
  label: string;
  value: TransactionPendingAgingFilter;
}[] = [
  { label: "Semua pending", value: "all" },
  { label: "Mendekati SLA", value: "warning" },
  { label: "Lewat SLA", value: "breached" },
];

function normalizeOperationalFilter(
  value: string | null | undefined
): TransactionOperationalFilter {
  if (AVAILABLE_OPERATIONAL_FILTERS.some((option) => option.value === value)) {
    return value as TransactionOperationalFilter;
  }

  return "all";
}

function normalizePendingAgingFilter(
  value: string | null | undefined
): TransactionPendingAgingFilter {
  if (AVAILABLE_PENDING_AGING_FILTERS.some((option) => option.value === value)) {
    return value as TransactionPendingAgingFilter;
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

function getNextActionPresentation(reason: NextActionReason): {
  badgeClassName: string;
  label: string;
} {
  switch (reason) {
    case "followup_overdue":
      return {
        label: "Follow-up terlambat",
        badgeClassName:
          "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300",
      };
    case "breached":
      return {
        label: "Lewat SLA",
        badgeClassName:
          "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300",
      };
    case "followup_due":
      return {
        label: "Follow-up segera",
        badgeClassName:
          "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
      };
    case "warning":
      return {
        label: "Mendekati SLA",
        badgeClassName:
          "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
      };
    case "handover":
      return {
        label: "Perlu handover",
        badgeClassName:
          "border-orange-500/30 bg-orange-500/10 text-orange-700 dark:text-orange-300",
      };
    case "claimed_stale":
      return {
        label: "Klaim macet",
        badgeClassName:
          "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300",
      };
    case "unclaimed":
      return {
        label: "Belum diklaim",
        badgeClassName:
          "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300",
      };
    case "mine":
      return {
        label: "Klaim saya",
        badgeClassName:
          "border-[var(--ui-accent)]/25 bg-[var(--ui-accent-bg)] text-[var(--ui-accent)]",
      };
    case "no_note":
      return {
        label: "Belum ada catatan",
        badgeClassName:
          "border-violet-500/30 bg-violet-500/10 text-violet-700 dark:text-violet-300",
      };
    case "stale_note":
    default:
      return {
        label: "Catatan lama",
        badgeClassName:
          "border-[var(--ui-border)] bg-[var(--ui-card)] text-[var(--ui-text-muted)] dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300",
      };
  }
}

export default function TransactionsPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const highlightedTransactionId = searchParams.get("highlight")?.trim() || "";
  const queuedTransactionIds = useMemo(
    () =>
      searchParams
        .get("ids")
        ?.split(",")
        .map((id) => id.trim())
        .filter(Boolean) || [],
    [searchParams]
  );
  const queuedOperationalFilter = normalizeOperationalFilter(
    searchParams.get("queue")?.trim()
  );
  const queuedPendingAgingFilter = normalizePendingAgingFilter(
    searchParams.get("aging")?.trim()
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
  const [selectedTransactionIds, setSelectedTransactionIds] = useState<string[]>(queuedTransactionIds);
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
  const [selectedPendingAgingFilter, setSelectedPendingAgingFilter] =
    useState<TransactionPendingAgingFilter>(queuedPendingAgingFilter);
  const [searchInput, setSearchInput] = useState(queuedSearch);
  const [appliedSearch, setAppliedSearch] = useState(queuedSearch);

  const [itemsPerPage, setItemsPerPage] = useState<number>(queuedItemsPerPage);
  const [currentPage, setCurrentPage] = useState<number>(queuedPage);
  const [now, setNow] = useState(() => new Date());

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
        transactionIds: selectedTransactionIds.length > 0 ? selectedTransactionIds : undefined,
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
        pendingAging:
          selectedPendingAgingFilter !== ALL_PENDING_AGING_FILTERS
            ? selectedPendingAgingFilter
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
    selectedPendingAgingFilter,
    selectedProvider,
    selectedStatus,
    toast,
  ]);

  useEffect(() => {
    setSelectedCategory((current) => (current === queuedCategory ? current : queuedCategory));
    setSelectedTransactionIds((current) => {
      if (
        current.length === queuedTransactionIds.length &&
        current.every((value, index) => value === queuedTransactionIds[index])
      ) {
        return current;
      }

      return queuedTransactionIds;
    });
    setSelectedOperationalFilter((current) =>
      current === queuedOperationalFilter ? current : queuedOperationalFilter
    );
    setSelectedPendingAgingFilter((current) =>
      current === queuedPendingAgingFilter ? current : queuedPendingAgingFilter
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
    queuedTransactionIds,
    queuedPage,
    queuedPendingAgingFilter,
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

    if (selectedTransactionIds.length > 0) {
      params.set("ids", selectedTransactionIds.join(","));
    } else {
      params.delete("ids");
    }

    if (selectedProvider !== ALL_PROVIDERS) {
      params.set("provider", selectedProvider);
    } else {
      params.delete("provider");
    }

    if (selectedPendingAgingFilter !== ALL_PENDING_AGING_FILTERS) {
      params.set("aging", selectedPendingAgingFilter);
    } else {
      params.delete("aging");
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
    selectedTransactionIds,
    router,
    searchParams,
    selectedCategory,
    selectedOperationalFilter,
    selectedPendingAgingFilter,
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

  const pendingTransactions = useMemo(
    () => transactions.filter((transaction) => transaction.status === "Pending"),
    [transactions]
  );

  const pendingTransactionIds = pendingTransactions.map((transaction) => transaction.id);

  const followUpSummary = useMemo(() => {
    let activeCount = 0;
    let dueCount = 0;
    let overdueCount = 0;

    for (const transaction of pendingTransactions) {
      if (!transaction.followUp?.followUpAt) {
        continue;
      }

      activeCount += 1;
      const state = getFollowUpState(transaction.followUp.followUpAt, now);
      if (state === "due") {
        dueCount += 1;
      }
      if (state === "overdue") {
        overdueCount += 1;
      }
    }

    return {
      activeCount,
      dueCount,
      overdueCount,
    };
  }, [now, pendingTransactions]);

  const pendingAgingSummary = useMemo(() => {
    let warningCount = 0;
    let breachedCount = 0;
    let oldestMinutes: number | null = null;

    for (const transaction of pendingTransactions) {
      const elapsedMinutes = getElapsedMinutes(transaction.timestamp, now);
      const slaState = getPendingSlaState(transaction.timestamp, now);

      if (elapsedMinutes !== null) {
        oldestMinutes = oldestMinutes === null ? elapsedMinutes : Math.max(oldestMinutes, elapsedMinutes);
      }

      if (slaState === "warning") {
        warningCount += 1;
      }

      if (slaState === "breached") {
        breachedCount += 1;
      }
    }

    return {
      warningCount,
      breachedCount,
      oldestMinutes,
    };
  }, [now, pendingTransactions]);

  const nextActionItems = useMemo<NextActionItem[]>(() => {
    return pendingTransactions
      .map((transaction) => {
        const pendingAgeMinutes = getElapsedMinutes(transaction.timestamp, now);
        const noteAgeMinutes = transaction.lastInternalNoteAt
          ? getElapsedMinutes(transaction.lastInternalNoteAt, now)
          : null;
        const claimedStaleMinutes = getClaimedStaleMinutes(
          {
            claimedAt: transaction.claimedAt,
            lastInternalNoteAt: transaction.lastInternalNoteAt,
            followUpCreatedAt: transaction.followUp?.createdAt,
          },
          now
        );
        const followUpState = transaction.followUp?.followUpAt
          ? getFollowUpState(transaction.followUp.followUpAt, now)
          : null;
        const followUpMinutesUntil = transaction.followUp?.followUpAt
          ? getMinutesUntil(transaction.followUp.followUpAt, now)
          : null;
        const followUpOverdueMinutes =
          followUpMinutesUntil !== null && followUpMinutesUntil < 0
            ? Math.abs(followUpMinutesUntil)
            : null;
        const slaState = getPendingSlaState(transaction.timestamp, now);
        const isMine = Boolean(user?.id) && transaction.claimedByUserId === user?.id;
        const isUnclaimed = !transaction.claimedByUserId;
        const hasNote = Boolean(transaction.lastInternalNotePreview);
        const isHandover = transaction.internalPriority === "handover";
        const hasClaimedStaleSignal = isClaimedStale(
          {
            claimedAt: transaction.claimedAt,
            lastInternalNoteAt: transaction.lastInternalNoteAt,
            followUpCreatedAt: transaction.followUp?.createdAt,
          },
          now,
          CLAIMED_STALE_MINUTES
        );
        const isStaleNote =
          hasNote && noteAgeMinutes !== null && noteAgeMinutes >= CLAIMED_STALE_MINUTES;

        let reason: NextActionReason = "stale_note";
        let score = 0;
        let helperText = pendingAgeMinutes === null
          ? "Pending aktif di halaman ini."
          : `Usia pending ${formatElapsedMinutesCompact(pendingAgeMinutes)}.`;

        if (followUpState === "overdue") {
          reason = "followup_overdue";
          score = 900;
          helperText = followUpOverdueMinutes === null
            ? "Follow-up transaksi ini sudah terlambat."
            : `Follow-up terlambat ${formatElapsedMinutesCompact(followUpOverdueMinutes)}.`;
        } else if (slaState === "breached") {
          reason = "breached";
          score = 700;
          helperText = pendingAgeMinutes === null
            ? "Pending ini sudah lewat SLA."
            : `Lewat SLA dengan usia ${formatElapsedMinutesCompact(pendingAgeMinutes)}.`;
        } else if (followUpState === "due") {
          reason = "followup_due";
          score = 650;
          helperText = followUpMinutesUntil === null
            ? "Follow-up transaksi ini perlu dicek sekarang."
            : followUpMinutesUntil <= 0
              ? "Follow-up jatuh tempo sekarang."
              : `Follow-up jatuh tempo ${formatElapsedMinutesCompact(followUpMinutesUntil)} lagi.`;
        } else if (slaState === "warning") {
          reason = "warning";
          score = 600;
          helperText = pendingAgeMinutes === null
            ? "Pending ini mendekati SLA."
            : `Perlu dipantau sebelum lewat SLA (${formatElapsedMinutesCompact(pendingAgeMinutes)}).`;
        } else if (isHandover) {
          reason = "handover";
          score = 500;
          helperText = transaction.lastInternalNotePreview
            ? `Sudah ditandai untuk sif berikutnya. ${transaction.lastInternalNotePreview}`
            : "Sudah ditandai untuk sif berikutnya.";
        } else if (hasClaimedStaleSignal) {
          reason = "claimed_stale";
          score = 450;
          helperText = claimedStaleMinutes === null
            ? "Transaksi ini sudah lama diklaim tanpa update operasional baru."
            : transaction.claimedByUsername
              ? `Tidak ada update operasional ${formatElapsedMinutesCompact(claimedStaleMinutes)} dari ${transaction.claimedByUsername}.`
              : `Tidak ada update operasional ${formatElapsedMinutesCompact(claimedStaleMinutes)} sejak klaim terakhir.`;
        } else if (isUnclaimed) {
          reason = "unclaimed";
          score = 400;
          helperText = "Belum ada staf yang mengambil transaksi pending ini.";
        } else if (isMine) {
          reason = "mine";
          score = 300;
          helperText = transaction.claimedByUsername
            ? `Sedang ditangani oleh ${transaction.claimedByUsername}.`
            : "Sedang Anda tangani saat ini.";
        } else if (!hasNote) {
          reason = "no_note";
          score = 200;
          helperText = "Belum ada catatan internal untuk konteks lanjutan.";
        } else if (isStaleNote) {
          reason = "stale_note";
          score = 100;
          helperText = `Catatan terakhir ${formatElapsedMinutesCompact(noteAgeMinutes)} lalu.`;
        } else {
          return null;
        }

        if (transaction.provider === "tokovoucher") {
          score += 10;
          if (
            reason !== "followup_overdue" &&
            reason !== "breached" &&
            reason !== "followup_due" &&
            reason !== "warning"
          ) {
            helperText = `${helperText} Bisa direfresh manual dari server.`;
          }
        }

        if (pendingAgeMinutes !== null) {
          score += Math.min(pendingAgeMinutes, 180);
        }

        if (reason === "followup_due" && followUpMinutesUntil !== null) {
          score += Math.max(0, FOLLOW_UP_DUE_SOON_MINUTES - Math.max(followUpMinutesUntil, 0));
        }

        if (reason === "followup_overdue" && followUpOverdueMinutes !== null) {
          score += Math.min(followUpOverdueMinutes, 120);
        }

        if (!hasNote) {
          score += 20;
        } else if (noteAgeMinutes !== null) {
          score += Math.min(noteAgeMinutes, 60);
        }

        return {
          transaction,
          reason,
          helperText,
          score,
          pendingAgeMinutes,
          noteAgeMinutes,
        };
      })
      .filter((item): item is NextActionItem => item !== null)
      .sort((left, right) => {
        if (right.score !== left.score) {
          return right.score - left.score;
        }

        const rightPendingAge = right.pendingAgeMinutes ?? -1;
        const leftPendingAge = left.pendingAgeMinutes ?? -1;
        if (rightPendingAge !== leftPendingAge) {
          return rightPendingAge - leftPendingAge;
        }

        const rightNoteAge = right.noteAgeMinutes ?? Number.MAX_SAFE_INTEGER;
        const leftNoteAge = left.noteAgeMinutes ?? Number.MAX_SAFE_INTEGER;
        if (rightNoteAge !== leftNoteAge) {
          return rightNoteAge - leftNoteAge;
        }

        return right.transaction.timestamp.localeCompare(left.transaction.timestamp);
      })
      .slice(0, 5);
  }, [now, pendingTransactions, user?.id]);

  const highlightedTransaction = useMemo(
    () => transactions.find((transaction) => transaction.id === highlightedTransactionId),
    [transactions, highlightedTransactionId]
  );

  useEffect(() => {
    if (pendingTransactions.length === 0) {
      return;
    }

    const intervalId = window.setInterval(() => {
      setNow(new Date());
    }, 60000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [pendingTransactions.length]);

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

  const handleFocusTransaction = (transactionId: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("highlight", transactionId);
    const nextQuery = params.toString();
    router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname, {
      scroll: false,
    });
  };

  const handleResetHandoverFilter = () => {
    setSelectedTransactionIds([]);
    const params = new URLSearchParams(searchParams.toString());
    params.delete("ids");
    params.delete("highlight");
    const nextQuery = params.toString();
    router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname, {
      scroll: false,
    });
  };

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
    setSelectedPendingAgingFilter(ALL_PENDING_AGING_FILTERS);
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
    selectedPendingAgingFilter !== ALL_PENDING_AGING_FILTERS ||
    appliedSearch !== "" ||
    itemsPerPage !== DEFAULT_ITEMS_PER_PAGE;

  const activeFilterCount = [
    selectedCategory !== ALL_CATEGORIES,
    selectedStatus !== ALL_STATUSES,
    dateRange !== undefined,
    selectedProvider !== ALL_PROVIDERS,
    selectedOperationalFilter !== ALL_OPERATIONAL_FILTERS,
    selectedPendingAgingFilter !== ALL_PENDING_AGING_FILTERS,
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
                      htmlFor="pending-aging-filter-sheet"
                      className="text-sm font-medium text-[var(--ui-text)] dark:text-zinc-100"
                    >
                      SLA Pending
                    </Label>
                    <Select
                      value={selectedPendingAgingFilter}
                      onValueChange={(value) => {
                        setSelectedPendingAgingFilter(value as TransactionPendingAgingFilter);
                        setCurrentPage(1);
                      }}
                    >
                      <SelectTrigger
                        id="pending-aging-filter-sheet"
                        className="rounded-xl border-[var(--ui-input-border)] bg-[var(--ui-input-bg)] text-[var(--ui-text)] focus:ring-[var(--ui-accent)] dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                      >
                        <div className="flex items-center gap-2">
                          <AlertTriangle className="h-4 w-4 text-[var(--ui-text-secondary)] dark:text-zinc-500" />
                          <SelectValue placeholder="Pilih usia pending" />
                        </div>
                      </SelectTrigger>
                      <SelectContent>
                        {AVAILABLE_PENDING_AGING_FILTERS.map((option) => (
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
          <CardContent className="grid gap-3 p-4 sm:gap-4 sm:p-6 lg:grid-cols-[minmax(0,1fr)_240px] lg:items-end">
            <div className="space-y-3 sm:space-y-4">
              <div className="grid gap-2.5 rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-card-alt)] p-3 dark:border-zinc-800 dark:bg-zinc-900 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] sm:gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--ui-text-secondary)] dark:text-zinc-500">
                    Antrean operasional
                  </p>
                  <p className="mt-1 text-[11px] leading-4 text-[var(--ui-text-muted)] dark:text-zinc-400 sm:text-xs sm:leading-5">
                    Pilih antrean kerja staf.
                  </p>
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--ui-text-secondary)] dark:text-zinc-500">
                    Prioritas SLA pending
                  </p>
                  <p className="mt-1 text-[11px] leading-4 text-[var(--ui-text-muted)] dark:text-zinc-400 sm:text-xs sm:leading-5">
                    Fokus ke pending aman, warning, atau breach.
                  </p>
                </div>
                <div className="flex flex-wrap gap-1.5 sm:gap-2">
                  {AVAILABLE_OPERATIONAL_FILTERS.map((option) => {
                    const isActive = selectedOperationalFilter === option.value;
                    const Icon = option.value === "mine"
                      ? Hand
                      : option.value === "handover"
                        ? Flag
                        : option.value === "followup_due" || option.value === "followup_overdue"
                          ? BellRing
                          : Filter;

                    return (
                      <Button
                        key={option.value}
                        type="button"
                        variant="outline"
                        onClick={() => {
                          setSelectedOperationalFilter(option.value);
                          setCurrentPage(1);
                        }}
                        className={`h-8 rounded-full px-3 text-[11px] sm:h-10 sm:px-4 sm:text-sm ${
                          isActive
                            ? "border-[var(--ui-accent)]/25 bg-[var(--ui-accent-bg)] text-[var(--ui-accent)] hover:bg-[var(--ui-accent-bg)]"
                            : "border-[var(--ui-border)] bg-[var(--ui-card)] text-[var(--ui-text-muted)] hover:bg-[var(--ui-accent-bg)] hover:text-[var(--ui-text)] dark:border-zinc-800 dark:bg-zinc-950"
                        }`}
                      >
                        <Icon className="mr-2 h-4 w-4" />
                        {option.label}
                      </Button>
                    );
                  })}
                </div>
                <div className="flex flex-wrap gap-1.5 sm:gap-2">
                  {AVAILABLE_PENDING_AGING_FILTERS.map((option) => {
                    const isActive = selectedPendingAgingFilter === option.value;
                    const toneClass =
                      option.value === "breached"
                        ? isActive
                          ? "border-red-500/30 bg-red-500/10 text-red-700 hover:bg-red-500/15 dark:text-red-300"
                          : "border-[var(--ui-border)] bg-[var(--ui-card)] text-[var(--ui-text-muted)] hover:border-red-500/20 hover:bg-red-500/10 hover:text-red-700 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400 dark:hover:text-red-300"
                        : option.value === "warning"
                          ? isActive
                            ? "border-amber-500/30 bg-amber-500/10 text-amber-700 hover:bg-amber-500/15 dark:text-amber-300"
                            : "border-[var(--ui-border)] bg-[var(--ui-card)] text-[var(--ui-text-muted)] hover:border-amber-500/20 hover:bg-amber-500/10 hover:text-amber-700 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400 dark:hover:text-amber-300"
                          : isActive
                            ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/15 dark:text-emerald-300"
                            : "border-[var(--ui-border)] bg-[var(--ui-card)] text-[var(--ui-text-muted)] hover:border-emerald-500/20 hover:bg-emerald-500/10 hover:text-emerald-700 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400 dark:hover:text-emerald-300";

                    return (
                      <Button
                        key={option.value}
                        type="button"
                        variant="outline"
                        onClick={() => {
                          setSelectedPendingAgingFilter(option.value);
                          setCurrentPage(1);
                        }}
                        className={`h-8 rounded-full px-3 text-[11px] sm:h-10 sm:px-4 sm:text-sm ${toneClass}`}
                      >
                        <AlertTriangle className="mr-2 h-4 w-4" />
                        {option.label}
                      </Button>
                    );
                  })}
                </div>
              </div>
              <div>
                <Label
                  htmlFor="transaction-search"
                  className="text-sm font-medium text-[var(--ui-text)] dark:text-zinc-100"
                >
                  Cari Transaksi
                </Label>
                <p className="mt-1 text-[11px] leading-4 text-[var(--ui-text-secondary)] dark:text-zinc-500 sm:text-xs sm:leading-5">
                  Cari ID referensi, pelanggan, produk, SN, provider ID, merek, atau SKU.
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
                    className="h-10 rounded-xl border-[var(--ui-input-border)] bg-[var(--ui-input-bg)] pl-10 text-sm text-[var(--ui-text)] placeholder:text-[var(--ui-text-secondary)] focus-visible:ring-[var(--ui-accent)] dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 sm:h-11"
                  />
                </div>
                <div className="flex gap-2">
                  {searchInput !== "" && (
                    <Button
                      variant="outline"
                      onClick={handleClearSearch}
                      className="h-10 rounded-xl border-[var(--ui-border)] bg-[var(--ui-card-alt)] px-3 text-sm text-[var(--ui-text)] hover:bg-[var(--ui-accent-bg)] dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100 sm:h-11"
                    >
                      <X className="mr-2 h-4 w-4" />
                      Hapus
                    </Button>
                  )}
                  <Button
                    onClick={handleApplySearch}
                    className="h-10 rounded-xl bg-[var(--ui-accent)] px-4 text-sm text-white hover:bg-[var(--ui-accent-hover)] sm:h-11"
                  >
                    <Search className="mr-2 h-4 w-4" />
                    Cari
                  </Button>
                </div>
              </div>
            </div>

            <div className="relative rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-card-alt)] p-3.5 dark:border-zinc-800 dark:bg-zinc-900 sm:p-4">
              {isLoading && (
                <div className="absolute inset-0 z-10 flex items-center justify-center rounded-2xl bg-[var(--ui-card-alt)]/80 backdrop-blur-[2px] dark:bg-zinc-900/80">
                  <div className="flex items-center gap-2 rounded-full border border-[var(--ui-border)] bg-[var(--ui-card)] px-4 py-2 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-[var(--ui-accent)]" />
                    <span className="text-xs font-medium text-[var(--ui-text-muted)] dark:text-zinc-400">Memuat...</span>
                  </div>
                </div>
              )}
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-medium uppercase tracking-[0.18em] text-[var(--ui-text-secondary)] dark:text-zinc-500">
                    Ringkasan Hasil
                  </p>
                  <p className="mt-1.5 text-xl font-semibold text-[var(--ui-text)] dark:text-zinc-100 sm:mt-2 sm:text-2xl">
                    {totalTransactions.toLocaleString("id-ID")}
                  </p>
                  <p className="mt-1 text-xs leading-5 text-[var(--ui-text-muted)] dark:text-zinc-400 sm:text-sm">
                    {transactions.length.toLocaleString("id-ID")} baris di halaman
                    {" "}{currentPage} dari {totalPages}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1.5">
                  {selectedOperationalFilter !== ALL_OPERATIONAL_FILTERS && (
                    <Badge
                      variant="outline"
                      className="border-[var(--ui-accent)]/25 bg-[var(--ui-accent-bg)] text-[10px] text-[var(--ui-accent)] dark:border-[var(--ui-accent)]/30 dark:bg-[var(--ui-accent)]/10"
                    >
                      {AVAILABLE_OPERATIONAL_FILTERS.find((f) => f.value === selectedOperationalFilter)?.label ?? "Kustom"}
                    </Badge>
                  )}
                  <Badge
                    variant="outline"
                    className="border-[var(--ui-border)] bg-[var(--ui-card)] text-[10px] text-[var(--ui-text-muted)] dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400"
                  >
                    {selectedPendingAgingFilter === "all"
                      ? "Semua SLA"
                      : selectedPendingAgingFilter === "warning"
                        ? "Fokus warning"
                        : "Fokus breach"}
                  </Badge>
                </div>
              </div>
              <div className="mt-3 grid gap-1.5 text-[11px] text-[var(--ui-text-secondary)] dark:text-zinc-500 sm:mt-4 sm:gap-2 sm:text-xs">
                <div className="flex items-center justify-between rounded-xl border border-[var(--ui-border)] bg-[var(--ui-card)] px-3 py-2 dark:border-zinc-800 dark:bg-zinc-950">
                  <span>Pending di halaman</span>
                  <span className={`font-semibold ${isLoading ? "animate-pulse text-[var(--ui-text-muted)] dark:text-zinc-500" : "text-[var(--ui-text)] dark:text-zinc-100"}`}>
                    {isLoading ? "..." : pendingTransactions.length}
                  </span>
                </div>
                <div className="flex items-center justify-between rounded-xl border border-[var(--ui-border)] bg-[var(--ui-card)] px-3 py-2 dark:border-zinc-800 dark:bg-zinc-950">
                  <span>Mendekati SLA</span>
                  <span className={`font-semibold ${isLoading ? "animate-pulse text-[var(--ui-text-muted)] dark:text-zinc-500" : "text-amber-600 dark:text-amber-300"}`}>
                    {isLoading ? "..." : pendingAgingSummary.warningCount}
                  </span>
                </div>
                <div className="flex items-center justify-between rounded-xl border border-[var(--ui-border)] bg-[var(--ui-card)] px-3 py-2 dark:border-zinc-800 dark:bg-zinc-950">
                  <span>Lewat SLA</span>
                  <span className={`font-semibold ${isLoading ? "animate-pulse text-[var(--ui-text-muted)] dark:text-zinc-500" : "text-red-600 dark:text-red-300"}`}>
                    {isLoading ? "..." : pendingAgingSummary.breachedCount}
                  </span>
                </div>
                <div className="flex items-center justify-between rounded-xl border border-[var(--ui-border)] bg-[var(--ui-card)] px-3 py-2 dark:border-zinc-800 dark:bg-zinc-950">
                  <span>Follow-up aktif</span>
                  <span className={`font-semibold ${isLoading ? "animate-pulse text-[var(--ui-text-muted)] dark:text-zinc-500" : "text-[var(--ui-text)] dark:text-zinc-100"}`}>
                    {isLoading ? "..." : followUpSummary.activeCount}
                  </span>
                </div>
                <div className="flex items-center justify-between rounded-xl border border-[var(--ui-border)] bg-[var(--ui-card)] px-3 py-2 dark:border-zinc-800 dark:bg-zinc-950">
                  <span>Follow-up segera</span>
                  <span className={`font-semibold ${isLoading ? "animate-pulse text-[var(--ui-text-muted)] dark:text-zinc-500" : "text-amber-600 dark:text-amber-300"}`}>
                    {isLoading ? "..." : followUpSummary.dueCount}
                  </span>
                </div>
                <div className="flex items-center justify-between rounded-xl border border-[var(--ui-border)] bg-[var(--ui-card)] px-3 py-2 dark:border-zinc-800 dark:bg-zinc-950">
                  <span>Follow-up terlambat</span>
                  <span className={`font-semibold ${isLoading ? "animate-pulse text-[var(--ui-text-muted)] dark:text-zinc-500" : "text-red-600 dark:text-red-300"}`}>
                    {isLoading ? "..." : followUpSummary.overdueCount}
                  </span>
                </div>
                <div className="flex items-center justify-between rounded-xl border border-[var(--ui-border)] bg-[var(--ui-card)] px-3 py-2 dark:border-zinc-800 dark:bg-zinc-950">
                  <span>Diklaim di halaman</span>
                  <span className={`font-semibold ${isLoading ? "animate-pulse text-[var(--ui-text-muted)] dark:text-zinc-500" : "text-[var(--ui-text)] dark:text-zinc-100"}`}>
                    {isLoading ? "..." : transactions.filter((transaction) => !!transaction.claimedByUserId).length}
                  </span>
                </div>
                <div className="flex items-center justify-between rounded-xl border border-[var(--ui-border)] bg-[var(--ui-card)] px-3 py-2 dark:border-zinc-800 dark:bg-zinc-950">
                  <span>Pending tertua</span>
                  <span className={`font-semibold ${isLoading ? "animate-pulse text-[var(--ui-text-muted)] dark:text-zinc-500" : "text-[var(--ui-text)] dark:text-zinc-100"}`}>
                    {isLoading ? "..." : pendingAgingSummary.oldestMinutes === null
                      ? "-"
                      : formatElapsedMinutesCompact(pendingAgingSummary.oldestMinutes)}
                  </span>
                </div>
                <div className="flex items-center justify-between rounded-xl border border-[var(--ui-border)] bg-[var(--ui-card)] px-3 py-2 dark:border-zinc-800 dark:bg-zinc-950">
                  <span>Perlu handover</span>
                  <span className={`font-semibold ${isLoading ? "animate-pulse text-[var(--ui-text-muted)] dark:text-zinc-500" : "text-[var(--ui-text)] dark:text-zinc-100"}`}>
                    {isLoading ? "..." : transactions.filter((transaction) => transaction.internalPriority === "handover").length}
                  </span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-3xl border-[var(--ui-border)] bg-[var(--ui-card)] shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          <CardContent className="grid gap-3 p-5 text-sm text-[var(--ui-text-muted)] dark:text-zinc-400 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
            <div className="space-y-2">
              <p>
                Pending TokoVoucher bisa direfresh manual dari server. Pending
                Digiflazz menunggu update webhook supaya tidak memanggil endpoint
                transaksi lagi dari browser.
              </p>
              <p>
                Setiap kartu transaksi juga sudah menjadi pusat kerja staf: klaim
                transaksi, pantau SLA, baca catatan internal terbaru, lalu buka
                detail untuk melihat timeline aktivitas lengkap.
              </p>
            </div>
            <div className="flex flex-wrap gap-2 text-xs uppercase tracking-[0.18em] text-[var(--ui-text-secondary)] dark:text-zinc-500">
              <Badge variant="outline" className="border-[var(--ui-border)] bg-[var(--ui-card-alt)] dark:border-zinc-800 dark:bg-zinc-900">
                Refresh dikendalikan server
              </Badge>
              <Badge variant="outline" className="border-[var(--ui-border)] bg-[var(--ui-card-alt)] dark:border-zinc-800 dark:bg-zinc-900">
                Catatan + timeline aktif
              </Badge>
            </div>
          </CardContent>
        </Card>

        {nextActionItems.length > 0 && (
          <Card className="rounded-3xl border-[var(--ui-border)] bg-[var(--ui-surface)] shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
            <CardContent className="space-y-4 p-4 sm:p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--ui-text-secondary)] dark:text-zinc-500">
                    Perlu ditindak sekarang
                  </p>
                  <h2 className="mt-1 text-lg font-semibold text-[var(--ui-text)] dark:text-zinc-100 sm:text-xl">
                    Prioritas otomatis dari transaksi pending di halaman ini
                  </h2>
                  <p className="mt-1 text-xs leading-5 text-[var(--ui-text-muted)] dark:text-zinc-400 sm:text-sm">
                    Urutan ini membantu staf memilih transaksi yang paling mendesak dari daftar yang sedang terlihat, tanpa mengubah filter aktif.
                  </p>
                </div>
                <Badge
                  variant="outline"
                  className="w-fit border-[var(--ui-border)] bg-[var(--ui-card-alt)] text-[10px] uppercase tracking-[0.16em] text-[var(--ui-text-muted)] dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400"
                >
                  {nextActionItems.length} prioritas teratas
                </Badge>
              </div>

              <div className="grid gap-3 xl:grid-cols-2">
                {nextActionItems.map((item) => {
                  const presentation = getNextActionPresentation(item.reason);
                  const transactionIdSuffix = item.transaction.id.slice(-8);

                  return (
                    <button
                      key={item.transaction.id}
                      type="button"
                      onClick={() => handleFocusTransaction(item.transaction.id)}
                      className="rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-card-alt)] p-3 text-left transition-colors hover:border-[var(--ui-accent)]/25 hover:bg-[var(--ui-accent-bg)]/60 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-sky-400/30 dark:hover:bg-sky-500/10"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <p className="text-sm font-semibold text-[var(--ui-text)] dark:text-zinc-100">
                            {item.transaction.productName}
                          </p>
                          <p className="mt-1 text-xs text-[var(--ui-text-secondary)] dark:text-zinc-500">
                            REF ...{transactionIdSuffix} • {item.transaction.provider === "tokovoucher" ? "TokoVoucher" : "Digiflazz"}
                          </p>
                        </div>
                        <Badge variant="outline" className={presentation.badgeClassName}>
                          {presentation.label}
                        </Badge>
                      </div>

                      <p className="mt-3 text-sm leading-5 text-[var(--ui-text-muted)] dark:text-zinc-400">
                        {item.helperText}
                      </p>

                      <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-[var(--ui-text-secondary)] dark:text-zinc-500">
                        {item.pendingAgeMinutes !== null && (
                          <span className="rounded-full border border-[var(--ui-border)] bg-[var(--ui-card)] px-2.5 py-1 dark:border-zinc-800 dark:bg-zinc-950">
                            Usia {formatElapsedMinutesCompact(item.pendingAgeMinutes)}
                          </span>
                        )}
                        {item.transaction.claimedByUsername && (
                          <span className="rounded-full border border-[var(--ui-border)] bg-[var(--ui-card)] px-2.5 py-1 dark:border-zinc-800 dark:bg-zinc-950">
                            {item.transaction.claimedByUserId === user?.id
                              ? "Klaim saya"
                              : `PIC ${item.transaction.claimedByUsername}`}
                          </span>
                        )}
                        {item.reason === "claimed_stale" && (
                          <span className="rounded-full border border-red-500/30 bg-red-500/10 px-2.5 py-1 text-red-700 dark:text-red-300">
                            Klaim macet
                          </span>
                        )}
                        {item.transaction.internalPriority === "handover" && (
                          <span className="rounded-full border border-orange-500/30 bg-orange-500/10 px-2.5 py-1 text-orange-700 dark:text-orange-300">
                            Butuh handover
                          </span>
                        )}
                        {item.transaction.lastInternalNotePreview && (
                          <span className="rounded-full border border-[var(--ui-border)] bg-[var(--ui-card)] px-2.5 py-1 dark:border-zinc-800 dark:bg-zinc-950">
                            Ada catatan
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {(highlightedTransactionId || selectedTransactionIds.length > 0) && (
          <Card className={`rounded-3xl border shadow-sm ${highlightedTransactionId && !highlightedTransaction ? "border-amber-500/30 bg-amber-500/10 dark:border-amber-400/30 dark:bg-amber-500/10" : "border-[var(--ui-accent)]/30 bg-[var(--ui-accent-bg)]/60 dark:border-sky-400/30 dark:bg-sky-500/10"}`}>
            <CardContent className="flex flex-col gap-2 p-5 text-sm sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-semibold text-[var(--ui-text)] dark:text-zinc-100">
                  {highlightedTransactionId
                    ? highlightedTransaction
                      ? `Transaksi ${highlightedTransactionId} ditemukan dari handover.`
                      : `Transaksi ${highlightedTransactionId} belum muncul di halaman ini.`
                    : `Menampilkan ${selectedTransactionIds.length} transaksi pilihan dari handover terakhir.`}
                </p>
                <p className="text-[var(--ui-text-muted)] dark:text-zinc-400">
                  {highlightedTransactionId
                    ? highlightedTransaction
                      ? "Kartu transaksi terkait sudah diberi highlight agar mudah ditemukan."
                      : "Coba ubah filter, pencarian, atau halaman agar transaksi target terlihat."
                    : "Daftar ini sudah dipersempit ke transaksi yang dikirim dari hasil handover."}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {highlightedTransaction ? (
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
                ) : null}
                {selectedTransactionIds.length > 0 ? (
                  <Button
                    variant="outline"
                    onClick={handleResetHandoverFilter}
                    className="rounded-xl border-[var(--ui-border)] text-[var(--ui-text-muted)] hover:bg-[var(--ui-card)] hover:text-[var(--ui-text)] dark:border-zinc-700"
                  >
                    Reset filter handover ini
                  </Button>
                ) : null}
              </div>
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
                  now={now}
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
