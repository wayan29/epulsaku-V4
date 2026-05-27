"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogTrigger,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  CheckCircle2,
  XCircle,
  Loader2,
  Smartphone,
  Zap,
  Gamepad2,
  DollarSign,
  Ticket,
  LucideIcon,
  LucideAlertCircle,
  CalendarDays,
  Info,
  ShoppingBag,
  CreditCard,
  Hash,
  RefreshCw,
  Code2,
  UserSquare2,
  Trash2,
  AlertTriangle,
  Copy,
  Server,
  ShoppingCart,
  Building,
  Bot,
  Briefcase,
  FileText,
  UserCircle,
  Hand,
  MessageSquare,
  Flag,
  BellRing,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  addTransactionInternalNoteInDB,
  claimTransactionInDB,
  clearTransactionFollowUpInDB,
  deleteTransactionFromDB,
  listTransactionActivityTimelineFromDB,
  listTransactionInternalNotesFromDB,
  refreshPendingTransactionsFromDB,
  setTransactionFollowUpInDB,
  unclaimTransactionInDB,
  type TransactionFollowUp,
  type TransactionInternalNote,
  type TransactionTimelineItem,
} from "@/lib/transaction-utils";
import { formatDateInTimezone } from "@/lib/timezone";
import {
  CLAIMED_STALE_MINUTES,
  formatElapsedMinutesCompact,
  getClaimedStaleMinutes,
  getElapsedMinutes,
  getFollowUpState,
  getMinutesUntil,
  getPendingSlaState,
  isClaimedStale,
  PENDING_SLA_BREACH_MINUTES,
} from "@/lib/date-utils";

export const productIconsMapping: { [key: string]: LucideIcon } = {
  Pulsa: Smartphone,
  "Token Listrik": Zap,
  "Game Topup": Gamepad2,
  "Digital Service": ShoppingBag,
  "FREE FIRE": Gamepad2,
  "MOBILE LEGENDS": Gamepad2,
  "GENSHIN IMPACT": Gamepad2,
  "HONKAI STAR RAIL": Gamepad2,
  PLN: Zap,
  "E-Money": CreditCard,
  Default: ShoppingBag,
};

export const productCategoryColors: {
  [key: string]: {
    light: string;
    dark: string;
    gradient: string;
    icon: string;
    cssClass: string;
  };
} = {
  Pulsa: {
    light: "bg-blue-50 text-blue-800 border-blue-200",
    dark: "dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-700/50",
    gradient: "from-blue-500 to-sky-400",
    icon: "text-blue-500 dark:text-blue-400",
    cssClass: "category-pulsa",
  },
  "Token Listrik": {
    light: "bg-yellow-50 text-yellow-800 border-yellow-200",
    dark: "dark:bg-yellow-900/30 dark:text-yellow-300 dark:border-yellow-700/50",
    gradient: "from-yellow-500 to-amber-400",
    icon: "text-yellow-500 dark:text-yellow-400",
    cssClass: "category-token",
  },
  Game: {
    light: "bg-purple-50 text-purple-800 border-purple-200",
    dark: "dark:bg-purple-900/30 dark:text-purple-300 dark:border-purple-700/50",
    gradient: "from-purple-500 to-indigo-400",
    icon: "text-purple-500 dark:text-purple-400",
    cssClass: "category-game",
  },
  "E-Money": {
    light: "bg-green-50 text-green-800 border-green-200",
    dark: "dark:bg-green-900/30 dark:text-green-300 dark:border-green-700/50",
    gradient: "from-green-500 to-emerald-400",
    icon: "text-green-500 dark:text-green-400",
    cssClass: "category-emoney",
  },
  Default: {
    light: "bg-gray-50 text-gray-800 border-gray-200",
    dark: "dark:bg-gray-900/30 dark:text-gray-300 dark:border-gray-700/50",
    gradient: "from-gray-500 to-gray-400",
    icon: "text-gray-500 dark:text-gray-400",
    cssClass: "category-default",
  },
};

export type TransactionStatus = "Sukses" | "Pending" | "Gagal";

export interface TransactionCore {
  id: string;
  productName: string;
  details: string;
  costPrice: number;
  sellingPrice: number;
  status: TransactionStatus;
  timestamp: string;
  serialNumber?: string;
  failureReason?: string;
  buyerSkuCode: string;
  originalCustomerNo: string;
  productCategoryFromProvider: string;
  productBrandFromProvider: string;
  provider: "digiflazz" | "tokovoucher";
  source?: "web" | "telegram_bot";
  providerTransactionId?: string;
  transactionYear?: number;
  transactionMonth?: number;
  transactionDayOfMonth?: number;
  transactionDayOfWeek?: number;
  transactionHour?: number;
  transactedBy?: string;
}

export type TransactionInternalPriority = "normal" | "handover";

export interface Transaction extends TransactionCore {
  iconName: string;
  categoryKey: string;
  _id?: string;
  claimedByUserId?: string;
  claimedByUsername?: string;
  claimedAt?: string;
  internalPriority?: TransactionInternalPriority;
  lastInternalNoteAt?: string;
  lastInternalNotePreview?: string;
  followUp?: TransactionFollowUp | null;
  latestActivityPreview?: TransactionTimelineItem[];
}

export interface NewTransactionInput extends TransactionCore {}

const statusConfig: {
  [key in TransactionStatus]: {
    icon: LucideIcon;
    color: string;
    textColor: string;
    displayText: string;
  };
} = {
  Sukses: {
    icon: CheckCircle2,
    color: "bg-green-500 hover:bg-green-500",
    textColor: "text-green-700",
    displayText: "Sukses",
  },
  Pending: {
    icon: Loader2,
    color: "bg-yellow-500 hover:bg-yellow-500",
    textColor: "text-yellow-700",
    displayText: "Pending",
  },
  Gagal: {
    icon: XCircle,
    color: "bg-red-500 hover:bg-red-500",
    textColor: "text-red-700",
    displayText: "Gagal",
  },
};

interface TransactionItemProps {
  transaction: Transaction;
  onTransactionUpdate: () => void;
  isHighlighted?: boolean;
  now?: Date;
}

interface DetailRowProps {
  icon: LucideIcon;
  label: string;
  value: React.ReactNode;
  valueClassName?: string;
  isMono?: boolean;
}

const DetailRow: React.FC<DetailRowProps> = ({
  icon: Icon,
  label,
  value,
  valueClassName,
  isMono,
}) => (
  <div className="grid grid-cols-[max-content_1fr] items-start gap-x-3 py-1.5">
    <div className="flex items-center text-[var(--ui-text-muted)] dark:text-zinc-400">
      <Icon className="mr-2 h-4 w-4 flex-shrink-0" />
      <span className="text-xs font-medium sm:text-sm">{label}:</span>
    </div>
    <div
      className={`min-w-0 break-all text-xs text-[var(--ui-text)] dark:text-zinc-100 sm:text-sm ${valueClassName} ${
        isMono ? "font-mono" : ""
      }`}
    >
      {value}
    </div>
  </div>
);

function getTimelinePresentation(item: TransactionTimelineItem): {
  icon: LucideIcon;
  label: string;
  className: string;
} {
  switch (item.type) {
    case "claimed":
      return {
        icon: Hand,
        label: "Klaim",
        className: "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300",
      };
    case "unclaimed":
      return {
        icon: Hand,
        label: "Lepas Klaim",
        className: "border-zinc-500/30 bg-zinc-500/10 text-zinc-700 dark:text-zinc-300",
      };
    case "internal_note_added":
      return {
        icon: MessageSquare,
        label: "Catatan",
        className: "border-violet-500/30 bg-violet-500/10 text-violet-700 dark:text-violet-300",
      };
    case "status_changed":
      return {
        icon: RefreshCw,
        label: "Status",
        className: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
      };
    case "handover_marked":
      return {
        icon: Flag,
        label: "Handover",
        className: "border-orange-500/30 bg-orange-500/10 text-orange-700 dark:text-orange-300",
      };
    case "handover_acknowledged":
      return {
        icon: CheckCircle2,
        label: "Handover Diambil",
        className: "border-teal-500/30 bg-teal-500/10 text-teal-700 dark:text-teal-300",
      };
    case "follow_up_set":
      return {
        icon: BellRing,
        label: "Follow-up",
        className: "border-indigo-500/30 bg-indigo-500/10 text-indigo-700 dark:text-indigo-300",
      };
    case "follow_up_cleared":
      return {
        icon: CheckCircle2,
        label: "Follow-up Selesai",
        className: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
      };
    case "deleted":
      return {
        icon: Trash2,
        label: "Dihapus",
        className: "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300",
      };
    case "legacy_note":
    default:
      return {
        icon: MessageSquare,
        label: "Catatan Lama",
        className: "border-[var(--ui-border)] bg-[var(--ui-card-alt)] text-[var(--ui-text-muted)] dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300",
      };
  }
}

