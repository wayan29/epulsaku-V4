"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  DollarSign,
  Gamepad2,
  PiggyBank,
  RefreshCw,
  Settings,
  ShoppingBag,
  Smartphone,
  Ticket,
  Wifi,
  Zap,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import ProductCard from "@/components/products/ProductCard";
import DigiflazzDepositDialog from "@/components/dashboard/DepositDialog";
import ProtectedRoute from "@/components/core/ProtectedRoute";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import {
  DIGIFLAZZ_CREDENTIALS_MISSING_ERROR,
  type DigiflazzCategoryIconKey,
  type DigiflazzCategorySummary,
} from "@/lib/digiflazz-services-shared";
import {
  getDigiflazzServicesPageData,
} from "@/lib/digiflazz-services-utils";

const digiflazzIconMapping: Record<DigiflazzCategoryIconKey, LucideIcon> = {
  smartphone: Smartphone,
  zap: Zap,
  gamepad2: Gamepad2,
  wifi: Wifi,
  "shopping-bag": ShoppingBag,
  "dollar-sign": DollarSign,
  ticket: Ticket,
};

function CategorySkeleton() {
  return (
    <div className="relative flex h-[180px] flex-col items-center justify-center space-y-3 rounded-3xl border border-[var(--ui-border)] bg-[var(--ui-surface)] p-6 text-center shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <Skeleton className="absolute right-2 top-2 h-6 w-12 rounded-full" />
      <Skeleton className="h-14 w-14 rounded-xl" />
      <div className="w-full space-y-2">
        <Skeleton className="mx-auto h-5 w-24" />
        <Skeleton className="mx-auto h-3 w-3/4" />
      </div>
    </div>
  );
}

