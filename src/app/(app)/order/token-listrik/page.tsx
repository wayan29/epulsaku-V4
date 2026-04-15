
// src/app/(app)/order/token-listrik/page.tsx
"use client";

import { useState, useEffect, useMemo, useRef } from 'react';
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import OrderFormShell from "@/components/order/OrderFormShell";
import { Zap, AlertTriangle, Loader2, ShieldCheck, Send, Search, RefreshCw, UserCheck, KeyRound, CheckCircle, Clock, ListChecks, Tag, DollarSign, Database } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from '@/contexts/AuthContext';
import { verifyPin } from '@/ai/flows/verify-pin-flow';
import { fetchDigiflazzProducts, type DigiflazzProduct } from '@/ai/flows/fetch-digiflazz-products-flow';
import { inquirePlnCustomer, type InquirePlnCustomerOutput } from '@/ai/flows/inquire-pln-customer-flow';
import { purchaseDigiflazzProduct } from '@/ai/flows/purchase-digiflazz-product-flow';
import { addTransactionToDB } from '@/lib/transaction-utils';
import { generateRefId } from '@/lib/client-utils';
import { trySendTelegramNotification, type TelegramNotificationDetails } from '@/lib/notification-utils';
import type { TransactionStatus, NewTransactionInput } from '@/components/transactions/TransactionItem';
import { getCustomSellingPrice } from '@/lib/price-settings-utils';
import {
  getSavedPlnCustomers,
  markSavedPlnCustomerOrdered,
  type SavedPlnCustomer,
} from '@/lib/savepln-utils';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

const tokenListrikOrderFormSchema = z.object({
  meterNumber: z.string().min(10, "Nomor meter minimal 10 digit").max(13, "Nomor meter maksimal 13 digit").regex(/^\d+$/, "Nomor meter hanya boleh berisi angka"),
});

type TokenListrikOrderFormValues = z.infer<typeof tokenListrikOrderFormSchema>;

const RELEVANT_PLN_CATEGORIES_UPPER = ["PLN", "TOKEN LISTRIK", "TOKEN"];

interface SubmittedTokenListrikOrderInfo {
  refId: string;
  productName: string;
  meterNumber: string;
  plnCustomerName?: string;
  costPrice: number;
  sellingPrice: number;
  profit?: number;
  status: TransactionStatus;
  message?: string | null;
  sn?: string | null;
}

