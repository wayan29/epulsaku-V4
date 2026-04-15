"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DateRange } from "react-day-picker";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  XAxis,
  YAxis,
} from "recharts";
import {
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  CalendarIcon as CalendarIconLucide,
  ChartColumnBig,
  ClipboardList,
  FileText,
  Filter,
  History,
  Loader2,
  ReceiptText,
  RefreshCw,
  Settings,
  ShieldAlert,
  ShoppingCart,
  Sparkles,
  TrendingUp,
  Wallet,
  XCircle,
} from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/contexts/AuthContext";
import {
  getDashboardSummary,
  type DashboardHighlight,
  type DashboardHealthCard,
  type DashboardMetricKey,
  type DashboardStatusRow,
  type DashboardSummary,
} from "@/lib/dashboard-utils";
import {
  listShiftHandoversFromDB,
  listTransactionsFromDB,
  type ShiftHandoverRecord,
} from "@/lib/transaction-utils";

const metricConfig: Record<
  DashboardMetricKey,
  { label: string; icon: typeof BarChart3; color: string; helper: string }
> = {
  transactions: {
    label: "Volume",
    icon: BarChart3,
    color: "#D35400",
    helper: "Jumlah transaksi pada rentang aktif.",
  },
  revenue: {
    label: "Omzet",
    icon: TrendingUp,
    color: "#10B981",
    helper: "Nilai jual transaksi sukses.",
  },
  cost: {
    label: "Modal",
    icon: Wallet,
    color: "#F59E0B",
    helper: "Total biaya transaksi sukses.",
  },
  profit: {
    label: "Keuntungan",
    icon: Sparkles,
    color: "#3B82F6",
    helper: "Omzet dikurangi modal.",
  },
};

const baseQuickActions = [
  {
    href: "/transactions",
    label: "Tinjau Transaksi",
    description: "Lihat transaksi pending, gagal, dan riwayat detail.",
    icon: History,
    permission: "riwayat_transaksi",
  },
  {
    href: "/transactions?queue=mine",
    label: "Klaim Saya",
    description: "Buka antrean pending yang sedang diklaim oleh akun aktif.",
    icon: ClipboardList,
    permission: "riwayat_transaksi",
  },
  {
    href: "/transactions?queue=unclaimed",
    label: "Antrean Belum Diklaim",
    description: "Buka antrean pending yang belum diambil staf mana pun.",
    icon: History,
    permission: "riwayat_transaksi",
  },
  {
    href: "/transactions?queue=others",
    label: "Klaim Staf Lain",
    description: "Fokus ke antrean pending yang sedang diklaim staf lain.",
    icon: ShieldAlert,
    permission: "riwayat_transaksi",
  },
  {
    href: "/transactions?queue=handover",
    label: "Perlu handover",
    description: "Fokus ke antrean pending yang sudah ditandai untuk sif berikutnya.",
    icon: ClipboardList,
    permission: "riwayat_transaksi",
  },
  {
    href: "/profit-report",
    label: "Buka Laporan Keuntungan",
    description: "Buka laporan keuntungan lengkap dengan ekspor.",
    icon: FileText,
    permission: "laporan_profit",
  },
  {
    href: "/order/tokovoucher",
    label: "Buat Order",
    description: "Masuk ke pemesanan TokoVoucher dari dashboard.",
    icon: ShoppingCart,
    permission: "layanan_tokovoucher",
  },
  {
    href: "/price-settings",
    label: "Pengaturan Harga",
    description: "Sesuaikan markup dan harga jual Digiflazz.",
    icon: Settings,
    permission: "pengaturan_harga_digiflazz",
  },
];

type SheetView = "status" | "brands" | "providers" | null;

interface OperationalDashboardData {
  pendingTransactions: Awaited<ReturnType<typeof listTransactionsFromDB>>["transactions"];
  openHandovers: ShiftHandoverRecord[];
  recentHandovers: ShiftHandoverRecord[];
}

function createDefaultRange(): DateRange {
  const today = new Date();
  const from = new Date(today);
  from.setDate(today.getDate() - 6);

  return {
    from,
    to: today,
  };
}

function formatCurrency(value: number): string {
  return `Rp ${Math.round(value).toLocaleString("id-ID")}`;
}

function formatCompact(value: number): string {
  return new Intl.NumberFormat("id-ID", {
    notation: "compact",
    maximumFractionDigits: value >= 100 ? 0 : 1,
  }).format(value);
}

function formatPercent(value: number): string {
  return `${value.toFixed(value >= 10 ? 0 : 1)}%`;
}

