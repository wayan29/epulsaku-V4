"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  type ShiftHandoverAcknowledgeDetails,
  type ShiftHandoverRecord,
  type ShiftHandoverResolutionItem,
} from "@/lib/transaction-utils";
import { formatDateInTimezone } from "@/lib/timezone";
import {
  formatElapsedMinutesCompact,
  getElapsedMinutes,
  getFollowUpState,
  getPendingSlaState,
} from "@/lib/date-utils";
import { useToast } from "@/hooks/use-toast";
import {
  AlertTriangle,
  BellRing,
  CheckCircle2,
  ClipboardList,
  Copy,
  ExternalLink,
  Filter,
  Hand,
  Loader2,
  MessageSquare,
  MoveDown,
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

type AutoPriorityReason =
  | "followup_overdue"
  | "followup_due"
  | "mine"
  | "handover"
  | "breached";

type AutoPriorityCandidate = {
  id: string;
  score: number;
  reason: AutoPriorityReason;
};

function getAutoPriorityPresentation(reason: AutoPriorityReason): {
  label: string;
  className: string;
  icon: typeof BellRing;
} {
  switch (reason) {
    case "followup_overdue":
      return {
        label: "Follow-up terlambat",
        className:
          "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300",
        icon: BellRing,
      };
    case "followup_due":
      return {
        label: "Follow-up segera",
        className:
          "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
        icon: BellRing,
      };
    case "mine":
      return {
        label: "Klaim saya",
        className:
          "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300",
        icon: Hand,
      };
    case "handover":
      return {
        label: "Sudah ditandai handover",
        className:
          "border-orange-500/30 bg-orange-500/10 text-orange-700 dark:text-orange-300",
        icon: AlertTriangle,
      };
    case "breached":
    default:
      return {
        label: "Lewat SLA",
        className:
          "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300",
        icon: AlertTriangle,
      };
  }
}

function buildAutoSummary(input: {
  overdueCount: number;
  dueCount: number;
  mineCount: number;
  handoverCount: number;
  breachedCount: number;
}): string {
  const parts: string[] = [];

  if (input.overdueCount > 0) {
    parts.push(`${input.overdueCount} follow-up terlambat`);
  }
  if (input.dueCount > 0) {
    parts.push(`${input.dueCount} follow-up segera`);
  }
  if (input.mineCount > 0) {
    parts.push(`${input.mineCount} transaksi klaim saya`);
  }
  if (input.handoverCount > 0) {
    parts.push(`${input.handoverCount} item sudah ditandai handover`);
  }
  if (input.breachedCount > 0) {
    parts.push(`${input.breachedCount} pending lewat SLA`);
  }

  if (parts.length === 0) {
    return "";
  }

  return `Auto handover memilih ${parts.join(", ")}. Mohon lanjutkan tindak lanjut dari item yang sudah dipilih dan sesuaikan prioritas bila ada update terbaru dari pelanggan/provider.`;
}

function getResolutionItemTitle(item: ShiftHandoverResolutionItem) {
  return item.productName?.trim() || item.transactionId;
}

function buildBlockedTransactionsHref(items: ShiftHandoverResolutionItem[]) {
  const transactionIds = items.map((item) => item.transactionId).filter(Boolean);
  const params = new URLSearchParams({
    queue: "others",
    ids: transactionIds.join(","),
    highlight: transactionIds[0] || "",
  });

  return `/transactions?${params.toString()}`;
}

function buildDominantBlockedTransactionsHref(
  items: ShiftHandoverResolutionItem[],
  dominantOwner?: string | null
) {
  const dominantItems = items.filter((item) => item.claimedByUsername?.trim() === dominantOwner);
  if (dominantItems.length === 0) {
    return buildBlockedTransactionsHref(items);
  }

  return buildBlockedTransactionsHref(dominantItems);
}

function formatBlockedTransactionCountLabel(count: number) {
  return `${count} transaksi blocked`;
}

const RESOLUTION_BUCKET_ORDER = ["adopted", "alreadyMine", "resolved", "blocked"] as const;

type ResolutionBucketKey = (typeof RESOLUTION_BUCKET_ORDER)[number];

type ResolutionBucketConfig = {
  title: string;
  className: string;
  countLabel: (count: number) => string;
  summaryLabel: (count: number) => string;
};

const RESOLUTION_BUCKET_CONFIG: Record<ResolutionBucketKey, ResolutionBucketConfig> = {
  adopted: {
    title: "Masuk ke antrean saya",
    className: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
    countLabel: (count) => `${count} transaksi masuk`,
    summaryLabel: (count) => `${count} masuk ke antrean saya`,
  },
  alreadyMine: {
    title: "Sudah menjadi antrean saya",
    className: "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300",
    countLabel: (count) => `${count} transaksi sudah di saya`,
    summaryLabel: (count) => `${count} sudah di saya`,
  },
  resolved: {
    title: "Sudah tidak pending",
    className: "border-zinc-500/30 bg-zinc-500/10 text-zinc-700 dark:text-zinc-300",
    countLabel: (count) => `${count} transaksi selesai`,
    summaryLabel: (count) => `${count} selesai`,
  },
  blocked: {
    title: "Masih dipegang staf lain",
    className: "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300",
    countLabel: (count) => `${count} transaksi blocked`,
    summaryLabel: (count) => `${count} blocked`,
  },
};

function getResolutionBucketCountLabel(bucket: ResolutionBucketKey, count: number) {
  return RESOLUTION_BUCKET_CONFIG[bucket].countLabel(count);
}

function getResolutionBucketAnchorId(bucket: ResolutionBucketKey) {
  return `handover-resolution-${bucket}`;
}

function buildResolutionSummaryItems(details: ShiftHandoverAcknowledgeDetails) {
  return RESOLUTION_BUCKET_ORDER.flatMap((bucketKey) => {
    const count = details[bucketKey].length;
    if (count === 0) {
      return [];
    }

    return [
      {
        key: bucketKey,
        label: RESOLUTION_BUCKET_CONFIG[bucketKey].summaryLabel(count),
        className: RESOLUTION_BUCKET_CONFIG[bucketKey].className,
      },
    ];
  });
}

function hasDominantBlockedOwner(input: {
  count: number;
  dominantOwner?: string | null;
  dominantOwnerCount?: number;
}) {
  return Boolean(
    input.dominantOwner && input.dominantOwnerCount && input.dominantOwnerCount > input.count / 2
  );
}

function getBlockedReviewLabel(input: { count: number; dominantOwner?: string | null; dominantOwnerCount?: number }) {
  if (hasDominantBlockedOwner(input)) {
    return `Tinjau blocked milik ${input.dominantOwner}`;
  }

  return `Tinjau ${formatBlockedTransactionCountLabel(input.count)}`;
}

function getBlockedCopyLabel(input: { count: number; dominantOwner?: string | null; dominantOwnerCount?: number }) {
  if (hasDominantBlockedOwner(input)) {
    return `Salin tautan blocked milik ${input.dominantOwner}`;
  }

  return `Salin tautan ${formatBlockedTransactionCountLabel(input.count)}`;
}

function getDominantBlockedFocusLabel(input: {
  count: number;
  dominantOwner?: string | null;
  dominantOwnerCount?: number;
}) {
  if (hasDominantBlockedOwner(input)) {
    return `Fokus ke ${input.dominantOwner}`;
  }

  return `Fokus ke blocked utama`;
}

function getDominantBlockedCopyLabel(input: {
  count: number;
  dominantOwner?: string | null;
  dominantOwnerCount?: number;
}) {
  if (hasDominantBlockedOwner(input)) {
    return `Salin tautan ${input.dominantOwner}`;
  }

  return `Salin tautan blocked utama`;
}

function getDominantBlockedOwnerCopyLabel(input: {
  dominantOwner?: string | null;
  dominantOwnerCount?: number;
  count: number;
}) {
  if (hasDominantBlockedOwner(input)) {
    return `Salin PIC ${input.dominantOwner}`;
  }

  return `Salin PIC utama`;
}

function getDominantBlockedFollowUpCopyLabel(input: {
  dominantOwner?: string | null;
  dominantOwnerCount?: number;
  count: number;
}) {
  if (hasDominantBlockedOwner(input)) {
    return `Salin follow-up ${input.dominantOwner}`;
  }

  return `Salin follow-up blocked`;
}

function buildTopPriorityBlockedFollowUpMessage(input: {
  item: ShiftHandoverResolutionItem;
  handoverSummary?: string;
  acknowledgedAt?: string;
}) {
  const handoverContext = input.handoverSummary?.trim()
    ? `Ringkasan handover: ${input.handoverSummary.trim()}.`
    : null;
  const acknowledgedContext = input.acknowledgedAt
    ? `Diterima pada ${formatDateInTimezone(input.acknowledgedAt)}.`
    : null;
  const pendingAgeLabel = getResolutionPendingAgeLabel(input.item.timestamp);
  const transactionContext = `${input.item.transactionId} (${getResolutionItemTitle(input.item)}${pendingAgeLabel ? `, ${pendingAgeLabel}` : ""})`;

  return [
    input.item.claimedByUsername
      ? `Halo @${input.item.claimedByUsername}, mohon cek transaksi prioritas ${transactionContext} yang masih tertahan di antrean Anda.`
      : `Mohon cek transaksi prioritas ${transactionContext} yang masih blocked.`,
    handoverContext,
    acknowledgedContext,
  ]
    .filter(Boolean)
    .join(" ");
}

function buildDominantBlockedFollowUpMessage(input: {
  dominantOwner?: string | null;
  dominantOwnerCount?: number;
  totalCount: number;
  handoverSummary?: string;
  acknowledgedAt?: string;
  items?: ShiftHandoverResolutionItem[];
}) {
  const handoverContext = input.handoverSummary?.trim()
    ? `Ringkasan handover: ${input.handoverSummary.trim()}.`
    : null;
  const acknowledgedContext = input.acknowledgedAt
    ? `Diterima pada ${formatDateInTimezone(input.acknowledgedAt)}.`
    : null;
  const dominantOwnerItems = input.dominantOwner
    ? (input.items || [])
        .filter((item) => item.claimedByUsername?.trim() === input.dominantOwner)
        .sort((left, right) => {
          const leftTime = left.timestamp ? new Date(left.timestamp).getTime() : Number.POSITIVE_INFINITY;
          const rightTime = right.timestamp ? new Date(right.timestamp).getTime() : Number.POSITIVE_INFINITY;
          return leftTime - rightTime;
        })
    : [];
  const transactionPreviewItems = dominantOwnerItems.slice(0, 3);
  const remainingTransactionCount = Math.max(0, dominantOwnerItems.length - transactionPreviewItems.length);
  const transactionContext =
    transactionPreviewItems.length > 0
      ? `Transaksi: ${transactionPreviewItems
          .map((item) => {
            const pendingAgeMinutes = item.timestamp
              ? Math.max(0, Math.floor((Date.now() - new Date(item.timestamp).getTime()) / 60000))
              : null;
            const pendingAgeLabel = pendingAgeMinutes !== null
              ? `, ${formatElapsedMinutesCompact(pendingAgeMinutes)}`
              : "";

            return `${item.transactionId} (${getResolutionItemTitle(item)}${pendingAgeLabel})`;
          })
          .join(", ")}${remainingTransactionCount > 0 ? `, +${remainingTransactionCount} lainnya` : ""}.`
      : null;

  if (!input.dominantOwner || !input.dominantOwnerCount) {
    return [
      `Halo tim, ada ${input.totalCount} transaksi handover yang masih blocked dan perlu ditindaklanjuti.`,
      handoverContext,
      acknowledgedContext,
      transactionContext,
    ]
      .filter(Boolean)
      .join(" ");
  }

  return [
    `Halo @${input.dominantOwner}, ada ${input.dominantOwnerCount} dari ${input.totalCount} transaksi handover yang masih tertahan di antrean Anda. Mohon cek dan update tindak lanjutnya ya.`,
    handoverContext,
    acknowledgedContext,
    transactionContext,
  ]
    .filter(Boolean)
    .join(" ");
}

function getResolutionPendingAgeLabel(timestamp?: string) {
  if (!timestamp) {
    return null;
  }

  const ageMinutes = Math.max(0, Math.floor((Date.now() - new Date(timestamp).getTime()) / 60000));
  return formatElapsedMinutesCompact(ageMinutes);
}

function buildResolutionToastPreview(items: ShiftHandoverResolutionItem[], maxItems = 2) {
  const previewItems = items.slice(0, maxItems).map((item) => {
    return `${getResolutionItemTitle(item)} (${item.transactionId.slice(-8)})`;
  });

  if (previewItems.length === 0) {
    return null;
  }

  const remainingCount = Math.max(0, items.length - previewItems.length);
  return `${previewItems.join(", ")}${remainingCount > 0 ? `, +${remainingCount} lainnya` : ""}`;
}

function buildBlockedOwnerSummary(items: ShiftHandoverResolutionItem[]) {
  const ownerCounts = new Map<string, number>();

  for (const item of items) {
    const owner = item.claimedByUsername?.trim();
    if (!owner) {
      continue;
    }

    ownerCounts.set(owner, (ownerCounts.get(owner) || 0) + 1);
  }

  const entries = Array.from(ownerCounts.entries()).sort((left, right) => right[1] - left[1]);
  if (entries.length === 0) {
    return null;
  }

  const [topOwner, topOwnerCount] = entries[0];
  const ownerLabel = `${entries.length} staf`;
  const detailLabel = entries
    .map(([owner, count]) => `${count} dipegang ${owner}`)
    .join(", ");
  const dominantOwnerSummary =
    topOwnerCount > items.length / 2
      ? `Mayoritas tertahan di ${topOwner} (${topOwnerCount}/${items.length}).`
      : null;
  const oldestBlockedTimestamp = items
    .map((item) => item.timestamp)
    .filter((value): value is string => Boolean(value))
    .sort((left, right) => new Date(left).getTime() - new Date(right).getTime())[0];
  const oldestPendingAgeLabel = getResolutionPendingAgeLabel(oldestBlockedTimestamp);

  return {
    ownerCount: entries.length,
    dominantOwner: topOwner,
    dominantOwnerCount: topOwnerCount,
    oldestPendingAgeLabel,
    summary: `${items.length} transaksi masih dipegang ${ownerLabel}`,
    dominantOwnerSummary,
    details: detailLabel,
  };
}

const LAST_ACKNOWLEDGED_HANDOVER_STORAGE_KEY = "shift-handover:last-acknowledged-result";

type PersistedShiftHandoverResolutionState = {
  handover: ShiftHandoverRecord;
  details: ShiftHandoverAcknowledgeDetails;
};

function readPersistedShiftHandoverResolutionState(): PersistedShiftHandoverResolutionState | null {
  if (typeof window === "undefined") {
    return null;
  }

  const rawValue = window.sessionStorage.getItem(LAST_ACKNOWLEDGED_HANDOVER_STORAGE_KEY);
  if (!rawValue) {
    return null;
  }

  try {
    const parsed = JSON.parse(rawValue) as PersistedShiftHandoverResolutionState;
    if (!parsed?.handover?._id || !parsed.details) {
      window.sessionStorage.removeItem(LAST_ACKNOWLEDGED_HANDOVER_STORAGE_KEY);
      return null;
    }

    return parsed;
  } catch {
    window.sessionStorage.removeItem(LAST_ACKNOWLEDGED_HANDOVER_STORAGE_KEY);
    return null;
  }
}

function writePersistedShiftHandoverResolutionState(
  value: PersistedShiftHandoverResolutionState | null
) {
  if (typeof window === "undefined") {
    return;
  }

  if (!value) {
    window.sessionStorage.removeItem(LAST_ACKNOWLEDGED_HANDOVER_STORAGE_KEY);
    return;
  }

  window.sessionStorage.setItem(
    LAST_ACKNOWLEDGED_HANDOVER_STORAGE_KEY,
    JSON.stringify(value)
  );
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
  const [highlightedResolutionBucket, setHighlightedResolutionBucket] = useState<
    ResolutionBucketKey | null
  >(null);
  const resolutionHighlightTimeoutRef = useRef<number | null>(null);
  const [lastAcknowledgedHandoverId, setLastAcknowledgedHandoverId] = useState<string | null>(null);
  const [lastAcknowledgedHandoverPreview, setLastAcknowledgedHandoverPreview] =
    useState<ShiftHandoverRecord | null>(null);
  const [lastResolutionDetails, setLastResolutionDetails] =
    useState<ShiftHandoverAcknowledgeDetails | null>(null);

  useEffect(() => {
    const persistedState = readPersistedShiftHandoverResolutionState();
    if (!persistedState) {
      return;
    }

    setLastAcknowledgedHandoverId(persistedState.handover._id ?? null);
    setLastAcknowledgedHandoverPreview(persistedState.handover);
    setLastResolutionDetails(persistedState.details);
  }, []);

  useEffect(() => {
    return () => {
      if (resolutionHighlightTimeoutRef.current !== null) {
        window.clearTimeout(resolutionHighlightTimeoutRef.current);
      }
    };
  }, []);

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
  const now = new Date();
  const openHandovers = useMemo(
    () => handovers.filter((handover) => handover.status === "open"),
    [handovers]
  );
  const autoPriorityCandidates = useMemo(() => {
    return pendingTransactions
      .map<AutoPriorityCandidate | null>((transaction) => {
        const followUpState = transaction.followUp?.followUpAt
          ? getFollowUpState(transaction.followUp.followUpAt, now)
          : null;
        const slaState = getPendingSlaState(transaction.timestamp, now);
        const currentUserId = user?.id;
        const isMine = Boolean(currentUserId) && transaction.claimedByUserId === currentUserId;
        const isHandover = transaction.internalPriority === "handover";

        if (followUpState === "overdue") {
          const overdueMinutes = transaction.followUp?.followUpAt
            ? getElapsedMinutes(transaction.followUp.followUpAt, now)
            : 0;
          return {
            id: transaction.id,
            reason: "followup_overdue",
            score: 900 + Math.min(overdueMinutes ?? 0, 120),
          };
        }

        if (followUpState === "due") {
          return {
            id: transaction.id,
            reason: "followup_due",
            score: 760,
          };
        }

        if (isMine) {
          return {
            id: transaction.id,
            reason: "mine",
            score: 680,
          };
        }

        if (isHandover) {
          return {
            id: transaction.id,
            reason: "handover",
            score: 620,
          };
        }

        if (slaState === "breached") {
          const pendingAgeMinutes = getElapsedMinutes(transaction.timestamp, now);
          return {
            id: transaction.id,
            reason: "breached",
            score: 560 + Math.min(pendingAgeMinutes ?? 0, 120),
          };
        }

        return null;
      })
      .filter((item): item is AutoPriorityCandidate => item !== null)
      .sort((left, right) => right.score - left.score)
      .slice(0, 8);
  }, [now, pendingTransactions, user?.id]);
  const autoPriorityMap = useMemo(
    () => new Map(autoPriorityCandidates.map((candidate) => [candidate.id, candidate.reason])),
    [autoPriorityCandidates]
  );
  const resolutionSummaryItems = useMemo(
    () => (lastResolutionDetails ? buildResolutionSummaryItems(lastResolutionDetails) : []),
    [lastResolutionDetails]
  );

  const filteredHandovers = useMemo(() => {
    let nextHandovers: ShiftHandoverRecord[];

    switch (selectedFilter) {
      case "mine":
        nextHandovers = handovers.filter((handover) => handover.createdByUserId === user?.id);
        break;
      case "open":
        nextHandovers = handovers.filter((handover) => handover.status === "open");
        break;
      case "acknowledged_by_me":
        nextHandovers = handovers.filter((handover) => handover.acknowledgedByUserId === user?.id);
        break;
      default:
        nextHandovers = handovers;
        break;
    }

    if (
      lastAcknowledgedHandoverPreview &&
      !nextHandovers.some((handover) => handover._id === lastAcknowledgedHandoverPreview._id)
    ) {
      return [lastAcknowledgedHandoverPreview, ...nextHandovers];
    }

    return nextHandovers;
  }, [handovers, lastAcknowledgedHandoverPreview, selectedFilter, user?.id]);

  useEffect(() => {
    if (!lastAcknowledgedHandoverId || !lastResolutionDetails) {
      return;
    }

    const acknowledgedHandover = handovers.find(
      (handover) => handover._id === lastAcknowledgedHandoverId && handover.status === "acknowledged"
    );

    if (!acknowledgedHandover) {
      return;
    }

    setLastAcknowledgedHandoverPreview(acknowledgedHandover);
    writePersistedShiftHandoverResolutionState({
      handover: acknowledgedHandover,
      details: lastResolutionDetails,
    });
  }, [handovers, lastAcknowledgedHandoverId, lastResolutionDetails]);

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

  const handleAutoSelectPriorities = () => {
    if (autoPriorityCandidates.length === 0) {
      toast({
        title: "Belum ada kandidat prioritas",
        description: "Tidak ada transaksi pending yang memenuhi rule auto handover saat ini.",
      });
      return;
    }

    const nextSelectedIds = autoPriorityCandidates.map((candidate) => candidate.id);
    const reasonCounts = autoPriorityCandidates.reduce(
      (accumulator, candidate) => {
        accumulator[candidate.reason] += 1;
        return accumulator;
      },
      {
        followup_overdue: 0,
        followup_due: 0,
        mine: 0,
        handover: 0,
        breached: 0,
      } as Record<AutoPriorityReason, number>
    );

    setSelectedIds(nextSelectedIds);
    setSummary((current) => {
      if (current.trim()) {
        return current;
      }

      return buildAutoSummary({
        overdueCount: reasonCounts.followup_overdue,
        dueCount: reasonCounts.followup_due,
        mineCount: reasonCounts.mine,
        handoverCount: reasonCounts.handover,
        breachedCount: reasonCounts.breached,
      });
    });

    toast({
      title: "Prioritas handover dipilih",
      description: `${nextSelectedIds.length} transaksi penting sudah dipilih otomatis. Cek ulang sebelum menyimpan.`,
    });
  };

  const handleAcknowledge = async (handoverId: string) => {
    setAcknowledgingId(handoverId);
    try {
      const result = await acknowledgeShiftHandoverInDB(handoverId);
      toast({
        title: result.success ? "Handover masuk ke antrean saya" : "Gagal menerima handover sif",
        description: result.message,
        variant: result.success ? "default" : "destructive",
      });
      if (result.success) {
        const handoverPreview = handovers.find((handover) => handover._id === handoverId);
        const acknowledgedPreview = handoverPreview
          ? {
              ...handoverPreview,
              status: "acknowledged" as const,
              acknowledgedAt: new Date().toISOString(),
              acknowledgedByUserId: user?.id,
              acknowledgedByUsername: user?.username,
            }
          : null;

        setLastAcknowledgedHandoverId(handoverId);
        setLastResolutionDetails(result.details ?? null);
        setLastAcknowledgedHandoverPreview(acknowledgedPreview);
        writePersistedShiftHandoverResolutionState(
          acknowledgedPreview && result.details
            ? {
                handover: acknowledgedPreview,
                details: result.details,
              }
            : null
        );
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

  const handleJumpToResolutionBucket = (bucket: ResolutionBucketKey) => {
    if (resolutionHighlightTimeoutRef.current !== null) {
      window.clearTimeout(resolutionHighlightTimeoutRef.current);
    }

    setHighlightedResolutionBucket(bucket);
    window.location.hash = getResolutionBucketAnchorId(bucket);
    resolutionHighlightTimeoutRef.current = window.setTimeout(() => {
      setHighlightedResolutionBucket((current) => (current === bucket ? null : current));
      resolutionHighlightTimeoutRef.current = null;
    }, 1600);
  };

  const handleCopyBlockedTransactionsLink = async (items: ShiftHandoverResolutionItem[]) => {
    try {
      const blockedHref = buildBlockedTransactionsHref(items);
      await navigator.clipboard.writeText(new URL(blockedHref, window.location.origin).toString());
      const preview = buildResolutionToastPreview(items);
      toast({
        title: "Tautan blocked disalin",
        description: preview
          ? `Deep link blocked untuk ${preview} sudah disalin ke clipboard.`
          : "Deep link transaksi blocked dari handover ini sudah disalin ke clipboard.",
      });
    } catch {
      toast({
        title: "Gagal menyalin tautan",
        description: "Clipboard tidak tersedia di browser ini.",
        variant: "destructive",
      });
    }
  };

  const handleCopyDominantBlockedTransactionsLink = async (
    items: ShiftHandoverResolutionItem[],
    dominantOwner?: string | null
  ) => {
    try {
      const blockedHref = buildDominantBlockedTransactionsHref(items, dominantOwner);
      await navigator.clipboard.writeText(new URL(blockedHref, window.location.origin).toString());
      const dominantItems = dominantOwner
        ? items.filter((item) => item.claimedByUsername?.trim() === dominantOwner)
        : items;
      const preview = buildResolutionToastPreview(dominantItems);
      toast({
        title: "Tautan owner dominan disalin",
        description: dominantOwner
          ? preview
            ? `Deep link blocked ${dominantOwner} untuk ${preview} sudah disalin ke clipboard.`
            : `Deep link blocked untuk ${dominantOwner} sudah disalin ke clipboard.`
          : preview
            ? `Deep link blocked utama untuk ${preview} sudah disalin ke clipboard.`
            : "Deep link blocked untuk PIC dominan sudah disalin ke clipboard.",
      });
    } catch {
      toast({
        title: "Gagal menyalin tautan",
        description: "Clipboard tidak tersedia di browser ini.",
        variant: "destructive",
      });
    }
  };

  const handleCopyDominantBlockedOwner = async (input: {
    dominantOwner?: string | null;
    dominantOwnerCount?: number;
    totalCount?: number;
  }) => {
    if (!input.dominantOwner) {
      return;
    }

    try {
      await navigator.clipboard.writeText(input.dominantOwner);
      toast({
        title: "PIC dominan disalin",
        description:
          input.dominantOwnerCount && input.totalCount
            ? `${input.dominantOwner} memegang ${input.dominantOwnerCount} dari ${input.totalCount} transaksi blocked dan sudah disalin ke clipboard.`
            : `${input.dominantOwner} sudah disalin ke clipboard.`,
      });
    } catch {
      toast({
        title: "Gagal menyalin PIC",
        description: "Clipboard tidak tersedia di browser ini.",
        variant: "destructive",
      });
    }
  };

  const handleCopyDominantBlockedFollowUp = async (input: {
    dominantOwner?: string | null;
    dominantOwnerCount?: number;
    totalCount: number;
    handoverSummary?: string;
    acknowledgedAt?: string;
    items?: ShiftHandoverResolutionItem[];
  }) => {
    try {
      await navigator.clipboard.writeText(buildDominantBlockedFollowUpMessage(input));
      const dominantItems = input.dominantOwner
        ? (input.items || []).filter((item) => item.claimedByUsername?.trim() === input.dominantOwner)
        : input.items || [];
      const preview = buildResolutionToastPreview(dominantItems);
      toast({
        title: "Template follow-up disalin",
        description: input.dominantOwner
          ? preview
            ? `Pesan follow-up ${input.dominantOwner} untuk ${preview} sudah disalin ke clipboard.`
            : `Pesan follow-up untuk ${input.dominantOwner} sudah disalin ke clipboard.`
          : preview
            ? `Pesan follow-up blocked untuk ${preview} sudah disalin ke clipboard.`
            : "Pesan follow-up untuk PIC dominan sudah disalin ke clipboard.",
      });
    } catch {
      toast({
        title: "Gagal menyalin follow-up",
        description: "Clipboard tidak tersedia di browser ini.",
        variant: "destructive",
      });
    }
  };

  const handleCopyTopPriorityBlockedFollowUp = async (input: {
    item: ShiftHandoverResolutionItem;
    handoverSummary?: string;
    acknowledgedAt?: string;
  }) => {
    try {
      await navigator.clipboard.writeText(buildTopPriorityBlockedFollowUpMessage(input));
      toast({
        title: "Follow-up prioritas disalin",
        description: `Pesan follow-up ${getResolutionItemTitle(input.item)} (${input.item.transactionId.slice(-8)}) sudah disalin ke clipboard.`,
      });
    } catch {
      toast({
        title: "Gagal menyalin follow-up",
        description: "Clipboard tidak tersedia di browser ini.",
        variant: "destructive",
      });
    }
  };

  const handleCopyTopPriorityBlockedLink = async (input: {
    href: string;
    item: ShiftHandoverResolutionItem;
  }) => {
    try {
      await navigator.clipboard.writeText(new URL(input.href, window.location.origin).toString());
      toast({
        title: "Tautan prioritas disalin",
        description: `Deep link ${getResolutionItemTitle(input.item)} (${input.item.transactionId.slice(-8)}) sudah disalin ke clipboard.`,
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
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <Label htmlFor="handover-summary" className="text-sm font-medium text-[var(--ui-text)] dark:text-zinc-100">
                      Ringkasan operasional
                    </Label>
                    <p className="mt-1 text-xs text-[var(--ui-text-muted)] dark:text-zinc-400">
                      Tinjau lagi hasil auto pilih sebelum handover benar-benar disimpan.
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleAutoSelectPriorities}
                    disabled={isLoading || pendingTransactions.length === 0}
                    className="rounded-xl border-[var(--ui-accent)]/25 text-[var(--ui-accent)] hover:bg-[var(--ui-accent-bg)] hover:text-[var(--ui-accent-hover)]"
                  >
                    <ClipboardList className="mr-2 h-4 w-4" />
                    Auto pilih prioritas
                  </Button>
                </div>
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
                      const autoReason = autoPriorityMap.get(transaction.id);
                      const autoPresentation = autoReason
                        ? getAutoPriorityPresentation(autoReason)
                        : null;
                      const AutoReasonIcon = autoPresentation?.icon;
                      const followUpState = transaction.followUp?.followUpAt
                        ? getFollowUpState(transaction.followUp.followUpAt, now)
                        : null;
                      const pendingSlaState = getPendingSlaState(transaction.timestamp, now);
                      const followUpHelper =
                        followUpState === "overdue" && transaction.followUp?.followUpAt
                          ? `Terlambat ${formatElapsedMinutesCompact(getElapsedMinutes(transaction.followUp.followUpAt, now))}`
                          : followUpState === "due"
                            ? "Perlu dicek sekarang"
                            : null;
                      const pendingAge = formatElapsedMinutesCompact(
                        getElapsedMinutes(transaction.timestamp, now)
                      );

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
                          <div className="min-w-0 flex-1 space-y-1.5">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-semibold text-[var(--ui-text)] dark:text-zinc-100">
                                {transaction.productName}
                              </span>
                              {autoPresentation && AutoReasonIcon ? (
                                <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs ${autoPresentation.className}`}>
                                  <AutoReasonIcon className="h-3 w-3" /> {autoPresentation.label}
                                </span>
                              ) : null}
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
                            <div className="flex flex-wrap gap-2 text-xs text-[var(--ui-text-secondary)] dark:text-zinc-500">
                              <span>{transaction.id}</span>
                              <span>{formatDateInTimezone(transaction.timestamp)}</span>
                              {pendingSlaState === "breached" ? (
                                <span className="text-red-600 dark:text-red-300">Lewat SLA • {pendingAge}</span>
                              ) : null}
                              {followUpHelper ? (
                                <span className={followUpState === "overdue" ? "text-red-600 dark:text-red-300" : "text-amber-600 dark:text-amber-300"}>
                                  {followUpHelper}
                                </span>
                              ) : null}
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
                        {handover.status === "open" && (
                          <span>
                            Saat diterima, transaksi pending yang belum diklaim akan masuk ke Klaim Saya.
                          </span>
                        )}
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
                      {handover._id &&
                        handover.status === "acknowledged" &&
                        lastAcknowledgedHandoverId === handover._id &&
                        lastResolutionDetails && (
                          <div className="mt-4 rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-card)] p-4 dark:border-zinc-800 dark:bg-zinc-950">
                            <div className="mb-3">
                              <div className="flex items-center gap-2">
                                <CheckCircle2 className="h-4 w-4 text-[var(--ui-accent)]" />
                                <p className="text-sm font-semibold text-[var(--ui-text)] dark:text-zinc-100">
                                  Hasil penerimaan handover
                                </p>
                              </div>
                              {resolutionSummaryItems.length > 0 ? (
                                <div className="mt-2 space-y-2">
                                  <div className="flex flex-wrap gap-2">
                                    {resolutionSummaryItems.map((item) => (
                                      <a
                                        key={item.key}
                                        href={`#${getResolutionBucketAnchorId(item.key)}`}
                                        onClick={() => handleJumpToResolutionBucket(item.key)}
                                        className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-opacity hover:opacity-90 ${item.className}`}
                                      >
                                        <MoveDown className="h-3 w-3" />
                                        {item.label}
                                      </a>
                                    ))}
                                  </div>
                                  <p className="text-[11px] text-[var(--ui-text-secondary)] dark:text-zinc-400">
                                    Klik chip untuk lompat ke bucket terkait.
                                  </p>
                                </div>
                              ) : null}
                            </div>
                            <div className="space-y-3">
                              {lastResolutionDetails.resolved.length > 0 &&
                              lastResolutionDetails.adopted.length === 0 &&
                              lastResolutionDetails.alreadyMine.length === 0 &&
                              lastResolutionDetails.blocked.length === 0 ? (
                                <div className="rounded-2xl border border-zinc-500/20 bg-zinc-500/5 p-3 text-xs text-zinc-700 dark:text-zinc-300">
                                  Semua transaksi di handover ini sudah tidak pending saat diterima, jadi tidak ada item yang perlu ditindaklanjuti dari panel ini.
                                </div>
                              ) : null}
                              {RESOLUTION_BUCKET_ORDER.map((bucketKey) => {
                                const items = lastResolutionDetails[bucketKey];
                                if (items.length === 0) {
                                  return null;
                                }

                                const bucketPresentation = RESOLUTION_BUCKET_CONFIG[bucketKey];
                                const sortedItems =
                                  bucketKey === "blocked"
                                    ? [...items].sort((left, right) => {
                                        const leftTime = left.timestamp
                                          ? new Date(left.timestamp).getTime()
                                          : Number.POSITIVE_INFINITY;
                                        const rightTime = right.timestamp
                                          ? new Date(right.timestamp).getTime()
                                          : Number.POSITIVE_INFINITY;
                                        return leftTime - rightTime;
                                      })
                                    : items;
                                const blockedOwnerSummary =
                                  bucketKey === "blocked" ? buildBlockedOwnerSummary(sortedItems) : null;

                                return (
                                  <div
                                    key={bucketKey}
                                    id={getResolutionBucketAnchorId(bucketKey)}
                                    className={`rounded-2xl border p-3 scroll-mt-28 transition-all duration-300 dark:bg-zinc-900 ${
                                      highlightedResolutionBucket === bucketKey
                                        ? bucketKey === "blocked"
                                          ? "animate-pulse border-[var(--ui-accent)] bg-[var(--ui-accent-bg)] shadow-sm shadow-[var(--ui-accent)]/20 dark:border-[var(--ui-accent)]"
                                          : "border-[var(--ui-accent)] bg-[var(--ui-accent-bg)] shadow-sm shadow-[var(--ui-accent)]/20 dark:border-[var(--ui-accent)]"
                                        : "border-[var(--ui-border)] bg-[var(--ui-card-alt)] dark:border-zinc-800"
                                    }`}
                                  >
                                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                                      <div className="flex flex-wrap items-center gap-2">
                                        <span
                                          className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${bucketPresentation.className}`}
                                        >
                                          {bucketPresentation.title}
                                        </span>
                                        <span className="text-xs text-[var(--ui-text-secondary)] dark:text-zinc-500">
                                          {getResolutionBucketCountLabel(bucketKey, items.length)}
                                        </span>
                                      </div>
                                      {bucketKey === "blocked" ? (
                                        <div className="flex flex-wrap gap-2">
                                          <Button
                                            type="button"
                                            variant="outline"
                                            onClick={() => void handleCopyBlockedTransactionsLink(items)}
                                            className="h-8 rounded-full border-red-500/30 bg-red-500/10 px-2.5 py-1 text-xs font-medium text-red-700 hover:bg-red-500/15 dark:text-red-300"
                                          >
                                            <Copy className="mr-1 h-3 w-3" />
                                            {getBlockedCopyLabel({
                                              count: items.length,
                                              dominantOwner: blockedOwnerSummary?.dominantOwner,
                                              dominantOwnerCount: blockedOwnerSummary?.dominantOwnerCount,
                                            })}
                                          </Button>
                                          <Link
                                            href={buildBlockedTransactionsHref(items)}
                                            className="inline-flex items-center gap-1 rounded-full border border-red-500/30 bg-red-500/10 px-2.5 py-1 text-xs font-medium text-red-700 transition-colors hover:bg-red-500/15 dark:text-red-300"
                                          >
                                            {getBlockedReviewLabel({
                                              count: items.length,
                                              dominantOwner: blockedOwnerSummary?.dominantOwner,
                                              dominantOwnerCount: blockedOwnerSummary?.dominantOwnerCount,
                                            })}
                                            <ExternalLink className="h-3 w-3" />
                                          </Link>
                                        </div>
                                      ) : null}
                                    </div>
                                    {blockedOwnerSummary ? (
                                      <div className={`mb-3 rounded-xl border p-3 text-xs ${blockedOwnerSummary.dominantOwnerSummary ? "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300 shadow-sm shadow-red-500/10" : "border-red-500/20 bg-red-500/5 text-red-700 dark:text-red-300"}`}>
                                        <div className="flex flex-wrap items-center gap-2">
                                          <p className="font-semibold">{blockedOwnerSummary.summary}</p>
                                          {blockedOwnerSummary.oldestPendingAgeLabel ? (
                                            <span className="inline-flex items-center gap-1 rounded-full border border-red-500/30 bg-red-500/10 px-2 py-0.5 text-[11px] font-medium text-red-700 dark:text-red-300">
                                              Pending tertua {blockedOwnerSummary.oldestPendingAgeLabel}
                                            </span>
                                          ) : null}
                                        </div>
                                        {blockedOwnerSummary.dominantOwnerSummary ? (
                                          <div className="mt-2 flex flex-wrap items-start justify-between gap-2 rounded-lg border border-red-500/25 bg-red-500/10 px-2.5 py-2">
                                            <div className="flex items-start gap-2">
                                              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                                              <p className="font-medium leading-5">{blockedOwnerSummary.dominantOwnerSummary}</p>
                                            </div>
                                            <div className="space-y-2">
                                              <div className="flex flex-wrap gap-2">
                                                <Button
                                                  type="button"
                                                  variant="outline"
                                                  onClick={() =>
                                                    void handleCopyDominantBlockedOwner({
                                                      dominantOwner: blockedOwnerSummary.dominantOwner,
                                                      dominantOwnerCount: blockedOwnerSummary.dominantOwnerCount,
                                                      totalCount: items.length,
                                                    })
                                                  }
                                                  className="h-7 rounded-full border-red-500/30 bg-red-500/10 px-2.5 py-1 text-[11px] font-medium text-red-700 hover:bg-red-500/15 dark:text-red-300"
                                                >
                                                  <Copy className="mr-1 h-3 w-3" />
                                                  {getDominantBlockedOwnerCopyLabel({
                                                    count: items.length,
                                                    dominantOwner: blockedOwnerSummary.dominantOwner,
                                                    dominantOwnerCount: blockedOwnerSummary.dominantOwnerCount,
                                                  })}
                                                </Button>
                                                <Button
                                                  type="button"
                                                  variant="outline"
                                                  onClick={() =>
                                                    void handleCopyDominantBlockedTransactionsLink(
                                                      items,
                                                      blockedOwnerSummary.dominantOwner
                                                    )
                                                  }
                                                  className="h-7 rounded-full border-red-500/30 bg-red-500/10 px-2.5 py-1 text-[11px] font-medium text-red-700 hover:bg-red-500/15 dark:text-red-300"
                                                >
                                                  <Copy className="mr-1 h-3 w-3" />
                                                  {getDominantBlockedCopyLabel({
                                                    count: items.length,
                                                    dominantOwner: blockedOwnerSummary.dominantOwner,
                                                    dominantOwnerCount: blockedOwnerSummary.dominantOwnerCount,
                                                  })}
                                                </Button>
                                                <Button
                                                  type="button"
                                                  variant="outline"
                                                  onClick={() =>
                                                    void handleCopyDominantBlockedFollowUp({
                                                      dominantOwner: blockedOwnerSummary.dominantOwner,
                                                      dominantOwnerCount: blockedOwnerSummary.dominantOwnerCount,
                                                      totalCount: items.length,
                                                      handoverSummary: handover.summary,
                                                      acknowledgedAt: handover.acknowledgedAt,
                                                      items,
                                                    })
                                                  }
                                                  className="h-7 rounded-full border-red-500/30 bg-red-500/10 px-2.5 py-1 text-[11px] font-medium text-red-700 hover:bg-red-500/15 dark:text-red-300"
                                                >
                                                  <Copy className="mr-1 h-3 w-3" />
                                                  {getDominantBlockedFollowUpCopyLabel({
                                                    count: items.length,
                                                    dominantOwner: blockedOwnerSummary.dominantOwner,
                                                    dominantOwnerCount: blockedOwnerSummary.dominantOwnerCount,
                                                  })}
                                                </Button>
                                                <Link
                                                  href={buildDominantBlockedTransactionsHref(items, blockedOwnerSummary.dominantOwner)}
                                                  className="inline-flex items-center gap-1 rounded-full border border-red-500/30 bg-red-500/10 px-2.5 py-1 text-[11px] font-medium text-red-700 transition-colors hover:bg-red-500/15 dark:text-red-300"
                                                >
                                                  {getDominantBlockedFocusLabel({
                                                    count: items.length,
                                                    dominantOwner: blockedOwnerSummary.dominantOwner,
                                                    dominantOwnerCount: blockedOwnerSummary.dominantOwnerCount,
                                                  })}
                                                  <ExternalLink className="h-3 w-3" />
                                                </Link>
                                              </div>
                                              <p className="text-[11px] leading-5 text-red-700/80 dark:text-red-300/80">
                                                Salin PIC untuk nama staf, salin tautan untuk membuka subset blocked yang sama, dan salin follow-up untuk pesan siap kirim ke PIC terkait.
                                              </p>
                                            </div>
                                          </div>
                                        ) : null}
                                        <p className="mt-2 text-[var(--ui-text-secondary)] dark:text-zinc-400">
                                          {blockedOwnerSummary.details}
                                        </p>
                                      </div>
                                    ) : null}
                                    <div className="space-y-2">
                                      {sortedItems.map((item, index) => (
                                        <div
                                          key={`${bucketKey}-${item.transactionId}`}
                                          className={`rounded-xl border p-3 ${bucketKey === "blocked" && index === 0 ? "border-red-500/35 bg-red-500/10 shadow-sm shadow-red-500/10 dark:border-red-500/40 dark:bg-red-500/10" : "border-[var(--ui-border)] bg-[var(--ui-card)] dark:border-zinc-800 dark:bg-zinc-950"}`}
                                        >
                                          <div className="flex flex-wrap items-start justify-between gap-2">
                                            <div className="min-w-0 flex-1">
                                              <div className="flex flex-wrap items-center gap-2">
                                                {bucketKey === "blocked" ? (
                                                  <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${index === 0 ? "border-red-500/40 bg-red-500/15 text-red-700 dark:text-red-300" : "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300"}`}>
                                                    #{index + 1}
                                                    {index === 0 ? " · Prioritas utama" : ""}
                                                  </span>
                                                ) : null}
                                                <p className="text-sm font-semibold text-[var(--ui-text)] dark:text-zinc-100">
                                                  {getResolutionItemTitle(item)}
                                                </p>
                                              </div>
                                              {item.details && (
                                                <p className="mt-1 text-xs text-[var(--ui-text-muted)] dark:text-zinc-400">
                                                  {item.details}
                                                </p>
                                              )}
                                            </div>
                                            <div className="flex flex-wrap items-center gap-2">
                                              {bucketKey === "blocked" && index === 0 ? (
                                                <div className="space-y-2">
                                                  <div className="flex flex-wrap items-center gap-2">
                                                    <Button
                                                      type="button"
                                                      variant="outline"
                                                      onClick={() =>
                                                        void handleCopyTopPriorityBlockedFollowUp({
                                                          item,
                                                          handoverSummary: handover.summary,
                                                          acknowledgedAt: handover.acknowledgedAt,
                                                        })
                                                      }
                                                      className="h-7 rounded-full border-red-500/35 bg-red-500/15 px-2.5 py-1 text-xs font-semibold text-red-700 hover:bg-red-500/20 dark:text-red-300"
                                                    >
                                                      <Copy className="mr-1 h-3 w-3" />
                                                      Salin follow-up prioritas
                                                    </Button>
                                                    <Button
                                                      type="button"
                                                      variant="outline"
                                                      onClick={() =>
                                                        void handleCopyTopPriorityBlockedLink({
                                                          href: `/transactions?queue=others&ids=${encodeURIComponent(item.transactionId)}&highlight=${encodeURIComponent(item.transactionId)}`,
                                                          item,
                                                        })
                                                      }
                                                      className="h-7 rounded-full border-red-500/35 bg-red-500/15 px-2.5 py-1 text-xs font-semibold text-red-700 hover:bg-red-500/20 dark:text-red-300"
                                                    >
                                                      <Copy className="mr-1 h-3 w-3" />
                                                      Salin tautan prioritas
                                                    </Button>
                                                    <Link
                                                      href={`/transactions?queue=others&ids=${encodeURIComponent(item.transactionId)}&highlight=${encodeURIComponent(item.transactionId)}`}
                                                      className="inline-flex items-center gap-1 rounded-full border border-red-500/35 bg-red-500/15 px-2.5 py-1 text-xs font-semibold text-red-700 hover:bg-red-500/20 dark:text-red-300"
                                                    >
                                                      Buka transaksi prioritas
                                                      <ExternalLink className="h-3 w-3" />
                                                    </Link>
                                                  </div>
                                                  <p className="text-[11px] leading-5 text-red-700/80 dark:text-red-300/80">
                                                    Salin follow-up untuk pesan siap kirim, salin tautan untuk membagikan deep link transaksi ini, dan buka transaksi untuk langsung menindaklanjuti dari daftar transaksi.
                                                  </p>
                                                </div>
                                              ) : null}
                                              <Link
                                                href={`/transactions?highlight=${encodeURIComponent(item.transactionId)}`}
                                                className="inline-flex items-center gap-1 rounded-full border border-[var(--ui-border)] bg-[var(--ui-card-alt)] px-2.5 py-1 text-xs text-[var(--ui-accent)] hover:bg-[var(--ui-accent-bg)] hover:text-[var(--ui-accent-hover)] dark:border-zinc-800 dark:bg-zinc-900"
                                              >
                                                {item.transactionId.slice(-8)}
                                                <ExternalLink className="h-3 w-3" />
                                              </Link>
                                            </div>
                                          </div>
                                          {(item.claimedByUsername || item.status) && (
                                            <div className="mt-2 flex flex-wrap gap-2">
                                              {item.claimedByUsername && (
                                                <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs ${bucketKey === "blocked" ? "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300" : "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300"}`}>
                                                  <Hand className="h-3 w-3" />
                                                  {bucketKey === "blocked"
                                                    ? `Dipegang ${item.claimedByUsername}`
                                                    : "Klaim saya"}
                                                </span>
                                              )}
                                              {bucketKey === "blocked" && item.timestamp ? (
                                                <span className="inline-flex items-center gap-1 rounded-full border border-red-500/30 bg-red-500/10 px-2 py-0.5 text-xs text-red-700 dark:text-red-300">
                                                  Pending {getResolutionPendingAgeLabel(item.timestamp)}
                                                </span>
                                              ) : null}
                                              {item.status && item.status !== "Pending" && (
                                                <span className="inline-flex items-center gap-1 rounded-full border border-zinc-500/30 bg-zinc-500/10 px-2 py-0.5 text-xs text-zinc-700 dark:text-zinc-300">
                                                  {item.status}
                                                </span>
                                              )}
                                            </div>
                                          )}
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
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
                            Terima & jadikan antrean saya
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