function getTimelineActorLabel(item: TransactionTimelineItem): string {
  if (item.actorUsername) {
    return item.actorUsername;
  }

  if (item.actorType === "webhook") {
    return "Webhook";
  }

  if (item.actorType === "system") {
    return "Sistem";
  }

  return "Staff";
}

function getTimelineMetadataChips(item: TransactionTimelineItem): string[] {
  const chips: string[] = [];
  const metadata = item.metadata;

  if (!metadata) {
    return chips;
  }

  if (item.type === "status_changed") {
    if (
      typeof metadata.previousStatus === "string" &&
      typeof metadata.nextStatus === "string"
    ) {
      chips.push(`${metadata.previousStatus} → ${metadata.nextStatus}`);
    }
  }

  if (item.type === "handover_marked" && typeof metadata.handoverSummary === "string") {
    chips.push("Masuk handover");
  }

  if (
    item.type === "handover_acknowledged" &&
    typeof metadata.handoverCreatedByUsername === "string" &&
    metadata.handoverCreatedByUsername.trim()
  ) {
    chips.push(`Dari ${metadata.handoverCreatedByUsername}`);
  }

  if (item.type === "handover_acknowledged") {
    chips.push("Handover diterima");
  }

  if (
    item.type === "follow_up_set" &&
    typeof metadata.followUpAt === "string" &&
    metadata.followUpAt.trim()
  ) {
    chips.push(`Jadwal ${formatDateInTimezone(metadata.followUpAt)}`);
  }

  if (item.type === "follow_up_cleared") {
    chips.push("Reminder selesai");
  }

  if (item.type === "internal_note_added" && metadata.priority === "handover") {
    chips.push("Catatan handover");
  }

  if (
    item.type === "unclaimed" &&
    typeof metadata.previousClaimedByUsername === "string" &&
    metadata.previousClaimedByUsername.trim()
  ) {
    chips.push(`Sebelumnya ${metadata.previousClaimedByUsername}`);
  }

  if (item.type === "legacy_note") {
    chips.push("Riwayat lama");
  }

  return chips;
}