function formatSavedPlnDate(value?: string): string {
  if (!value) {
    return 'Belum ada aktivitas';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'Belum ada aktivitas';
  }

  return new Intl.DateTimeFormat('id-ID', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

export default function TokenListrikOrderPage() {
  const { toast } = useToast();
  const { user: authUser, logout } = useAuth();
  const router = useRouter();

  const [allApiProducts, setAllApiProducts] = useState<DigiflazzProduct[]>([]);
  const [isLoadingApiProducts, setIsLoadingApiProducts] = useState(true);
  const [apiProductsError, setApiProductsError] = useState<string | null>(null);

  const [selectedProduct, setSelectedProduct] = useState<DigiflazzProduct | null>(null);
  const [meterInquiryResult, setMeterInquiryResult] = useState<InquirePlnCustomerOutput | null>(null);

  const [isConfirmingOrder, setIsConfirmingOrder] = useState(false);
  const [pinInput, setPinInput] = useState("");
  const [pinError, setPinError] = useState("");
  const [isSubmittingWithPin, setIsSubmittingWithPin] = useState(false);

  const [isMeterChecked, setIsMeterChecked] = useState(false);
  const [isCheckingMeter, setIsCheckingMeter] = useState(false);
  const [meterCheckError, setMeterCheckError] = useState<string | null>(null);
  const [isRefreshingPricelist, setIsRefreshingPricelist] = useState(false);
  const [lastSubmittedOrder, setLastSubmittedOrder] = useState<SubmittedTokenListrikOrderInfo | null>(null);
  const [savedCustomers, setSavedCustomers] = useState<SavedPlnCustomer[]>([]);
  const [isLoadingSavedCustomers, setIsLoadingSavedCustomers] = useState(true);
  const [savedCustomersError, setSavedCustomersError] = useState<string | null>(null);
  const [isSavedCustomersDialogOpen, setIsSavedCustomersDialogOpen] = useState(false);
  const [savedCustomerSearch, setSavedCustomerSearch] = useState('');
  const [allowProceedWithoutValidation, setAllowProceedWithoutValidation] = useState(false);
  const skipMeterResetRef = useRef(false);

  const form = useForm<TokenListrikOrderFormValues>({
    resolver: zodResolver(tokenListrikOrderFormSchema),
    defaultValues: {
      meterNumber: "",
    },
  });
  const watchedMeterNumber = form.watch('meterNumber');

  const loadSavedCustomers = async () => {
    setIsLoadingSavedCustomers(true);
    setSavedCustomersError(null);

    try {
      const customers = await getSavedPlnCustomers();
      setSavedCustomers(customers);
    } catch (error) {
      console.error('Failed to load saved PLN customers:', error);
      const errorMessage = error instanceof Error ? error.message : 'Gagal memuat daftar pelanggan tersimpan.';
      setSavedCustomersError(errorMessage);
    } finally {
      setIsLoadingSavedCustomers(false);
    }
  };

  const loadAllApiProducts = async (forceRefresh = false) => {
    if (!forceRefresh) setIsLoadingApiProducts(true);
    else setIsRefreshingPricelist(true);

    setApiProductsError(null);
    if (forceRefresh) {
        setSelectedProduct(null);
        setLastSubmittedOrder(null);
    }

    try {
      const productsData = await fetchDigiflazzProducts({ forceRefresh });
      setAllApiProducts(productsData);
      if (forceRefresh) {
        toast({
            title: "Pricelist Refreshed",
            description: "Successfully updated product list from Digiflazz.",
        });
      }
    } catch (error) {
      console.error("Failed to load Digiflazz API products for PLN:", error);
      const errorMessage = error instanceof Error ? error.message : "Failed to load products.";
      setApiProductsError(errorMessage);
      toast({
        title: forceRefresh ? "Refresh Failed" : "Error Loading Products",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      if (!forceRefresh) setIsLoadingApiProducts(false);
      else setIsRefreshingPricelist(false);
    }
  };

  useEffect(() => {
    loadAllApiProducts(false);
    void loadSavedCustomers();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (skipMeterResetRef.current) {
      skipMeterResetRef.current = false;
      return;
    }

    if (isMeterChecked) {
      setIsMeterChecked(false);
      setMeterInquiryResult(null);
      setSelectedProduct(null);
      setMeterCheckError(null);
      setLastSubmittedOrder(null);
      setAllowProceedWithoutValidation(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watchedMeterNumber]);

  const filteredSavedCustomers = useMemo(() => {
    const normalizedQuery = savedCustomerSearch.trim().toLowerCase();

    if (!normalizedQuery) {
      return savedCustomers;
    }

    return savedCustomers.filter((customer) =>
      [
        customer.customerName,
        customer.customerNo,
        customer.preferredCustomerNo,
        customer.meterNo,
        customer.subscriberId,
        customer.segmentPower,
      ]
        .filter(Boolean)
        .some((value) => value?.toLowerCase().includes(normalizedQuery))
    );
  }, [savedCustomerSearch, savedCustomers]);

  const handleUseSavedCustomer = (customer: SavedPlnCustomer) => {
    const meterNumberToUse =
      customer.preferredCustomerNo ||
      customer.subscriberId ||
      customer.meterNo ||
      customer.customerNo;

    skipMeterResetRef.current = true;
    form.setValue('meterNumber', meterNumberToUse, {
      shouldDirty: true,
      shouldTouch: true,
      shouldValidate: true,
    });

    setMeterInquiryResult({
      isSuccess: true,
      customerName: customer.customerName,
      meterNo: customer.meterNo,
      subscriberId: customer.subscriberId,
      segmentPower: customer.segmentPower,
      message: 'Data pelanggan diambil dari riwayat pelanggan tersimpan.',
      rawResponse: customer.rawResponse,
      source: 'cache',
    });
    setMeterCheckError(null);
    setSelectedProduct(null);
    setLastSubmittedOrder(null);
    setAllowProceedWithoutValidation(false);
    setIsMeterChecked(true);
    setIsSavedCustomersDialogOpen(false);
    setSavedCustomerSearch('');

    toast({
      title: 'Pelanggan tersimpan dipilih',
      description: `${customer.customerName} dimuat dari riwayat pelanggan tersimpan.`,
    });
  };

  const handleCheckMeterNumber = async () => {
    setIsCheckingMeter(true);
    setMeterCheckError(null);
    setMeterInquiryResult(null);
    setSelectedProduct(null);
    setLastSubmittedOrder(null);
    setAllowProceedWithoutValidation(false);

    const currentMeterNumber = form.getValues('meterNumber');

    if (!currentMeterNumber || currentMeterNumber.length < 10) {
      setMeterCheckError("Masukkan nomor meter PLN yang valid (minimal 10 digit).");
      setIsMeterChecked(true);
      setIsCheckingMeter(false);
      return;
    }

    if (isLoadingApiProducts && allApiProducts.length === 0) {
      setMeterCheckError("Daftar produk masih dimuat, tunggu sebentar lalu coba lagi.");
      setIsMeterChecked(true);
      setIsCheckingMeter(false);
      return;
    }
    if (apiProductsError && allApiProducts.length === 0) {
      setMeterCheckError(`Gagal memuat produk: ${apiProductsError}. Tidak dapat memeriksa nomor meter.`);
      setIsMeterChecked(true);
      setIsCheckingMeter(false);
      return;
    }

    try {
      const result = await inquirePlnCustomer({ customerNo: currentMeterNumber });
      setMeterInquiryResult(result);
      if (!result.isSuccess) {
        setMeterCheckError(result.message || "Gagal memverifikasi nomor meter. Pastikan nomor sudah benar.");
      } else {
        setAllowProceedWithoutValidation(false);
        void loadSavedCustomers();
      }
    } catch (error) {
      console.error("PLN Inquiry system error:", error);
      const errorMessage = error instanceof Error ? error.message : "Terjadi kesalahan tak terduga.";
      setMeterInquiryResult({ isSuccess: false, message: `Error: ${errorMessage}` });
      setMeterCheckError(`Error sistem saat cek ID PLN: ${errorMessage}`);
    } finally {
      setIsMeterChecked(true);
      setIsCheckingMeter(false);
    }
  };

  const canUseValidatedCustomer = meterInquiryResult?.isSuccess === true;
  const canUseManualUnverifiedFlow =
    allowProceedWithoutValidation &&
    !canUseValidatedCustomer &&
    Boolean(form.getValues('meterNumber')?.trim());
  const canShowProducts = canUseValidatedCustomer || canUseManualUnverifiedFlow;

  const availableProducts = useMemo(() => {
    if (!isMeterChecked || isLoadingApiProducts || apiProductsError) {
        return [];
    }

    const relevantProducts = allApiProducts.filter(p => {
        const productBrandUpper = p.brand.toUpperCase();
        const productCategoryUpper = p.category.toUpperCase();

        const brandMatch = productBrandUpper === "PLN" || productBrandUpper.includes("LISTRIK");
        const categoryMatch = RELEVANT_PLN_CATEGORIES_UPPER.some(cat => productCategoryUpper.includes(cat));

        return brandMatch && categoryMatch;
    }).sort((a, b) => a.price - b.price);

    if (relevantProducts.length === 0 && isMeterChecked && !meterCheckError && (meterInquiryResult?.isSuccess || allowProceedWithoutValidation) && !meterInquiryResult?.message?.includes("Gagal memuat produk")) {
        setTimeout(() => setMeterCheckError(`Tidak ada produk token listrik yang ditemukan saat ini.`), 0);
    } else if (relevantProducts.length > 0 && meterCheckError && meterCheckError.startsWith("Tidak ada produk")) {
         setTimeout(() => setMeterCheckError(null), 0);
    }

    return relevantProducts;
  }, [allApiProducts, isMeterChecked, meterInquiryResult, isLoadingApiProducts, apiProductsError, meterCheckError, allowProceedWithoutValidation]);


  const handleProductSelect = (product: DigiflazzProduct) => {
    const isActive = product.buyer_product_status && product.seller_product_status;
    if (!isActive) {
        toast({
            title: "Produk Tidak Tersedia",
            description: `${product.product_name} saat ini tidak tersedia untuk dibeli.`,
            variant: "default"
        });
        return;
    }
    setSelectedProduct(product);
    setLastSubmittedOrder(null);
  };

  const onSubmitOrder = () => {
    if (!selectedProduct) {
      toast({ title: "Belum Ada Produk Dipilih", description: "Silakan pilih produk token listrik.", variant: "destructive" });
      return;
    }
    if (!canUseValidatedCustomer && !canUseManualUnverifiedFlow) {
      toast({ title: "Nomor Meter Belum Terverifikasi", description: "Cek nomor meter dulu atau pilih lanjut tanpa validasi jika Digiflazz sedang bermasalah.", variant: "destructive" });
      return;
    }
    const isActive = selectedProduct.buyer_product_status && selectedProduct.seller_product_status;
    if (!isActive) {
        toast({ title: "Produk Tidak Aktif", description: "Produk yang dipilih tidak tersedia.", variant: "destructive" });
        return;
    }
    setIsConfirmingOrder(true);
    setPinInput("");
    setPinError("");
  };

  const handlePinConfirm = async () => {
    if (!selectedProduct || !authUser || (!canUseValidatedCustomer && !canUseManualUnverifiedFlow)) {
      setPinError("Detail order, sesi pengguna, atau izin lanjut tanpa validasi hilang. Coba lagi.");
      setIsSubmittingWithPin(false);
      return;
    }
    const isActive = selectedProduct.buyer_product_status && selectedProduct.seller_product_status;
    if (!isActive) {
      setPinError("Produk tidak lagi tersedia.");
      setIsSubmittingWithPin(false);
      return;
    }

    setIsSubmittingWithPin(true);
    setPinError("");

    const refId = `DF-${generateRefId()}`;
    const meterNumber = form.getValues("meterNumber");

    try {
      const pinResponse = await verifyPin({ username: authUser.username, pin: pinInput });
      if (!pinResponse.isValid) {
        setPinError(pinResponse.message || "PIN salah.");
        setIsSubmittingWithPin(false);
        if (pinResponse.accountDisabled) {
            toast({
              title: "Account Disabled",
              description: "Your account has been locked and you have been logged out. Please contact a super administrator.",
              variant: "destructive",
              duration: 10000,
            });
            logout();
        }
        return;
      }

      const purchaseResponse = await purchaseDigiflazzProduct({
        buyerSkuCode: selectedProduct.buyer_sku_code,
        customerNo: meterNumber,
        refId: refId,
      });

      const clientSideSellingPriceEstimate = getCustomSellingPrice(selectedProduct.buyer_sku_code, 'digiflazz') || 
                                          (selectedProduct.price < 20000 ? selectedProduct.price + 1000 : 
                                          selectedProduct.price <= 50000 ? selectedProduct.price + 1500 : 
                                          selectedProduct.price + 2000);

      const newTxInput: NewTransactionInput = {
        id: refId,
        productName: selectedProduct.product_name,
        details: `${meterNumber} (${meterInquiryResult?.customerName || 'Belum Tervalidasi'})`,
        costPrice: selectedProduct.price,
        sellingPrice: clientSideSellingPriceEstimate,
        status: purchaseResponse.status as TransactionStatus || "Gagal",
        timestamp: new Date().toISOString(),
        serialNumber: purchaseResponse.sn || undefined,
        failureReason: purchaseResponse.status === "Gagal" ? purchaseResponse.message : undefined,
        buyerSkuCode: selectedProduct.buyer_sku_code,
        originalCustomerNo: meterNumber,
        productCategoryFromProvider: selectedProduct.category,
        productBrandFromProvider: selectedProduct.brand,
        provider: 'digiflazz',
        transactedBy: authUser.username,
      };
      
      await addTransactionToDB(newTxInput, authUser.username);
      await markSavedPlnCustomerOrdered(meterNumber, {
        refId,
        productName: selectedProduct.product_name,
      });
      void loadSavedCustomers();

      let profitForSummary: number | undefined = undefined;
      if (purchaseResponse.status === "Sukses") {
          profitForSummary = clientSideSellingPriceEstimate - selectedProduct.price;
      }

      const notificationDetails: TelegramNotificationDetails = {
        refId: refId,
        productName: selectedProduct.product_name,
        customerNoDisplay: `${meterNumber} (${meterInquiryResult?.customerName || 'Belum Tervalidasi'})`,
        status: purchaseResponse.status as TransactionStatus || "Gagal",
        provider: 'Digiflazz',
        costPrice: selectedProduct.price,
        sellingPrice: clientSideSellingPriceEstimate,
        profit: profitForSummary,
        sn: purchaseResponse.sn || null,
        failureReason: purchaseResponse.status === "Gagal" ? purchaseResponse.message : null,
        timestamp: new Date(),
        transactedBy: authUser.username,
      };
      trySendTelegramNotification(notificationDetails);

      if (purchaseResponse.status === "Sukses" || purchaseResponse.status === "Pending") {
        toast({
          title: `Order ${purchaseResponse.status}`,
          description: purchaseResponse.message || `Order untuk ${selectedProduct.product_name} ${purchaseResponse.status.toLowerCase()}. SN: ${purchaseResponse.sn || 'N/A'}`,
          duration: 7000,
        });
      } else { 
         toast({
          title: "Order Gagal",
          description: purchaseResponse.message || "Gagal memproses order Anda dengan Digiflazz.",
          variant: "destructive",
        });
      }

      setLastSubmittedOrder({
        refId: refId,
        productName: selectedProduct.product_name,
        meterNumber: meterNumber,
        plnCustomerName: meterInquiryResult?.customerName,
        costPrice: selectedProduct.price,
        sellingPrice: clientSideSellingPriceEstimate, 
        profit: profitForSummary,
        status: purchaseResponse.status as TransactionStatus || "Gagal",
        message: purchaseResponse.message,
        sn: purchaseResponse.sn,
      });

      form.reset({ meterNumber: "" });
      setSelectedProduct(null);
      setMeterInquiryResult(null);
      setIsConfirmingOrder(false);
      setIsMeterChecked(false);
      setPinInput("");
      setPinError("");

    } catch (error) {
      console.error("Error verifikasi PIN atau submit order:", error);
      const message = error instanceof Error ? error.message : "Terjadi kesalahan.";
      setPinError(`Error order: ${message}`);
      toast({ title: "Order Gagal", description: message, variant: "destructive" });

      const failedTxInput: NewTransactionInput = {
        id: refId,
        productName: selectedProduct.product_name,
        details: `${meterNumber} (${meterInquiryResult?.customerName || 'Belum Tervalidasi'})`,
        costPrice: selectedProduct.price,
        sellingPrice: 0,
        status: "Gagal",
        timestamp: new Date().toISOString(),
        failureReason: message,
        buyerSkuCode: selectedProduct.buyer_sku_code,
        originalCustomerNo: meterNumber,
        productCategoryFromProvider: selectedProduct.category,
        productBrandFromProvider: selectedProduct.brand,
        provider: 'digiflazz',
        transactedBy: authUser.username,
      };
      await addTransactionToDB(failedTxInput, authUser.username);
      await markSavedPlnCustomerOrdered(meterNumber, {
        refId,
        productName: selectedProduct.product_name,
      });
      void loadSavedCustomers();
      const notificationDetails: TelegramNotificationDetails = {
        refId: refId,
        productName: selectedProduct.product_name,
        customerNoDisplay: `${meterNumber} (${meterInquiryResult?.customerName || 'Belum Tervalidasi'})`,
        status: "Gagal",
        provider: 'Digiflazz',
        costPrice: selectedProduct.price,
        sellingPrice: 0,
        failureReason: message,
        timestamp: new Date(),
        transactedBy: authUser.username,
      };
      trySendTelegramNotification(notificationDetails);
    } finally {
      setIsSubmittingWithPin(false);
    }
  };

  const hasActiveProductsAvailable = useMemo(() => {
    return availableProducts.some(p => p.buyer_product_status && p.seller_product_status);
  }, [availableProducts]);

  const handleRefreshPricelist = async () => {
    await loadAllApiProducts(true);
  };

  const themedLabelClass =
    "flex items-center font-semibold text-[var(--ui-text)] dark:text-zinc-100";
  const themedInputClass =
    "rounded-xl border-[var(--ui-input-border)] bg-[var(--ui-input-bg)] text-[var(--ui-text)] placeholder:text-[var(--ui-text-secondary)] focus-visible:ring-[var(--ui-accent)] dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100";
  const themedOutlineButtonClass =
    "rounded-xl border-[var(--ui-border)] bg-[var(--ui-card-alt)] text-[var(--ui-text)] hover:bg-[var(--ui-accent-bg)] hover:text-[var(--ui-accent)] dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100";
  const themedPrimaryButtonClass =
    "rounded-xl bg-[var(--ui-accent)] text-white hover:bg-[var(--ui-accent-hover)]";
  const themedInfoCardClass =
    "rounded-3xl border-[var(--ui-border)] bg-[var(--ui-card)] text-[var(--ui-text)] shadow-sm dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100";

  const ProductSkeleton = () => (
    <Card className={themedInfoCardClass}>
      <CardContent className="p-3 space-y-2">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-5 w-1/2" />
          <div className="flex gap-2 pt-1">
            <Skeleton className="h-5 w-16 rounded-full" />
            <Skeleton className="h-5 w-20 rounded-full" />
          </div>
      </CardContent>
    </Card>
  );

  if (isLoadingApiProducts && allApiProducts.length === 0 && !isRefreshingPricelist) {
    return (
      <OrderFormShell title="Beli Token Listrik PLN" description="Masukkan nomor meter untuk mencari produk." icon={Zap}>
        <div className="flex flex-col items-center justify-center py-10 text-[var(--ui-text-muted)] dark:text-zinc-400">
          <Loader2 className="mb-4 h-12 w-12 animate-spin text-[var(--ui-accent)]" />
          <p className="text-lg">Memuat produk Token Listrik dari Digiflazz...</p>
        </div>
      </OrderFormShell>
    );
  }

  if (apiProductsError && allApiProducts.length === 0 && !isLoadingApiProducts && !isRefreshingPricelist) {
    return (
      <OrderFormShell title="Beli Token Listrik PLN" description="Masukkan nomor meter untuk mencari produk." icon={Zap}>
        <Card className="border-destructive bg-destructive/10 py-10 text-center shadow">
            <CardContent>
              <div className="mb-2 flex items-center justify-center gap-2 text-destructive">
                    <AlertTriangle className="h-6 w-6" /> <span className="font-semibold">Error Memuat Produk</span>
              </div>
              <p className="text-destructive/90">{apiProductsError}</p>
              <Button onClick={() => loadAllApiProducts(false)} className={`mt-4 ${themedPrimaryButtonClass}`}>Coba Muat Ulang</Button>
            </CardContent>
          </Card>
      </OrderFormShell>
    );
  }

  return (
    <>
    {!lastSubmittedOrder ? (
      <OrderFormShell title="Beli Token Listrik PLN" description="Masukkan nomor meter, cek pelanggan, lalu pilih produk." icon={Zap}>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmitOrder)} className="space-y-6">
            <FormField
              control={form.control}
              name="meterNumber"
              render={({ field }) => (
                <FormItem>
                  <Label className={themedLabelClass}>
                    <Zap className="mr-2 h-4 w-4 text-[var(--ui-accent)]" />
                    Nomor Meter / ID Pelanggan
                  </Label>
                  <FormControl>
                    <Input
                      placeholder="e.g., 12345678901"
                      {...field}
                      type="tel"
                      disabled={isCheckingMeter || isRefreshingPricelist || isSubmittingWithPin}
                      maxLength={13}
                      className={themedInputClass}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="flex flex-col sm:flex-row gap-2">
                <Button
                  type="button"
                  onClick={handleCheckMeterNumber}
                  className={`w-full sm:flex-grow ${themedPrimaryButtonClass}`}
                  disabled={isCheckingMeter || !watchedMeterNumber || watchedMeterNumber.length < 10 || isRefreshingPricelist || (isLoadingApiProducts && allApiProducts.length === 0) || isSubmittingWithPin}
                >
                  {isCheckingMeter ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                      <Search className="mr-2 h-4 w-4" />
                  )}
                  {isCheckingMeter ? "Mengecek..." : "Cek ID Pelanggan"}
                </Button>
                <Button
                    type="button"
                    onClick={() => setIsSavedCustomersDialogOpen(true)}
                    variant="outline"
                    className={`w-full sm:w-auto ${themedOutlineButtonClass}`}
                    disabled={isSubmittingWithPin}
                >
                    {isLoadingSavedCustomers ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Database className="mr-2 h-4 w-4" />
                    )}
                    Pilih Pelanggan Tersimpan
                </Button>
                <Button
                    type="button"
                    onClick={handleRefreshPricelist}
                    variant="outline"
                    className={`w-full sm:w-auto ${themedOutlineButtonClass}`}
                    disabled={isRefreshingPricelist || (isLoadingApiProducts && allApiProducts.length === 0) || isSubmittingWithPin}
                >
                    {isRefreshingPricelist ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                        <RefreshCw className="mr-2 h-4 w-4" />
                    )}
                    {isRefreshingPricelist ? 'Memuat Ulang...' : 'Refresh Pricelist'}
                </Button>
            </div>
            <div className="flex flex-col gap-1 text-xs text-[var(--ui-text-muted)] dark:text-zinc-400 sm:flex-row sm:items-center sm:justify-between">
              <p>
                {isLoadingSavedCustomers
                  ? 'Memuat daftar pelanggan PLN tersimpan...'
                  : `${savedCustomers.length} pelanggan PLN tersimpan siap dipakai.`}
              </p>
              {savedCustomersError && (
                <p className="text-destructive">Daftar pelanggan tersimpan belum bisa dimuat: {savedCustomersError}</p>
              )}
            </div>

            {isMeterChecked && (
              <>
                {meterCheckError && (!meterInquiryResult || !meterInquiryResult.isSuccess) && (
                  <div className="mt-2 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                      <div className="space-y-2">
                        <p className="font-semibold">Validasi PLN belum berhasil</p>
                        <p>{meterCheckError}</p>
                        <p className="text-xs text-amber-800">
                          Kalau ini gangguan inquiry Digiflazz dan kamu yakin nomor pelanggan benar, transaksi tetap bisa dilanjutkan tanpa validasi.
                        </p>
                        {!allowProceedWithoutValidation ? (
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => setAllowProceedWithoutValidation(true)}
                            className="border-amber-300 bg-white text-amber-900 hover:bg-amber-100"
                          >
                            Lanjut Tanpa Validasi
                          </Button>
                        ) : (
                          <p className="text-xs font-semibold text-amber-900">
                            Mode bypass aktif. Produk PLN bisa dipilih di bawah, tetapi data pelanggan belum tervalidasi.
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {meterInquiryResult?.isSuccess && meterInquiryResult.customerName && (
                  <div className="mt-2 p-3 rounded-md text-sm bg-green-50 border border-green-200 text-green-700">
                    <p className="font-semibold flex items-center"><UserCheck className="h-4 w-4 mr-2" />Data Pelanggan Ditemukan:</p>
                    <p><strong>Nama:</strong> {meterInquiryResult.customerName}</p>
                    {meterInquiryResult.meterNo && <p><strong>No. Meter:</strong> {meterInquiryResult.meterNo}</p>}
                    {meterInquiryResult.subscriberId && <p><strong>ID Pel:</strong> {meterInquiryResult.subscriberId}</p>}
                    {meterInquiryResult.segmentPower && <p><strong>Daya:</strong> {meterInquiryResult.segmentPower}</p>}
                    {meterInquiryResult.source === 'cache' && (
                      <p className="pt-1 text-xs font-medium text-green-800">Sumber validasi: riwayat pelanggan tersimpan.</p>
                    )}
                  </div>
                )}

                {canUseManualUnverifiedFlow && (
                  <div className="mt-2 rounded-2xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
                    <p className="font-semibold">Order tanpa validasi PLN aktif</p>
                    <p className="mt-1 text-xs text-amber-800">
                      Nomor meter akan langsung dikirim ke provider tanpa hasil cek nama pelanggan. Gunakan hanya saat inquiry Digiflazz sedang bermasalah.
                    </p>
                  </div>
                )}
                
                {isLoadingApiProducts && isMeterChecked && (
                  <div className="grid max-h-96 grid-cols-1 gap-3 overflow-y-auto rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-card-alt)] p-2 md:grid-cols-2 dark:border-zinc-800 dark:bg-zinc-900">
                     {[...Array(6)].map((_, i) => <ProductSkeleton key={i} />)}
                  </div>
                )}
                
                {availableProducts.length > 0 && canShowProducts && !isLoadingApiProducts && (
                  <div className="space-y-4 pt-4">
                    <h3 className="text-lg font-semibold text-[var(--ui-text)] dark:text-zinc-100">Pilih Produk Token Listrik:</h3>
                    <div className="grid max-h-96 grid-cols-1 gap-3 overflow-y-auto rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-card-alt)] p-2 md:grid-cols-2 dark:border-zinc-800 dark:bg-zinc-900">
                      {availableProducts.map(product => {
                        const isActive = product.buyer_product_status && product.seller_product_status;
                        return (
                            <Card
                              key={product.buyer_sku_code}
                              onClick={() => handleProductSelect(product)}
                              className={`${themedInfoCardClass} transition-shadow
                                          ${isActive ? 'cursor-pointer hover:shadow-lg' : 'opacity-60 cursor-not-allowed'}
                                          ${selectedProduct?.buyer_sku_code === product.buyer_sku_code && isActive ? 'ring-2 ring-[var(--ui-accent)] border-[var(--ui-accent)]' : 'border-[var(--ui-border)]'}`}
                            >
                              <CardContent className="p-3">
                                  <div className="flex justify-between items-start">
                                    <p className="mr-2 flex-grow text-sm font-medium text-[var(--ui-text)] dark:text-zinc-100">{product.product_name}</p>
                                    {selectedProduct?.buyer_sku_code === product.buyer_sku_code && isActive && <ShieldCheck className="h-5 w-5 flex-shrink-0 text-[var(--ui-accent)]" />}
                                  </div>
                                  <p className={`text-md font-semibold ${isActive ? 'text-[var(--ui-accent)]' : 'text-[var(--ui-text-muted)] dark:text-zinc-400'}`}>Rp {product.price.toLocaleString()}</p>
                                  <div className="mt-1.5 flex flex-wrap gap-1">
                                      <Badge variant="outline" className="border-[var(--ui-border)] bg-[var(--ui-card-alt)] text-xs text-[var(--ui-text)] dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100">{product.brand}</Badge>
                                      {isActive ? (
                                        <Badge variant="default" className="text-xs bg-green-100 text-green-800 border-green-300">Tersedia</Badge>
                                      ) : (
                                        <Badge variant="destructive" className="text-xs">Tidak Tersedia</Badge>
                                      )}
                                  </div>
                              </CardContent>
                            </Card>
                        );
                      })}
                    </div>
                     {selectedProduct && (
                        <div className="mt-2 rounded-2xl border border-[var(--ui-accent)]/30 bg-[var(--ui-accent-bg)] p-3 text-center">
                            <p className="font-semibold text-[var(--ui-accent)]">Terpilih: {selectedProduct.product_name} (Modal: Rp {selectedProduct.price.toLocaleString()})</p>
                             {!(selectedProduct.buyer_product_status && selectedProduct.seller_product_status) && (
                                <p className="text-sm text-destructive">(Produk ini saat ini tidak tersedia)</p>
                            )}
                        </div>
                    )}
                  </div>
                )}
                {isMeterChecked && (!meterCheckError || canUseManualUnverifiedFlow) && canShowProducts && availableProducts.length === 0 && !isLoadingApiProducts && (
                  <div className="mt-4 rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-card)] p-4 text-center text-[var(--ui-text-muted)] dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400">
                    Tidak ada produk token listrik yang ditemukan untuk filter saat ini.
                  </div>
                )}
              </>
            )}

            {selectedProduct && isMeterChecked && canShowProducts && hasActiveProductsAvailable && (
              <Button
                type="submit"
                className={`mt-6 w-full ${themedPrimaryButtonClass}`}
                disabled={isRefreshingPricelist || isSubmittingWithPin || !selectedProduct || !(selectedProduct.buyer_product_status && selectedProduct.seller_product_status) || !canShowProducts}
              >
                <Send className="mr-2 h-4 w-4" /> {canUseManualUnverifiedFlow ? 'Lanjut Tanpa Validasi' : 'Lanjut ke Pembayaran'}
              </Button>
            )}
          </form>
        </Form>
      </OrderFormShell>
    ) : (
      <Card className="mt-8 border-2 border-[var(--ui-accent)]/25 bg-[var(--ui-card)] shadow-xl dark:border-sky-400/20 dark:bg-zinc-950">
        <CardHeader className="bg-[var(--ui-accent-bg)]">
          <div className="flex items-center gap-3">
            {lastSubmittedOrder.status === "Sukses" ? <CheckCircle className="h-8 w-8 text-green-500" /> : lastSubmittedOrder.status === "Pending" ? <Clock className="h-8 w-8 text-yellow-500" /> : <AlertTriangle className="h-8 w-8 text-red-500" />}
            <CardTitle className="text-xl text-[var(--ui-accent)]">
              {lastSubmittedOrder.status === "Sukses" ? "Transaction Successful" : lastSubmittedOrder.status === "Pending" ? "Transaction Pending" : "Transaction Failed"}
            </CardTitle>
          </div>
          <CardDescription className="text-[var(--ui-text-muted)] dark:text-zinc-400">
            Ref ID: {lastSubmittedOrder.refId}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 pt-6 text-[var(--ui-text)] dark:text-zinc-100">
          <p><strong>Product:</strong> {lastSubmittedOrder.productName}</p>
          <p><strong>Meter Number:</strong> {lastSubmittedOrder.meterNumber} {lastSubmittedOrder.plnCustomerName && `(${lastSubmittedOrder.plnCustomerName})`}</p>
          <p><strong>Harga Jual (Estimasi):</strong> Rp {lastSubmittedOrder.sellingPrice.toLocaleString()}</p>
          {lastSubmittedOrder.status === "Sukses" && typeof lastSubmittedOrder.profit === 'number' && (
                <div className="flex items-center text-sm">
                    <DollarSign className="h-4 w-4 mr-1 text-green-600"/>
                    <span className="text-green-700 font-semibold">Profit (Estimasi): Rp {lastSubmittedOrder.profit.toLocaleString()}</span>
                </div>
            )}
          <div><strong>Status:</strong> <Badge variant={lastSubmittedOrder.status === 'Sukses' ? 'default' : lastSubmittedOrder.status === 'Gagal' ? 'destructive' : 'secondary'} className={`${lastSubmittedOrder.status === 'Sukses' ? 'bg-green-100 text-green-800 border-green-300' : lastSubmittedOrder.status === 'Gagal' ? 'bg-red-100 text-red-800 border-red-300' : 'bg-yellow-100 text-yellow-800 border-yellow-300'}`}>{lastSubmittedOrder.status}</Badge></div>
          {lastSubmittedOrder.message && <p className="text-sm text-[var(--ui-text-muted)] dark:text-zinc-400"><strong>Message:</strong> {lastSubmittedOrder.message}</p>}
          {lastSubmittedOrder.sn && <p><strong>Token/SN:</strong> <span className="font-mono text-[var(--ui-accent)]">{lastSubmittedOrder.sn}</span></p>}
          <p className="text-xs italic text-[var(--ui-text-muted)] dark:text-zinc-400">Catatan: Harga Jual dan Profit yang ditampilkan di sini adalah estimasi. Nilai final tercatat di Riwayat Transaksi.</p>

          <div className="flex flex-col sm:flex-row gap-3 pt-4">
            <Button onClick={() => router.push('/transactions')} className={`w-full sm:w-auto ${themedPrimaryButtonClass}`}>
              <ListChecks className="mr-2 h-4 w-4" /> View Transaction History
            </Button>
            <Button onClick={() => setLastSubmittedOrder(null)} variant="outline" className={`w-full sm:w-auto ${themedOutlineButtonClass}`}>
              <Tag className="mr-2 h-4 w-4" /> Place New Order
            </Button>
          </div>
        </CardContent>
      </Card>
    )}

      <Dialog open={isSavedCustomersDialogOpen} onOpenChange={setIsSavedCustomersDialogOpen}>
        <DialogContent className="border-[var(--ui-border)] bg-[var(--ui-card)] text-[var(--ui-text)] sm:max-w-2xl dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-[var(--ui-text)] dark:text-zinc-100">
              <Database className="h-5 w-5 text-[var(--ui-accent)]" />
              Pelanggan PLN Tersimpan
            </DialogTitle>
            <DialogDescription className="text-[var(--ui-text-muted)] dark:text-zinc-400">
              Pilih pelanggan setia dari riwayat pelanggan tersimpan untuk langsung lanjut order tanpa validasi ulang ke Digiflazz.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <Input
              value={savedCustomerSearch}
              onChange={(event) => setSavedCustomerSearch(event.target.value)}
              placeholder="Cari nama pelanggan, no meter, IDPEL, atau daya..."
              className={themedInputClass}
            />

            {savedCustomersError && (
              <div className="rounded-2xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                {savedCustomersError}
              </div>
            )}

            <div className="rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-card-alt)] p-3 dark:border-zinc-800 dark:bg-zinc-900">
              {isLoadingSavedCustomers ? (
                <div className="space-y-2">
                  {[...Array(4)].map((_, index) => (
                    <div
                      key={index}
                      className="rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-card)] p-4 dark:border-zinc-800 dark:bg-zinc-950"
                    >
                      <Skeleton className="h-4 w-40" />
                      <Skeleton className="mt-2 h-3 w-56" />
                      <Skeleton className="mt-3 h-3 w-32" />
                    </div>
                  ))}
                </div>
              ) : filteredSavedCustomers.length > 0 ? (
                <div className="max-h-[28rem] space-y-2 overflow-y-auto pr-1">
                  {filteredSavedCustomers.map((customer) => (
                    <button
                      key={customer._id}
                      type="button"
                      onClick={() => handleUseSavedCustomer(customer)}
                      className="w-full rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-card)] p-4 text-left transition-colors hover:border-[var(--ui-accent)] hover:bg-[var(--ui-accent-bg)] dark:border-zinc-800 dark:bg-zinc-950"
                    >
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                        <div className="space-y-1">
                          <p className="font-semibold text-[var(--ui-text)] dark:text-zinc-100">
                            {customer.customerName}
                          </p>
                          <p className="text-sm text-[var(--ui-text-muted)] dark:text-zinc-400">
                            ID Pel: {customer.subscriberId || '-'} | Meter: {customer.meterNo || '-'}
                          </p>
                          <p className="text-sm text-[var(--ui-text-muted)] dark:text-zinc-400">
                            Nomor order default: {customer.preferredCustomerNo || customer.customerNo}
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-2 sm:justify-end">
                          {customer.segmentPower && (
                            <Badge
                              variant="outline"
                              className="border-[var(--ui-border)] bg-[var(--ui-card-alt)] text-[var(--ui-text)] dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                            >
                              {customer.segmentPower}
                            </Badge>
                          )}
                          {customer.lastOrderedAt && (
                            <Badge className="bg-[var(--ui-accent-bg)] text-[var(--ui-accent)]">
                              Order terakhir: {formatSavedPlnDate(customer.lastOrderedAt)}
                            </Badge>
                          )}
                        </div>
                      </div>
                      <p className="mt-3 text-xs text-[var(--ui-text-muted)] dark:text-zinc-400">
                        Validasi terakhir: {formatSavedPlnDate(customer.lastValidatedAt)}
                        {customer.lastOrderProductName ? ` | Produk terakhir: ${customer.lastOrderProductName}` : ''}
                      </p>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="py-10 text-center text-sm text-[var(--ui-text-muted)] dark:text-zinc-400">
                  Belum ada pelanggan PLN tersimpan yang cocok dengan pencarian ini.
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>


      {isConfirmingOrder && selectedProduct && (canUseValidatedCustomer || canUseManualUnverifiedFlow) && (
         <AlertDialog open={isConfirmingOrder} onOpenChange={(open) => { if (!open && !isSubmittingWithPin) setIsConfirmingOrder(false); else if (open) setIsConfirmingOrder(true); }}>
          <AlertDialogContent className="border-[var(--ui-border)] bg-[var(--ui-card)] text-[var(--ui-text)] dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100">
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2 text-[var(--ui-text)] dark:text-zinc-100">
                <ShieldCheck className="h-6 w-6 text-[var(--ui-accent)]" />
                Konfirmasi Order Anda
              </AlertDialogTitle>
              <AlertDialogDescription className="pt-2 text-sm text-[var(--ui-text-muted)] dark:text-zinc-400">
                Harap periksa detail order Anda dan masukkan PIN untuk konfirmasi:
              </AlertDialogDescription>
              <div className="space-y-1 pt-2 text-sm text-[var(--ui-text)] dark:text-zinc-100">
                <div><strong>Nomor Meter:</strong> {form.getValues("meterNumber")}</div>
                <div><strong>Nama Pelanggan:</strong> {meterInquiryResult?.customerName || 'Belum tervalidasi'}</div>
                {meterInquiryResult?.segmentPower && <div><strong>Daya:</strong> {meterInquiryResult.segmentPower}</div>}
                <div><strong>Produk:</strong> {selectedProduct.product_name}</div>
                <div><strong>Harga Modal:</strong> Rp {selectedProduct.price.toLocaleString()}</div>
                {canUseManualUnverifiedFlow && (
                  <div className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                    Order ini dikirim tanpa validasi PLN dari Digiflazz. Pastikan nomor meter sudah benar sebelum melanjutkan.
                  </div>
                )}
              </div>
            </AlertDialogHeader>

            <div className="my-4 space-y-2 rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-card-alt)] p-4 py-4 dark:border-zinc-800 dark:bg-zinc-900">
              <Label htmlFor="pinInputTokenListrik" className="flex items-center justify-center text-sm font-medium text-[var(--ui-text-muted)] dark:text-zinc-400">
                <KeyRound className="mr-2 h-4 w-4" />
                PIN Transaksi
              </Label>
              <Input
                id="pinInputTokenListrik"
                type="password"
                value={pinInput}
                onChange={(e) => {
                  const val = e.target.value.replace(/\D/g, '');
                  if (val.length <= 6) {
                    setPinInput(val);
                    if (pinError) setPinError("");
                  }
                }}
                placeholder="● ● ● ● ● ●"
                maxLength={6}
                className="rounded-xl border-[var(--ui-input-border)] bg-[var(--ui-input-bg)] text-center text-xl tracking-[0.5em] text-[var(--ui-text)] focus-visible:ring-[var(--ui-accent)] dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
              />
              {pinError && <p className="text-sm text-destructive text-center pt-2">{pinError}</p>}
            </div>

            <AlertDialogFooter className="pt-2">
                <AlertDialogCancel onClick={() => {setIsConfirmingOrder(false); setPinInput(""); setPinError("");}} disabled={isSubmittingWithPin} className={themedOutlineButtonClass}>
                    Batal
                </AlertDialogCancel>
                <Button onClick={handlePinConfirm} disabled={isSubmittingWithPin || pinInput.length !== 6} className={themedPrimaryButtonClass}>
                  {isSubmittingWithPin && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Konfirmasi & Bayar
                </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </>
  );
}
