
// src/app/(app)/order/tokovoucher/page.tsx
"use client";

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from '@/components/ui/badge';
import OrderFormShell from "@/components/order/OrderFormShell";
import ProductCard from "@/components/products/ProductCard";
import { ShoppingCart, Loader2, AlertTriangle, KeyRound, Send, CheckCircle, Info, DollarSign, ListChecks, Tag, RefreshCw, Server, Code, ArrowLeft, TagIcon, LayoutGrid, Users, PackageSearch, Settings, PiggyBank, Bookmark, ArrowUpDown } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from '@/contexts/AuthContext';
import Link from 'next/link';
import { verifyPin } from '@/ai/flows/verify-pin-flow';
import { generateRefId } from '@/lib/client-utils';
import { addTransactionToDB } from '@/lib/transaction-utils';
import { trySendTelegramNotification, type TelegramNotificationDetails } from '@/lib/notification-utils';
import type { TransactionStatus, NewTransactionInput } from '@/components/transactions/TransactionItem';
import { getCustomSellingPrice } from '@/lib/price-settings-utils';
import { getAdminSettingsFromDB } from '@/lib/admin-settings-utils';
import { Skeleton } from '@/components/ui/skeleton';

import { fetchTokoVoucherBalance, type FetchTokoVoucherBalanceOutput } from '@/ai/flows/tokovoucher/fetchTokoVoucherBalance-flow';
import { fetchTokoVoucherCategories, type TokoVoucherCategory } from '@/ai/flows/tokovoucher/fetchTokoVoucherCategories-flow';
import { fetchTokoVoucherOperators, type TokoVoucherOperator } from '@/ai/flows/tokovoucher/fetchTokoVoucherOperators-flow';
import { fetchTokoVoucherProductTypes, type TokoVoucherProductType } from '@/ai/flows/tokovoucher/fetchTokoVoucherProductTypes-flow';
import { fetchTokoVoucherProducts, type TokoVoucherProduct } from '@/ai/flows/tokovoucher/fetchTokoVoucherProducts-flow';
import { purchaseTokoVoucherProduct } from '@/ai/flows/tokovoucher/purchaseTokoVoucherProduct-flow';
import TokoVoucherDepositDialog from '@/components/dashboard/TokoVoucherDepositDialog';
import { Separator } from '@/components/ui/separator';

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface OrderDetailsToConfirm {
  product: TokoVoucherProduct;
  customerNo: string;
  serverId?: string;
}

interface SubmittedOrderInfo {
  refId: string;
  productName: string;
  customerNoDisplay: string;
  costPrice: number;
  sellingPrice: number;
  profit?: number;
  status: TransactionStatus;
  message?: string | null;
  sn?: string | null;
  trxId?: string;
}

// Filter by ID for reliability
const PRIORITY_CATEGORY_IDS = [1, 4, 8, 9]; // 1: Topup Game, 4: Pulsa, 8: PLN, 9: E-Money
const BRAND_KEYWORDS = ["DANA", "GOPAY", "OVO", "SHOPEEPAY", "MAXIM", "TELKOMSEL", "INDOSAT", "XL", "AXIS", "SMARTFREN", "TRI", "PLN", "FREE FIRE", "MOBILE LEGENDS", "GENSHIN IMPACT", "HONKAI STAR RAIL", "PUBG"];

type SortOrder = 'default' | 'price-asc' | 'price-desc';