function toDateTimeLocalValue(value: string | null | undefined): string {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  const hours = `${date.getHours()}`.padStart(2, "0");
  const minutes = `${date.getMinutes()}`.padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function getTimelineSourceLabel(item: TransactionTimelineItem): string | null {
  switch (item.source) {
    case "webhook_digiflazz":
      return "Digiflazz webhook";
    case "webhook_tokovoucher":
      return "TokoVoucher webhook";
    case "manual_refresh":
      return "Refresh manual";
    case "shift_handover":
      return "Shift handover";
    case "ui":
      return "Panel staf";
    case "legacy_note":
      return "Riwayat lama";
    default:
      return null;
  }
}

export default function TransactionItem({
  transaction,
  onTransactionUpdate,
  isHighlighted = false,
  now = new Date(),
}: TransactionItemProps) {
  const {
    id,
    productName,
    details,
    status,
    timestamp,
    sellingPrice,
    serialNumber,
    failureReason,
    buyerSkuCode,
    originalCustomerNo,
    iconName,
    provider,
    costPrice,
    productBrandFromProvider,
    source,
    providerTransactionId,
    transactedBy,
    claimedByUserId,
    claimedByUsername,
    claimedAt,
    internalPriority,
    lastInternalNoteAt,
    lastInternalNotePreview,
    followUp,
    latestActivityPreview = [],
  } = transaction;

  const { user } = useAuth();
  const { toast } = useToast();
  const router = useRouter();

  const displaySellingPrice = useMemo(() => {
    if (typeof sellingPrice === "number" && sellingPrice > 0) {
      return sellingPrice;
    }

    if (costPrice < 20000) return costPrice + 1000;
    if (costPrice <= 50000) return costPrice + 1500;
    return costPrice + 2000;
  }, [costPrice, sellingPrice]);

  const ProductIconComponent =
    productIconsMapping[iconName] || productIconsMapping["Default"];

  const currentStatusConfig = statusConfig[status] || statusConfig["Gagal"];
  const SIcon = currentStatusConfig.icon;

  const [isDetailsDialogOpen, setIsDetailsDialogOpen] = useState(false);
  const [isCheckingStatus, setIsCheckingStatus] = useState(false);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const [isNotesDialogOpen, setIsNotesDialogOpen] = useState(false);
  const [isFollowUpDialogOpen, setIsFollowUpDialogOpen] = useState(false);
  const [isLoadingNotes, setIsLoadingNotes] = useState(false);
  const [isLoadingTimeline, setIsLoadingTimeline] = useState(false);
  const [isSavingNote, setIsSavingNote] = useState(false);
  const [isSavingFollowUp, setIsSavingFollowUp] = useState(false);
  const [isClearingFollowUp, setIsClearingFollowUp] = useState(false);
  const [isClaiming, setIsClaiming] = useState(false);
  const [isUnclaiming, setIsUnclaiming] = useState(false);
  const [notes, setNotes] = useState<TransactionInternalNote[]>([]);
  const [timelineItems, setTimelineItems] = useState<TransactionTimelineItem[]>([]);
  const [noteInput, setNoteInput] = useState("");
  const [followUpInput, setFollowUpInput] = useState(() => toDateTimeLocalValue(followUp?.followUpAt));
  const [followUpNoteInput, setFollowUpNoteInput] = useState(followUp?.note || "");
  const [markForHandover, setMarkForHandover] = useState(
    internalPriority === "handover"
  );

  useEffect(() => {
    setMarkForHandover(internalPriority === "handover");
  }, [internalPriority]);

  useEffect(() => {
    setFollowUpInput(toDateTimeLocalValue(followUp?.followUpAt));
    setFollowUpNoteInput(followUp?.note || "");
  }, [followUp?.followUpAt, followUp?.note]);

  const isPending = status === "Pending";
  const isMine = !!user?.id && claimedByUserId === user.id;
  const isClaimedByOther = !!claimedByUserId && !isMine;
  const pendingElapsedMinutes = isPending ? getElapsedMinutes(timestamp, now) : null;
  const pendingElapsedLabel = isPending
    ? formatElapsedMinutesCompact(pendingElapsedMinutes)
    : null;
  const pendingSlaState = isPending ? getPendingSlaState(timestamp, now) : null;
  const pendingBreachMinutes =
    pendingElapsedMinutes === null
      ? null
      : Math.max(0, pendingElapsedMinutes - PENDING_SLA_BREACH_MINUTES);
  const pendingSlaBadgeClass =
    pendingSlaState === "breached"
      ? "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300"
      : pendingSlaState === "warning"
        ? "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300"
        : "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
  const pendingSlaLabel =
    pendingSlaState === "breached"
      ? "Lewat SLA"
      : pendingSlaState === "warning"
        ? "Mendekati SLA"
        : "Masih aman";
  const pendingSlaHelperText =
    pendingSlaState === "breached"
      ? `Lewat SLA ${formatElapsedMinutesCompact(pendingBreachMinutes)}`
      : `Usia pending ${pendingElapsedLabel}`;
  const followUpState = followUp?.followUpAt ? getFollowUpState(followUp.followUpAt, now) : null;
  const followUpMinutesUntil = followUp?.followUpAt ? getMinutesUntil(followUp.followUpAt, now) : null;
  const followUpOverdueMinutes =
    followUpMinutesUntil !== null && followUpMinutesUntil < 0
      ? Math.abs(followUpMinutesUntil)
      : null;
  const claimedStaleMinutes = isPending
    ? getClaimedStaleMinutes(
        {
          claimedAt,
          lastInternalNoteAt,
          followUpCreatedAt: followUp?.createdAt,
        },
        now
      )
    : null;
  const hasClaimedStaleSignal =
    isPending &&
    isClaimedStale(
      {
        claimedAt,
        lastInternalNoteAt,
        followUpCreatedAt: followUp?.createdAt,
      },
      now,
      CLAIMED_STALE_MINUTES
    );
  const followUpBadgeClass =
    followUpState === "overdue"
      ? "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300"
      : followUpState === "due"
        ? "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300"
        : "border-indigo-500/30 bg-indigo-500/10 text-indigo-700 dark:text-indigo-300";
  const followUpLabel =
    followUpState === "overdue"
      ? `Terlambat ${formatElapsedMinutesCompact(followUpOverdueMinutes)}`
      : followUpState === "due"
        ? followUpMinutesUntil === 0
          ? "Jatuh tempo sekarang"
          : `Jatuh tempo ${formatElapsedMinutesCompact(followUpMinutesUntil)}`
        : followUpMinutesUntil !== null
          ? `Follow-up ${formatElapsedMinutesCompact(followUpMinutesUntil)}`
          : "Follow-up aktif";
  const isOverdueFollowUp = followUpState === "overdue";
  const isDueFollowUp = followUpState === "due";
  const activeFollowUpButtonClass = isOverdueFollowUp
    ? "border-red-500/30 bg-red-500/10 text-red-700 hover:bg-red-500/15 dark:text-red-300"
    : isDueFollowUp
      ? "border-amber-500/30 bg-amber-500/10 text-amber-700 hover:bg-amber-500/15 dark:text-amber-300"
      : followUpBadgeClass;

  const loadNotes = useCallback(async () => {
    setIsLoadingNotes(true);
    try {
      const result = await listTransactionInternalNotesFromDB(id);
      setNotes(result);
    } catch (error) {
      toast({
        title: "Gagal memuat catatan",
        description:
          error instanceof Error ? error.message : "Tidak dapat memuat catatan internal.",
        variant: "destructive",
      });
    } finally {
      setIsLoadingNotes(false);
    }
  }, [id, toast]);

  const loadTimeline = useCallback(async () => {
    setIsLoadingTimeline(true);
    try {
      const result = await listTransactionActivityTimelineFromDB(id);
      setTimelineItems(result);
    } catch (error) {
      toast({
        title: "Gagal memuat timeline",
        description:
          error instanceof Error ? error.message : "Tidak dapat memuat aktivitas transaksi.",
        variant: "destructive",
      });
    } finally {
      setIsLoadingTimeline(false);
    }
  }, [id, toast]);

  useEffect(() => {
    if (isNotesDialogOpen) {
      void loadNotes();
    }
  }, [isNotesDialogOpen, loadNotes]);

  useEffect(() => {
    if (isDetailsDialogOpen) {
      void loadTimeline();
    }
  }, [isDetailsDialogOpen, loadTimeline]);

  const stopCardOpen = (event: React.SyntheticEvent) => {
    event.preventDefault();
    event.stopPropagation();
  };

  const handleViewReceipt = () => {
    if (status === "Sukses") {
      router.push(`/receipt/${id}`);
      return;
    }

    toast({
      title: "Struk belum tersedia",
      description: "Struk hanya bisa dibuka untuk transaksi yang sukses.",
    });
  };

  const handleCheckStatus = async () => {
    if (!id) {
      toast({
        title: "Gagal",
        description: "ID transaksi tidak ditemukan.",
        variant: "destructive",
      });
      return;
    }

    setIsCheckingStatus(true);
    try {
      const refreshResult = await refreshPendingTransactionsFromDB([id]);
      const itemResult = refreshResult.items[0];

      if (!refreshResult.success || !itemResult) {
        toast({
          title: "Cek status gagal",
          description:
            refreshResult.message ||
            "Tidak dapat merefresh transaksi pending ini dari server.",
          variant: "destructive",
        });
        return;
      }

      if (itemResult.skipped) {
        toast({
          title: "Dikelola webhook",
          description:
            itemResult.message ||
            "Transaksi pending ini diperbarui oleh webhook, bukan refresh manual.",
        });
        return;
      }

      if (itemResult.changed) {
        toast({
          title: "Status diperbarui",
          description: `Status transaksi berubah menjadi ${itemResult.currentStatus}. ${
            itemResult.message || ""
          }`,
        });
        void onTransactionUpdate();
        return;
      }

      toast({
        title: "Status belum berubah",
        description: `Status transaksi masih ${itemResult.currentStatus}. ${
          itemResult.message || "Belum ada info baru."
        }`,
      });
    } catch (error) {
      console.error("Gagal mengecek status transaksi:", error);
      toast({
        title: "Gagal mengecek status",
        description:
          error instanceof Error ? error.message : "Terjadi error yang tidak diketahui.",
        variant: "destructive",
      });
    } finally {
      setIsCheckingStatus(false);
      setIsDetailsDialogOpen(false);
    }
  };

  const handleDeleteTransaction = async () => {
    const deleteResult = await deleteTransactionFromDB(id);
    if (deleteResult.success) {
      toast({
        title: "Transaksi dihapus",
        description: `ID transaksi ${id} sudah dihapus dari riwayat.`,
      });
      onTransactionUpdate();
    } else {
      toast({
        title: "Gagal menghapus",
        description: deleteResult.message || `Tidak dapat menghapus ID transaksi ${id}.`,
        variant: "destructive",
      });
    }
    setIsConfirmingDelete(false);
    setIsDetailsDialogOpen(false);
  };

  const handleCopySn = () => {
    if (!serialNumber) return;

    navigator.clipboard
      .writeText(serialNumber)
      .then(() => {
        toast({
          title: "SN disalin",
          description: "Serial number sudah disalin ke clipboard.",
        });
      })
      .catch((err) => {
        console.error("Gagal menyalin SN:", err);
        toast({
          title: "Gagal menyalin",
          description: "Serial number tidak dapat disalin.",
          variant: "destructive",
        });
      });
  };

  const handleClaim = async () => {
    setIsClaiming(true);
    try {
      const result = await claimTransactionInDB(id);
      toast({
        title: result.success ? "Transaksi diklaim" : "Klaim gagal",
        description: result.message,
        variant: result.success ? "default" : "destructive",
      });
      if (result.success) {
        onTransactionUpdate();
      }
    } finally {
      setIsClaiming(false);
    }
  };

  const handleUnclaim = async () => {
    setIsUnclaiming(true);
    try {
      const result = await unclaimTransactionInDB(id);
      toast({
        title: result.success ? "Klaim dilepas" : "Lepas klaim gagal",
        description: result.message,
        variant: result.success ? "default" : "destructive",
      });
      if (result.success) {
        onTransactionUpdate();
      }
    } finally {
      setIsUnclaiming(false);
    }
  };

  const handleSaveNote = async () => {
    setIsSavingNote(true);
    try {
      const result = await addTransactionInternalNoteInDB(
        id,
        noteInput,
        markForHandover ? "handover" : "normal"
      );

      toast({
        title: result.success ? "Catatan internal tersimpan" : "Gagal menyimpan",
        description: result.message,
        variant: result.success ? "default" : "destructive",
      });

      if (result.success) {
        setNoteInput("");
        await Promise.all([loadNotes(), loadTimeline()]);
        onTransactionUpdate();
      }
    } finally {
      setIsSavingNote(false);
    }
  };

  const handleFollowUpDateChange = (event: ChangeEvent<HTMLInputElement>) => {
    setFollowUpInput(event.target.value);
  };

  const handleSaveFollowUp = async () => {
    setIsSavingFollowUp(true);
    try {
      const result = await setTransactionFollowUpInDB({
        transactionId: id,
        dueAt: followUpInput,
        note: followUpNoteInput,
      });

      toast({
        title: result.success ? "Follow-up tersimpan" : "Gagal menyimpan follow-up",
        description: result.message,
        variant: result.success ? "default" : "destructive",
      });

      if (result.success) {
        setIsFollowUpDialogOpen(false);
        await Promise.all([loadTimeline(), loadNotes()]);
        onTransactionUpdate();
      }
    } finally {
      setIsSavingFollowUp(false);
    }
  };

  const handleClearFollowUp = async () => {
    setIsClearingFollowUp(true);
    try {
      const result = await clearTransactionFollowUpInDB(id);
      toast({
        title: result.success ? "Follow-up selesai" : "Gagal menghapus follow-up",
        description: result.message,
        variant: result.success ? "default" : "destructive",
      });

      if (result.success) {
        setIsFollowUpDialogOpen(false);
        await Promise.all([loadTimeline(), loadNotes()]);
        onTransactionUpdate();
      }
    } finally {
      setIsClearingFollowUp(false);
    }
  };

  const providerDisplayName =
    provider === "tokovoucher" ? "TokoVoucher" : "Digiflazz";
  const providerColorClass =
    provider === "tokovoucher"
      ? "border-[var(--ui-accent)]/25 bg-[var(--ui-accent-bg)] text-[var(--ui-accent)]"
      : "border-purple-500/50 bg-purple-50 text-purple-700 dark:border-purple-400/50 dark:bg-purple-900/30 dark:text-purple-300";
  const statusBadgeClass =
    status === "Sukses"
      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
      : status === "Gagal"
        ? "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300"
        : "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300";

  const getCategoryColor = () => {
    const gameKeywords = [
      "GAME",
      "FREE FIRE",
      "MOBILE LEGENDS",
      "GENSHIN IMPACT",
      "HONKAI STAR RAIL",
    ];
    const productNameUpper = (productName || "").toUpperCase();
    const iconNameUpper = (iconName || "").toUpperCase();

    if (
      gameKeywords.some(
        (kw) => iconNameUpper.includes(kw) || productNameUpper.includes(kw)
      )
    ) {
      return productCategoryColors["Game"];
    }
    if (iconNameUpper.includes("PULSA")) {
      return productCategoryColors["Pulsa"];
    }
    if (iconNameUpper.includes("TOKEN") || iconNameUpper.includes("PLN")) {
      return productCategoryColors["Token Listrik"];
    }
    if (iconNameUpper.includes("E-MONEY")) {
      return productCategoryColors["E-Money"];
    }
    return productCategoryColors["Default"];
  };

  const latestCardActivities = latestActivityPreview.slice(0, 2);
  const hasOperationalNote = Boolean(lastInternalNotePreview);
  const hasActiveFollowUp = Boolean(followUp?.followUpAt);
  const hasActivityPreview = latestCardActivities.length > 0;
  const hasOperationalSignals =
    Boolean(claimedByUsername) || hasOperationalNote || hasActiveFollowUp || isHighlighted || hasActivityPreview;
  const noteButtonLabel = hasOperationalNote ? "Lihat Catatan" : "Catatan";
  const noteButtonToneClass = hasOperationalNote
    ? "border-violet-500/30 bg-violet-500/10 text-violet-700 hover:bg-violet-500/15 dark:text-violet-300"
    : "border-[var(--ui-accent)]/25 text-[var(--ui-accent)] hover:bg-[var(--ui-accent-bg)] hover:text-[var(--ui-accent-hover)]";

  const categoryColor = getCategoryColor();
  const highlightCardClass = isHighlighted
    ? "ring-2 ring-[var(--ui-accent)] ring-offset-2 ring-offset-background"
    : "";
  const overdueFollowUpCardClass =
    isPending && isOverdueFollowUp && !isClaimedByOther
      ? "border-red-200 bg-red-50/40 dark:border-red-900/30 dark:bg-red-950/20"
      : "";
  const cardTopBorderClass = isClaimedByOther
    ? "border-t-red-500"
    : isPending && isOverdueFollowUp
      ? "border-t-red-500"
      : "border-t-[var(--ui-accent)]";
  const otherClaimCardClass = isClaimedByOther
    ? "border-red-200 bg-red-50/70 dark:border-red-900/40 dark:bg-red-950/30"
    : "border-[var(--ui-border)] bg-[var(--ui-card)] dark:border-zinc-800 dark:bg-zinc-950";
  const otherClaimPanelClass = isClaimedByOther
    ? "border-red-200 bg-red-50/80 dark:border-red-900/40 dark:bg-red-950/40"
    : isPending && isOverdueFollowUp
      ? "border-red-500/20 bg-red-500/5 dark:border-red-900/30 dark:bg-red-950/20"
      : "border-[var(--ui-border)] bg-[var(--ui-card-alt)] dark:border-zinc-800 dark:bg-zinc-900";

  return (
    <>
      <AlertDialog open={isDetailsDialogOpen} onOpenChange={setIsDetailsDialogOpen}>
        <AlertDialogTrigger asChild>
          <Card
            className={`transaction-card ${categoryColor.cssClass} ${highlightCardClass} ${overdueFollowUpCardClass} ${otherClaimCardClass} group relative cursor-pointer overflow-hidden rounded-3xl border border-t-4 ${cardTopBorderClass} text-[var(--ui-text)] shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg dark:text-zinc-100`}
          >
            <div
              className={`absolute inset-0 bg-gradient-to-br ${categoryColor.gradient} opacity-0 transition-opacity duration-300 group-hover:opacity-10`}
            />
            <div className="absolute right-2 top-2">
              <Badge variant="outline" className={`status-badge shadow-sm ${statusBadgeClass}`}>
                <SIcon className={`mr-1 h-3 w-3 ${status === "Pending" ? "animate-spin" : ""}`} />
                {currentStatusConfig.displayText}
              </Badge>
            </div>
            <CardHeader className="pb-1 pt-4">
              <div className="flex items-start gap-3">
                <div
                  className={`flex items-center justify-center rounded-full p-2 transition-transform duration-300 group-hover:scale-110 ${categoryColor.light} ${categoryColor.dark}`}
                >
                  <ProductIconComponent className={`h-6 w-6 ${categoryColor.icon}`} />
                </div>
                <div className="space-y-1">
                  <CardTitle className="line-clamp-1 font-headline text-lg font-semibold text-[var(--ui-text)] dark:text-zinc-100">
                    {productName}
                  </CardTitle>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    <Badge variant="outline" className={`text-xs capitalize ${providerColorClass}`}>
                      {providerDisplayName}
                    </Badge>
                    {productBrandFromProvider && (
                      <Badge
                        variant="outline"
                        className="border-[var(--ui-border)] bg-[var(--ui-card-alt)] text-xs text-[var(--ui-text-muted)] dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400"
                      >
                        {productBrandFromProvider}
                      </Badge>
                    )}
                    {transactedBy && (
                      <Badge
                        className="border-[var(--ui-border)] bg-[var(--ui-card-alt)] text-xs text-[var(--ui-text-muted)] dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400"
                        variant="outline"
                      >
                        <UserCircle className="mr-1 h-3 w-3" /> {transactedBy}
                      </Badge>
                    )}
                    {claimedByUsername && (
                      <Badge
                        variant="outline"
                        className={hasClaimedStaleSignal ? "border-red-500/30 bg-red-500/10 text-xs text-red-700 dark:text-red-300" : isClaimedByOther ? "border-red-500/30 bg-red-500/10 text-xs text-red-700 dark:text-red-300" : "border-sky-500/30 bg-sky-500/10 text-xs text-sky-700 dark:text-sky-300"}
                      >
                        <Hand className="mr-1 h-3 w-3" /> {isMine ? "Klaim saya" : `Dipegang ${claimedByUsername}`}
                      </Badge>
                    )}
                    {hasClaimedStaleSignal && (
                      <Badge
                        variant="outline"
                        className="border-red-500/30 bg-red-500/10 text-xs text-red-700 dark:text-red-300"
                      >
                        <AlertTriangle className="mr-1 h-3 w-3" /> Klaim macet
                      </Badge>
                    )}
                    {internalPriority === "handover" && (
                      <Badge
                        variant="outline"
                        className="border-orange-500/30 bg-orange-500/10 text-xs text-orange-700 dark:text-orange-300"
                      >
                        <Flag className="mr-1 h-3 w-3" /> Perlu handover
                      </Badge>
                    )}
                    {isPending && isOverdueFollowUp && (
                      <Badge
                        variant="outline"
                        className="border-red-500/30 bg-red-500/10 text-xs text-red-700 dark:text-red-300"
                      >
                        <BellRing className="mr-1 h-3 w-3" /> Follow-up overdue
                      </Badge>
                    )}
                    {isPending && pendingSlaState && (
                      <Badge
                        variant="outline"
                        className={`text-xs ${pendingSlaBadgeClass}`}
                      >
                        <AlertTriangle className="mr-1 h-3 w-3" />
                        {pendingSlaLabel} • {pendingElapsedLabel}
                      </Badge>
                    )}
                    {source === "telegram_bot" && (
                      <Badge
                        variant="outline"
                        className="border-sky-500/50 bg-sky-50 text-xs text-sky-700 dark:border-sky-400/50 dark:bg-sky-900/30 dark:text-sky-300"
                      >
                        <Bot className="mr-1 h-3 w-3" /> Lewat Telegram
                      </Badge>
                    )}
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pb-4 pt-3">
              <div className="space-y-3">
                <div className="grid grid-cols-1 gap-1">
                  <div className="flex items-center text-sm text-[var(--ui-text)] dark:text-zinc-100">
                    <Info className="mr-2 h-4 w-4 flex-shrink-0 text-[var(--ui-text-muted)] dark:text-zinc-400" />
                    <span className="line-clamp-1 font-medium">{details}</span>
                  </div>
                  <div className="flex items-center text-sm text-[var(--ui-text)] dark:text-zinc-100">
                    <DollarSign className="mr-2 h-4 w-4 flex-shrink-0 text-[var(--ui-text-muted)] dark:text-zinc-400" />
                    <span className="font-semibold text-[var(--ui-accent)]">
                      Rp {displaySellingPrice.toLocaleString("id-ID")}
                    </span>
                  </div>
                </div>

                {hasOperationalSignals && (
                  <div className={`space-y-2 rounded-2xl border p-3 ${otherClaimPanelClass}`}>
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--ui-text-secondary)] dark:text-zinc-500">
                          Sinyal operasional
                        </p>
                        <p className="mt-1 text-xs text-[var(--ui-text-muted)] dark:text-zinc-400">
                          Klaim staf, catatan lanjutan, dan riwayat aksi terbaru.
                        </p>
                      </div>
                      {(hasOperationalNote || hasActivityPreview) && (
                        <Badge
                          variant="outline"
                          className="border-[var(--ui-border)] bg-[var(--ui-card)] text-[10px] text-[var(--ui-text-muted)] dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400"
                        >
                          {hasOperationalNote && hasActivityPreview
                            ? "Catatan + timeline"
                            : hasOperationalNote
                              ? "Ada catatan"
                              : "Ada timeline"}
                        </Badge>
                      )}
                    </div>
                    {claimedByUsername && (
                      <div
                        className={`flex items-start gap-2 text-xs ${
                          hasClaimedStaleSignal || isClaimedByOther
                            ? "text-red-700 dark:text-red-300"
                            : "text-[var(--ui-text-muted)] dark:text-zinc-400"
                        }`}
                      >
                        <Hand className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
                        <span>
                          {isClaimedByOther ? "Sedang dipegang oleh" : "Dipegang oleh"}{" "}
                          <span className="font-semibold text-[var(--ui-text)] dark:text-zinc-100">
                            {claimedByUsername}
                          </span>
                          {claimedAt ? ` • ${formatDateInTimezone(claimedAt)}` : ""}
                        </span>
                      </div>
                    )}
                    {hasClaimedStaleSignal && claimedStaleMinutes !== null && (
                      <div className="flex items-start gap-2 text-xs text-red-700 dark:text-red-300">
                        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
                        <span>
                          <span className="font-semibold">Klaim macet</span> • tidak ada update operasional {formatElapsedMinutesCompact(claimedStaleMinutes)}.
                        </span>
                      </div>
                    )}
                    {lastInternalNotePreview && (
                      <div className="flex items-start gap-2 text-xs text-[var(--ui-text-muted)] dark:text-zinc-400">
                        <MessageSquare className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
                        <span className="line-clamp-2">
                          <span className="font-semibold text-[var(--ui-text)] dark:text-zinc-100">
                            Catatan terbaru
                          </span>{" "}
                          {lastInternalNotePreview}
                          {lastInternalNoteAt
                            ? ` • ${formatDateInTimezone(lastInternalNoteAt)}`
                            : ""}
                        </span>
                      </div>
                    )}
                    {followUp?.followUpAt && (
                      <div className="flex items-start gap-2 text-xs text-[var(--ui-text-muted)] dark:text-zinc-400">
                        <BellRing className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
                        <span className="line-clamp-2">
                          <span className="font-semibold text-[var(--ui-text)] dark:text-zinc-100">
                            Follow-up
                          </span>{" "}
                          {followUpLabel} • {formatDateInTimezone(followUp.followUpAt)}
                          {followUp.note ? ` • ${followUp.note}` : ""}
                        </span>
                      </div>
                    )}
                    {hasActivityPreview && (
                      <div className="space-y-2 border-t border-[var(--ui-border)]/70 pt-2 dark:border-zinc-800">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--ui-text-secondary)] dark:text-zinc-500">
                          Aktivitas terbaru
                        </p>
                        {latestCardActivities.map((item) => {
                          const presentation = getTimelinePresentation(item);
                          const TimelineIcon = presentation.icon;

                          return (
                            <div
                              key={`preview-${item.id}`}
                              className="flex items-start gap-2 text-xs text-[var(--ui-text-muted)] dark:text-zinc-400"
                            >
                              <TimelineIcon className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
                              <span className="line-clamp-2">
                                <span className="font-semibold text-[var(--ui-text)] dark:text-zinc-100">
                                  {presentation.label}
                                </span>{" "}
                                {item.summary} • {formatDateInTimezone(item.createdAt)}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                    {isHighlighted && (
                      <div className="flex items-start gap-2 text-xs text-[var(--ui-accent)] dark:text-sky-300">
                        <Flag className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
                        <span className="font-semibold">Target dari catatan handover.</span>
                      </div>
                    )}
                  </div>
                )}

                {isPending && (
                  <div className="space-y-3 border-t border-[var(--ui-border)]/70 pt-2 dark:border-zinc-800">
                    {followUp?.followUpAt && (
                      <div className={`flex items-start gap-2 rounded-2xl border px-3 py-2 text-xs ${followUpBadgeClass} ${isOverdueFollowUp ? "ring-1 ring-red-500/20" : ""}`}>
                        <BellRing className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
                        <div>
                          <p className="font-semibold">{followUpLabel}</p>
                          <p>
                            {formatDateInTimezone(followUp.followUpAt)}
                            {followUp.note ? ` • ${followUp.note}` : ""}
                          </p>
                        </div>
                      </div>
                    )}
                    {pendingSlaState && (
                      <div className={`flex items-start gap-2 rounded-2xl border px-3 py-2 text-xs ${pendingSlaBadgeClass}`}>
                        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
                        <div>
                          <p className="font-semibold">{pendingSlaLabel}</p>
                          <p>{pendingSlaHelperText}</p>
                        </div>
                      </div>
                    )}
                    <div className="flex flex-wrap gap-2">
                      {isMine ? (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={isUnclaiming}
                          onPointerDown={stopCardOpen}
                          onClick={(event) => {
                            stopCardOpen(event);
                            void handleUnclaim();
                          }}
                          className="rounded-xl border-[var(--ui-border)] bg-[var(--ui-card-alt)] text-[var(--ui-text)] hover:bg-[var(--ui-accent-bg)]"
                        >
                          {isUnclaiming ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          ) : (
                            <Hand className="mr-2 h-4 w-4" />
                          )}
                          Lepas Klaim
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          disabled={isClaiming || isClaimedByOther}
                          onPointerDown={stopCardOpen}
                          onClick={(event) => {
                            stopCardOpen(event);
                            void handleClaim();
                          }}
                          className={`rounded-xl text-white ${
                            isClaimedByOther
                              ? "bg-red-500 hover:bg-red-500"
                              : "bg-[var(--ui-accent)] hover:bg-[var(--ui-accent-hover)]"
                          }`}
                        >
                          {isClaiming ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          ) : (
                            <Hand className="mr-2 h-4 w-4" />
                          )}
                          {isClaimedByOther ? "Sudah Diklaim" : "Klaim"}
                        </Button>
                      )}

                      <Button
                        size="sm"
                        variant="outline"
                        onPointerDown={stopCardOpen}
                        onClick={(event) => {
                          stopCardOpen(event);
                          setIsNotesDialogOpen(true);
                        }}
                        className={`rounded-xl ${noteButtonToneClass}`}
                      >
                        <MessageSquare className="mr-2 h-4 w-4" />
                        {noteButtonLabel}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onPointerDown={stopCardOpen}
                        onClick={(event) => {
                          stopCardOpen(event);
                          setIsFollowUpDialogOpen(true);
                        }}
                        className={`rounded-xl ${hasActiveFollowUp ? activeFollowUpButtonClass : "border-indigo-500/30 bg-indigo-500/10 text-indigo-700 hover:bg-indigo-500/15 dark:text-indigo-300"}`}
                      >
                        <BellRing className="mr-2 h-4 w-4" />
                        {hasActiveFollowUp ? "Ubah Follow-up" : "Follow-up"}
                      </Button>
                    </div>
                  </div>
                )}

                <div className="flex items-center justify-between border-t border-[var(--ui-border)]/70 pt-1 text-xs text-[var(--ui-text-muted)] dark:border-zinc-800 dark:text-zinc-400">
                  <div className="flex items-center gap-1.5">
                    <CalendarDays className="h-3.5 w-3.5" />
                    <span>{formatDateInTimezone(timestamp)}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Hash className="h-3.5 w-3.5" />
                    <span className="font-mono">...{id.slice(-6)}</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </AlertDialogTrigger>
        <AlertDialogContent className="overflow-hidden border-[var(--ui-border)] bg-[var(--ui-card)] text-[var(--ui-text)] dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100 sm:max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-3 font-headline text-xl text-[var(--ui-text)] dark:text-zinc-100">
              <div className={`rounded-full p-2 ${categoryColor.light} ${categoryColor.dark}`}>
                <ProductIconComponent className={`h-6 w-6 ${categoryColor.icon}`} />
              </div>
              Detail Transaksi
            </AlertDialogTitle>
            <AlertDialogDescription className="sr-only">
              Detail transaksi {id}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <ScrollArea className="max-h-[60vh]">
            <div className="space-y-2 py-1 pr-4">
              <div className="flex items-center justify-between">
                <DetailRow
                  icon={CalendarDays}
                  label="Tanggal"
                  value={formatDateInTimezone(timestamp)}
                />
                <Badge variant="outline" className={`shadow-sm ${statusBadgeClass}`}>
                  <SIcon className={`mr-1 h-3.5 w-3.5 ${status === "Pending" ? "animate-spin" : ""}`} />
                  {currentStatusConfig.displayText}
                </Badge>
              </div>
              <Separator className="my-2 bg-[var(--ui-border)] dark:bg-zinc-800" />
              <DetailRow
                icon={Briefcase}
                label="Produk"
                value={productName}
                valueClassName="font-semibold"
              />
              <DetailRow icon={Info} label="Detail" value={details} />
              {transactedBy && (
                <DetailRow
                  icon={UserCircle}
                  label="Pengguna"
                  value={transactedBy}
                  valueClassName="font-semibold"
                />
              )}
              <DetailRow
                icon={Building}
                label="Provider"
                value={providerDisplayName}
                valueClassName={`capitalize font-semibold ${
                  provider === "tokovoucher"
                    ? "text-[var(--ui-accent)]"
                    : "text-purple-700 dark:text-purple-300"
                }`}
              />
              {claimedByUsername && (
                <DetailRow
                  icon={Hand}
                  label="Diklaim Oleh"
                  value={`${claimedByUsername}${claimedAt ? ` • ${formatDateInTimezone(claimedAt)}` : ""}`}
                  valueClassName="font-semibold"
                />
              )}
              {lastInternalNotePreview && (
                <DetailRow
                  icon={MessageSquare}
                  label="Catatan Terakhir"
                  value={lastInternalNotePreview}
                />
              )}
              {internalPriority === "handover" && (
                <DetailRow
                  icon={Flag}
                  label="Prioritas Antrean"
                  value="Ditandai untuk handover sif"
                  valueClassName="font-semibold text-orange-600 dark:text-orange-300"
                />
              )}
              {followUp?.followUpAt && (
                <DetailRow
                  icon={BellRing}
                  label="Follow-up"
                  value={`${followUpLabel} • ${formatDateInTimezone(followUp.followUpAt)}${followUp.note ? ` • ${followUp.note}` : ""}`}
                  valueClassName="font-semibold"
                />
              )}
              {source === "telegram_bot" && (
                <DetailRow
                  icon={Bot}
                  label="Sumber"
                  value="Bot Telegram"
                  valueClassName="font-semibold text-sky-700"
                />
              )}
              <Separator className="my-3 bg-[var(--ui-border)] dark:bg-zinc-800" />
              <DetailRow
                icon={Hash}
                label="ID Referensi"
                value={<span className="font-mono">{id}</span>}
              />
              {providerTransactionId && (
                <DetailRow
                  icon={Server}
                  label="ID Trx Provider"
                  value={<span className="font-mono">{providerTransactionId}</span>}
                />
              )}
              <DetailRow
                icon={Code2}
                label="Kode SKU"
                value={<span className="font-mono">{buyerSkuCode}</span>}
              />
              <DetailRow
                icon={UserSquare2}
                label="No. Pelanggan Asli"
                value={<span className="font-mono">{originalCustomerNo}</span>}
              />

              <div className="mt-3 space-y-3 rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-card-alt)] p-3 dark:border-zinc-800 dark:bg-zinc-900">
                <DetailRow
                  icon={DollarSign}
                  label="Harga Jual"
                  value={`Rp ${displaySellingPrice.toLocaleString("id-ID")}`}
                  valueClassName="font-semibold text-[var(--ui-accent)]"
                />
                {status === "Sukses" && typeof costPrice === "number" && (
                  <>
                    <DetailRow
                      icon={DollarSign}
                      label="Harga Modal"
                      value={`Rp ${Number(costPrice).toLocaleString("id-ID")}`}
                    />
                    <DetailRow
                      icon={DollarSign}
                      label="Keuntungan"
                      value={`Rp ${(displaySellingPrice - Number(costPrice)).toLocaleString("id-ID")}`}
                      valueClassName={`font-semibold ${
                        displaySellingPrice - Number(costPrice) >= 0
                          ? "text-green-600"
                          : "text-red-600"
                      }`}
                    />
                  </>
                )}
              </div>

              {status === "Sukses" && serialNumber && (
                <div className="space-y-1.5 pt-2">
                  <div className="flex items-center text-[var(--ui-text-muted)] dark:text-zinc-400">
                    <Ticket className="mr-2 h-4 w-4 flex-shrink-0" />
                    <span className="text-xs font-medium sm:text-sm">Nomor Serial (SN):</span>
                  </div>
                  <div className="flex items-center justify-between rounded-md border border-green-200 bg-green-50 p-3 shadow-sm dark:border-green-700/50 dark:bg-green-900/20">
                    <span className="break-all font-mono text-sm text-green-700 dark:text-green-300 sm:text-base">
                      {serialNumber}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={handleCopySn}
                      className="ml-2 h-8 w-8 text-green-600 hover:bg-green-100 hover:text-green-800 dark:text-green-400 dark:hover:bg-green-900/30 dark:hover:text-green-300"
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}

              {status === "Gagal" && failureReason && (
                <div className="mt-2 space-y-1 rounded-md border border-red-200 bg-red-50 p-3 dark:border-red-700/50 dark:bg-red-900/20">
                  <div className="flex items-center text-red-800 dark:text-red-300">
                    <LucideAlertCircle className="mr-2 h-4 w-4 flex-shrink-0" />
                    <span className="text-xs font-medium sm:text-sm">Alasan Gagal:</span>
                  </div>
                  <p className="pl-6 text-sm text-red-700 dark:text-red-300">{failureReason}</p>
                </div>
              )}

              {status === "Pending" && (
                <div className="mt-2 overflow-hidden rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-card-alt)] dark:border-zinc-800 dark:bg-zinc-900">
                  {pendingSlaState && (
                    <div className={`flex items-start gap-2 border-b px-3 py-2.5 text-xs ${pendingSlaBadgeClass}`}>
                      <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold">{pendingSlaLabel}</p>
                        <p className="opacity-90">{pendingSlaHelperText}</p>
                      </div>
                    </div>
                  )}
                  <div className="flex items-start gap-2 px-3 py-2.5 text-xs text-[var(--ui-text-muted)] dark:text-zinc-400">
                    <Loader2 className="mt-0.5 h-4 w-4 flex-shrink-0 animate-spin text-amber-600 dark:text-amber-400" />
                    <p className="min-w-0 flex-1 leading-5">
                      {provider === "tokovoucher"
                        ? "Transaksi masih diproses TokoVoucher. Gunakan tombol \"Refresh Status Sekarang\" untuk mengecek hasil terbaru."
                        : pendingSlaState === "breached"
                          ? "Webhook Digiflazz belum mengirim update padahal pending sudah lewat SLA. Tombol \"Cek manual ke Digiflazz\" diaktifkan sebagai fallback."
                          : "Transaksi diproses Digiflazz. Status diperbarui otomatis lewat webhook."}
                    </p>
                  </div>
                </div>
              )}

              <div className="mt-4 rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-card-alt)] dark:border-zinc-800 dark:bg-zinc-900">
                <div className="border-b border-[var(--ui-border)] px-4 py-3 dark:border-zinc-800">
                  <h3 className="font-semibold text-[var(--ui-text)] dark:text-zinc-100">Timeline Aktivitas</h3>
                  <p className="mt-1 text-xs text-[var(--ui-text-muted)] dark:text-zinc-400">
                    Urutan aktivitas operasional terbaru untuk transaksi ini.
                  </p>
                </div>
                <ScrollArea className="max-h-[320px]">
                  <div className="space-y-3 p-4">
                    {isLoadingTimeline ? (
                      <div className="flex items-center justify-center py-8 text-[var(--ui-text-muted)] dark:text-zinc-400">
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Memuat timeline...
                      </div>
                    ) : timelineItems.length === 0 ? (
                      <div className="space-y-3">
                        <div className="rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-card)] p-3 dark:border-zinc-800 dark:bg-zinc-950">
                          <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-[var(--ui-text-secondary)] dark:text-zinc-500">
                            <Badge variant="outline" className="border-[var(--ui-border)] bg-[var(--ui-card-alt)] text-[var(--ui-text)] dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100">
                              <ShoppingCart className="mr-1 h-3 w-3" /> Transaksi Dibuat
                            </Badge>
                            <span>{formatDateInTimezone(timestamp)}</span>
                          </div>
                          <p className="text-sm text-[var(--ui-text)] dark:text-zinc-100">
                            Order {productName} via {provider === "tokovoucher" ? "TokoVoucher" : "Digiflazz"}.
                          </p>
                        </div>
                        <div className="rounded-2xl border border-dashed border-[var(--ui-border)] p-4 text-center text-xs text-[var(--ui-text-muted)] dark:border-zinc-800 dark:text-zinc-400">
                          {status === "Pending"
                            ? "Belum ada aktivitas operasional. Klaim transaksi atau tambah catatan internal untuk memulai timeline."
                            : "Tidak ada aktivitas tambahan tercatat setelah pembuatan transaksi."}
                        </div>
                      </div>
                    ) : (
                      timelineItems.map((item) => {
                        const presentation = getTimelinePresentation(item);
                        const actorLabel = getTimelineActorLabel(item);
                        const sourceLabel = getTimelineSourceLabel(item);
                        const metadataChips = getTimelineMetadataChips(item);
                        const TimelineIcon = presentation.icon;

                        return (
                          <div
                            key={item.id}
                            className="rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-card)] p-3 dark:border-zinc-800 dark:bg-zinc-950"
                          >
                            <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-[var(--ui-text-secondary)] dark:text-zinc-500">
                              <Badge variant="outline" className={presentation.className}>
                                <TimelineIcon className="mr-1 h-3 w-3" /> {presentation.label}
                              </Badge>
                              <Badge
                                variant="outline"
                                className="border-[var(--ui-border)] bg-[var(--ui-card-alt)] text-[var(--ui-text)] dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
                              >
                                {actorLabel}
                              </Badge>
                              {sourceLabel && (
                                <Badge
                                  variant="outline"
                                  className="border-[var(--ui-border)] bg-[var(--ui-card-alt)] text-[var(--ui-text-muted)] dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400"
                                >
                                  {sourceLabel}
                                </Badge>
                              )}
                              <span>{formatDateInTimezone(item.createdAt)}</span>
                            </div>
                            <p className="text-sm font-medium text-[var(--ui-text)] dark:text-zinc-100">
                              {item.summary}
                            </p>
                            {metadataChips.length > 0 && (
                              <div className="mt-2 flex flex-wrap gap-2">
                                {metadataChips.map((chip) => (
                                  <Badge
                                    key={`${item.id}-${chip}`}
                                    variant="outline"
                                    className="border-[var(--ui-border)] bg-[var(--ui-card-alt)] text-[10px] text-[var(--ui-text-muted)] dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400"
                                  >
                                    {chip}
                                  </Badge>
                                ))}
                              </div>
                            )}
                            {item.note && (
                              <p className="mt-2 rounded-xl border border-[var(--ui-border)] bg-[var(--ui-card-alt)] px-3 py-2 text-sm text-[var(--ui-text)] dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100">
                                {item.note}
                              </p>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                </ScrollArea>
              </div>
            </div>
          </ScrollArea>
          <AlertDialogFooter className="mt-2 flex flex-col gap-2 pt-4 sm:flex-row sm:justify-end">
            {isPending && (
              <>
                <Button
                  variant="outline"
                  onClick={() => setIsNotesDialogOpen(true)}
                  className={`w-full shrink-0 sm:w-auto ${noteButtonToneClass}`}
                >
                  <MessageSquare className="mr-2 h-4 w-4" /> {noteButtonLabel}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setIsFollowUpDialogOpen(true)}
                  className={`w-full shrink-0 sm:w-auto ${hasActiveFollowUp ? followUpBadgeClass : "border-indigo-500/30 bg-indigo-500/10 text-indigo-700 hover:bg-indigo-500/15 dark:text-indigo-300"}`}
                >
                  <BellRing className="mr-2 h-4 w-4" /> {hasActiveFollowUp ? "Ubah Follow-up" : "Follow-up"}
                </Button>
              </>
            )}

            <Button
              variant="destructive"
              onClick={() => setIsConfirmingDelete(true)}
              className="w-full shrink-0 sm:w-auto"
            >
              <Trash2 className="mr-2 h-4 w-4" /> Hapus
            </Button>

            {status === "Pending" && provider === "tokovoucher" && (
              <Button
                onClick={handleCheckStatus}
                disabled={isCheckingStatus}
                className="w-full shrink-0 bg-[var(--ui-accent)] text-white hover:bg-[var(--ui-accent-hover)] sm:w-auto"
              >
                {isCheckingStatus ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="mr-2 h-4 w-4" />
                )}
                Refresh Status Sekarang
              </Button>
            )}

            {status === "Pending" && provider === "digiflazz" && (
              pendingSlaState === "breached" ? (
                <Button
                  variant="outline"
                  onClick={handleCheckStatus}
                  disabled={isCheckingStatus}
                  className="w-full shrink-0 border-amber-500/40 bg-amber-50 text-amber-800 hover:bg-amber-100 dark:bg-amber-950/30 dark:text-amber-200 sm:w-auto"
                >
                  {isCheckingStatus ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="mr-2 h-4 w-4" />
                  )}
                  Cek manual ke Digiflazz
                </Button>
              ) : (
                <Button
                  variant="outline"
                  disabled
                  className="w-full shrink-0 border-[var(--ui-border)] bg-[var(--ui-card-alt)] text-[var(--ui-text-muted)] opacity-80 sm:w-auto"
                >
                  <Server className="mr-2 h-4 w-4" />
                  Dikelola Webhook
                </Button>
              )
            )}

            {status === "Sukses" && (
              <Button
                variant="outline"
                onClick={handleViewReceipt}
                className="w-full shrink-0 border-[var(--ui-accent)]/25 text-[var(--ui-accent)] hover:bg-[var(--ui-accent-bg)] hover:text-[var(--ui-accent-hover)] sm:w-auto"
              >
                <FileText className="mr-2 h-4 w-4" /> Lihat Struk
              </Button>
            )}

            <AlertDialogCancel className="mt-0 w-full border-[var(--ui-border)] bg-[var(--ui-card-alt)] text-[var(--ui-text)] hover:bg-[var(--ui-accent-bg)] dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100 sm:w-auto">
              Tutup
            </AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={isFollowUpDialogOpen} onOpenChange={setIsFollowUpDialogOpen}>
        <DialogContent
          aria-describedby={`follow-up-description-${id}`}
          className="border-[var(--ui-border)] bg-[var(--ui-card)] text-[var(--ui-text)] dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100 sm:max-w-xl"
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BellRing className="h-5 w-5 text-[var(--ui-accent)]" />
              Follow-up Transaksi
            </DialogTitle>
            <DialogDescription id={`follow-up-description-${id}`}>
              Pasang reminder aktif untuk transaksi {id} agar staf tidak lupa menindaklanjuti pending ini.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className={`rounded-2xl border px-4 py-3 text-sm ${hasActiveFollowUp ? followUpBadgeClass : "border-[var(--ui-border)] bg-[var(--ui-card-alt)] text-[var(--ui-text-muted)] dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400"}`}>
              {hasActiveFollowUp ? (
                <div className="space-y-1">
                  <p className="font-semibold text-[var(--ui-text)] dark:text-zinc-100">{followUpLabel}</p>
                  <p>{formatDateInTimezone(followUp?.followUpAt || "")}</p>
                  {followUp?.note && <p>{followUp.note}</p>}
                </div>
              ) : (
                <p>Belum ada follow-up aktif untuk transaksi ini.</p>
              )}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <label htmlFor={`follow-up-at-${id}`}>Waktu follow-up</label>
                <Input
                  id={`follow-up-at-${id}`}
                  type="datetime-local"
                  value={followUpInput}
                  onChange={handleFollowUpDateChange}
                  className="rounded-2xl border-[var(--ui-input-border)] bg-[var(--ui-input-bg)]"
                />
              </div>
              <div className="space-y-2">
                <label>Preset cepat</label>
                <div className="flex flex-wrap gap-2">
                  {[15, 30, 60, 120].map((minutes) => (
                    <Button
                      key={minutes}
                      type="button"
                      variant="outline"
                      onClick={() => {
                        const nextDate = new Date(Date.now() + minutes * 60000);
                        setFollowUpInput(toDateTimeLocalValue(nextDate.toISOString()));
                      }}
                      className="rounded-full"
                    >
                      {minutes < 60 ? `${minutes} menit` : `${minutes / 60} jam`}
                    </Button>
                  ))}
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <label htmlFor={`follow-up-note-${id}`}>Catatan follow-up</label>
              <Textarea
                id={`follow-up-note-${id}`}
                value={followUpNoteInput}
                onChange={(event) => setFollowUpNoteInput(event.target.value)}
                placeholder="Contoh: cek ulang status provider, follow up customer, atau pastikan sudah diklaim staf berikutnya."
                className="min-h-[110px] rounded-2xl border-[var(--ui-input-border)] bg-[var(--ui-input-bg)] text-[var(--ui-text)]"
              />
            </div>
          </div>

          <DialogFooter className="gap-2">
            {hasActiveFollowUp && (
              <Button
                type="button"
                variant="outline"
                onClick={() => void handleClearFollowUp()}
                disabled={isClearingFollowUp}
                className="border-red-500/30 bg-red-500/10 text-red-700 hover:bg-red-500/15 dark:text-red-300"
              >
                {isClearingFollowUp ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                )}
                Selesaikan Follow-up
              </Button>
            )}
            <Button
              variant="outline"
              onClick={() => setIsFollowUpDialogOpen(false)}
              className="border-[var(--ui-border)] bg-[var(--ui-card-alt)] text-[var(--ui-text)] hover:bg-[var(--ui-accent-bg)]"
            >
              Tutup
            </Button>
            <Button
              onClick={() => void handleSaveFollowUp()}
              disabled={isSavingFollowUp}
              className="bg-[var(--ui-accent)] text-white hover:bg-[var(--ui-accent-hover)]"
            >
              {isSavingFollowUp ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <BellRing className="mr-2 h-4 w-4" />
              )}
              Simpan Follow-up
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isNotesDialogOpen} onOpenChange={setIsNotesDialogOpen}>
        <DialogContent
          aria-describedby={`internal-note-description-${id}`}
          className="border-[var(--ui-border)] bg-[var(--ui-card)] text-[var(--ui-text)] dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100 sm:max-w-2xl"
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5 text-[var(--ui-accent)]" />
              Catatan Internal
            </DialogTitle>
            <DialogDescription id={`internal-note-description-${id}`}>
              Catat update operasional untuk transaksi {id}. Gunakan tanda handover bila perlu diteruskan ke sif berikutnya.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-2 rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-card-alt)] px-4 py-3 text-sm dark:border-zinc-800 dark:bg-zinc-900 sm:grid-cols-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--ui-text-secondary)] dark:text-zinc-500">
                Catatan
              </p>
              <p className="mt-1 text-xs leading-5 text-[var(--ui-text-muted)] dark:text-zinc-400">
                Simpan konteks operasional terbaru untuk staf yang melanjutkan transaksi ini.
              </p>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--ui-text-secondary)] dark:text-zinc-500">
                Handover
              </p>
              <p className="mt-1 text-xs leading-5 text-[var(--ui-text-muted)] dark:text-zinc-400">
                Aktifkan jika catatan ini perlu diteruskan ke sif berikutnya.
              </p>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--ui-text-secondary)] dark:text-zinc-500">
                Timeline
              </p>
              <p className="mt-1 text-xs leading-5 text-[var(--ui-text-muted)] dark:text-zinc-400">
                Riwayat aksi lengkap tetap bisa dilihat di dialog detail transaksi.
              </p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-card-alt)] p-4 dark:border-zinc-800 dark:bg-zinc-900">
              <div className="mb-3 flex flex-wrap gap-2">
                {claimedByUsername && (
                  <Badge variant="outline" className="border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300">
                    <Hand className="mr-1 h-3 w-3" /> {claimedByUsername}
                  </Badge>
                )}
                {internalPriority === "handover" && (
                  <Badge variant="outline" className="border-orange-500/30 bg-orange-500/10 text-orange-700 dark:text-orange-300">
                    <Flag className="mr-1 h-3 w-3" /> Ditandai untuk Handover
                  </Badge>
                )}
              </div>
              <Textarea
                value={noteInput}
                onChange={(event) => setNoteInput(event.target.value)}
                placeholder="Contoh: customer sudah konfirmasi pembayaran, masih tunggu update provider / lanjut pantau sampai status sukses."
                className="min-h-[110px] rounded-2xl border-[var(--ui-input-border)] bg-[var(--ui-input-bg)] text-[var(--ui-text)]"
              />
              <div className="mt-3 flex items-center gap-3">
                <Checkbox
                  id={`handover-${id}`}
                  checked={markForHandover}
                  onCheckedChange={(checked) => setMarkForHandover(checked === true)}
                />
                <label htmlFor={`handover-${id}`} className="text-sm text-[var(--ui-text-muted)] dark:text-zinc-400">
                  Tandai transaksi ini untuk handover sif berikutnya.
                </label>
              </div>
            </div>

            <div className="rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-card)] dark:border-zinc-800 dark:bg-zinc-950">
              <div className="border-b border-[var(--ui-border)] px-4 py-3 dark:border-zinc-800">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-semibold text-[var(--ui-text)] dark:text-zinc-100">Riwayat Catatan</h3>
                    <p className="mt-1 text-xs text-[var(--ui-text-muted)] dark:text-zinc-400">
                      Catatan terbaru muncul paling atas agar konteks staf tetap cepat dipindai.
                    </p>
                  </div>
                  <Badge
                    variant="outline"
                    className="border-[var(--ui-border)] bg-[var(--ui-card-alt)] text-[10px] text-[var(--ui-text-muted)] dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400"
                  >
                    {notes.length} catatan
                  </Badge>
                </div>
              </div>
              <ScrollArea className="max-h-[280px]">
                <div className="space-y-3 p-4">
                  {isLoadingNotes ? (
                    <div className="flex items-center justify-center py-8 text-[var(--ui-text-muted)] dark:text-zinc-400">
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Memuat catatan...
                    </div>
                  ) : notes.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-[var(--ui-border)] p-6 text-center text-sm text-[var(--ui-text-muted)] dark:border-zinc-800 dark:text-zinc-400">
                      Belum ada catatan internal untuk transaksi ini.
                    </div>
                  ) : (
                    notes.map((note) => (
                      <div key={note._id || `${note.transactionId}-${note.createdAt}`} className="rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-card-alt)] p-3 dark:border-zinc-800 dark:bg-zinc-900">
                        <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-[var(--ui-text-secondary)] dark:text-zinc-500">
                          <Badge variant="outline" className="border-[var(--ui-border)] bg-[var(--ui-card)] text-[var(--ui-text)] dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100">
                            {note.createdByUsername}
                          </Badge>
                          <span>{formatDateInTimezone(note.createdAt)}</span>
                        </div>
                        <p className="text-sm text-[var(--ui-text)] dark:text-zinc-100">{note.note}</p>
                      </div>
                    ))
                  )}
                </div>
              </ScrollArea>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setIsNotesDialogOpen(false)}
              className="border-[var(--ui-border)] bg-[var(--ui-card-alt)] text-[var(--ui-text)] hover:bg-[var(--ui-accent-bg)]"
            >
              Tutup
            </Button>
            <Button
              onClick={() => void handleSaveNote()}
              disabled={isSavingNote}
              className="bg-[var(--ui-accent)] text-white hover:bg-[var(--ui-accent-hover)]"
            >
              {isSavingNote ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <MessageSquare className="mr-2 h-4 w-4" />
              )}
              Simpan Catatan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={isConfirmingDelete} onOpenChange={setIsConfirmingDelete}>
        <AlertDialogContent className="border-[var(--ui-border)] bg-[var(--ui-card)] text-[var(--ui-text)] dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-red-600">
              <AlertTriangle className="h-6 w-6 text-red-600" />
              Konfirmasi Hapus
            </AlertDialogTitle>
            <AlertDialogDescription className="text-[var(--ui-text-muted)] dark:text-zinc-400">
              Yakin ingin menghapus transaksi ini?
              <div className="mt-2 rounded border border-[var(--ui-border)] bg-[var(--ui-card-alt)] p-2 dark:border-zinc-800 dark:bg-zinc-900">
                <span className="font-mono text-xs text-[var(--ui-text)] dark:text-zinc-100">ID: {id}</span>
              </div>
              <p className="mt-2 text-sm font-medium">Aksi ini tidak bisa dibatalkan.</p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-[var(--ui-border)] bg-[var(--ui-card-alt)] text-[var(--ui-text)] hover:bg-[var(--ui-accent-bg)] dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100">
              Batal
            </AlertDialogCancel>
            <Button onClick={handleDeleteTransaction} className="bg-red-600 text-white hover:bg-red-700">
              <Trash2 className="mr-1.5 h-4 w-4" />
              Ya, Hapus
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