function formatTimestamp(value: string): string {
  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function getActiveWindowDescription(label: string, days: number): string {
  if (label === "7 Hari Terakhir") {
    return label;
  }

  if (label === "30 Hari Terakhir") {
    return label;
  }

  if (label === "Bulan Ini") {
    return label;
  }

  if (label === "Tahun Ini") {
    return label;
  }

  return `${label} • ${days} hari`;
}

function deltaTone(value: number | null): string {
  if (value === null) return "text-[var(--ui-text-secondary)] dark:text-zinc-500";
  if (value > 0) return "text-emerald-600 dark:text-emerald-400";
  if (value < 0) return "text-rose-600 dark:text-rose-400";
  return "text-[var(--ui-text-secondary)] dark:text-zinc-500";
}

function toneSurface(tone: DashboardHealthCard["tone"] | DashboardHighlight["tone"]) {
  switch (tone) {
    case "positive":
      return "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-500/10 dark:text-emerald-300";
    case "warning":
      return "border-amber-500/20 bg-amber-500/10 text-amber-700 dark:border-amber-400/20 dark:bg-amber-500/10 dark:text-amber-300";
    case "danger":
      return "border-rose-500/20 bg-rose-500/10 text-rose-700 dark:border-rose-400/20 dark:bg-rose-500/10 dark:text-rose-300";
    case "accent":
      return "border-[var(--ui-accent)]/20 bg-[var(--ui-accent-bg)] text-[var(--ui-accent)] dark:border-sky-400/20 dark:bg-sky-500/10 dark:text-sky-300";
    default:
      return "border-[var(--ui-border)] bg-[var(--ui-card-alt)] text-[var(--ui-text-muted)] dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400";
  }
}

function DashboardSkeleton() {
  return (
    <div className="mx-auto max-w-7xl space-y-4 pb-10 sm:space-y-6">
      <div className="flex items-center gap-3 sm:gap-4">
        <Skeleton className="h-10 w-10 shrink-0 rounded-2xl sm:h-12 sm:w-12" />
        <div className="min-w-0 space-y-2">
          <Skeleton className="h-6 w-48 sm:h-7 sm:w-64" />
          <Skeleton className="h-4 w-full max-w-[280px] sm:max-w-[384px]" />
        </div>
      </div>
      <Card className="rounded-2xl border-[var(--ui-border)] bg-[var(--ui-surface)] sm:rounded-3xl dark:border-zinc-800 dark:bg-zinc-950">
        <CardContent className="grid gap-3 p-4 sm:gap-4 sm:p-6 md:grid-cols-3">
          <Skeleton className="h-12 rounded-xl md:col-span-2" />
          <Skeleton className="h-12 rounded-xl" />
        </CardContent>
      </Card>
      <div className="grid gap-3 sm:gap-4 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <Card key={index} className="rounded-2xl border-[var(--ui-border)] bg-[var(--ui-card)] sm:rounded-3xl dark:border-zinc-800 dark:bg-zinc-950">
            <CardContent className="space-y-3 p-4 sm:space-y-4 sm:p-6">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-8 w-32" />
              <Skeleton className="h-4 w-20" />
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="grid gap-4 sm:gap-6 xl:grid-cols-[1.6fr,1fr]">
        <Skeleton className="h-[300px] rounded-2xl sm:h-[420px] sm:rounded-3xl" />
        <Skeleton className="h-[300px] rounded-2xl sm:h-[420px] sm:rounded-3xl" />
      </div>
    </div>
  );
}

function MetricDelta({
  value,
  label,
}: {
  value: number | null;
  label: string;
}) {
  if (value === null) {
    return (
      <div className="text-xs text-[var(--ui-text-secondary)] dark:text-zinc-500">
        {label}: n/a
      </div>
    );
  }

  const Icon = value >= 0 ? ArrowUpRight : ArrowDownRight;

  return (
    <div className={`flex items-center gap-1 text-xs font-medium ${deltaTone(value)}`}>
      <Icon className="h-3.5 w-3.5" />
      {label}: {value > 0 ? "+" : ""}
      {value.toFixed(1)}%
    </div>
  );
}

function StatusProgress({ item }: { item: DashboardStatusRow }) {
  const toneClass = toneSurface(item.tone);

  return (
    <div className="rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-card-alt)] p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-[var(--ui-text)] dark:text-zinc-100">
            {item.label}
          </p>
          <p className="text-xs text-[var(--ui-text-muted)] dark:text-zinc-400">
            {item.count.toLocaleString("id-ID")} transaksi
          </p>
        </div>
        <div className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${toneClass}`}>
          {formatPercent(item.share)}
        </div>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-[var(--ui-border)]/70 dark:bg-zinc-800">
        <div
          className={`h-full rounded-full ${item.tone === "positive" ? "bg-emerald-500" : item.tone === "warning" ? "bg-amber-500" : "bg-rose-500"}`}
          style={{ width: `${Math.min(item.share, 100)}%` }}
        />
      </div>
    </div>
  );
}

export default function DashboardClient() {
  const { user } = useAuth();
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [operationalData, setOperationalData] = useState<OperationalDashboardData>({
    pendingTransactions: [],
    openHandovers: [],
    recentHandovers: [],
  });
  const [dateRange, setDateRange] = useState<DateRange>(createDefaultRange);
  const [activeChartFilterLabel, setActiveChartFilterLabel] = useState("7 Hari Terakhir");
  const [activeMetric, setActiveMetric] =
    useState<DashboardMetricKey>("transactions");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sheetView, setSheetView] = useState<SheetView>(null);
  const requestIdRef = useRef(0);

  const canAccess = useCallback(
    (permission: string) => {
      if (!user) return false;
      if (user.role === "super_admin") return true;
      return (
        user.permissions?.includes("all_access") ||
        user.permissions?.includes(permission)
      );
    },
    [user]
  );

  const quickActions = useMemo(
    () => baseQuickActions.filter((item) => canAccess(item.permission)),
    [canAccess]
  );

  const canAccessOperationalQueue = canAccess("riwayat_transaksi");
  const canAccessShiftHandover = canAccess("riwayat_transaksi") || canAccess("shift_handover");

  const loadSummary = useCallback(
    async (nextRange: DateRange, nextLabel: string) => {
      if (!nextRange.from) return;

      const resolvedRange = {
        from: nextRange.from,
        to: nextRange.to ?? nextRange.from,
      };

      const requestId = requestIdRef.current + 1;
      requestIdRef.current = requestId;

      setIsLoading(true);
      setError(null);
      setDateRange(resolvedRange);
      setActiveChartFilterLabel(nextLabel);

      try {
        const nextSummary = await getDashboardSummary({
          from: resolvedRange.from.toISOString(),
          to: resolvedRange.to.toISOString(),
        });

        if (requestId !== requestIdRef.current) return;
        setSummary(nextSummary);
      } catch (summaryError) {
        if (requestId !== requestIdRef.current) return;
        const message =
          summaryError instanceof Error
            ? summaryError.message
            : "Gagal memuat ringkasan dashboard.";
        setError(message);
      } finally {
        if (requestId === requestIdRef.current) {
          setIsLoading(false);
        }
      }
    },
    []
  );

  useEffect(() => {
    const initialRange = createDefaultRange();
    void loadSummary(initialRange, "7 Hari Terakhir");
  }, [loadSummary]);

  useEffect(() => {
    let isCancelled = false;

    async function loadOperationalData() {
      if (!canAccessOperationalQueue && !canAccessShiftHandover) {
        setOperationalData({
          pendingTransactions: [],
          openHandovers: [],
          recentHandovers: [],
        });
        return;
      }

      try {
        const [pendingResponse, handoverRows] = await Promise.all([
          canAccessOperationalQueue
            ? listTransactionsFromDB({ status: "Pending", limit: 5, operationalFilter: "all" })
            : Promise.resolve({ transactions: [] }),
          canAccessShiftHandover ? listShiftHandoversFromDB() : Promise.resolve([]),
        ]);

        if (isCancelled) return;

        setOperationalData({
          pendingTransactions: pendingResponse.transactions,
          openHandovers: handoverRows.filter((handover) => handover.status === "open"),
          recentHandovers: handoverRows,
        });
      } catch {
        if (isCancelled) return;
        setOperationalData({
          pendingTransactions: [],
          openHandovers: [],
          recentHandovers: [],
        });
      }
    }

    void loadOperationalData();

    return () => {
      isCancelled = true;
    };
  }, [canAccessOperationalQueue, canAccessShiftHandover, user]);

  const handlePreset = (days: number, label: string) => {
    const to = new Date();
    const from = new Date(to);
    from.setDate(to.getDate() - days);

    void loadSummary({ from, to }, label);
  };

  const handleCalendarSelect = (nextRange: DateRange | undefined) => {
    if (!nextRange?.from) return;

    const resolvedRange = {
      from: nextRange.from,
      to: nextRange.to ?? nextRange.from,
    };

    const label = nextRange.to
      ? `${new Intl.DateTimeFormat("id-ID", {
          day: "2-digit",
          month: "short",
          year: "numeric",
        }).format(nextRange.from)} - ${new Intl.DateTimeFormat("id-ID", {
          day: "2-digit",
          month: "short",
          year: "numeric",
        }).format(resolvedRange.to)}`
      : new Intl.DateTimeFormat("id-ID", {
          day: "2-digit",
          month: "short",
          year: "numeric",
        }).format(nextRange.from);

    void loadSummary(resolvedRange, label);
  };

  const activeMetricConfig = metricConfig[activeMetric];

  const activeMetricTotal = useMemo(() => {
    if (!summary) return 0;
    return summary.rangeSummary[activeMetric];
  }, [summary, activeMetric]);

  const pendingClaimedCount = useMemo(
    () => operationalData.pendingTransactions.filter((transaction) => Boolean(transaction.claimedByUserId)).length,
    [operationalData.pendingTransactions]
  );

  const pendingUnclaimedCount = useMemo(
    () => operationalData.pendingTransactions.filter((transaction) => !transaction.claimedByUserId).length,
    [operationalData.pendingTransactions]
  );

  const pendingOthersCount = useMemo(
    () =>
      operationalData.pendingTransactions.filter(
        (transaction) => Boolean(transaction.claimedByUserId) && transaction.claimedByUserId !== user?.id
      ).length,
    [operationalData.pendingTransactions, user?.id]
  );

  const pendingHandoverCount = useMemo(
    () => operationalData.pendingTransactions.filter((transaction) => transaction.internalPriority === "handover").length,
    [operationalData.pendingTransactions]
  );

  const myCreatedHandovers = useMemo(
    () => operationalData.recentHandovers.filter((handover) => handover.createdByUserId === user?.id),
    [operationalData.recentHandovers, user?.id]
  );

  const myAcknowledgedHandovers = useMemo(
    () =>
      operationalData.recentHandovers.filter(
        (handover) => handover.acknowledgedByUserId === user?.id
      ),
    [operationalData.recentHandovers, user?.id]
  );

  const myOpenCreatedHandovers = useMemo(
    () => myCreatedHandovers.filter((handover) => handover.status === "open"),
    [myCreatedHandovers]
  );

  if (isLoading && !summary) {
    return <DashboardSkeleton />;
  }

  if (!summary || error) {
    return (
      <Card className="mx-auto max-w-3xl rounded-3xl border-destructive bg-destructive/10 py-10 text-center shadow">
        <CardHeader>
          <CardTitle className="flex items-center justify-center gap-2 text-destructive">
            <ShieldAlert className="h-6 w-6" />
            Dashboard Gagal Dimuat
          </CardTitle>
          <CardDescription className="text-destructive/80">
            {error || "Data ringkasan tidak tersedia saat ini."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            onClick={() => void loadSummary(dateRange, activeChartFilterLabel)}
            className="rounded-xl bg-[var(--ui-accent)] text-white hover:bg-[var(--ui-accent-hover)]"
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            Coba Muat Ulang
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <div className="mx-auto max-w-7xl min-w-0 space-y-4 pb-8 sm:space-y-8 sm:pb-10">
        <section className="flex flex-col items-start justify-between gap-3 sm:gap-4 lg:flex-row lg:items-end">
          <div className="flex items-start gap-2.5 sm:gap-4">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[var(--ui-accent-gradient-from)] to-[var(--ui-accent-gradient-to)] text-white shadow-lg sm:h-12 sm:w-12 sm:rounded-2xl">
              <TrendingUp className="h-4 w-4 sm:h-6 sm:w-6" />
            </div>
            <div className="space-y-1.5 sm:space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-lg font-serif font-bold tracking-tight text-[var(--ui-text)] dark:text-zinc-100 sm:text-2xl md:text-3xl">
                  Dashboard Ringkasan
                </h1>
                <div className="hidden rounded-full border border-[var(--ui-accent)]/20 bg-[var(--ui-accent-bg)] px-3 py-1 text-xs font-semibold text-[var(--ui-accent)] dark:border-sky-400/20 dark:bg-sky-500/10 dark:text-sky-300 sm:inline-flex">
                  Ringkasan sisi server
                </div>
              </div>
              <p className="hidden max-w-3xl text-sm leading-6 text-[var(--ui-text-muted)] sm:block dark:text-zinc-400">
                KPI, grafik, dan ringkasan kini dihitung di server dengan data
                yang lebih ringan. Fokus tampilan ini adalah kesehatan operasi,
                distribusi provider, dan momentum keuntungan.
              </p>
              <p className="text-[11px] text-[var(--ui-text-secondary)] dark:text-zinc-500 sm:text-xs">
                Terakhir diperbarui {formatTimestamp(summary.generatedAt)}
              </p>
            </div>
          </div>
          <div className="grid w-full grid-cols-1 gap-2 sm:w-auto sm:grid-cols-2">
            <Button
              asChild
              variant="outline"
              className="rounded-xl border-[var(--ui-border)] bg-[var(--ui-card-alt)] text-[var(--ui-text)] hover:bg-[var(--ui-accent-bg)] hover:text-[var(--ui-accent)] dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
            >
              <Link href="/transactions">
                <ReceiptText className="mr-2 h-4 w-4" />
                Transaksi
              </Link>
            </Button>
            <Button
              asChild
              className="rounded-xl bg-[var(--ui-accent)] text-white hover:bg-[var(--ui-accent-hover)]"
            >
              <Link href="/profit-report">
                <FileText className="mr-2 h-4 w-4" />
                Laporan Keuntungan
              </Link>
            </Button>
          </div>
        </section>

        <Card className="rounded-2xl border-[var(--ui-border)] bg-[var(--ui-surface)]/95 shadow-md backdrop-blur sm:rounded-3xl lg:sticky lg:top-4 lg:z-20 dark:border-zinc-800 dark:bg-zinc-950/95">
          <CardContent className="space-y-3 p-3.5 sm:space-y-5 sm:p-6">
            <div className="flex flex-col items-start justify-between gap-3 lg:flex-row lg:items-end">
              <div>
                <p className="text-sm font-semibold text-[var(--ui-text)] dark:text-zinc-100">
                  Periode Aktif
                </p>
                <p className="text-xs text-[var(--ui-text-muted)] dark:text-zinc-400 sm:text-sm">
                  {getActiveWindowDescription(activeChartFilterLabel, summary.range.days)}
                </p>
              </div>
              <div className="grid w-full grid-cols-4 gap-1 sm:flex sm:w-auto sm:flex-wrap sm:items-center sm:gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handlePreset(6, "7 Hari Terakhir")}
                  className={`h-8 rounded-xl px-2 text-[11px] sm:h-9 sm:text-sm ${activeChartFilterLabel === "7 Hari Terakhir" ? "border-[var(--ui-accent)] bg-[var(--ui-accent)] text-white hover:bg-[var(--ui-accent-hover)]" : "border-[var(--ui-border)] bg-[var(--ui-card-alt)] text-[var(--ui-text)] hover:bg-[var(--ui-accent-bg)] hover:text-[var(--ui-accent)] dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"}`}
                >
                  7D
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handlePreset(29, "30 Hari Terakhir")}
                  className={`h-8 rounded-xl px-2 text-[11px] sm:h-9 sm:text-sm ${activeChartFilterLabel === "30 Hari Terakhir" ? "border-[var(--ui-accent)] bg-[var(--ui-accent)] text-white hover:bg-[var(--ui-accent-hover)]" : "border-[var(--ui-border)] bg-[var(--ui-card-alt)] text-[var(--ui-text)] hover:bg-[var(--ui-accent-bg)] hover:text-[var(--ui-accent)] dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"}`}
                >
                  30D
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const today = new Date();
                    void loadSummary(
                      {
                        from: new Date(today.getFullYear(), today.getMonth(), 1),
                        to: today,
                      },
                      "Bulan Ini"
                    );
                  }}
                  className={`h-8 rounded-xl px-2 text-[11px] sm:h-9 sm:text-sm ${activeChartFilterLabel === "Bulan Ini" ? "border-[var(--ui-accent)] bg-[var(--ui-accent)] text-white hover:bg-[var(--ui-accent-hover)]" : "border-[var(--ui-border)] bg-[var(--ui-card-alt)] text-[var(--ui-text)] hover:bg-[var(--ui-accent-bg)] hover:text-[var(--ui-accent)] dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"}`}
                >
                  MTD
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const today = new Date();
                    void loadSummary(
                      {
                        from: new Date(today.getFullYear(), 0, 1),
                        to: today,
                      },
                      "Tahun Ini"
                    );
                  }}
                  className={`h-8 rounded-xl px-2 text-[11px] sm:h-9 sm:text-sm ${activeChartFilterLabel === "Tahun Ini" ? "border-[var(--ui-accent)] bg-[var(--ui-accent)] text-white hover:bg-[var(--ui-accent-hover)]" : "border-[var(--ui-border)] bg-[var(--ui-card-alt)] text-[var(--ui-text)] hover:bg-[var(--ui-accent-bg)] hover:text-[var(--ui-accent)] dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"}`}
                >
                  YTD
                </Button>
              </div>
            </div>
            <div className="grid gap-3 sm:gap-4 md:grid-cols-[minmax(0,1fr)_auto]">
              <div>
                <Label
                  htmlFor="dashboard-date-range"
                  className="text-sm font-medium text-[var(--ui-text)] dark:text-zinc-100"
                >
                  Rentang Tanggal Kustom
                </Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      id="dashboard-date-range"
                      variant="outline"
                      className="mt-1 w-full justify-start rounded-xl border-[var(--ui-input-border)] bg-[var(--ui-input-bg)] text-left font-normal text-[var(--ui-text)] hover:bg-[var(--ui-accent-bg)] hover:text-[var(--ui-accent)] dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                    >
                      <CalendarIconLucide className="mr-2 h-4 w-4" />
                      {dateRange.from ? (
                        dateRange.to ? (
                          <>
                            {new Intl.DateTimeFormat("id-ID", {
                              day: "2-digit",
                              month: "short",
                              year: "numeric",
                            }).format(dateRange.from)}{" "}
                            -{" "}
                            {new Intl.DateTimeFormat("id-ID", {
                              day: "2-digit",
                              month: "short",
                              year: "numeric",
                            }).format(dateRange.to)}
                          </>
                        ) : (
                          new Intl.DateTimeFormat("id-ID", {
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                          }).format(dateRange.from)
                        )
                      ) : (
                        <span>Pilih rentang tanggal</span>
                      )}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent
                    align="start"
                    className="w-auto max-w-[calc(100vw-2rem)] rounded-2xl border-[var(--ui-border)] bg-[var(--ui-card)] p-0 dark:border-zinc-800 dark:bg-zinc-950"
                  >
                    <div className="block sm:hidden">
                      <Calendar
                        initialFocus
                        mode="range"
                        defaultMonth={dateRange.from}
                        selected={dateRange}
                        onSelect={handleCalendarSelect}
                        numberOfMonths={1}
                      />
                    </div>
                    <div className="hidden sm:block">
                      <Calendar
                        initialFocus
                        mode="range"
                        defaultMonth={dateRange.from}
                        selected={dateRange}
                        onSelect={handleCalendarSelect}
                        numberOfMonths={2}
                      />
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
              <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-end">
                <Button
                  variant="outline"
                  onClick={() => {
                    const defaultRange = createDefaultRange();
                    void loadSummary(defaultRange, "7 Hari Terakhir");
                  }}
                  className="w-full rounded-xl border-[var(--ui-border)] bg-[var(--ui-card-alt)] text-[var(--ui-text)] hover:bg-[var(--ui-accent-bg)] hover:text-[var(--ui-accent)] sm:w-auto dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
                >
                  <Filter className="mr-2 h-4 w-4" />
                  Reset
                </Button>
                <Button
                  variant="outline"
                  onClick={() => void loadSummary(dateRange, activeChartFilterLabel)}
                  className="w-full rounded-xl border-[var(--ui-border)] bg-[var(--ui-card-alt)] text-[var(--ui-text)] hover:bg-[var(--ui-accent-bg)] hover:text-[var(--ui-accent)] sm:w-auto dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
                >
                  <RefreshCw className={`mr-2 h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
                  Muat Ulang
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <section className="grid gap-3 sm:gap-4 md:grid-cols-2 xl:grid-cols-3">
          {summary.kpis.map((item) => {
            const isOverall = item.key === "overall";
            return (
              <Card
                key={item.key}
                className={`rounded-2xl border shadow-sm transition-transform hover:-translate-y-0.5 sm:rounded-3xl ${isOverall ? "border-[var(--ui-accent)]/20 bg-[var(--ui-accent-bg)] dark:border-sky-400/20 dark:bg-sky-500/10" : "border-[var(--ui-border)] bg-[var(--ui-card)] dark:border-zinc-800 dark:bg-zinc-950"}`}
              >
                <CardContent className="space-y-2.5 p-3.5 sm:space-y-4 sm:p-6">
                  <div className="flex items-start justify-between gap-3 sm:gap-4">
                    <div>
                      <p className="text-sm font-medium text-[var(--ui-text-muted)] dark:text-zinc-400">
                        {item.label}
                      </p>
                      <p className="mt-1 text-xs text-[var(--ui-text-secondary)] dark:text-zinc-500">
                        {item.helper}
                      </p>
                    </div>
                    <div className="rounded-xl bg-white/70 p-1.5 text-[var(--ui-accent)] shadow-sm sm:rounded-2xl sm:p-2 dark:bg-zinc-900">
                      <ChartColumnBig className="h-4 w-4 sm:h-5 sm:w-5" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <p className="text-xl font-bold tracking-tight text-[var(--ui-text)] sm:text-3xl dark:text-zinc-100">
                      {item.transactions.toLocaleString("id-ID")}
                    </p>
                    <p className="text-sm font-medium text-[var(--ui-text-muted)] dark:text-zinc-400">
                      {formatCurrency(item.revenue)} omzet
                    </p>
                    <p className="text-sm font-medium text-[var(--ui-accent)]">
                      {formatCurrency(item.profit)} profit
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 border-t border-[var(--ui-border)] pt-3 text-xs dark:border-zinc-800">
                    <MetricDelta value={item.deltaTransactions} label="Trx" />
                    <MetricDelta value={item.deltaProfit} label="Keuntungan" />
                    <div className="text-[var(--ui-text-secondary)] dark:text-zinc-500">
                      Rasio sukses {formatPercent(item.successRate)}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </section>

        <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 md:grid-cols-3 xl:grid-cols-5">
          {summary.healthCards.map((item) => (
            <Card
              key={item.key}
              className={`rounded-2xl border shadow-sm sm:rounded-3xl ${toneSurface(item.tone)} dark:text-inherit`}
            >
              <CardContent className="space-y-2 p-3.5 sm:space-y-3 sm:p-5">
                <p className="text-[10px] font-semibold uppercase tracking-[0.15em] opacity-80 sm:text-xs sm:tracking-[0.2em]">
                  {item.label}
                </p>
                <p className="text-lg font-bold tracking-tight sm:text-2xl">{item.value}</p>
                <p className="text-xs opacity-90 sm:text-sm">{item.helper}</p>
              </CardContent>
            </Card>
          ))}
        </section>

        {(canAccessOperationalQueue || canAccessShiftHandover) && (
          <section className="grid gap-4 sm:gap-6 xl:grid-cols-[1.1fr,0.9fr]">
            {canAccessOperationalQueue && (
              <Card className="min-w-0 rounded-2xl border-[var(--ui-border)] bg-[var(--ui-card)] shadow-lg sm:rounded-3xl dark:border-zinc-800 dark:bg-zinc-950">
                <CardHeader>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <CardTitle className="flex items-center gap-2 text-lg font-serif text-[var(--ui-text)] dark:text-zinc-100 sm:text-xl">
                        <ClipboardList className="h-5 w-5 text-[var(--ui-accent)]" />
                        Antrean Pending Operasional
                      </CardTitle>
                      <CardDescription className="text-[var(--ui-text-muted)] dark:text-zinc-400">
                        Ringkasan cepat transaksi pending yang perlu dipantau staf aktif.
                      </CardDescription>
                    </div>
                    <Button
                      asChild
                      variant="outline"
                      className="rounded-xl border-[var(--ui-border)] bg-[var(--ui-card-alt)] text-[var(--ui-accent)] hover:bg-[var(--ui-accent-bg)] hover:text-[var(--ui-accent-hover)] dark:border-zinc-800 dark:bg-zinc-900"
                    >
                      <Link href="/transactions">
                        <ReceiptText className="mr-2 h-4 w-4" />
                        Buka Antrean
                      </Link>
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                    <div className="rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-card-alt)] p-4 dark:border-zinc-800 dark:bg-zinc-900">
                      <p className="text-xs uppercase tracking-[0.16em] text-[var(--ui-text-secondary)] dark:text-zinc-500">Pending aktif</p>
                      <p className="mt-2 text-2xl font-semibold text-[var(--ui-text)] dark:text-zinc-100">
                        {operationalData.pendingTransactions.length}
                      </p>
                    </div>
                    <Link
                      href="/transactions?queue=unclaimed"
                      className="rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-card-alt)] p-4 transition-colors hover:bg-[var(--ui-accent-bg)] dark:border-zinc-800 dark:bg-zinc-900"
                    >
                      <p className="text-xs uppercase tracking-[0.16em] text-[var(--ui-text-secondary)] dark:text-zinc-500">Belum diklaim</p>
                      <p className="mt-2 text-2xl font-semibold text-[var(--ui-text)] dark:text-zinc-100">
                        {pendingUnclaimedCount}
                      </p>
                    </Link>
                    <Link
                      href="/transactions?queue=mine"
                      className="rounded-2xl border border-emerald-500/25 bg-emerald-500/10 p-4 transition-colors hover:bg-emerald-500/15"
                    >
                      <p className="text-xs uppercase tracking-[0.16em] text-emerald-700 dark:text-emerald-300">Klaim saya</p>
                      <p className="mt-2 text-2xl font-semibold text-emerald-800 dark:text-emerald-200">
                        {operationalData.pendingTransactions.filter((transaction) => transaction.claimedByUserId === user?.id).length}
                      </p>
                    </Link>
                    <Link
                      href="/transactions?queue=others"
                      className="rounded-2xl border border-rose-500/25 bg-rose-500/10 p-4 transition-colors hover:bg-rose-500/15"
                    >
                      <p className="text-xs uppercase tracking-[0.16em] text-rose-700 dark:text-rose-300">Staf lain pegang</p>
                      <p className="mt-2 text-2xl font-semibold text-rose-800 dark:text-rose-200">
                        {pendingOthersCount}
                      </p>
                    </Link>
                    <Link
                      href="/transactions?queue=handover"
                      className="rounded-2xl border border-orange-500/25 bg-orange-500/10 p-4 transition-colors hover:bg-orange-500/15"
                    >
                      <p className="text-xs uppercase tracking-[0.16em] text-orange-700 dark:text-orange-300">Perlu handover</p>
                      <p className="mt-2 text-2xl font-semibold text-orange-800 dark:text-orange-200">
                        {pendingHandoverCount}
                      </p>
                    </Link>
                  </div>

                  <div className="space-y-3">
                    {operationalData.pendingTransactions.length === 0 ? (
                      <div className="rounded-2xl border border-dashed border-[var(--ui-border)] p-6 text-center text-sm text-[var(--ui-text-muted)] dark:border-zinc-800 dark:text-zinc-400">
                        Tidak ada transaksi pending pada ringkasan dashboard saat ini.
                      </div>
                    ) : (
                      operationalData.pendingTransactions.map((transaction) => (
                        <Link
                          key={transaction.id}
                          href={`/transactions?highlight=${encodeURIComponent(transaction.id)}`}
                          className="block rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-card-alt)] p-4 transition-colors hover:bg-[var(--ui-accent-bg)] dark:border-zinc-800 dark:bg-zinc-900"
                        >
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="min-w-0 flex-1 space-y-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="font-semibold text-[var(--ui-text)] dark:text-zinc-100">
                                  {transaction.productName}
                                </p>
                                {transaction.claimedByUserId === user?.id && (
                                  <span className="inline-flex items-center rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-300">
                                    Klaim saya
                                  </span>
                                )}
                                {transaction.claimedByUsername ? (
                                  <span className="inline-flex items-center rounded-full border border-sky-500/30 bg-sky-500/10 px-2 py-0.5 text-[11px] font-medium text-sky-700 dark:text-sky-300">
                                    {transaction.claimedByUsername}
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center rounded-full border border-[var(--ui-border)] bg-[var(--ui-card)] px-2 py-0.5 text-[11px] font-medium text-[var(--ui-text-muted)] dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-400">
                                    Belum diklaim
                                  </span>
                                )}
                                {transaction.internalPriority === "handover" && (
                                  <span className="inline-flex items-center rounded-full border border-orange-500/30 bg-orange-500/10 px-2 py-0.5 text-[11px] font-medium text-orange-700 dark:text-orange-300">
                                    Perlu handover
                                  </span>
                                )}
                              </div>
                              <p className="line-clamp-2 text-sm text-[var(--ui-text-muted)] dark:text-zinc-400">
                                {transaction.details}
                              </p>
                              <div className="flex flex-wrap gap-3 text-xs text-[var(--ui-text-secondary)] dark:text-zinc-500">
                                <span>{transaction.id}</span>
                                <span>{formatTimestamp(transaction.timestamp)}</span>
                              </div>
                            </div>
                          </div>
                        </Link>
                      ))
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            {canAccessShiftHandover && (
              <div className="space-y-4 sm:space-y-6">
                <Card className="min-w-0 rounded-2xl border-[var(--ui-border)] bg-[var(--ui-card)] shadow-lg sm:rounded-3xl dark:border-zinc-800 dark:bg-zinc-950">
                  <CardHeader>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <CardTitle className="flex items-center gap-2 text-lg font-serif text-[var(--ui-text)] dark:text-zinc-100 sm:text-xl">
                          <ShieldAlert className="h-5 w-5 text-amber-500" />
                          Handover Sif Terbuka
                        </CardTitle>
                        <CardDescription className="text-[var(--ui-text-muted)] dark:text-zinc-400">
                          Catatan sif terbuka yang perlu diterima atau ditindaklanjuti.
                        </CardDescription>
                      </div>
                      <Button
                        asChild
                        variant="outline"
                        className="rounded-xl border-[var(--ui-border)] bg-[var(--ui-card-alt)] text-[var(--ui-accent)] hover:bg-[var(--ui-accent-bg)] hover:text-[var(--ui-accent-hover)] dark:border-zinc-800 dark:bg-zinc-900"
                      >
                        <Link href="/shift-handover">
                          <ClipboardList className="mr-2 h-4 w-4" />
                          Lihat Handover Sif
                        </Link>
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-amber-800 dark:text-amber-200">
                      <p className="text-xs uppercase tracking-[0.16em]">Handover sif terbuka</p>
                      <p className="mt-2 text-3xl font-semibold">{operationalData.openHandovers.length}</p>
                      <p className="mt-1 text-sm opacity-90">
                        Gunakan halaman handover sif untuk menerima catatan dan membuka transaksi terkait.
                      </p>
                    </div>

                    {operationalData.openHandovers.length === 0 ? (
                      <div className="rounded-2xl border border-dashed border-[var(--ui-border)] p-6 text-center text-sm text-[var(--ui-text-muted)] dark:border-zinc-800 dark:text-zinc-400">
                        Tidak ada handover terbuka saat ini.
                      </div>
                    ) : (
                      operationalData.openHandovers.slice(0, 3).map((handover) => (
                        <Link
                          key={handover._id || `${handover.createdByUsername}-${handover.createdAt}`}
                          href="/shift-handover"
                          className="block rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-card-alt)] p-4 transition-colors hover:bg-[var(--ui-accent-bg)] dark:border-zinc-800 dark:bg-zinc-900"
                        >
                          <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--ui-text-secondary)] dark:text-zinc-500">
                            <span className="rounded-full border border-[var(--ui-border)] bg-[var(--ui-card)] px-2 py-0.5 text-[var(--ui-text)] dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100">
                              {handover.createdByUsername}
                            </span>
                            <span>{formatTimestamp(handover.createdAt)}</span>
                          </div>
                          <p className="mt-2 line-clamp-3 text-sm text-[var(--ui-text)] dark:text-zinc-100">
                            {handover.summary}
                          </p>
                          <p className="mt-2 text-xs text-[var(--ui-text-muted)] dark:text-zinc-400">
                            {handover.pendingTransactionIds.length} transaksi dibawa ke sif berikutnya.
                          </p>
                        </Link>
                      ))
                    )}
                  </CardContent>
                </Card>

                <Card className="min-w-0 rounded-2xl border-[var(--ui-border)] bg-[var(--ui-card)] shadow-lg sm:rounded-3xl dark:border-zinc-800 dark:bg-zinc-950">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-lg font-serif text-[var(--ui-text)] dark:text-zinc-100 sm:text-xl">
                      <ClipboardList className="h-5 w-5 text-[var(--ui-accent)]" />
                      Aktivitas Handover Sif Saya
                    </CardTitle>
                    <CardDescription className="text-[var(--ui-text-muted)] dark:text-zinc-400">
                      Pantau handover sif yang kamu buat dan yang sudah kamu terima belakangan ini.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid gap-3 sm:grid-cols-3">
                      <div className="rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-card-alt)] p-4 dark:border-zinc-800 dark:bg-zinc-900">
                        <p className="text-xs uppercase tracking-[0.16em] text-[var(--ui-text-secondary)] dark:text-zinc-500">Saya buat</p>
                        <p className="mt-2 text-2xl font-semibold text-[var(--ui-text)] dark:text-zinc-100">
                          {myCreatedHandovers.length}
                        </p>
                        <p className="mt-1 text-xs text-[var(--ui-text-muted)] dark:text-zinc-400">
                          Total handover sif terbaru yang dibuat akun aktif.
                        </p>
                      </div>
                      <div className="rounded-2xl border border-amber-500/25 bg-amber-500/10 p-4 dark:text-amber-200">
                        <p className="text-xs uppercase tracking-[0.16em] text-amber-700 dark:text-amber-300">Masih terbuka</p>
                        <p className="mt-2 text-2xl font-semibold text-amber-800 dark:text-amber-200">
                          {myOpenCreatedHandovers.length}
                        </p>
                        <p className="mt-1 text-xs text-amber-700/80 dark:text-amber-200/80">
                          Handover buatanmu yang belum diterima.
                        </p>
                      </div>
                      <div className="rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-card-alt)] p-4 dark:border-zinc-800 dark:bg-zinc-900">
                        <p className="text-xs uppercase tracking-[0.16em] text-[var(--ui-text-secondary)] dark:text-zinc-500">Saya terima</p>
                        <p className="mt-2 text-2xl font-semibold text-[var(--ui-text)] dark:text-zinc-100">
                          {myAcknowledgedHandovers.length}
                        </p>
                        <p className="mt-1 text-xs text-[var(--ui-text-muted)] dark:text-zinc-400">
                          Handover yang sudah kamu terima.
                        </p>
                      </div>
                    </div>

                    <div className="space-y-3">
                      {myCreatedHandovers.length === 0 && myAcknowledgedHandovers.length === 0 ? (
                        <div className="rounded-2xl border border-dashed border-[var(--ui-border)] p-6 text-center text-sm text-[var(--ui-text-muted)] dark:border-zinc-800 dark:text-zinc-400">
                          Belum ada aktivitas handover sif pribadi di daftar terbaru.
                        </div>
                      ) : (
                        <>
                          {myCreatedHandovers.slice(0, 2).map((handover) => (
                            <Link
                              key={`created-${handover._id || handover.createdAt}`}
                              href="/shift-handover"
                              className="block rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-card-alt)] p-4 transition-colors hover:bg-[var(--ui-accent-bg)] dark:border-zinc-800 dark:bg-zinc-900"
                            >
                              <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--ui-text-secondary)] dark:text-zinc-500">
                                <span className="rounded-full border border-sky-500/30 bg-sky-500/10 px-2 py-0.5 text-sky-700 dark:text-sky-300">
                                  Saya buat
                                </span>
                                {handover.status === "open" && (
                                  <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-amber-700 dark:text-amber-300">
                                    Terbuka
                                  </span>
                                )}
                                <span>{formatTimestamp(handover.createdAt)}</span>
                              </div>
                              <p className="mt-2 line-clamp-2 text-sm text-[var(--ui-text)] dark:text-zinc-100">
                                {handover.summary}
                              </p>
                            </Link>
                          ))}

                          {myAcknowledgedHandovers.slice(0, 2).map((handover) => (
                            <Link
                              key={`ack-${handover._id || handover.createdAt}`}
                              href="/shift-handover"
                              className="block rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-card-alt)] p-4 transition-colors hover:bg-[var(--ui-accent-bg)] dark:border-zinc-800 dark:bg-zinc-900"
                            >
                              <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--ui-text-secondary)] dark:text-zinc-500">
                                <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-emerald-700 dark:text-emerald-300">
                                  Saya terima
                                </span>
                                <span>{handover.acknowledgedAt ? formatTimestamp(handover.acknowledgedAt) : formatTimestamp(handover.createdAt)}</span>
                              </div>
                              <p className="mt-2 line-clamp-2 text-sm text-[var(--ui-text)] dark:text-zinc-100">
                                {handover.summary}
                              </p>
                            </Link>
                          ))}
                        </>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}
          </section>
        )}

        <section className="grid gap-4 sm:gap-6 xl:grid-cols-[1.6fr,1fr]">
          <Card className="min-w-0 rounded-2xl border-[var(--ui-border)] bg-[var(--ui-surface)] shadow-lg sm:rounded-3xl dark:border-zinc-800 dark:bg-zinc-950">
            <CardHeader className="space-y-3 border-b border-[var(--ui-border)] px-4 pb-4 sm:space-y-4 sm:px-6 sm:pb-5 dark:border-zinc-800">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="space-y-1 sm:space-y-2">
                  <CardTitle className="flex items-center gap-2 text-base font-serif text-[var(--ui-text)] sm:gap-3 sm:text-xl dark:text-zinc-100">
                    <div className="rounded-lg bg-[var(--ui-accent-bg)] p-1.5 text-[var(--ui-accent)] sm:rounded-xl sm:p-2 dark:bg-sky-500/10 dark:text-sky-300">
                      <activeMetricConfig.icon className="h-4 w-4 sm:h-5 sm:w-5" />
                    </div>
                    Tren {activeMetricConfig.label}
                  </CardTitle>
                  <CardDescription className="text-xs text-[var(--ui-text-muted)] sm:text-sm dark:text-zinc-400">
                    {activeMetricConfig.helper}
                  </CardDescription>
                </div>
                <div className="rounded-xl border border-[var(--ui-border)] bg-[var(--ui-card-alt)] px-3 py-2 text-right sm:rounded-2xl sm:px-4 sm:py-3 dark:border-zinc-800 dark:bg-zinc-900">
                  <p className="text-[10px] uppercase tracking-[0.15em] text-[var(--ui-text-secondary)] sm:text-xs sm:tracking-[0.2em] dark:text-zinc-500">
                    Total Aktif
                  </p>
                  <p className="mt-0.5 text-base font-bold text-[var(--ui-text)] sm:mt-1 sm:text-xl dark:text-zinc-100">
                    {activeMetric === "transactions"
                      ? activeMetricTotal.toLocaleString("id-ID")
                      : formatCurrency(activeMetricTotal)}
                  </p>
                </div>
              </div>
              <Tabs
                value={activeMetric}
                onValueChange={(value) => setActiveMetric(value as DashboardMetricKey)}
              >
                <TabsList className="h-auto w-full flex-wrap justify-start gap-1 rounded-xl bg-[var(--ui-card-alt)] p-1 sm:gap-2 sm:rounded-2xl sm:p-1.5 dark:bg-zinc-900">
                  {Object.entries(metricConfig).map(([key, item]) => (
                    <TabsTrigger
                      key={key}
                      value={key}
                      className="rounded-lg px-2.5 py-1.5 text-xs text-[var(--ui-text-muted)] data-[state=active]:bg-[var(--ui-card)] data-[state=active]:text-[var(--ui-text)] data-[state=active]:shadow-sm sm:rounded-xl sm:px-4 sm:py-2 sm:text-sm dark:text-zinc-400 dark:data-[state=active]:bg-zinc-950 dark:data-[state=active]:text-zinc-100"
                    >
                      <item.icon className="mr-1.5 h-3.5 w-3.5 sm:mr-2 sm:h-4 sm:w-4" />
                      {item.label}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>
            </CardHeader>
            <CardContent className="px-3 pt-4 sm:px-6 sm:pt-6">
              {isLoading ? (
                <div className="flex h-[240px] items-center justify-center text-sm text-[var(--ui-text-muted)] sm:h-[340px] dark:text-zinc-400">
                  <Loader2 className="mr-2 h-6 w-6 animate-spin text-[var(--ui-accent)] sm:mr-3 sm:h-8 sm:w-8" />
                  Memuat grafik...
                </div>
              ) : summary.chartSeries.length > 0 ? (
                <div className="touch-manipulation" style={{ touchAction: 'pan-y' }}>
                  <ChartContainer
                    config={{
                      [activeMetric]: {
                        label: activeMetricConfig.label,
                        color: activeMetricConfig.color,
                      },
                    }}
                    className="h-[240px] w-full sm:h-[340px]"
                  >
                    <AreaChart data={summary.chartSeries} margin={{ top: 8, right: 4, left: -8, bottom: 0 }}>
                      <defs>
                        <linearGradient id="dashboard-active-metric" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor={activeMetricConfig.color} stopOpacity={0.7} />
                          <stop offset="95%" stopColor={activeMetricConfig.color} stopOpacity={0.08} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid vertical={false} stroke="hsl(var(--border) / 0.35)" strokeDasharray="3 3" />
                      <XAxis
                        dataKey="label"
                        tickLine={false}
                        axisLine={false}
                        tick={{ fill: "var(--ui-text-secondary)", fontSize: 10 }}
                        dy={8}
                        interval="preserveStartEnd"
                      />
                      <YAxis
                        tickLine={false}
                        axisLine={false}
                        tick={{ fill: "var(--ui-text-secondary)", fontSize: 10 }}
                        tickFormatter={(value: number) =>
                          activeMetric === "transactions"
                            ? formatCompact(value)
                            : formatCompact(value)
                        }
                        width={40}
                      />
                      <ChartTooltip
                        cursor={{ stroke: activeMetricConfig.color, strokeDasharray: "4 4" }}
                        content={
                          <ChartTooltipContent
                            formatter={(value) => [
                              activeMetric === "transactions"
                                ? `${Number(value).toLocaleString("id-ID")} tx`
                                : formatCurrency(Number(value)),
                              activeMetricConfig.label,
                            ]}
                          />
                        }
                      />
                      <Area
                        type="monotone"
                        dataKey={activeMetric}
                        stroke={activeMetricConfig.color}
                        fill="url(#dashboard-active-metric)"
                        strokeWidth={2.5}
                        activeDot={{ r: 4, fill: activeMetricConfig.color, stroke: "#fff", strokeWidth: 2 }}
                      />
                    </AreaChart>
                  </ChartContainer>
                </div>
              ) : (
                <div className="flex h-[240px] items-center justify-center text-center text-sm text-[var(--ui-text-muted)] sm:h-[340px] dark:text-zinc-400">
                  Tidak ada data grafik untuk rentang yang sedang dipilih.
                </div>
              )}
            </CardContent>
          </Card>

          <div className="min-w-0 space-y-4 sm:space-y-6">
            <Card className="min-w-0 rounded-2xl border-[var(--ui-border)] bg-[var(--ui-card)] shadow-lg sm:rounded-3xl dark:border-zinc-800 dark:bg-zinc-950">
              <CardHeader className="space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <CardTitle className="text-lg font-serif text-[var(--ui-text)] dark:text-zinc-100 sm:text-xl">
                      Perbandingan Provider
                    </CardTitle>
                    <CardDescription className="text-[var(--ui-text-muted)] dark:text-zinc-400">
                      Bandingkan volume, rasio sukses, dan keuntungan per provider.
                    </CardDescription>
                  </div>
                  <Button
                    variant="ghost"
                    onClick={() => setSheetView("providers")}
                    className="rounded-xl text-[var(--ui-accent)] hover:bg-[var(--ui-accent-bg)] hover:text-[var(--ui-accent-hover)]"
                  >
                    Rincian
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-3 sm:space-y-4">
                {summary.providerBreakdown.map((provider) => (
                  <div
                    key={provider.provider}
                    className="rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-card-alt)] p-3.5 dark:border-zinc-800 dark:bg-zinc-900 sm:p-4"
                  >
                    <div className="flex items-start justify-between gap-3 sm:gap-4">
                      <div>
                        <p className="text-sm font-semibold text-[var(--ui-text)] dark:text-zinc-100">
                          {provider.label}
                        </p>
                        <p className="text-xs text-[var(--ui-text-muted)] dark:text-zinc-400">
                          Merek utama: {provider.dominantBrand}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-lg font-bold text-[var(--ui-text)] dark:text-zinc-100">
                          {provider.transactions.toLocaleString("id-ID")}
                        </p>
                        <p className="text-xs text-[var(--ui-text-secondary)] dark:text-zinc-500">
                          {formatPercent(provider.successRate)} sukses
                        </p>
                      </div>
                    </div>
                    <div className="mt-3 grid grid-cols-1 gap-2.5 text-sm sm:mt-4 sm:grid-cols-2 sm:gap-3">
                      <div className="rounded-xl border border-[var(--ui-border)] bg-white/70 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-950">
                        <p className="text-[var(--ui-text-secondary)] dark:text-zinc-500">Omzet</p>
                        <p className="mt-1 font-semibold text-[var(--ui-text)] dark:text-zinc-100">
                          {formatCurrency(provider.revenue)}
                        </p>
                      </div>
                      <div className="rounded-xl border border-[var(--ui-border)] bg-white/70 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-950">
                        <p className="text-[var(--ui-text-secondary)] dark:text-zinc-500">Keuntungan</p>
                        <p className="mt-1 font-semibold text-[var(--ui-accent)]">
                          {formatCurrency(provider.profit)}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            {quickActions.length > 0 && (
              <Card className="min-w-0 rounded-2xl border-[var(--ui-border)] bg-[var(--ui-card)] shadow-lg sm:rounded-3xl dark:border-zinc-800 dark:bg-zinc-950">
                <CardHeader>
                  <CardTitle className="text-lg font-serif text-[var(--ui-text)] dark:text-zinc-100 sm:text-xl">
                    Aksi Cepat
                  </CardTitle>
                  <CardDescription className="text-[var(--ui-text-muted)] dark:text-zinc-400">
                    Pintasan ke halaman operasional yang paling sering dipakai.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {quickActions.map((action) => (
                    <Button
                      key={action.href}
                      asChild
                      variant="outline"
                      className="h-auto w-full justify-start rounded-xl border-[var(--ui-border)] bg-[var(--ui-card-alt)] px-3 py-3 text-left hover:bg-[var(--ui-accent-bg)] hover:text-[var(--ui-accent)] sm:rounded-2xl sm:px-4 sm:py-4 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
                    >
                      <Link href={action.href}>
                        <div className="flex items-start gap-2.5 sm:gap-3">
                          <div className="rounded-lg bg-white/80 p-1.5 text-[var(--ui-accent)] shadow-sm sm:rounded-xl sm:p-2 dark:bg-zinc-950">
                            <action.icon className="h-4 w-4" />
                          </div>
                          <div className="space-y-0.5 sm:space-y-1">
                            <p className="text-sm font-semibold">{action.label}</p>
                            <p className="hidden text-xs text-[var(--ui-text-muted)] dark:text-zinc-400 sm:block">
                              {action.description}
                            </p>
                          </div>
                        </div>
                      </Link>
                    </Button>
                  ))}
                </CardContent>
              </Card>
            )}
          </div>
        </section>

        <section className="grid gap-4 sm:gap-6 xl:grid-cols-[1.2fr,0.8fr]">
          <Card className="min-w-0 rounded-2xl border-[var(--ui-border)] bg-[var(--ui-card)] shadow-lg sm:rounded-3xl dark:border-zinc-800 dark:bg-zinc-950">
            <CardHeader className="space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <CardTitle className="text-lg font-serif text-[var(--ui-text)] dark:text-zinc-100 sm:text-xl">
                    Distribusi Merek
                  </CardTitle>
                  <CardDescription className="text-[var(--ui-text-muted)] dark:text-zinc-400">
                    Peringkat merek paling aktif untuk rentang yang sedang dipilih.
                  </CardDescription>
                </div>
                <Button
                  variant="ghost"
                  onClick={() => setSheetView("brands")}
                  className="rounded-xl text-[var(--ui-accent)] hover:bg-[var(--ui-accent-bg)] hover:text-[var(--ui-accent-hover)]"
                >
                  Lihat semua
                </Button>
              </div>
            </CardHeader>
            <CardContent className="px-3 pb-4 sm:px-6 sm:pb-6">
              {summary.brandBreakdown.length > 0 ? (
                <div className="touch-manipulation" style={{ touchAction: 'pan-y' }}>
                  <ChartContainer
                    config={{
                      transactions: {
                        label: "Transaksi",
                        color: "var(--ui-accent)",
                      },
                    }}
                    className="h-[260px] w-full sm:h-[320px]"
                  >
                    <BarChart
                      data={summary.brandBreakdown}
                      layout="vertical"
                      margin={{ top: 0, right: 8, left: 0, bottom: 0 }}
                    >
                      <CartesianGrid horizontal={false} stroke="hsl(var(--border) / 0.25)" />
                      <YAxis
                        type="category"
                        dataKey="name"
                        width={80}
                        tickLine={false}
                        axisLine={false}
                        tick={{ fill: "var(--ui-text-secondary)", fontSize: 10 }}
                      />
                      <XAxis
                        type="number"
                        tickLine={false}
                        axisLine={false}
                        tick={{ fill: "var(--ui-text-secondary)", fontSize: 10 }}
                        allowDecimals={false}
                      />
                      <ChartTooltip
                        cursor={{ fill: "rgba(148, 163, 184, 0.08)" }}
                        content={
                          <ChartTooltipContent
                            labelFormatter={(label, payload) =>
                              payload?.[0]?.payload?.name || String(label)
                            }
                            formatter={(value, _, item) => [
                              `${Number(value).toLocaleString("id-ID")} transaksi | ${formatCurrency(
                                Number(item.payload?.profit || 0)
                              )} keuntungan`,
                              "Merek",
                            ]}
                          />
                        }
                      />
                      <Bar dataKey="transactions" radius={[0, 10, 10, 0]}>
                        {summary.brandBreakdown.map((entry, index) => (
                          <Cell key={`${entry.name}-${index}`} fill={entry.fill} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ChartContainer>
                </div>
              ) : (
                <div className="flex h-[260px] items-center justify-center text-center text-sm text-[var(--ui-text-muted)] sm:h-[320px] dark:text-zinc-400">
                  Tidak ada distribusi merek untuk rentang yang dipilih.
                </div>
              )}
            </CardContent>
          </Card>

          <div className="min-w-0 space-y-4 sm:space-y-6">
            <Card className="min-w-0 rounded-2xl border-[var(--ui-border)] bg-[var(--ui-card)] shadow-lg sm:rounded-3xl dark:border-zinc-800 dark:bg-zinc-950">
              <CardHeader className="space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <CardTitle className="text-lg font-serif text-[var(--ui-text)] dark:text-zinc-100 sm:text-xl">
                      Rincian Status
                    </CardTitle>
                    <CardDescription className="text-[var(--ui-text-muted)] dark:text-zinc-400">
                      Lihat komposisi sukses, pending, dan gagal.
                    </CardDescription>
                  </div>
                  <Button
                    variant="ghost"
                    onClick={() => setSheetView("status")}
                    className="rounded-xl text-[var(--ui-accent)] hover:bg-[var(--ui-accent-bg)] hover:text-[var(--ui-accent-hover)]"
                  >
                    Rincian
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {summary.statusBreakdown.map((item) => (
                  <StatusProgress key={item.status} item={item} />
                ))}
              </CardContent>
            </Card>

            <Card className="min-w-0 rounded-2xl border-[var(--ui-border)] bg-[var(--ui-card)] shadow-lg sm:rounded-3xl dark:border-zinc-800 dark:bg-zinc-950">
              <CardHeader>
                <CardTitle className="text-lg font-serif text-[var(--ui-text)] dark:text-zinc-100 sm:text-xl">
                  Highlight Utama
                </CardTitle>
                <CardDescription className="text-[var(--ui-text-muted)] dark:text-zinc-400">
                  Tiga insight cepat untuk membantu prioritas hari ini.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {summary.highlights.map((item) => (
                  <div
                    key={item.key}
                    className={`rounded-2xl border p-3.5 sm:p-4 ${toneSurface(item.tone)}`}
                  >
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] opacity-80">
                      {item.label}
                    </p>
                    <p className="mt-2 text-lg font-bold">{item.value}</p>
                    <p className="mt-1 text-sm opacity-90">{item.helper}</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </section>
      </div>

      <Sheet open={Boolean(sheetView)} onOpenChange={(open) => !open && setSheetView(null)}>
        <SheetContent className="w-full border-[var(--ui-border)] bg-[var(--ui-card)] text-[var(--ui-text)] sm:max-w-xl dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100">
          <SheetHeader>
            <SheetTitle className="text-[var(--ui-text)] dark:text-zinc-100">
              {sheetView === "brands"
                ? "Rangkuman Merek"
                : sheetView === "providers"
                  ? "Perbandingan Provider"
                  : "Rincian Status"}
            </SheetTitle>
            <SheetDescription className="text-[var(--ui-text-muted)] dark:text-zinc-400">
              {sheetView === "brands"
                ? "Rincian distribusi merek untuk rentang aktif."
                : sheetView === "providers"
                  ? "Perbandingan performa provider untuk rentang aktif."
                  : "Distribusi status transaksi beserta indikator kesehatan operasional."}
            </SheetDescription>
          </SheetHeader>
          <ScrollArea className="mt-6 h-[calc(100vh-10rem)] pr-4">
            {sheetView === "brands" && (
              <div className="space-y-3">
                {summary.brandBreakdown.map((brand) => (
                  <div
                    key={brand.name}
                    className="rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-card-alt)] p-3.5 dark:border-zinc-800 dark:bg-zinc-900 sm:p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-[var(--ui-text)] dark:text-zinc-100">
                          {brand.name}
                        </p>
                        <p className="text-sm text-[var(--ui-text-muted)] dark:text-zinc-400">
                          {brand.transactions.toLocaleString("id-ID")} transaksi
                        </p>
                      </div>
                      <div
                        className="h-3 w-3 rounded-full"
                        style={{ backgroundColor: brand.fill }}
                      />
                    </div>
                    <div className="mt-3 grid grid-cols-1 gap-2.5 text-sm sm:mt-4 sm:grid-cols-3 sm:gap-3">
                      <div>
                        <p className="text-[var(--ui-text-secondary)] dark:text-zinc-500">Porsi</p>
                        <p className="mt-1 font-semibold text-[var(--ui-text)] dark:text-zinc-100">
                          {formatPercent(brand.share)}
                        </p>
                      </div>
                      <div>
                        <p className="text-[var(--ui-text-secondary)] dark:text-zinc-500">Omzet</p>
                        <p className="mt-1 font-semibold text-[var(--ui-text)] dark:text-zinc-100">
                          {formatCurrency(brand.revenue)}
                        </p>
                      </div>
                      <div>
                        <p className="text-[var(--ui-text-secondary)] dark:text-zinc-500">Keuntungan</p>
                        <p className="mt-1 font-semibold text-[var(--ui-accent)]">
                          {formatCurrency(brand.profit)}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {sheetView === "providers" && (
              <div className="space-y-4">
                {summary.providerBreakdown.map((provider) => (
                  <div
                    key={provider.provider}
                    className="rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-card-alt)] p-3.5 dark:border-zinc-800 dark:bg-zinc-900 sm:p-4"
                  >
                    <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                      <div>
                        <p className="font-semibold text-[var(--ui-text)] dark:text-zinc-100">
                          {provider.label}
                        </p>
                        <p className="text-sm text-[var(--ui-text-muted)] dark:text-zinc-400">
                          Merek utama: {provider.dominantBrand}
                        </p>
                      </div>
                      <div className="rounded-full border border-[var(--ui-accent)]/20 bg-[var(--ui-accent-bg)] px-3 py-1 text-xs font-semibold text-[var(--ui-accent)]">
                        {formatPercent(provider.successRate)} sukses
                      </div>
                    </div>
                    <div className="mt-3 grid grid-cols-1 gap-2.5 text-sm sm:mt-4 sm:grid-cols-2 sm:gap-3">
                      <div className="rounded-xl border border-[var(--ui-border)] bg-white/70 p-3 dark:border-zinc-800 dark:bg-zinc-950">
                        <p className="text-[var(--ui-text-secondary)] dark:text-zinc-500">Transaksi</p>
                        <p className="mt-1 font-semibold text-[var(--ui-text)] dark:text-zinc-100">
                          {provider.transactions.toLocaleString("id-ID")}
                        </p>
                      </div>
                      <div className="rounded-xl border border-[var(--ui-border)] bg-white/70 p-3 dark:border-zinc-800 dark:bg-zinc-950">
                        <p className="text-[var(--ui-text-secondary)] dark:text-zinc-500">Keuntungan</p>
                        <p className="mt-1 font-semibold text-[var(--ui-accent)]">
                          {formatCurrency(provider.profit)}
                        </p>
                      </div>
                      <div className="rounded-xl border border-[var(--ui-border)] bg-white/70 p-3 dark:border-zinc-800 dark:bg-zinc-950">
                        <p className="text-[var(--ui-text-secondary)] dark:text-zinc-500">Pending</p>
                        <p className="mt-1 font-semibold text-[var(--ui-text)] dark:text-zinc-100">
                          {provider.pendingCount.toLocaleString("id-ID")}
                        </p>
                      </div>
                      <div className="rounded-xl border border-[var(--ui-border)] bg-white/70 p-3 dark:border-zinc-800 dark:bg-zinc-950">
                        <p className="text-[var(--ui-text-secondary)] dark:text-zinc-500">Gagal</p>
                        <p className="mt-1 font-semibold text-[var(--ui-text)] dark:text-zinc-100">
                          {provider.failedCount.toLocaleString("id-ID")}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {sheetView === "status" && (
              <div className="space-y-4">
                <div className="space-y-3">
                  {summary.statusBreakdown.map((item) => (
                    <StatusProgress key={item.status} item={item} />
                  ))}
                </div>
                <div className="space-y-3">
                  {summary.healthCards.map((item) => (
                    <div
                      key={item.key}
                      className={`rounded-2xl border p-3.5 sm:p-4 ${toneSurface(item.tone)}`}
                    >
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] opacity-80">
                        {item.label}
                      </p>
                      <p className="mt-2 text-lg font-bold">{item.value}</p>
                      <p className="mt-1 text-sm opacity-90">{item.helper}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </ScrollArea>
        </SheetContent>
      </Sheet>
    </>
  );
}