export default function DigiflazzServicesPage() {
  const { toast } = useToast();
  const [prioritizedCategories, setPrioritizedCategories] = useState<
    DigiflazzCategorySummary[]
  >([]);
  const [otherCategories, setOtherCategories] = useState<
    DigiflazzCategorySummary[]
  >([]);
  const [totalCategories, setTotalCategories] = useState(0);
  const [totalActiveProducts, setTotalActiveProducts] = useState(0);
  const [credentialsConfigured, setCredentialsConfigured] = useState(true);
  const [digiflazzBalance, setDigiflazzBalance] = useState<number | null>(null);
  const [isLoadingApiProducts, setIsLoadingApiProducts] = useState(true);
  const [isLoadingDigiflazzBalance, setIsLoadingDigiflazzBalance] =
    useState(true);
  const [apiProductsError, setApiProductsError] = useState<string | null>(null);
  const [apiProductsWarning, setApiProductsWarning] = useState<string | null>(
    null
  );
  const [digiflazzBalanceError, setDigiflazzBalanceError] = useState<
    string | null
  >(null);
  const [isDigiflazzDepositDialogOpen, setIsDigiflazzDepositDialogOpen] =
    useState(false);
  const requestIdRef = useRef(0);

  const loadDigiflazzServices = useCallback(
    async ({
      forceRefreshProducts = false,
      preserveCategories = false,
      notifyCredentialIssue = false,
    }: {
      forceRefreshProducts?: boolean;
      preserveCategories?: boolean;
      notifyCredentialIssue?: boolean;
    } = {}) => {
      const requestId = requestIdRef.current + 1;
      requestIdRef.current = requestId;

      setIsLoadingDigiflazzBalance(true);
      setDigiflazzBalanceError(null);

      if (!preserveCategories) {
        setIsLoadingApiProducts(true);
        setApiProductsError(null);
        setApiProductsWarning(null);
      }

      try {
        const summary = await getDigiflazzServicesPageData({
          forceRefreshProducts,
        });

        if (requestId !== requestIdRef.current) {
          return;
        }

        setCredentialsConfigured(summary.credentialsConfigured);
        setDigiflazzBalance(summary.balance);
        setDigiflazzBalanceError(summary.balanceError);
        setApiProductsError(summary.apiProductsError);
        setApiProductsWarning(summary.apiProductsWarning);
        setPrioritizedCategories(summary.prioritizedCategories);
        setOtherCategories(summary.otherCategories);
        setTotalCategories(summary.totalCategories);
        setTotalActiveProducts(summary.totalActiveProducts);

        if (!summary.credentialsConfigured && notifyCredentialIssue) {
          toast({
            title: "Digiflazz Config Needed",
            description: DIGIFLAZZ_CREDENTIALS_MISSING_ERROR,
            variant: "destructive",
            duration: 7000,
          });
        }

        if (forceRefreshProducts) {
          if (summary.apiProductsWarning) {
            toast({
              title: "Refresh Used Cached Categories",
              description: summary.apiProductsWarning,
              variant: "destructive",
            });
          } else if (summary.apiProductsError) {
            toast({
              title: "Error Loading Categories",
              description: summary.apiProductsError,
              variant: "destructive",
            });
          } else {
            toast({
              title: "Product List Refreshed",
              description:
                "Successfully reloaded Digiflazz category summary from the server.",
            });
          }
        }
      } catch (error) {
        if (requestId !== requestIdRef.current) {
          return;
        }

        const errorMessage =
          error instanceof Error
            ? error.message
            : "Failed to load Digiflazz services.";

        console.error("Failed to load Digiflazz services:", error);

        if (!preserveCategories) {
          setApiProductsError(errorMessage);
        }
        setDigiflazzBalanceError(errorMessage);

        toast({
          title: "Error Loading Digiflazz Services",
          description: errorMessage,
          variant: "destructive",
        });
      } finally {
        if (requestId === requestIdRef.current) {
          setIsLoadingDigiflazzBalance(false);
          if (!preserveCategories) {
            setIsLoadingApiProducts(false);
          }
        }
      }
    },
    [toast]
  );

  useEffect(() => {
    void loadDigiflazzServices({ notifyCredentialIssue: true });
  }, [loadDigiflazzServices]);

  const allCategories = [...prioritizedCategories, ...otherCategories];

  return (
    <ProtectedRoute requiredPermission="layanan_digiflazz">
      <div className="mx-auto max-w-7xl space-y-8 pb-10">
        <section>
          <div className="mb-6 flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-[var(--ui-accent-gradient-from)] to-[var(--ui-accent-gradient-to)] text-white shadow-lg">
              <Smartphone className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-2xl font-serif font-bold tracking-tight text-[var(--ui-text)] dark:text-zinc-100 sm:text-3xl">
                Layanan Produk Digiflazz
              </h1>
              <p className="mt-1 text-md text-[var(--ui-text-muted)] dark:text-zinc-400">
                Kategori sekarang diringkas di server agar browser tidak perlu
                menarik seluruh katalog Digiflazz.
              </p>
            </div>
          </div>
        </section>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,0.9fr)]">
          <Card className="relative overflow-hidden rounded-3xl border-[var(--ui-border)] bg-[var(--ui-surface)] shadow-lg dark:border-zinc-800 dark:bg-zinc-950 dark:shadow-lg">
            <div className="absolute left-0 right-0 top-0 h-1 bg-gradient-to-r from-[var(--ui-top-bar-from)] via-[var(--ui-top-bar-via)] to-[var(--ui-accent-gradient-to)] opacity-80" />
            <CardHeader className="flex flex-row items-center justify-between space-y-0 px-6 pb-2 pt-6 sm:px-8">
              <CardTitle className="text-xl font-serif text-[var(--ui-text)] dark:text-zinc-100">
                Saldo Digiflazz
              </CardTitle>
              <div className="rounded-xl bg-[var(--ui-accent)]/10 p-2">
                <DollarSign className="h-6 w-6 text-[var(--ui-accent)]" />
              </div>
            </CardHeader>
            <CardContent className="px-6 pb-8 pt-2 sm:px-8">
              {isLoadingDigiflazzBalance ? (
                <Skeleton className="mb-2 h-10 w-48" />
              ) : digiflazzBalanceError ? (
                <div className="mb-2 rounded-xl border border-red-200 bg-red-50 p-3 text-red-500 dark:border-red-900/50 dark:bg-red-900/10">
                  <div className="flex items-center space-x-2">
                    <AlertTriangle className="h-5 w-5" />
                    <span className="text-sm font-medium">
                      Error: {digiflazzBalanceError}
                    </span>
                  </div>
                </div>
              ) : digiflazzBalance !== null ? (
                <p className="mb-2 text-3xl font-bold tracking-tight text-[var(--ui-accent)]">
                  Rp {digiflazzBalance.toLocaleString("id-ID")}
                </p>
              ) : (
                <p className="mb-2 text-[var(--ui-text-secondary)] dark:text-zinc-500">
                  Data saldo tidak tersedia.
                </p>
              )}

              <div className="mt-5 flex flex-col gap-3 sm:flex-row">
                <Button
                  variant="outline"
                  className="rounded-xl border-[var(--ui-accent-light)]/30 text-[var(--ui-accent)] hover:bg-[var(--ui-accent)]/10 hover:text-[var(--ui-accent-hover)]"
                  onClick={() => setIsDigiflazzDepositDialogOpen(true)}
                  disabled={
                    isLoadingDigiflazzBalance ||
                    !credentialsConfigured ||
                    digiflazzBalanceError === DIGIFLAZZ_CREDENTIALS_MISSING_ERROR
                  }
                >
                  <PiggyBank className="mr-2 h-4 w-4" />
                  Request Deposit
                </Button>
                <Button
                  onClick={() =>
                    void loadDigiflazzServices({ forceRefreshProducts: true })
                  }
                  disabled={isLoadingApiProducts || !credentialsConfigured}
                  variant="secondary"
                  className="rounded-xl bg-[var(--ui-card-alt)] text-[var(--ui-accent)] hover:bg-[var(--ui-highlight-bg)] dark:bg-zinc-900 dark:text-[var(--ui-accent-light)] dark:hover:bg-zinc-800"
                >
                  <RefreshCw
                    className={`mr-2 h-4 w-4 ${
                      isLoadingApiProducts ? "animate-spin" : ""
                    }`}
                  />
                  Refresh Kategori
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-3xl border-[var(--ui-border)] bg-[var(--ui-card)] shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
            <CardContent className="grid h-full gap-4 p-6 sm:grid-cols-2 lg:grid-cols-1">
              <div className="rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-card-alt)] p-4 dark:border-zinc-800 dark:bg-zinc-900">
                <p className="text-xs font-medium uppercase tracking-[0.18em] text-[var(--ui-text-secondary)] dark:text-zinc-500">
                  Active Products
                </p>
                <p className="mt-2 text-3xl font-semibold text-[var(--ui-text)] dark:text-zinc-100">
                  {totalActiveProducts.toLocaleString("id-ID")}
                </p>
                <p className="mt-1 text-sm text-[var(--ui-text-muted)] dark:text-zinc-400">
                  Hanya produk aktif yang diringkas ke kategori.
                </p>
              </div>
              <div className="rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-card-alt)] p-4 dark:border-zinc-800 dark:bg-zinc-900">
                <p className="text-xs font-medium uppercase tracking-[0.18em] text-[var(--ui-text-secondary)] dark:text-zinc-500">
                  Categories
                </p>
                <p className="mt-2 text-3xl font-semibold text-[var(--ui-text)] dark:text-zinc-100">
                  {totalCategories.toLocaleString("id-ID")}
                </p>
                <p className="mt-1 text-sm text-[var(--ui-text-muted)] dark:text-zinc-400">
                  Kategori prioritas dan kategori lainnya dari server summary.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        {apiProductsError && !isLoadingApiProducts && (
          <Card className="border-destructive bg-destructive/10 py-10 text-center shadow">
            <CardHeader>
              <CardTitle className="flex items-center justify-center gap-2 text-destructive">
                <AlertTriangle className="h-6 w-6" />
                Error Loading Products
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-destructive/90">{apiProductsError}</p>
              {apiProductsError.includes("Digiflazz username or API key") && (
                <Button asChild variant="destructive" size="sm" className="mt-3">
                  <Link href="/admin-settings">
                    <Settings className="mr-2 h-4 w-4" />
                    Go to Admin Settings
                  </Link>
                </Button>
              )}
            </CardContent>
          </Card>
        )}

        {apiProductsWarning && !isLoadingApiProducts && (
          <Card className="rounded-3xl border-amber-500/30 bg-amber-500/10 shadow-sm">
            <CardContent className="flex flex-col gap-2 p-5 text-sm text-amber-800 dark:text-amber-200 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                <p>{apiProductsWarning}</p>
              </div>
              <span className="text-xs font-medium uppercase tracking-[0.18em]">
                Cached Summary
              </span>
            </CardContent>
          </Card>
        )}

        {isLoadingApiProducts && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-xl font-semibold">
                <Skeleton className="h-5 w-32" />
              </h2>
              <Skeleton className="h-4 w-20" />
            </div>
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
              {Array.from({ length: 4 }).map((_, index) => (
                <CategorySkeleton key={index} />
              ))}
            </div>
          </div>
        )}

        {!isLoadingApiProducts && !apiProductsError && allCategories.length > 0 && (
          <>
            {prioritizedCategories.length > 0 && (
              <section>
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="flex items-center gap-3 text-xl font-serif font-semibold text-[var(--ui-text)] dark:text-zinc-100">
                    Kategori Utama
                    <Separator className="min-w-[50px] flex-1 bg-[#EFEBE0] dark:bg-zinc-800" />
                  </h2>
                  <span className="rounded-full border border-[var(--ui-border)] bg-[var(--ui-surface)] px-3 py-1 text-sm font-medium text-[var(--ui-text-secondary)] dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-500">
                    {prioritizedCategories.length} kategori
                  </span>
                </div>
                <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                  {prioritizedCategories.map((category) => (
                    <ProductCard
                      key={category.key}
                      title={category.title}
                      description={category.description}
                      icon={digiflazzIconMapping[category.iconKey]}
                      href={category.href}
                      productCount={category.productCount}
                    />
                  ))}
                </div>
              </section>
            )}

            {otherCategories.length > 0 && (
              <section>
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="flex items-center gap-3 text-xl font-serif font-semibold text-[var(--ui-text)] dark:text-zinc-100">
                    Kategori Lainnya
                    <Separator className="min-w-[50px] flex-1 bg-[#EFEBE0] dark:bg-zinc-800" />
                  </h2>
                  <span className="rounded-full border border-[var(--ui-border)] bg-[var(--ui-surface)] px-3 py-1 text-sm font-medium text-[var(--ui-text-secondary)] dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-500">
                    {otherCategories.length} kategori
                  </span>
                </div>
                <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                  {otherCategories.map((category) => (
                    <ProductCard
                      key={category.key}
                      title={category.title}
                      description={category.description}
                      icon={digiflazzIconMapping[category.iconKey]}
                      href={category.href}
                      productCount={category.productCount}
                    />
                  ))}
                </div>
              </section>
            )}
          </>
        )}

        {!isLoadingApiProducts && !apiProductsError && allCategories.length === 0 && (
          <p className="py-10 text-center text-muted-foreground">
            No categories could be derived from active Digiflazz products.
          </p>
        )}

        <DigiflazzDepositDialog
          open={isDigiflazzDepositDialogOpen}
          onOpenChange={setIsDigiflazzDepositDialogOpen}
          onDepositSuccess={() =>
            void loadDigiflazzServices({ preserveCategories: true })
          }
        />
      </div>
    </ProtectedRoute>
  );
}