export default function TokoVoucherOrderPage() {
  const { toast } = useToast();
  const { user: authUser, logout } = useAuth();
  const router = useRouter();

  const [isTokoVoucherConfigured, setIsTokoVoucherConfigured] = useState(false);
  const tokovoucherCredentialsMissingError = "TokoVoucher Member Code or Signature/Key is not configured in Admin Settings.";
  
  const [tokovoucherBalance, setTokoVoucherBalance] = useState<number | null>(null);
  const [tokovoucherMemberName, setTokoVoucherMemberName] = useState<string | null>(null);
  const [isLoadingTokoVoucherBalance, setIsLoadingTokoVoucherBalance] = useState(true);
  const [tokovoucherBalanceError, setTokoVoucherBalanceError] = useState<string | null>(null);
  const [isTokoVoucherDepositDialogOpen, setIsTokoVoucherDepositDialogOpen] = useState(false);


  const [categories, setCategories] = useState<TokoVoucherCategory[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | undefined>();
  const [isLoadingCategories, setIsLoadingCategories] = useState(true);

  const [operators, setOperators] = useState<TokoVoucherOperator[]>([]);
  const [selectedOperatorId, setSelectedOperatorId] = useState<number | undefined>();
  const [isLoadingOperators, setIsLoadingOperators] = useState(false);

  const [productTypes, setProductTypes] = useState<TokoVoucherProductType[]>([]);
  const [selectedProductTypeId, setSelectedProductTypeId] = useState<number | undefined>();
  const [isLoadingProductTypes, setIsLoadingProductTypes] = useState(false);

  const [products, setProducts] = useState<TokoVoucherProduct[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<TokoVoucherProduct | null>(null);
  const [isLoadingProducts, setIsLoadingProducts] = useState(false);
  const [sortOrder, setSortOrder] = useState<SortOrder>('default');
  
  const [customerNo, setCustomerNo] = useState('');
  const [serverId, setServerId] = useState('');

  const [isConfirmingOrder, setIsConfirmingOrder] = useState(false);
  const [orderDetailsToConfirm, setOrderDetailsToConfirm] = useState<OrderDetailsToConfirm | null>(null);
  const [pinInput, setPinInput] = useState("");
  const [pinError, setPinError] = useState("");
  const [isSubmittingWithPin, setIsSubmittingWithPin] = useState(false);
  const [lastSubmittedOrder, setLastSubmittedOrder] = useState<SubmittedOrderInfo | null>(null);

  const [mainError, setMainError] = useState<string | null>(null);

  const resetSelections = (level: 'category' | 'operator' | 'productType' | 'product' = 'category', keepLastOrderSummary = false) => {
    if (level === 'category') {
      setSelectedCategoryId(undefined);
      setOperators([]);
    }
    if (level === 'category' || level === 'operator') {
      setSelectedOperatorId(undefined);
      setProductTypes([]);
    }
    if (level === 'category' || level === 'operator' || level === 'productType') {
      setSelectedProductTypeId(undefined);
      setProducts([]);
    }
    setSelectedProduct(null);
    setCustomerNo('');
    setServerId('');
    if (!keepLastOrderSummary) {
      setLastSubmittedOrder(null);
    }
    setMainError(null);
    setSortOrder('default');
  };

  const loadTokoVoucherBalance = async () => {
    setIsLoadingTokoVoucherBalance(true);
    setTokoVoucherBalanceError(null);
    try {
      const balanceData = await fetchTokoVoucherBalance();
      if (balanceData.isSuccess) {
        setTokoVoucherBalance(balanceData.saldo ?? null);
        setTokoVoucherMemberName(balanceData.nama ?? null);
      } else {
        setTokoVoucherBalanceError(balanceData.message || "Failed to fetch TokoVoucher balance.");
        if (balanceData.message && balanceData.message.includes("not configured")) {
             // Toast might be redundant if mainError also shows this
        } else {
            toast({ title: "Error Loading TokoVoucher Balance", description: balanceData.message || "Unknown error.", variant: "destructive" });
        }
      }
    } catch (error) {
      console.error("Failed to load TokoVoucher balance:", error);
      let errorMessage = "Failed to load TokoVoucher balance.";
      if (error instanceof Error) errorMessage = error.message;
      setTokoVoucherBalanceError(errorMessage);
      toast({ title: "Error TokoVoucher Balance", description: errorMessage, variant: "destructive" });
    } finally {
      setIsLoadingTokoVoucherBalance(false);
    }
  };


  useEffect(() => {
    async function loadInitialData() {
      setIsLoadingCategories(true);
      const adminSettings = await getAdminSettingsFromDB();
      if (adminSettings.tokovoucherMemberCode && adminSettings.tokovoucherSignature && adminSettings.tokovoucherKey) {
        setIsTokoVoucherConfigured(true);
        loadTokoVoucherBalance();
        
        setMainError(null);
        const result = await fetchTokoVoucherCategories();
        if (result.isSuccess && result.data) {
          setCategories(result.data);
        } else {
          setMainError(result.message || "Failed to load categories from TokoVoucher.");
          toast({ title: "Error", description: result.message || "Could not load TokoVoucher categories.", variant: "destructive" });
        }
      } else {
        setIsTokoVoucherConfigured(false);
        setMainError(tokovoucherCredentialsMissingError);
        setTokoVoucherBalanceError(tokovoucherCredentialsMissingError);
        setIsLoadingTokoVoucherBalance(false);
      }
      setIsLoadingCategories(false);
    }
    loadInitialData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toast]);


  useEffect(() => {
    if (!selectedCategoryId) {
      setOperators([]);
      setSelectedOperatorId(undefined);
      setProductTypes([]);
      setSelectedProductTypeId(undefined);
      setProducts([]);
      setSelectedProduct(null);
      return;
    }
    async function loadOperators() {
      setIsLoadingOperators(true);
      setMainError(null);
      const result = await fetchTokoVoucherOperators({ categoryId: selectedCategoryId! });
      if (result.isSuccess && result.data) {
        setOperators(result.data);
      } else {
        setOperators([]);
        setMainError(result.message || `Failed to load operators for category ${selectedCategoryId}.`);
        toast({ title: "Error", description: result.message || "Could not load TokoVoucher operators.", variant: "destructive" });
      }
      setIsLoadingOperators(false);
      setSelectedOperatorId(undefined); 
      setProductTypes([]);
      setSelectedProductTypeId(undefined);
      setProducts([]);
      setSelectedProduct(null);
    }
    loadOperators();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCategoryId]); 

  useEffect(() => {
    if (!selectedOperatorId) {
      setProductTypes([]);
      setSelectedProductTypeId(undefined);
      setProducts([]);
      setSelectedProduct(null);
      return;
    }
    async function loadProductTypes() {
      setIsLoadingProductTypes(true);
      setMainError(null);
      const result = await fetchTokoVoucherProductTypes({ operatorId: selectedOperatorId! });
      if (result.isSuccess && result.data) {
        setProductTypes(result.data);
      } else {
        setProductTypes([]);
        setMainError(result.message || `Failed to load product types for operator ${selectedOperatorId}.`);
        toast({ title: "Error", description: result.message || "Could not load TokoVoucher product types.", variant: "destructive" });
      }
      setIsLoadingProductTypes(false);
      setSelectedProductTypeId(undefined); 
      setProducts([]);
      setSelectedProduct(null);
    }
    loadProductTypes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedOperatorId]); 

  useEffect(() => {
    if (!selectedProductTypeId) {
      setProducts([]);
      setSelectedProduct(null);
      return;
    }
    async function loadProducts() {
      setIsLoadingProducts(true);
      setMainError(null);
      const result = await fetchTokoVoucherProducts({ productTypeId: selectedProductTypeId! });
      if (result.isSuccess && result.data) {
        setProducts(result.data); // Keep original API order
      } else {
        setProducts([]);
        setMainError(result.message || `Failed to load products for type ${selectedProductTypeId}.`);
        toast({ title: "Error", description: result.message || "Could not load TokoVoucher products.", variant: "destructive" });
      }
      setIsLoadingProducts(false);
      setSelectedProduct(null); 
    }
    loadProducts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedProductTypeId]);

  const sortedProducts = useMemo(() => {
    if (sortOrder === 'price-asc') {
      return [...products].sort((a, b) => a.price - b.price);
    }
    if (sortOrder === 'price-desc') {
      return [...products].sort((a, b) => b.price - a.price);
    }
    return products; // 'default' order from API
  }, [products, sortOrder]);

  const handleProductSelect = (product: TokoVoucherProduct) => {
    if (product.status !== 1) {
      toast({ title: "Product Not Available", description: `${product.nama_produk} is currently not available.`, variant: "default" });
      return;
    }
    setSelectedProduct(product);
    setCustomerNo('');
    setServerId('');
    setLastSubmittedOrder(null);
    setTimeout(() => {
        document.getElementById('tokovoucher-order-confirmation-section')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 100);
  };

  const handleInitiateOrder = () => {
    if (!selectedProduct) return;
    if (selectedProduct.status !== 1) {
        toast({ title: "Cannot Order", description: "This product is currently not available.", variant: "destructive" });
        return;
    }
    if (!customerNo.trim()) {
      toast({ title: "Validation Error", description: "Please enter the customer/destination number/ID.", variant: "destructive" });
      return;
    }
    setOrderDetailsToConfirm({ product: selectedProduct, customerNo, serverId: serverId.trim() || undefined });
    setIsConfirmingOrder(true);
    setPinInput("");
    setPinError("");
  };

  const handlePinConfirm = async () => {
    if (!orderDetailsToConfirm || !authUser) {
      setPinError("Order details or user session is missing. Please try again.");
      setIsSubmittingWithPin(false);
      return;
    }
    const { product, customerNo: custNoForApi, serverId: serverIdForApi } = orderDetailsToConfirm;
    if (product.status !== 1) {
      setPinError("This product is currently not available for purchase.");
      setIsSubmittingWithPin(false);
      return;
    }

    setIsSubmittingWithPin(true);
    setPinError("");

    const refId = `TV-${generateRefId()}`;
    const transactionDetailsForDisplay = serverIdForApi ? `${custNoForApi} (Server: ${serverIdForApi})` : custNoForApi;

    try {
      const pinResponse = await verifyPin({ username: authUser.username, pin: pinInput });
      if (!pinResponse.isValid) {
        setPinError(pinResponse.message || "Invalid PIN.");
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

      const purchaseResponse = await purchaseTokoVoucherProduct({
        refId,
        productCode: product.code,
        customerNo: custNoForApi,
        serverId: serverIdForApi,
      });
      
      const statusForDb: TransactionStatus = purchaseResponse.status === 'sukses' ? 'Sukses' : purchaseResponse.status === 'pending' ? 'Pending' : 'Gagal';
      const clientSideSellingPriceEstimate = getCustomSellingPrice(product.code, 'tokovoucher') || (product.price < 20000 ? product.price + 1000 : product.price <= 50000 ? product.price + 1500 : product.price + 2000);

      // --- Improved Brand & Category Derivation ---
      const productNameUpper = product.nama_produk.toUpperCase();
      let derivedBrand = product.op_name || operators.find(o => String(o.id) === product.op_id)?.nama || BRAND_KEYWORDS.find(b => productNameUpper.includes(b));
      if (!derivedBrand) derivedBrand = "TokoVoucher Service";

      let derivedCategory = product.category_name || categories.find(c => String(c.id) === product.category_id)?.nama;
      if (!derivedCategory) {
          const gameKeywords = ["GAME", "TOPUP", "DIAMOND", "UC", "FREE FIRE", "MOBILE LEGENDS", "GENSHIN", "HONKAI", "PUBG"];
          if (gameKeywords.some(k => productNameUpper.includes(k))) {
              derivedCategory = "Games";
          } else {
              derivedCategory = "Lainnya";
          }
      }
      // --- End of Improved Logic ---

      const newTxInput: NewTransactionInput = {
        id: refId,
        productName: product.nama_produk,
        details: transactionDetailsForDisplay,
        costPrice: product.price,
        sellingPrice: clientSideSellingPriceEstimate, 
        status: statusForDb,
        timestamp: new Date().toISOString(),
        serialNumber: purchaseResponse.status === 'sukses' ? (purchaseResponse.sn || undefined) : undefined,
        failureReason: purchaseResponse.status === 'gagal' ? (purchaseResponse.sn || purchaseResponse.message) : purchaseResponse.status === 'error' ? purchaseResponse.message : undefined,
        buyerSkuCode: product.code,
        originalCustomerNo: serverIdForApi ? `${custNoForApi}|${serverIdForApi}` : custNoForApi, 
        productCategoryFromProvider: derivedCategory,
        productBrandFromProvider: derivedBrand,
        provider: 'tokovoucher',
        providerTransactionId: purchaseResponse.trxId || undefined, 
        transactedBy: authUser.username,
      };
      
      await addTransactionToDB(newTxInput, authUser.username);

      let profitForSummary: number | undefined = undefined;
      if (statusForDb === "Sukses") {
          profitForSummary = clientSideSellingPriceEstimate - product.price;
      }

      const notificationDetails: TelegramNotificationDetails = {
        refId: refId,
        productName: product.nama_produk,
        customerNoDisplay: transactionDetailsForDisplay,
        status: statusForDb,
        provider: 'TokoVoucher',
        costPrice: product.price,
        sellingPrice: clientSideSellingPriceEstimate,
        profit: profitForSummary,
        sn: purchaseResponse.sn || null,
        failureReason: purchaseResponse.status === 'gagal' ? (purchaseResponse.sn || purchaseResponse.message) : purchaseResponse.status === 'error' ? purchaseResponse.message : null,
        timestamp: new Date(),
        trxId: purchaseResponse.trxId || undefined,
        transactedBy: authUser.username,
      };
      trySendTelegramNotification(notificationDetails);
      
      if (purchaseResponse.isSuccess) {
        toast({
          title: `Order ${purchaseResponse.status}`,
          description: purchaseResponse.message || `Order for ${product.nama_produk} is ${purchaseResponse.status?.toLowerCase()}. Trx ID: ${purchaseResponse.trxId || 'N/A'}`,
          duration: 7000,
        });
      } else {
         toast({
          title: `Order ${purchaseResponse.status || "Failed"}`,
          description: purchaseResponse.message || "Failed to process your order with TokoVoucher.",
          variant: "destructive",
        });
      }

      setLastSubmittedOrder({
        refId: refId,
        productName: product.nama_produk,
        customerNoDisplay: transactionDetailsForDisplay,
        costPrice: product.price,
        sellingPrice: clientSideSellingPriceEstimate,
        profit: profitForSummary,
        status: statusForDb,
        message: purchaseResponse.message,
        sn: purchaseResponse.sn,
        trxId: purchaseResponse.trxId,
      });

      resetSelections('category', true); 
      setIsConfirmingOrder(false);
      setOrderDetailsToConfirm(null);
      setPinInput("");
      setPinError("");
      loadTokoVoucherBalance(); 

    } catch (error) {
      console.error("PIN verification or order submission error:", error);
      const message = error instanceof Error ? error.message : "An error occurred.";
      setPinError(`Order error: ${message}`);
      toast({ title: "Order Failed", description: message, variant: "destructive" });
      const notificationDetails: TelegramNotificationDetails = {
        refId: refId,
        productName: product.nama_produk,
        customerNoDisplay: transactionDetailsForDisplay,
        status: "Gagal",
        provider: 'TokoVoucher',
        costPrice: product.price,
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
  
  const { priorityCategories, otherCategories } = useMemo(() => {
    const priority: TokoVoucherCategory[] = [];
    const others: TokoVoucherCategory[] = [];
    
    categories.forEach(cat => {
      if (PRIORITY_CATEGORY_IDS.includes(cat.id)) {
        priority.push(cat);
      } else {
        others.push(cat);
      }
    });

    return { 
        priorityCategories: priority.sort((a,b) => a.nama.localeCompare(b.nama)),
        otherCategories: others.sort((a,b) => a.nama.localeCompare(b.nama)),
    };
  }, [categories]);

  const selectedCategoryName = useMemo(() => categories.find(c => c.id === selectedCategoryId)?.nama, [categories, selectedCategoryId]);
  const selectedOperatorName = useMemo(() => operators.find(o => o.id === selectedOperatorId)?.nama, [operators, selectedOperatorId]);
  const selectedProductTypeName = useMemo(() => productTypes.find(pt => pt.id === selectedProductTypeId)?.nama, [productTypes, selectedProductTypeId]);

  const getStepTitle = () => {
    if (!selectedCategoryId) return "1. Pilih Kategori";
    if (!selectedOperatorId) return `2. Pilih Operator untuk ${selectedCategoryName}`;
    if (!selectedProductTypeId) return `3. Pilih Jenis Produk untuk ${selectedOperatorName}`;
    return `4. Pilih Produk (${selectedProductTypeName})`;
  };

  const CurrentStepIcon = !selectedCategoryId ? LayoutGrid : !selectedOperatorId ? Users : !selectedProductTypeId ? PackageSearch : ShoppingCart;

  const StepSkeleton = () => (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
      {[...Array(8)].map((_, i) => (
        <Card key={i} className="h-[130px] rounded-3xl border-[var(--ui-border)] bg-[var(--ui-surface)] p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950 flex flex-col justify-between">
           <div className="flex items-start justify-between">
            <div className="space-y-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-3 w-32" />
            </div>
            <Skeleton className="h-10 w-10 rounded-md flex-shrink-0" />
          </div>
          <Skeleton className="h-4 w-20" />
        </Card>
      ))}
    </div>
  );

  const availableBadgeClass = "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
  const pendingBadgeClass = "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300";
  const failedBadgeClass = "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300";


  if (!isTokoVoucherConfigured && mainError === tokovoucherCredentialsMissingError) {
     return (
      <OrderFormShell title="TokoVoucher Services" description="Manage TokoVoucher products." icon={ShoppingCart}>
        <Card className="text-center py-10 shadow border-destructive bg-destructive/10 max-w-2xl mx-auto">
            <CardHeader>
              <CardTitle className="text-destructive flex items-center justify-center gap-2">
                  <AlertTriangle className="h-6 w-6" /> TokoVoucher Not Configured
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-destructive/90">{mainError}</p>
              <Button asChild className="mt-4">
                <Link href="/admin-settings">
                  <Settings className="mr-2 h-4 w-4" /> Go to Admin Settings
                </Link>
              </Button>
            </CardContent>
          </Card>
      </OrderFormShell>
    );
  }


  if (isLoadingCategories) {
    return (
      <OrderFormShell title="TokoVoucher Services" description="Select product and complete your order." icon={ShoppingCart}>
        <div className="flex flex-col items-center justify-center py-10 text-[var(--ui-text-muted)] dark:text-zinc-400">
          <Loader2 className="mb-4 h-12 w-12 animate-spin text-[var(--ui-accent)]" />
          <p className="text-lg">Loading TokoVoucher data...</p>
        </div>
      </OrderFormShell>
    );
  }
  
  if (mainError && categories.length === 0 && !isLoadingCategories && isTokoVoucherConfigured) {
     return (
      <OrderFormShell title="TokoVoucher Services" description="Error loading data." icon={ShoppingCart}>
        <Card className="text-center py-10 shadow border-destructive bg-destructive/10  max-w-2xl mx-auto">
            <CardHeader>
              <CardTitle className="text-destructive flex items-center justify-center gap-2">
                  <AlertTriangle className="h-6 w-6" /> Error Loading TokoVoucher Data
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-destructive/90">{mainError}</p>
              <Button onClick={() => window.location.reload()} className="mt-4" variant="outline">Try Reload Page</Button>
            </CardContent>
          </Card>
      </OrderFormShell>
    );
  }

  return (
    <>
    <div className="space-y-8 max-w-7xl mx-auto pb-10">
      <section>
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-[var(--ui-accent-gradient-from)] to-[var(--ui-accent-gradient-to)] text-white shadow-lg">
            <ShoppingCart className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-serif font-bold tracking-tight text-[var(--ui-text)] dark:text-zinc-100">Layanan TokoVoucher</h1>
            <p className="mt-1 text-sm text-[var(--ui-text-muted)] dark:text-zinc-400">Pilih kategori, operator, dan produk dengan tampilan yang mengikuti UI theme global.</p>
          </div>
        </div>
      </section>

      <Card className="relative max-w-2xl mx-auto overflow-hidden rounded-3xl border-[var(--ui-border)] bg-[var(--ui-surface)] shadow-lg dark:border-zinc-800 dark:bg-zinc-950">
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-[var(--ui-top-bar-from)] via-[var(--ui-top-bar-via)] to-[var(--ui-accent-gradient-to)] opacity-80" />
        <CardHeader className="flex flex-row items-center justify-between space-y-0 px-6 pb-2 pt-6 sm:px-8">
          <CardTitle className="text-lg font-semibold font-headline text-[var(--ui-text)] dark:text-zinc-100">TokoVoucher Balance</CardTitle>
          <div className="rounded-xl bg-[var(--ui-accent)]/10 p-2">
            <DollarSign className="h-6 w-6 text-[var(--ui-accent)]" />
          </div>
        </CardHeader>
        <CardContent className="px-6 pb-6 pt-2 sm:px-8 sm:pb-8">
          {isLoadingTokoVoucherBalance ? (
            <Skeleton className="h-8 w-40" />
          ) : tokovoucherBalanceError ? (
            <div className="space-y-2 rounded-2xl border border-red-200 bg-red-50 p-3 text-red-700 dark:border-red-900/50 dark:bg-red-950/10 dark:text-red-300">
              <div className="flex items-center space-x-2">
                <AlertTriangle className="h-5 w-5" />
                <span>Error: {tokovoucherBalanceError}</span>
              </div>
            </div>
          ) : tokovoucherBalance !== null ? (
            <>
              <p className="text-3xl font-bold tracking-tight text-[var(--ui-accent)]">Rp {tokovoucherBalance.toLocaleString()}</p>
              {tokovoucherMemberName && <p className="mt-1 text-xs text-[var(--ui-text-secondary)] dark:text-zinc-500">Member: {tokovoucherMemberName}</p>}
            </>
          ) : (
            <p className="text-[var(--ui-text-secondary)] dark:text-zinc-500">TokoVoucher balance data not available.</p>
          )}
          <Button
            variant="outline"
            size="sm"
            className="mt-4 rounded-xl border-[var(--ui-accent-light)]/30 text-[var(--ui-accent)] hover:bg-[var(--ui-accent)]/10 hover:text-[var(--ui-accent-hover)]"
            onClick={() => setIsTokoVoucherDepositDialogOpen(true)}
            disabled={isLoadingTokoVoucherBalance || !!tokovoucherBalanceError}
          >
            <PiggyBank className="mr-2 h-4 w-4" /> Request Deposit
          </Button>
        </CardContent>
      </Card>

      {!lastSubmittedOrder ? (
        <OrderFormShell
          title="TokoVoucher Services"
          description={selectedCategoryId ? `Follow steps for: ${selectedCategoryName}` : "Start by selecting a category below."}
          icon={ShoppingCart}
        >
          <div className="space-y-6">
            {!selectedCategoryId && (
              <>
                {priorityCategories.length > 0 && (
                  <section>
                    <div className="mb-4 flex items-center justify-between">
                      <h2 className="flex items-center gap-3 text-xl font-serif font-semibold text-[var(--ui-text)] dark:text-zinc-100">
                        Kategori Utama
                        <Separator className="w-16 bg-[var(--ui-border)] dark:bg-zinc-800" />
                      </h2>
                      <span className="rounded-full border border-[var(--ui-border)] bg-[var(--ui-card-alt)] px-3 py-1 text-sm font-medium text-[var(--ui-text-secondary)] dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-500">{priorityCategories.length} kategori</span>
                    </div>
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4">
                      {priorityCategories.map((cat) => (
                        <ProductCard
                          key={cat.id}
                          title={cat.nama}
                          description={`Jelajahi produk ${cat.nama}`}
                          imageUrl={cat.image || undefined}
                          icon={cat.image ? undefined : LayoutGrid}
                          onClick={() => setSelectedCategoryId(cat.id)}
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
                        <Separator className="w-16 bg-[var(--ui-border)] dark:bg-zinc-800" />
                      </h2>
                      <span className="rounded-full border border-[var(--ui-border)] bg-[var(--ui-card-alt)] px-3 py-1 text-sm font-medium text-[var(--ui-text-secondary)] dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-500">{otherCategories.length} kategori</span>
                    </div>
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4">
                      {otherCategories.map((cat) => (
                        <ProductCard
                          key={cat.id}
                          title={cat.nama}
                          description={`Jelajahi produk ${cat.nama}`}
                          imageUrl={cat.image || undefined}
                          icon={cat.image ? undefined : LayoutGrid}
                          onClick={() => setSelectedCategoryId(cat.id)}
                        />
                      ))}
                    </div>
                  </section>
                )}
              </>
            )}

            {selectedCategoryId && !selectedOperatorId && (
              <>
                <div className="mb-4 flex items-center justify-between rounded-2xl border border-[var(--ui-highlight-border)] bg-[var(--ui-accent-bg)] p-3">
                  <p className="text-md font-semibold text-[var(--ui-accent)]">Kategori: {selectedCategoryName}</p>
                  <Button variant="outline" size="sm" onClick={() => resetSelections('category')} className="rounded-xl border-[var(--ui-accent)]/20 text-[var(--ui-accent)] hover:bg-[var(--ui-accent)]/10 hover:text-[var(--ui-accent-hover)]">
                    <ArrowLeft className="mr-1.5 h-4 w-4" /> Ganti Kategori
                  </Button>
                </div>
                <div className="space-y-2">
                  <Label className="flex items-center gap-2 text-md font-semibold text-[var(--ui-text)] dark:text-zinc-100"><CurrentStepIcon className="h-5 w-5 text-[var(--ui-accent)]" /> {getStepTitle()}</Label>
                  {isLoadingOperators ? <StepSkeleton /> : operators.length === 0 ? (
                    <p className="text-[var(--ui-text-secondary)] dark:text-zinc-500">Tidak ada operator ditemukan untuk {selectedCategoryName}.</p>
                  ) : (
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4">
                      {operators.map((op) => (
                        <ProductCard
                          key={op.id}
                          title={op.nama}
                          description={op.keterangan || `Produk dari ${op.nama}`}
                          imageUrl={op.image || undefined}
                          icon={op.image ? undefined : Users}
                          onClick={() => setSelectedOperatorId(op.id)}
                        />
                      ))}
                    </div>
                  )}
                  {mainError && !isLoadingOperators && operators.length === 0 && <p className="text-destructive">{mainError}</p>}
                </div>
              </>
            )}

            {selectedCategoryId && selectedOperatorId && !selectedProductTypeId && (
              <>
                <div className="mb-4 space-y-2 rounded-2xl border border-[var(--ui-highlight-border)] bg-[var(--ui-accent-bg)] p-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-[var(--ui-accent)]">Kategori: {selectedCategoryName}</p>
                    <Button variant="ghost" size="sm" onClick={() => resetSelections('category')} className="h-6 rounded-lg px-1.5 text-xs text-[var(--ui-accent)] hover:bg-[var(--ui-accent)]/10 hover:text-[var(--ui-accent-hover)]">
                      <ArrowLeft className="mr-1 h-3 w-3" /> Ganti
                    </Button>
                  </div>
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-[var(--ui-accent)]">Operator: {selectedOperatorName}</p>
                    <Button variant="ghost" size="sm" onClick={() => resetSelections('operator')} className="h-6 rounded-lg px-1.5 text-xs text-[var(--ui-accent)] hover:bg-[var(--ui-accent)]/10 hover:text-[var(--ui-accent-hover)]">
                      <ArrowLeft className="mr-1 h-3 w-3" /> Ganti
                    </Button>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="flex items-center gap-2 text-md font-semibold text-[var(--ui-text)] dark:text-zinc-100"><CurrentStepIcon className="h-5 w-5 text-[var(--ui-accent)]" /> {getStepTitle()}</Label>
                  {isLoadingProductTypes ? <StepSkeleton /> : productTypes.length === 0 ? (
                    <p className="text-[var(--ui-text-secondary)] dark:text-zinc-500">Tidak ada jenis produk ditemukan untuk {selectedOperatorName}.</p>
                  ) : (
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4">
                      {productTypes.map((pt) => (
                        <ProductCard
                          key={pt.id}
                          title={pt.nama}
                          description={`Pilih ${pt.nama}`}
                          imageUrl={pt.image || undefined}
                          icon={pt.image ? undefined : TagIcon}
                          onClick={() => setSelectedProductTypeId(pt.id)}
                        />
                      ))}
                    </div>
                  )}
                  {mainError && !isLoadingProductTypes && productTypes.length === 0 && <p className="text-destructive">{mainError}</p>}
                </div>
              </>
            )}

            {selectedCategoryId && selectedOperatorId && selectedProductTypeId && (
              <>
                <div className="mb-4 space-y-2 rounded-2xl border border-[var(--ui-highlight-border)] bg-[var(--ui-accent-bg)] p-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold text-[var(--ui-accent)]">Kategori: {selectedCategoryName}</p>
                    <Button variant="ghost" size="sm" onClick={() => resetSelections('category')} className="h-6 rounded-lg px-1.5 text-xs text-[var(--ui-accent)] hover:bg-[var(--ui-accent)]/10 hover:text-[var(--ui-accent-hover)]">
                      <ArrowLeft className="mr-1 h-3 w-3" /> Ganti
                    </Button>
                  </div>
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold text-[var(--ui-accent)]">Operator: {selectedOperatorName}</p>
                    <Button variant="ghost" size="sm" onClick={() => resetSelections('operator')} className="h-6 rounded-lg px-1.5 text-xs text-[var(--ui-accent)] hover:bg-[var(--ui-accent)]/10 hover:text-[var(--ui-accent-hover)]">
                      <ArrowLeft className="mr-1 h-3 w-3" /> Ganti
                    </Button>
                  </div>
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold text-[var(--ui-accent)]">Jenis Produk: {selectedProductTypeName}</p>
                    <Button variant="ghost" size="sm" onClick={() => resetSelections('productType')} className="h-6 rounded-lg px-1.5 text-xs text-[var(--ui-accent)] hover:bg-[var(--ui-accent)]/10 hover:text-[var(--ui-accent-hover)]">
                      <ArrowLeft className="mr-1 h-3 w-3" /> Ganti
                    </Button>
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="mb-2 flex flex-col items-start justify-between gap-2 sm:flex-row sm:items-center">
                    <Label className="flex items-center gap-2 text-md font-semibold text-[var(--ui-text)] dark:text-zinc-100"><CurrentStepIcon className="h-5 w-5 text-[var(--ui-accent)]" /> {getStepTitle()}</Label>
                    <div className="w-full sm:w-auto">
                      <Select value={sortOrder} onValueChange={(value) => setSortOrder(value as SortOrder)}>
                        <SelectTrigger className="h-9 rounded-xl border-[var(--ui-input-border)] bg-[var(--ui-input-bg)] text-[var(--ui-text)] focus:ring-[var(--ui-accent)] dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100">
                          <div className="flex items-center gap-2">
                            <ArrowUpDown className="h-4 w-4 text-[var(--ui-text-secondary)] dark:text-zinc-500" />
                            <SelectValue placeholder="Sort by..." />
                          </div>
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="default">Default</SelectItem>
                          <SelectItem value="price-asc">Harga Terendah</SelectItem>
                          <SelectItem value="price-desc">Harga Tertinggi</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  {isLoadingProducts ? (
                    <div className="flex justify-center py-6">
                      <Loader2 className="h-8 w-8 animate-spin text-[var(--ui-accent)]" />
                      <span className="ml-2 text-[var(--ui-text-secondary)] dark:text-zinc-500">Loading products...</span>
                    </div>
                  ) : sortedProducts.length === 0 ? (
                    <p className="py-4 text-center text-[var(--ui-text-secondary)] dark:text-zinc-500">No products found for this type.</p>
                  ) : (
                    <div className="grid max-h-[calc(100vh-500px)] grid-cols-1 gap-3 overflow-y-auto rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-card-alt)]/60 p-2 md:max-h-[350px] md:grid-cols-2 dark:border-zinc-800 dark:bg-zinc-900/40">
                      {sortedProducts.map((product) => (
                        <Card
                          key={product.code}
                          onClick={() => handleProductSelect(product)}
                          className={`flex flex-col justify-between rounded-3xl border bg-[var(--ui-card)] transition-all duration-200 dark:border-zinc-800 dark:bg-zinc-950 ${
                            product.status !== 1 ? 'cursor-not-allowed opacity-60' : 'cursor-pointer shadow-sm hover:-translate-y-0.5 hover:shadow-lg'
                          } ${
                            selectedProduct?.code === product.code && product.status === 1 ? 'border-[var(--ui-accent)] ring-2 ring-[var(--ui-accent)] shadow-lg' : 'border-[var(--ui-border)]'
                          }`}
                        >
                          <div>
                            <CardHeader className="pb-2">
                              <div className="flex items-start justify-between gap-3">
                                <CardTitle className="text-md font-semibold leading-tight text-[var(--ui-text)] dark:text-zinc-100">{product.nama_produk}</CardTitle>
                                {selectedProduct?.code === product.code && product.status === 1 && <CheckCircle className="h-5 w-5 flex-shrink-0 text-[var(--ui-accent)]" />}
                              </div>
                              <CardDescription className="truncate text-xs text-[var(--ui-text-secondary)] dark:text-zinc-500">
                                {product.op_name && `Op: ${product.op_name}`}
                                {product.op_name && (product.category_name || product.jenis_name) && " | "}
                                {product.jenis_name && `Jenis: ${product.jenis_name}`}
                                {product.jenis_name && product.category_name && " | "}
                                {product.category_name && `Cat: ${product.category_name}`}
                                {!product.op_name && !product.category_name && !product.jenis_name && product.code && `Kode: ${product.code}`}
                              </CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-1.5 pb-3 pt-0">
                              <p className={`text-lg font-bold ${product.status === 1 ? 'text-[var(--ui-accent)]' : 'text-[var(--ui-text-secondary)] dark:text-zinc-500'}`}>Rp {product.price.toLocaleString()}</p>
                              <div className="flex flex-wrap gap-1.5">
                                <Badge variant="outline" className={`text-xs ${product.status === 1 ? availableBadgeClass : failedBadgeClass}`}>{product.status === 1 ? "Available" : "Unavailable"}</Badge>
                                <Badge variant="outline" className="border-[var(--ui-border)] bg-[var(--ui-card-alt)] text-xs text-[var(--ui-text-muted)] dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">Code: {product.code}</Badge>
                              </div>
                              {product.keterangan && <p className="truncate pt-1 text-xs italic text-[var(--ui-text-muted)] dark:text-zinc-400" title={product.keterangan}>Hint: {product.keterangan}</p>}
                            </CardContent>
                          </div>
                        </Card>
                      ))}
                    </div>
                  )}
                  {mainError && !isLoadingProducts && products.length === 0 && <p className="text-destructive">{mainError}</p>}
                </div>
              </>
            )}

            {selectedProduct && (
              <Card className="relative mt-6 overflow-hidden rounded-3xl border border-[var(--ui-accent)]/40 bg-[var(--ui-card)] shadow-lg dark:border-zinc-800 dark:bg-zinc-950" id="tokovoucher-order-confirmation-section">
                <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-[var(--ui-top-bar-from)] via-[var(--ui-top-bar-via)] to-[var(--ui-accent-gradient-to)] opacity-80" />
                <CardHeader className="bg-[var(--ui-accent-bg)]">
                  <CardTitle className="text-lg text-[var(--ui-accent)]">Order: {selectedProduct.nama_produk}</CardTitle>
                  <CardDescription className="text-[var(--ui-text-muted)] dark:text-zinc-400">
                    Harga Modal: Rp {selectedProduct.price.toLocaleString()} | Kode: {selectedProduct.code}
                    {selectedProduct.status !== 1 && <span className="block font-semibold text-destructive">(Product Not Available)</span>}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4 pt-4">
                  <div>
                    <Label htmlFor="tokovoucher-customer-no" className="font-semibold text-[var(--ui-text)] dark:text-zinc-100">Nomor Tujuan / User ID</Label>
                    <Input
                      id="tokovoucher-customer-no"
                      value={customerNo}
                      onChange={(e) => setCustomerNo(e.target.value)}
                      placeholder="e.g., 08123xxx / GameUserID"
                      className="mt-1 border-[var(--ui-input-border)] bg-[var(--ui-input-bg)] text-[var(--ui-text)] placeholder:text-[var(--ui-text-secondary)] focus-visible:ring-[var(--ui-accent)] dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                      disabled={selectedProduct.status !== 1 || isSubmittingWithPin}
                    />
                    {selectedProduct.keterangan && !selectedProduct.keterangan.toLowerCase().includes("masukkan") && <p className="mt-1 text-xs italic text-[var(--ui-text-muted)] dark:text-zinc-400">Hint: {selectedProduct.keterangan}</p>}
                  </div>
                  <div>
                    <Label htmlFor="tokovoucher-server-id" className="font-semibold text-[var(--ui-text)] dark:text-zinc-100">Server ID (Opsional)</Label>
                    <Input
                      id="tokovoucher-server-id"
                      value={serverId}
                      onChange={(e) => setServerId(e.target.value)}
                      placeholder="e.g., 1234 (jika diperlukan)"
                      className="mt-1 border-[var(--ui-input-border)] bg-[var(--ui-input-bg)] text-[var(--ui-text)] placeholder:text-[var(--ui-text-secondary)] focus-visible:ring-[var(--ui-accent)] dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                      disabled={selectedProduct.status !== 1 || isSubmittingWithPin}
                    />
                  </div>
                  <Button
                    onClick={handleInitiateOrder}
                    className="w-full rounded-xl bg-[var(--ui-accent)] py-3 text-md text-white hover:bg-[var(--ui-accent-hover)]"
                    disabled={!selectedProduct || selectedProduct.status !== 1 || !customerNo.trim() || isSubmittingWithPin}
                  >
                    {isSubmittingWithPin ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <Send className="mr-2 h-5 w-5" />}
                    Lanjutkan Pembayaran
                  </Button>
                </CardContent>
              </Card>
            )}
          </div>
        </OrderFormShell>
      ) : (
        <Card className="relative mt-8 max-w-2xl mx-auto overflow-hidden rounded-3xl border border-[var(--ui-accent)]/40 bg-[var(--ui-card)] shadow-xl dark:border-zinc-800 dark:bg-zinc-950">
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-[var(--ui-top-bar-from)] via-[var(--ui-top-bar-via)] to-[var(--ui-accent-gradient-to)] opacity-80" />
          <CardHeader className="bg-[var(--ui-accent-bg)]">
            <div className="flex items-center gap-3">
              {lastSubmittedOrder.status === "Sukses" ? <CheckCircle className="h-8 w-8 text-green-500" /> : lastSubmittedOrder.status === "Pending" ? <Loader2 className="h-8 w-8 animate-spin text-yellow-500" /> : <AlertTriangle className="h-8 w-8 text-red-500" />}
              <CardTitle className="text-xl text-[var(--ui-accent)]">
                {lastSubmittedOrder.status === "Sukses" ? "Transaction Successful" : lastSubmittedOrder.status === "Pending" ? "Transaction Pending" : "Transaction Failed"} (TokoVoucher)
              </CardTitle>
            </div>
            <CardDescription className="text-[var(--ui-text-muted)] dark:text-zinc-400">Ref ID: {lastSubmittedOrder.refId} {lastSubmittedOrder.trxId && `| Trx ID: ${lastSubmittedOrder.trxId}`}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 pt-6 text-[var(--ui-text)] dark:text-zinc-100">
            <p><strong>Product:</strong> {lastSubmittedOrder.productName}</p>
            <p><strong>Details:</strong> {lastSubmittedOrder.customerNoDisplay}</p>
            <p><strong>Harga Jual (Estimasi):</strong> Rp {lastSubmittedOrder.sellingPrice.toLocaleString()}</p>
            {lastSubmittedOrder.status === "Sukses" && typeof lastSubmittedOrder.profit === 'number' && (
              <div className="flex items-center text-sm">
                <DollarSign className="mr-1 h-4 w-4 text-green-600" />
                <span className="font-semibold text-green-700 dark:text-green-300">Profit (Estimasi): Rp {lastSubmittedOrder.profit.toLocaleString()}</span>
              </div>
            )}
            <div><strong>Status:</strong> <Badge variant="outline" className={lastSubmittedOrder.status === 'Sukses' ? availableBadgeClass : lastSubmittedOrder.status === 'Gagal' ? failedBadgeClass : pendingBadgeClass}>{lastSubmittedOrder.status}</Badge></div>
            {lastSubmittedOrder.message && <p className="text-sm text-[var(--ui-text-muted)] dark:text-zinc-400"><strong>Message:</strong> {lastSubmittedOrder.message}</p>}
            {lastSubmittedOrder.sn && <p><strong>SN/Token:</strong> <span className="font-mono text-[var(--ui-accent)]">{lastSubmittedOrder.sn}</span></p>}
            <p className="text-xs italic text-[var(--ui-text-secondary)] dark:text-zinc-500">Catatan: Harga Jual dan Profit yang ditampilkan adalah estimasi. Nilai final tercatat di Riwayat Transaksi.</p>
            <div className="flex flex-col gap-3 pt-4 sm:flex-row">
              <Button onClick={() => router.push('/transactions')} className="w-full rounded-xl bg-[var(--ui-accent)] text-white hover:bg-[var(--ui-accent-hover)] sm:w-auto">
                <ListChecks className="mr-2 h-4 w-4" /> View Transaction History
              </Button>
              <Button onClick={() => resetSelections()} variant="outline" className="w-full rounded-xl border-[var(--ui-accent)]/20 text-[var(--ui-accent)] hover:bg-[var(--ui-accent)]/10 hover:text-[var(--ui-accent-hover)] sm:w-auto">
                <Tag className="mr-2 h-4 w-4" /> Place New Order
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>

    {isConfirmingOrder && orderDetailsToConfirm && (
      <AlertDialog open={isConfirmingOrder} onOpenChange={(open) => { if (!open && !isSubmittingWithPin) setIsConfirmingOrder(false); else if (open) setIsConfirmingOrder(true); }}>
        <AlertDialogContent className="border-[var(--ui-border)] bg-[var(--ui-card)] text-[var(--ui-text)] dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <ShoppingCart className="h-6 w-6 text-[var(--ui-accent)]" />
              Confirm Your TokoVoucher Order
            </AlertDialogTitle>
            <AlertDialogDescription className="pt-2 text-sm text-[var(--ui-text-muted)] dark:text-zinc-400">
              Review your order and enter PIN to confirm:
            </AlertDialogDescription>
            <div className="pt-2 space-y-1 text-sm text-[var(--ui-text)] dark:text-zinc-100">
              <div><strong>Product:</strong> {orderDetailsToConfirm.product.nama_produk}</div>
              <div><strong>Kode Produk:</strong> {orderDetailsToConfirm.product.code}</div>
              <div><strong>Harga Modal:</strong> Rp {orderDetailsToConfirm.product.price.toLocaleString()}</div>
              <div><strong>Nomor Tujuan:</strong> {orderDetailsToConfirm.customerNo}</div>
              {orderDetailsToConfirm.serverId && <div><strong>Server ID:</strong> {orderDetailsToConfirm.serverId}</div>}
            </div>
          </AlertDialogHeader>
          <div className="my-4 space-y-2 rounded-2xl border border-[var(--ui-highlight-border)] bg-[var(--ui-accent-bg)] p-4 py-4">
            <Label htmlFor="tokovoucherPinInput" className="flex items-center justify-center text-sm font-medium text-[var(--ui-text-muted)] dark:text-zinc-400">
              <KeyRound className="mr-2 h-4 w-4" /> Transaction PIN
            </Label>
            <Input
              id="tokovoucherPinInput" type="password" value={pinInput}
              onChange={(e) => { const val = e.target.value.replace(/\D/g, ''); if (val.length <= 6) { setPinInput(val); if (pinError) setPinError("");}}}
              placeholder="● ● ● ● ● ●" maxLength={6}
              className="border-[var(--ui-input-border)] bg-[var(--ui-input-bg)] text-center text-xl tracking-[0.5em] text-[var(--ui-text)] focus-visible:ring-[var(--ui-accent)] dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
            />
            {pinError && <p className="text-sm text-destructive text-center pt-2">{pinError}</p>}
          </div>
          <AlertDialogFooter className="pt-2">
              <AlertDialogCancel onClick={() => { setIsConfirmingOrder(false); setPinInput(""); setPinError(""); }} disabled={isSubmittingWithPin} className="border-[var(--ui-border)] bg-[var(--ui-card-alt)] text-[var(--ui-text)] hover:bg-[var(--ui-accent-bg)] dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100">Cancel</AlertDialogCancel>
              <Button onClick={handlePinConfirm} disabled={isSubmittingWithPin || pinInput.length !== 6} className="bg-[var(--ui-accent)] text-white hover:bg-[var(--ui-accent-hover)]">
              {isSubmittingWithPin && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Confirm & Pay
              </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    )}
     <TokoVoucherDepositDialog open={isTokoVoucherDepositDialogOpen} onOpenChange={setIsTokoVoucherDepositDialogOpen} onDepositSuccess={() => { loadTokoVoucherBalance(); }} />
    </>
  );
}
