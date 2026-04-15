"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
  Building,
  Bot,
  Briefcase,
  FileText,
  UserCircle,
  Hand,
  MessageSquare,
  Flag,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  addTransactionInternalNoteInDB,
  claimTransactionInDB,
  deleteTransactionFromDB,
  listTransactionInternalNotesFromDB,
  refreshPendingTransactionsFromDB,
  unclaimTransactionInDB,
  type TransactionInternalNote,
} from "@/lib/transaction-utils";
import { formatDateInTimezone } from "@/lib/timezone";

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
      className={`break-words text-xs text-[var(--ui-text)] dark:text-zinc-100 sm:text-sm ${valueClassName} ${
        isMono ? "font-mono" : ""
      }`}
    >
      {value}
    </div>
  </div>
);

export default function TransactionItem({
  transaction,
  onTransactionUpdate,
  isHighlighted = false,
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
  const [isLoadingNotes, setIsLoadingNotes] = useState(false);
  const [isSavingNote, setIsSavingNote] = useState(false);
  const [isClaiming, setIsClaiming] = useState(false);
  const [isUnclaiming, setIsUnclaiming] = useState(false);
  const [notes, setNotes] = useState<TransactionInternalNote[]>([]);
  const [noteInput, setNoteInput] = useState("");
  const [markForHandover, setMarkForHandover] = useState(
    internalPriority === "handover"
  );

  useEffect(() => {
    setMarkForHandover(internalPriority === "handover");
  }, [internalPriority]);

  const isPending = status === "Pending";
  const isMine = !!user?.id && claimedByUserId === user.id;
  const isClaimedByOther = !!claimedByUserId && !isMine;

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

  useEffect(() => {
    if (isNotesDialogOpen) {
      void loadNotes();
    }
  }, [isNotesDialogOpen, loadNotes]);

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
        await loadNotes();
        onTransactionUpdate();
      }
    } finally {
      setIsSavingNote(false);
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

  const categoryColor = getCategoryColor();
  const highlightCardClass = isHighlighted
    ? "ring-2 ring-[var(--ui-accent)] ring-offset-2 ring-offset-background"
    : "";
  const otherClaimCardClass = isClaimedByOther
    ? "border-red-200 bg-red-50/70 dark:border-red-900/40 dark:bg-red-950/30"
    : "border-[var(--ui-border)] bg-[var(--ui-card)] dark:border-zinc-800 dark:bg-zinc-950";
  const otherClaimPanelClass = isClaimedByOther
    ? "border-red-200 bg-red-50/80 dark:border-red-900/40 dark:bg-red-950/40"
    : "border-[var(--ui-border)] bg-[var(--ui-card-alt)] dark:border-zinc-800 dark:bg-zinc-900";

  return (
    <>
      <AlertDialog open={isDetailsDialogOpen} onOpenChange={setIsDetailsDialogOpen}>
        <AlertDialogTrigger asChild>
          <Card
            className={`transaction-card ${categoryColor.cssClass} ${highlightCardClass} ${otherClaimCardClass} group relative cursor-pointer overflow-hidden rounded-3xl border border-t-4 ${isClaimedByOther ? "border-t-red-500" : "border-t-[var(--ui-accent)]"} text-[var(--ui-text)] shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg dark:text-zinc-100`}
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
                        className={isClaimedByOther ? "border-red-500/30 bg-red-500/10 text-xs text-red-700 dark:text-red-300" : "border-sky-500/30 bg-sky-500/10 text-xs text-sky-700 dark:text-sky-300"}
                      >
                        <Hand className="mr-1 h-3 w-3" /> {isMine ? "Klaim saya" : `Dipegang ${claimedByUsername}`}
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

                {(claimedByUsername || lastInternalNotePreview || isHighlighted) && (
                  <div className={`space-y-2 rounded-2xl border p-3 ${otherClaimPanelClass}`}>
                    {claimedByUsername && (
                      <div
                        className={`flex items-start gap-2 text-xs ${
                          isClaimedByOther
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
                    {lastInternalNotePreview && (
                      <div className="flex items-start gap-2 text-xs text-[var(--ui-text-muted)] dark:text-zinc-400">
                        <MessageSquare className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
                        <span className="line-clamp-2">
                          {lastInternalNotePreview}
                          {lastInternalNoteAt
                            ? ` • ${formatDateInTimezone(lastInternalNoteAt)}`
                            : ""}
                        </span>
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
                  <div className="flex flex-wrap gap-2 border-t border-[var(--ui-border)]/70 pt-2 dark:border-zinc-800">
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
                      className="rounded-xl border-[var(--ui-accent)]/25 text-[var(--ui-accent)] hover:bg-[var(--ui-accent-bg)] hover:text-[var(--ui-accent-hover)]"
                    >
                      <MessageSquare className="mr-2 h-4 w-4" />
                      Catatan
                    </Button>
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
                <div className="mt-2 flex items-center rounded-md border border-yellow-200 bg-yellow-50 p-3 text-yellow-700 shadow-sm dark:border-yellow-700/50 dark:bg-yellow-900/20 dark:text-yellow-300">
                  <Loader2 className="mr-2 h-4 w-4 animate-spin flex-shrink-0" />
                  <p className="text-xs sm:text-sm">
                    {provider === "tokovoucher"
                      ? "Transaksi ini masih diproses. Refresh status untuk mengecek hasil provider terbaru dari server."
                      : "Transaksi ini masih diproses. Digiflazz memperbarui status lewat webhook, jadi refresh manual dinonaktifkan."}
                  </p>
                </div>
              )}
            </div>
          </ScrollArea>
          <AlertDialogFooter className="mt-2 flex flex-col gap-2 pt-4 sm:flex-row sm:justify-end">
            {isPending && (
              <Button
                variant="outline"
                onClick={() => setIsNotesDialogOpen(true)}
                className="w-full shrink-0 border-[var(--ui-accent)]/25 text-[var(--ui-accent)] hover:bg-[var(--ui-accent-bg)] hover:text-[var(--ui-accent-hover)] sm:w-auto"
              >
                <MessageSquare className="mr-2 h-4 w-4" /> Catatan
              </Button>
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
              <Button
                variant="outline"
                disabled
                className="w-full shrink-0 border-[var(--ui-border)] bg-[var(--ui-card-alt)] text-[var(--ui-text-muted)] opacity-80 sm:w-auto"
              >
                <Server className="mr-2 h-4 w-4" />
                Dikelola Webhook
              </Button>
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

      <Dialog open={isNotesDialogOpen} onOpenChange={setIsNotesDialogOpen}>
        <DialogContent className="border-[var(--ui-border)] bg-[var(--ui-card)] text-[var(--ui-text)] dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100 sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5 text-[var(--ui-accent)]" />
              Catatan Internal
            </DialogTitle>
            <DialogDescription>
              Catat update operasional untuk transaksi {id}. Gunakan tanda handover bila perlu diteruskan ke sif berikutnya.
            </DialogDescription>
          </DialogHeader>

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
                <h3 className="font-semibold text-[var(--ui-text)] dark:text-zinc-100">Riwayat Catatan</h3>
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
