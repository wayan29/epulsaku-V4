
// src/app/(app)/order/digital-services/page.tsx
"use client";

import { useState, useEffect, useMemo } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { ShoppingBag, Loader2, AlertTriangle, RefreshCw, UserCheck, Info, ShieldCheck, Gamepad2, CreditCard, KeyRound, Zap, Wifi, Ticket, Smartphone, UserCircle2, Server, MapPin, Users, Send, CheckCircle, Clock, ListChecks, Tag, DollarSign, type LucideIcon } from "lucide-react";
import OrderFormShell from '@/components/order/OrderFormShell';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Badge } from '@/components/ui/badge';
import { fetchDigiflazzProducts, type DigiflazzProduct } from '@/ai/flows/fetch-digiflazz-products-flow';
import { inquirePlnCustomer, type InquirePlnCustomerOutput } from '@/ai/flows/inquire-pln-customer-flow';
import { inquireFreeFireNickname, type InquireFreeFireNicknameOutput } from '@/ai/flows/inquire-free-fire-nickname-flow';
import { inquireMobileLegendsNickname, type InquireMobileLegendsNicknameOutput } from '@/ai/flows/inquire-mobile-legends-nickname-flow';
import { inquireGenshinImpactNickname, type InquireGenshinImpactNicknameInput, type InquireGenshinImpactNicknameOutput } from '@/ai/flows/inquire-genshin-impact-nickname-flow';
import { inquireHonkaiStarRailNickname, type InquireHonkaiStarRailNicknameInput, type InquireHonkaiStarRailNicknameOutput, type HonkaiStarRailRegion } from '@/ai/flows/inquire-honkai-star-rail-nickname-flow';
import { useAuth } from '@/contexts/AuthContext';
import { verifyPin } from '@/ai/flows/verify-pin-flow';
import { purchaseDigiflazzProduct } from '@/ai/flows/purchase-digiflazz-product-flow';
import { addTransactionToDB } from '@/lib/transaction-utils';
import { generateRefId } from '@/lib/client-utils';
import { trySendTelegramNotification, type TelegramNotificationDetails } from '@/lib/notification-utils';
import type { TransactionStatus, NewTransactionInput } from '@/components/transactions/TransactionItem';
import { getCustomSellingPrice } from '@/lib/price-settings-utils';

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";


interface PageConfig {
  title: string;
  description: string;
  icon: LucideIcon;
  showCategoryFilter: boolean;
  productCardDescription: (product: DigiflazzProduct) => string;
  customerNoPlaceholder: (productBrand?: string, productDesc?: string) => string;
  zoneIdPlaceholder?: (productBrand?: string) => string;
  zoneIdLabel?: (productBrand?: string) => string;
  zoneIdHint?: (productBrand?: string) => string;
  zoneIdOptions?: (productBrand?: string) => string[];
}

const localCategoryIcons: Record<string, LucideIcon> = {
  "e-money": CreditCard,
  "games": Gamepad2,
  "pln": Zap,
  "paket data": Wifi,
  "voucher": Ticket,
  "tv": ShoppingBag,
  "paket sms telpon": Smartphone,
};

const honkaiStarRailRegions: HonkaiStarRailRegion[] = ["Asia", "America", "Europe", "TW, HK, MO"];
const genshinImpactServers: string[] = ["Asia", "America", "Europe", "TW, HK, MO"];

function normalizeCategorySelection(category?: string): string | undefined {
  if (!category) {
    return undefined;
  }

  const categoryUpper = category.trim().toUpperCase();

  if (categoryUpper.includes("PULSA")) {
    return "Pulsa";
  }

  if (categoryUpper.includes("PLN") || categoryUpper.includes("TOKEN")) {
    return "PLN";
  }

  if (categoryUpper.includes("PAKET DATA") || categoryUpper === "DATA") {
    return "Paket Data";
  }

  if (
    categoryUpper.includes("GAME") ||
    categoryUpper.includes("TOPUP") ||
    categoryUpper.includes("VOUCHER GAME")
  ) {
    return "Games";
  }

  return category.trim();
}

function getProductCategoryFilterValue(product: DigiflazzProduct): string {
  const productCategoryUpper = product.category.trim().toUpperCase();
  const productBrandUpper = product.brand.trim().toUpperCase();

  if (productCategoryUpper.includes("PULSA")) {
    return "Pulsa";
  }

  if (
    productCategoryUpper.includes("PLN") ||
    productCategoryUpper.includes("TOKEN") ||
    productBrandUpper.includes("PLN")
  ) {
    return "PLN";
  }

  if (
    productCategoryUpper.includes("PAKET DATA") ||
    productCategoryUpper === "DATA"
  ) {
    return "Paket Data";
  }

  if (
    productCategoryUpper.includes("GAME") ||
    productCategoryUpper.includes("TOPUP") ||
    productBrandUpper.includes("GAME") ||
    productBrandUpper.includes("VOUCHER GAME")
  ) {
    return "Games";
  }

  return product.category.trim();
}

function matchesSelectedCategoryFilter(
  product: DigiflazzProduct,
  selectedCategory?: string
): boolean {
  if (!selectedCategory) {
    return true;
  }

  return (
    getProductCategoryFilterValue(product).toUpperCase() ===
    normalizeCategorySelection(selectedCategory)?.toUpperCase()
  );
}


const getPageConfig = (category?: string, productBrand?: string): PageConfig => {
  const lowerCategory = category?.toLowerCase() || "";
  const lowerProductBrand = productBrand?.toLowerCase() || "";

  let icon = ShoppingBag;
  const categoryKeys = Object.keys(localCategoryIcons);
  const matchedKey = categoryKeys.find(key => lowerCategory.includes(key));
  if (matchedKey) {
      icon = localCategoryIcons[matchedKey];
  } else if (lowerProductBrand.includes("free fire") || lowerProductBrand.includes("mobile legends") || lowerProductBrand.includes("genshin impact") || lowerProductBrand.includes("honkai star rail")) {
      icon = Gamepad2;
  }

  let titleSuffix = category ? `${category.charAt(0).toUpperCase() + category.slice(1)} Services` : "Digital Services";
  if (productBrand && category) {
    titleSuffix = `${productBrand} (${category})`;
  } else if (productBrand) {
    titleSuffix = `${productBrand} Services`;
  }


  return {
    title: titleSuffix,
    description: `Select brand and product for ${category ? category.toLowerCase() : 'digital services'}, then enter details and confirm with PIN.`,
    icon: icon,
    showCategoryFilter: !category,
    productCardDescription: (p) => `Brand: ${p.brand} | Seller: ${p.seller_name}`,
    customerNoPlaceholder: (currentProductBrand, desc) => {
        const lowerDesc = desc?.toLowerCase() || "";
        const brandForPlaceholder = currentProductBrand?.toLowerCase() || lowerProductBrand;

        if (brandForPlaceholder.includes("free fire")) return "Enter Free Fire User ID";
        if (brandForPlaceholder.includes("mobile legends")) return "Enter User ID (Mobile Legends)";
        if (brandForPlaceholder.includes("genshin impact")) return "Enter User ID (Genshin Impact)";
        if (brandForPlaceholder.includes("honkai star rail")) return "Enter User ID (Honkai Star Rail)";
        if (lowerDesc.includes("no tujuan") || lowerDesc.includes("phone number") || lowerCategory.includes("e-money") || lowerCategory.includes("paket data") || lowerCategory.includes("paket sms telpon")) return "Enter destination / phone number";
        if (lowerDesc.includes("user id") || lowerDesc.includes("id game") || lowerCategory.includes("game")) return "Enter User ID / Game ID";
        if (lowerCategory.includes("pln") || brandForPlaceholder.includes("pln")) return "Enter PLN Customer ID / Meter No.";
        return desc || "e.g., Account ID, Customer No";
    },
    zoneIdPlaceholder: (currentProductBrand) => {
        const brand = currentProductBrand?.toLowerCase();
        if (brand?.includes("mobile legends")) return "Enter Zone ID";
        if (brand?.includes("genshin impact")) return "Select Server / Zone ID";
        if (brand?.includes("honkai star rail")) return "Select Server Region";
        return "Enter Server/Zone ID (Optional)";
    },
    zoneIdLabel: (currentProductBrand) => {
        const brand = currentProductBrand?.toLowerCase();
        if (brand?.includes("mobile legends")) return "Zone ID (Mobile Legends)";
        if (brand?.includes("genshin impact")) return "Server / Zone ID (Genshin Impact)";
        if (brand?.includes("honkai star rail")) return "Server Region (Honkai Star Rail)";
        return "Server/Zone ID";
    },
    zoneIdHint: (currentProductBrand) => {
        const brand = currentProductBrand?.toLowerCase();
        if (brand?.includes("honkai star rail")) return "Select your HSR game server region. Cek Nickname (opsional).";
        if (brand?.includes("genshin impact")) return "Select your Genshin Impact game server. Cek Nickname (opsional).";
        if (brand?.includes("mobile legends")) return "Masukkan User ID & Zone ID Mobile Legends Anda. Klik \"Cek Nickname ML\" untuk verifikasi (opsional).";
        return "";
    },
    zoneIdOptions: (currentProductBrand) => {
        const brand = currentProductBrand?.toLowerCase();
        if (brand?.includes("genshin impact")) return genshinImpactServers;
        if (brand?.includes("honkai star rail")) return honkaiStarRailRegions;
        return [];
    }
  };
};

interface OrderDetailsToConfirm {
  product: DigiflazzProduct;
  customerNo: string;
  zoneId?: string;
  plnCustomerName?: string;
  freeFireNickname?: string;
  mobileLegendsNickname?: string;
  genshinImpactNickname?: string;
  honkaiStarRailNickname?: string;
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
}

export default function DigitalServicesPage() {
  const { toast } = useToast();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { user: authUser, logout } = useAuth();
  const initialCategoryFromQuery = searchParams.get('category');

  const [products, setProducts] = useState<DigiflazzProduct[]>([]);
  const [isLoadingProducts, setIsLoadingProducts] = useState(true);
  const [productError, setProductError] = useState<string | null>(null);

  const [selectedCategory, setSelectedCategory] = useState<string | undefined>(
    initialCategoryFromQuery
      ? normalizeCategorySelection(decodeURIComponent(initialCategoryFromQuery))
      : undefined
  );
  const [selectedBrand, setSelectedBrand] = useState<string | undefined>(undefined);
  const [customerNo, setCustomerNo] = useState('');
  const [zoneId, setZoneId] = useState('');
  const [selectedProduct, setSelectedProduct] = useState<DigiflazzProduct | null>(null);
  const [isManuallyRefreshing, setIsManuallyRefreshing] = useState(false);

  const [isCheckingPlnId, setIsCheckingPlnId] = useState(false);
  const [plnInquiryResult, setPlnInquiryResult] = useState<InquirePlnCustomerOutput | null>(null);

  const [isCheckingFfNickname, setIsCheckingFfNickname] = useState(false);
  const [ffInquiryResult, setFfInquiryResult] = useState<InquireFreeFireNicknameOutput | null>(null);

  const [isCheckingMlNickname, setIsCheckingMlNickname] = useState(false);
  const [mlInquiryResult, setMlInquiryResult] = useState<InquireMobileLegendsNicknameOutput | null>(null);

  const [isCheckingGiNickname, setIsCheckingGiNickname] = useState(false);
  const [giInquiryResult, setGiInquiryResult] = useState<InquireGenshinImpactNicknameOutput | null>(null);

  const [isCheckingHsrNickname, setIsCheckingHsrNickname] = useState(false);
  const [hsrInquiryResult, setHsrInquiryResult] = useState<InquireHonkaiStarRailNicknameOutput | null>(null);


  const [isConfirmingOrder, setIsConfirmingOrder] = useState(false);
  const [orderDetailsToConfirmForPin, setOrderDetailsToConfirmForPin] = useState<OrderDetailsToConfirm | null>(null);
  const [pinInput, setPinInput] = useState("");
  const [pinError, setPinError] = useState("");
  const [isSubmittingWithPin, setIsSubmittingWithPin] = useState(false);
  const [lastSubmittedOrder, setLastSubmittedOrder] = useState<SubmittedOrderInfo | null>(null);


  const pageConfig = useMemo(() => getPageConfig(selectedCategory, selectedProduct?.brand || selectedBrand), [selectedCategory, selectedProduct, selectedBrand]);


  useEffect(() => {
    const categoryFromQuery = searchParams.get('category');
    const currentCategoryInState = categoryFromQuery
      ? normalizeCategorySelection(decodeURIComponent(categoryFromQuery))
      : undefined;
    if (currentCategoryInState !== selectedCategory) {
      setSelectedCategory(currentCategoryInState);
      setSelectedBrand(undefined);
      setSelectedProduct(null);
      setCustomerNo('');
      setZoneId('');
      setPlnInquiryResult(null);
      setFfInquiryResult(null);
      setMlInquiryResult(null);
      setGiInquiryResult(null);
      setHsrInquiryResult(null);
      setLastSubmittedOrder(null);
    }
  }, [searchParams, selectedCategory]);


  useEffect(() => {
    const initialLoadProducts = async () => {
      setIsLoadingProducts(true);
      setProductError(null);
      try {
        const fetchedProducts = await fetchDigiflazzProducts({ forceRefresh: false });
        setProducts(fetchedProducts);
      } catch (error) {
        console.error("Failed to load Digiflazz products:", error);
        let errorMessage = "Failed to load products.";
        if (error instanceof Error) {
            errorMessage = error.message;
        }
        setProductError(errorMessage);
        toast({
          title: "Error Loading Products",
          description: errorMessage,
          variant: "destructive",
        });
      } finally {
        setIsLoadingProducts(false);
      }
    };
    initialLoadProducts();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleManualRefresh = async () => {
    setIsManuallyRefreshing(true);
    setProductError(null);
    try {
      const fetchedProducts = await fetchDigiflazzProducts({ forceRefresh: true });
      setProducts(fetchedProducts);
      setSelectedProduct(null);
      setCustomerNo('');
      setZoneId('');
      setPlnInquiryResult(null);
      setFfInquiryResult(null);
      setMlInquiryResult(null);
      setGiInquiryResult(null);
      setHsrInquiryResult(null);
      setLastSubmittedOrder(null);
      toast({
        title: "Pricelist Refreshed",
        description: "Successfully updated products from Digiflazz.",
      });
    } catch (error) {
      console.error("Failed to manually refresh Digiflazz products:", error);
      let errorMessage = "Failed to refresh products.";
      if (error instanceof Error) {
          errorMessage = error.message;
      }
      setProductError(errorMessage);
      toast({
        title: "Error Refreshing Products",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsManuallyRefreshing(false);
    }
  };

  const categories = useMemo(() => {
    if (isLoadingProducts || productError) return [];
    return [
      ...new Set(
        products.map((product) => getProductCategoryFilterValue(product))
      ),
    ].sort();
  }, [products, isLoadingProducts, productError]);

  const brands = useMemo(() => {
    if (isLoadingProducts || productError || !selectedCategory) return [];
    return [
      ...new Set(
        products
          .filter((product) =>
            matchesSelectedCategoryFilter(product, selectedCategory)
          )
          .map((product) => product.brand)
      ),
    ].sort();
  }, [products, selectedCategory, isLoadingProducts, productError]);

  const productsToList = useMemo(() => {
    if (isLoadingProducts || productError) return [];
    let displayableProducts = products;

    if (selectedCategory) {
      displayableProducts = displayableProducts.filter((product) =>
        matchesSelectedCategoryFilter(product, selectedCategory)
      );
    }
    if (selectedBrand) {
      displayableProducts = displayableProducts.filter(p => p.brand === selectedBrand);
    }
    return displayableProducts.sort((a, b) => a.price - b.price);
  }, [products, selectedCategory, selectedBrand, isLoadingProducts, productError]);

  useEffect(() => {
    setSelectedBrand(undefined);
    setSelectedProduct(null);
    setCustomerNo('');
    setZoneId('');
    setPlnInquiryResult(null);
    setFfInquiryResult(null);
    setMlInquiryResult(null);
    setGiInquiryResult(null);
    setHsrInquiryResult(null);
    setLastSubmittedOrder(null);
  }, [selectedCategory]);

  useEffect(() => {
    setSelectedProduct(null);
    setCustomerNo('');
    setZoneId('');
    setPlnInquiryResult(null);
    setFfInquiryResult(null);
    setMlInquiryResult(null);
    setGiInquiryResult(null);
    setHsrInquiryResult(null);
    setLastSubmittedOrder(null);
  }, [selectedBrand]);

  const handleProductSelect = (product: DigiflazzProduct) => {
    const isActive = product.buyer_product_status && product.seller_product_status;
    if (!isActive) {
      toast({
        title: "Product Not Available",
        description: `${product.product_name} is currently not available for purchase.`,
        variant: "default"
      });
      return;
    }
    setSelectedProduct(product);
    setCustomerNo('');
    setZoneId('');
    setPlnInquiryResult(null);
    setFfInquiryResult(null);
    setMlInquiryResult(null);
    setGiInquiryResult(null);
    setHsrInquiryResult(null);
    setLastSubmittedOrder(null);

    setTimeout(() => {
        const orderFormElement = document.getElementById('order-confirmation-section');
        orderFormElement?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 100);
  };

  const handleInitiateOrder = () => {
    if (!selectedProduct) return;

    const isActive = selectedProduct.buyer_product_status && selectedProduct.seller_product_status;
    if (!isActive) {
        toast({ title: "Cannot Order", description: "This product is currently not available.", variant: "destructive" });
        return;
    }

    if (!customerNo.trim()) {
      toast({ title: "Validation Error", description: "Please enter the customer number/ID.", variant: "destructive" });
      return;
    }

    const isPlnProduct = selectedProduct.brand?.toUpperCase().includes("PLN") || selectedProduct.category?.toUpperCase() === "PLN";
    if (isPlnProduct && !plnInquiryResult?.isSuccess) {
        toast({ title: "Customer ID Not Verified", description: "Please check the PLN Customer ID successfully.", variant: "destructive" });
        return;
    }

    const brandUpper = selectedProduct.brand?.toUpperCase();
    const isMlProduct = brandUpper?.includes("MOBILE LEGENDS");
    const isGiProduct = brandUpper?.includes("GENSHIN IMPACT");
    const isHsrProduct = brandUpper?.includes("HONKAI STAR RAIL");

    if ((isMlProduct || isGiProduct || isHsrProduct) && !zoneId.trim()) {
        toast({ title: "Validation Error", description: `Please enter the ${pageConfig.zoneIdLabel?.(selectedProduct.brand)} for ${selectedProduct.brand}.`, variant: "destructive" });
        return;
    }

    setOrderDetailsToConfirmForPin({
      product: selectedProduct,
      customerNo,
      zoneId: (isMlProduct || isGiProduct || isHsrProduct) ? zoneId : undefined,
      plnCustomerName: plnInquiryResult?.isSuccess ? plnInquiryResult.customerName : undefined,
      freeFireNickname: ffInquiryResult?.isSuccess ? ffInquiryResult.nickname : undefined,
      mobileLegendsNickname: mlInquiryResult?.isSuccess ? mlInquiryResult.nickname : undefined,
      genshinImpactNickname: giInquiryResult?.isSuccess ? giInquiryResult.nickname : undefined,
      honkaiStarRailNickname: hsrInquiryResult?.isSuccess ? hsrInquiryResult.nickname : undefined,
    });
    setIsConfirmingOrder(true);
    setPinInput("");
    setPinError("");
  };


  const handlePinConfirmDigitalService = async () => {
    if (!orderDetailsToConfirmForPin || !authUser) {
      setPinError("Order details or user session is missing. Please try again.");
      setIsSubmittingWithPin(false);
      return;
    }
    const { product, customerNo: custNoToDigiflazz, zoneId: confirmedZoneId } = orderDetailsToConfirmForPin;

    const isActive = product.buyer_product_status && product.seller_product_status;
    if (!isActive) {
      setPinError("This product is currently not available for purchase.");
      toast({ title: "Order Failed", description: "The selected product has become unavailable.", variant: "destructive" });
      setIsSubmittingWithPin(false);
      return;
    }

    setIsSubmittingWithPin(true);
    setPinError("");

    const refId = `DF-${generateRefId()}`;
    let transactionDetailsForDisplay = custNoToDigiflazz;
    let finalCustomerNoForApi = custNoToDigiflazz;

    if (product.brand?.toUpperCase().includes("MOBILE LEGENDS") && confirmedZoneId) {
        finalCustomerNoForApi = custNoToDigiflazz + confirmedZoneId;
        transactionDetailsForDisplay = `${custNoToDigiflazz} (ML: ${orderDetailsToConfirmForPin.mobileLegendsNickname || 'N/A'}, Zone: ${confirmedZoneId})`;
    } else if (orderDetailsToConfirmForPin.plnCustomerName) {
        transactionDetailsForDisplay = `${custNoToDigiflazz} (${orderDetailsToConfirmForPin.plnCustomerName})`;
    } else if (orderDetailsToConfirmForPin.freeFireNickname) {
        transactionDetailsForDisplay = `${custNoToDigiflazz} (FF: ${orderDetailsToConfirmForPin.freeFireNickname})`;
    } else if (orderDetailsToConfirmForPin.genshinImpactNickname) {
        transactionDetailsForDisplay = `${custNoToDigiflazz} (GI: ${orderDetailsToConfirmForPin.genshinImpactNickname}, Server: ${confirmedZoneId})`;
    } else if (orderDetailsToConfirmForPin.honkaiStarRailNickname) {
        transactionDetailsForDisplay = `${custNoToDigiflazz} (HSR: ${orderDetailsToConfirmForPin.honkaiStarRailNickname}, Region: ${confirmedZoneId})`;
    } else if (confirmedZoneId) {
         transactionDetailsForDisplay += ` (Zone/Server: ${confirmedZoneId})`;
    }


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

      const purchaseResponse = await purchaseDigiflazzProduct({
        buyerSkuCode: product.buyer_sku_code,
        customerNo: finalCustomerNoForApi,
        refId: refId,
      });

      const clientSideSellingPriceEstimate = getCustomSellingPrice(product.buyer_sku_code, 'digiflazz') || 
                                          (product.price < 20000 ? product.price + 1000 : 
                                          product.price <= 50000 ? product.price + 1500 : 
                                          product.price + 2000);

      const newTxInput: NewTransactionInput = {
        id: refId,
        productName: product.product_name,
        details: transactionDetailsForDisplay,
        costPrice: product.price,
        sellingPrice: clientSideSellingPriceEstimate,
        status: purchaseResponse.status as TransactionStatus || "Gagal",
        timestamp: new Date().toISOString(),
        serialNumber: purchaseResponse.sn || undefined,
        failureReason: purchaseResponse.status === "Gagal" ? purchaseResponse.message : undefined,
        buyerSkuCode: product.buyer_sku_code,
        originalCustomerNo: finalCustomerNoForApi,
        productCategoryFromProvider: product.category,
        productBrandFromProvider: product.brand,
        provider: 'digiflazz',
        transactedBy: authUser.username,
      };
      
      await addTransactionToDB(newTxInput, authUser.username); 

      let profitForSummary: number | undefined = undefined;
      if (purchaseResponse.status === "Sukses") {
          profitForSummary = clientSideSellingPriceEstimate - product.price;
      }

      const notificationDetails: TelegramNotificationDetails = {
        refId: refId,
        productName: product.product_name,
        customerNoDisplay: transactionDetailsForDisplay,
        status: purchaseResponse.status as TransactionStatus || "Gagal",
        provider: 'Digiflazz',
        costPrice: product.price,
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
          description: purchaseResponse.message || `Order for ${product.product_name} is ${purchaseResponse.status.toLowerCase()}. SN: ${purchaseResponse.sn || 'N/A'}`,
          duration: 7000,
        });
      } else { 
         toast({
          title: "Order Failed",
          description: purchaseResponse.message || "Failed to process your order with Digiflazz.",
          variant: "destructive",
        });
      }

      setLastSubmittedOrder({
        refId: refId,
        productName: product.product_name,
        customerNoDisplay: transactionDetailsForDisplay,
        costPrice: product.price,
        sellingPrice: clientSideSellingPriceEstimate, 
        profit: profitForSummary,
        status: purchaseResponse.status as TransactionStatus || "Gagal",
        message: purchaseResponse.message,
        sn: purchaseResponse.sn,
      });

      setSelectedProduct(null);
      setCustomerNo('');
      setZoneId('');
      setPlnInquiryResult(null);
      setFfInquiryResult(null);
      setMlInquiryResult(null);
      setGiInquiryResult(null);
      setHsrInquiryResult(null);
      setIsConfirmingOrder(false);
      setOrderDetailsToConfirmForPin(null);
      setPinInput("");
      setPinError("");

    } catch (error) {
      console.error("PIN verification or order submission error:", error);
      const message = error instanceof Error ? error.message : "An error occurred.";
      setPinError(`Order error: ${message}`);
      toast({ title: "Order Failed", description: message, variant: "destructive" });

      const failedTxInput: NewTransactionInput = {
        id: refId,
        productName: product.product_name,
        details: transactionDetailsForDisplay,
        costPrice: product.price,
        sellingPrice: 0,
        status: "Gagal",
        timestamp: new Date().toISOString(),
        failureReason: message,
        buyerSkuCode: product.buyer_sku_code,
        originalCustomerNo: finalCustomerNoForApi,
        productCategoryFromProvider: product.category,
        productBrandFromProvider: product.brand,
        provider: 'digiflazz',
        transactedBy: authUser.username,
      };
      await addTransactionToDB(failedTxInput, authUser.username);
      const notificationDetails: TelegramNotificationDetails = {
        refId: refId,
        productName: product.product_name,
        customerNoDisplay: transactionDetailsForDisplay,
        status: "Gagal",
        provider: 'Digiflazz',
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

  const handlePlnInquiry = async () => {
    if (!customerNo.trim()) {
      toast({ title: "PLN Inquiry", description: "Please enter Customer Number first.", variant: "default" });
      return;
    }
    setIsCheckingPlnId(true);
    setPlnInquiryResult(null);
    try {
      const result = await inquirePlnCustomer({ customerNo });
      setPlnInquiryResult(result);
      if (result.isSuccess) {
        toast({ title: "PLN Inquiry Successful", description: `Customer Name: ${result.customerName || 'N/A'}` });
      } else {
        toast({ title: "PLN Inquiry Failed", description: result.message || "Could not verify customer ID.", variant: "destructive" });
      }
    } catch (error) {
      console.error("PLN Inquiry system error:", error);
      const errorMessage = error instanceof Error ? error.message : "An unexpected error occurred.";
      setPlnInquiryResult({ isSuccess: false, message: `Error: ${errorMessage}` });
      toast({ title: "PLN Inquiry Error", description: errorMessage, variant: "destructive" });
    } finally {
      setIsCheckingPlnId(false);
    }
  };

  const handleFreeFireNicknameInquiry = async () => {
    if (!customerNo.trim()) {
      toast({ title: "Free Fire Inquiry", description: "Please enter User ID first.", variant: "default" });
      return;
    }
    setIsCheckingFfNickname(true);
    setFfInquiryResult(null);
    try {
      const result = await inquireFreeFireNickname({ userId: customerNo });
      console.log('Free Fire Nickname Inquiry Result:', result);
      setFfInquiryResult(result);
      if (result.isSuccess && result.nickname) {
        toast({ title: "Free Fire Inquiry Successful", description: `Nickname: ${result.nickname}` });
      } else if (result.isSuccess && !result.nickname) {
        toast({ title: "Free Fire Inquiry Note", description: result.message || "User ID found, but nickname could not be determined from response." });
      }
      else {
        toast({ title: "Free Fire Inquiry Failed", description: result.message || "Could not verify User ID.", variant: "destructive" });
      }
    } catch (error) {
      console.error("Free Fire Inquiry system error:", error);
      const errorMessage = error instanceof Error ? error.message : "An unexpected error occurred.";
      setFfInquiryResult({ isSuccess: false, message: `Error: ${errorMessage}` });
      toast({ title: "Free Fire Inquiry Error", description: errorMessage, variant: "destructive" });
    } finally {
      setIsCheckingFfNickname(false);
    }
  };

  const handleMobileLegendsNicknameInquiry = async () => {
    if (!customerNo.trim()) {
      toast({ title: "Mobile Legends Inquiry", description: "Please enter User ID first.", variant: "default" });
      return;
    }
    if (!zoneId.trim()) {
      toast({ title: "Mobile Legends Inquiry", description: "Please enter Zone ID.", variant: "default" });
      return;
    }
    setIsCheckingMlNickname(true);
    setMlInquiryResult(null);
    try {
      const result = await inquireMobileLegendsNickname({ userId: customerNo, zoneId: zoneId });
      console.log('Mobile Legends Nickname Inquiry Result:', result);
      setMlInquiryResult(result);
      if (result.isSuccess && result.nickname) {
        toast({ title: "ML Nickname Inquiry Successful", description: `Nickname: ${result.nickname}` });
      } else if (result.isSuccess && !result.nickname) {
        toast({ title: "ML Nickname Inquiry Note", description: result.message || "User ID/Zone ID found, but nickname could not be determined." });
      } else {
        toast({ title: "ML Nickname Inquiry Failed", description: result.message || "Could not verify User ID/Zone ID.", variant: "destructive" });
      }
    } catch (error) {
      console.error("Mobile Legends Inquiry system error:", error);
      const errorMessage = error instanceof Error ? error.message : "An unexpected error occurred.";
      setMlInquiryResult({ isSuccess: false, message: `Error: ${errorMessage}` });
      toast({ title: "Mobile Legends Inquiry Error", description: errorMessage, variant: "destructive" });
    } finally {
      setIsCheckingMlNickname(false);
    }
  };

  const handleGenshinImpactNicknameInquiry = async () => {
    if (!customerNo.trim() || !zoneId.trim()) {
      toast({ title: "Genshin Impact Inquiry", description: "Please enter User ID and select Server/Zone ID.", variant: "default" });
      return;
    }
    setIsCheckingGiNickname(true);
    setGiInquiryResult(null);
    try {
      const result = await inquireGenshinImpactNickname({ userId: customerNo, zoneId: zoneId as any });
      console.log('Genshin Impact Nickname Inquiry Result:', result);
      setGiInquiryResult(result);
      if (result.isSuccess && result.nickname) {
        toast({ title: "Genshin Impact Inquiry Successful", description: `Nickname: ${result.nickname}` });
      } else if (result.isSuccess && !result.nickname) {
        toast({ title: "Genshin Impact Inquiry Note", description: result.message || "User ID/Server found, but nickname could not be determined." });
      } else {
        toast({ title: "Genshin Impact Inquiry Failed", description: result.message || "Could not verify User ID/Server.", variant: "destructive" });
      }
    } catch (error) {
      console.error("Genshin Impact Inquiry system error:", error);
      const errorMessage = error instanceof Error ? error.message : "An unexpected error occurred.";
      setGiInquiryResult({ isSuccess: false, message: `Error: ${errorMessage}` });
      toast({ title: "Genshin Impact Inquiry Error", description: errorMessage, variant: "destructive" });
    } finally {
      setIsCheckingGiNickname(false);
    }
  };

  const handleHonkaiStarRailNicknameInquiry = async () => {
    if (!customerNo.trim() || !zoneId.trim()) {
      toast({ title: "Honkai Star Rail Inquiry", description: "Please enter User ID and select Server Region.", variant: "default" });
      return;
    }
    setIsCheckingHsrNickname(true);
    setHsrInquiryResult(null);
    try {
      const result = await inquireHonkaiStarRailNickname({ userId: customerNo, region: zoneId as any });
      console.log('Honkai Star Rail Nickname Inquiry Result:', result);
      setHsrInquiryResult(result);
      if (result.isSuccess && result.nickname) {
        toast({ title: "Honkai Star Rail Inquiry Successful", description: `Nickname: ${result.nickname}` });
      } else if (result.isSuccess && !result.nickname) {
        toast({ title: "Honkai Star Rail Inquiry Note", description: result.message || "User ID/Region found, but nickname could not be determined." });
      } else {
        toast({ title: "Honkai Star Rail Inquiry Failed", description: result.message || "Could not verify User ID/Region.", variant: "destructive" });
      }
    } catch (error) {
      console.error("Honkai Star Rail Inquiry system error:", error);
      const errorMessage = error instanceof Error ? error.message : "An unexpected error occurred.";
      setHsrInquiryResult({ isSuccess: false, message: `Error: ${errorMessage}` });
      toast({ title: "Honkai Star Rail Inquiry Error", description: errorMessage, variant: "destructive" });
    } finally {
      setIsCheckingHsrNickname(false);
    }
  };


  const getProductListTitle = () => {
    if (selectedProduct && selectedCategory) {
        return `Products for ${selectedProduct.brand} (${selectedProduct.category})`;
    }
    if (selectedBrand && selectedCategory) {
      return `Products for ${selectedBrand} (${selectedCategory})`;
    }
    if (selectedCategory) {
      return `Products in ${selectedCategory}`;
    }
    return 'All Digital Products from Digiflazz';
  };

  const showPlnInquiryButton = selectedProduct && (selectedProduct.category?.toUpperCase() === "PLN" || selectedProduct.brand?.toUpperCase().includes("PLN"));
  const showFreeFireInquiryButton = selectedProduct && selectedProduct.brand?.toUpperCase().includes("FREE FIRE");
  const showMobileLegendsInquiryButton = selectedProduct && selectedProduct.brand?.toUpperCase().includes("MOBILE LEGENDS");
  const showGenshinImpactInquiryButton = selectedProduct && selectedProduct.brand?.toUpperCase().includes("GENSHIN IMPACT");
  const showHonkaiStarRailInquiryButton = selectedProduct && selectedProduct.brand?.toUpperCase().includes("HONKAI STAR RAIL");

  const needsZoneId = showMobileLegendsInquiryButton || showGenshinImpactInquiryButton || showHonkaiStarRailInquiryButton;

  const themedLabelClass =
    "font-semibold text-[var(--ui-text)] dark:text-zinc-100";
  const themedInputClass =
    "mt-1 flex-grow rounded-xl border-[var(--ui-input-border)] bg-[var(--ui-input-bg)] text-[var(--ui-text)] placeholder:text-[var(--ui-text-secondary)] focus-visible:ring-[var(--ui-accent)] dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100";
  const themedSelectTriggerClass =
    "w-full rounded-xl border-[var(--ui-input-border)] bg-[var(--ui-input-bg)] text-[var(--ui-text)] focus:ring-[var(--ui-accent)] dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100";
  const themedSelectContentClass =
    "border-[var(--ui-border)] bg-[var(--ui-card)] text-[var(--ui-text)] dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100";
  const themedOutlineButtonClass =
    "rounded-xl border-[var(--ui-border)] bg-[var(--ui-card-alt)] text-[var(--ui-text)] hover:bg-[var(--ui-accent-bg)] hover:text-[var(--ui-accent)] dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100";
  const themedPrimaryButtonClass =
    "w-full rounded-xl bg-[var(--ui-accent)] text-white hover:bg-[var(--ui-accent-hover)]";
  const themedInfoCardClass =
    "rounded-3xl border-[var(--ui-border)] bg-[var(--ui-card)] text-[var(--ui-text)] shadow-sm dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100";


  const proceedButtonDisabled = !selectedProduct ||
                                isSubmittingWithPin ||
                                !customerNo.trim() ||
                                (showPlnInquiryButton && !plnInquiryResult?.isSuccess) ||
                                (needsZoneId && !zoneId.trim()) ||
                                (selectedProduct && !(selectedProduct.buyer_product_status && selectedProduct.seller_product_status));


  return (
    <>
    {!lastSubmittedOrder ? (
      <OrderFormShell title={pageConfig.title} description={pageConfig.description} icon={pageConfig.icon}>
        <div className="space-y-6">
          {isLoadingProducts && (
            <div className="flex flex-col items-center justify-center py-10 text-[var(--ui-text-muted)] dark:text-zinc-400">
              <Loader2 className="mb-4 h-12 w-12 animate-spin text-[var(--ui-accent)]" />
              <p className="text-lg">Loading products from Digiflazz...</p>
            </div>
          )}

          {productError && !isLoadingProducts && (
            <Card className="border-destructive bg-destructive/10 py-10 text-center shadow">
              <CardHeader>
                  <CardTitle className="text-destructive flex items-center justify-center gap-2">
                      <AlertTriangle className="h-6 w-6" /> Error Loading Products
                  </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-destructive/90">{productError}</p>
                <p className="mt-2 text-sm text-[var(--ui-text-muted)] dark:text-zinc-400">Please try again later or contact support if the issue persists.</p>
              </CardContent>
            </Card>
          )}

          {!isLoadingProducts && !productError && products.length === 0 && (
            <Card className={`${themedInfoCardClass} py-10 text-center`}>
              <CardHeader>
                <CardTitle className="flex items-center justify-center gap-2 text-[var(--ui-text-muted)] dark:text-zinc-400">
                  <ShoppingBag className="h-6 w-6" /> No Products Available
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-[var(--ui-text)] dark:text-zinc-100">No digital products could be loaded from Digiflazz at this time.</p>
                <p className="mt-2 text-sm text-[var(--ui-text-muted)] dark:text-zinc-400">Please check back later or contact support.</p>
              </CardContent>
            </Card>
          )}

          {!isLoadingProducts && !productError && products.length > 0 && (
            <>
              <div className="space-y-4">
                <div className="flex justify-end">
                  <Button
                    onClick={handleManualRefresh}
                    disabled={isManuallyRefreshing || isLoadingProducts || isSubmittingWithPin}
                    variant="outline"
                    className={themedOutlineButtonClass}
                  >
                    {isManuallyRefreshing ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <RefreshCw className="mr-2 h-4 w-4" />
                    )}
                    {isManuallyRefreshing ? 'Refreshing...' : 'Refresh Pricelist'}
                  </Button>
                </div>
                <div className={`grid grid-cols-1 ${pageConfig.showCategoryFilter ? 'md:grid-cols-2' : 'md:grid-cols-1'} gap-4`}>
                  {pageConfig.showCategoryFilter && (
                    <div>
                      <Label htmlFor="category-select" className={themedLabelClass}>Filter by Category</Label>
                      <Select
                        value={selectedCategory || "all"}
                        onValueChange={(value) => {
                          setSelectedCategory(
                            value === 'all'
                              ? undefined
                              : normalizeCategorySelection(value)
                          );
                        }}
                        disabled={categories.length === 0 || isSubmittingWithPin}
                      >
                        <SelectTrigger id="category-select" className={themedSelectTriggerClass}>
                          <SelectValue placeholder={categories.length > 0 ? "All Categories" : "No categories available"} />
                        </SelectTrigger>
                        <SelectContent className={themedSelectContentClass}>
                          <SelectItem value="all">All Categories</SelectItem>
                          {categories.map(cat => (
                            <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  <div className={`${!pageConfig.showCategoryFilter ? 'md:col-span-1' : ''}`}>
                    <Label htmlFor="brand-select" className={themedLabelClass}>Filter by Brand {selectedCategory ? `(in ${selectedCategory})` : ''}</Label>
                    <Select
                      value={selectedBrand || "all"}
                      onValueChange={(value) => {
                          setSelectedBrand(value === 'all' ? undefined : value);
                      }}
                      disabled={(!selectedCategory && !initialCategoryFromQuery) || brands.length === 0 || isSubmittingWithPin}
                    >
                      <SelectTrigger id="brand-select" className={themedSelectTriggerClass}>
                        <SelectValue placeholder={brands.length > 0 ? "All Brands" : (!selectedCategory && !initialCategoryFromQuery ? "Select category first" : "No brands available")} />
                      </SelectTrigger>
                      <SelectContent className={themedSelectContentClass}>
                        <SelectItem value="all">All Brands</SelectItem>
                        {brands.map(brand => (
                          <SelectItem key={brand} value={brand}>{brand}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              {productsToList.length > 0 ? (
                <div className="space-y-4 pt-4">
                  <h3 className="flex items-center gap-2 text-xl font-semibold text-[var(--ui-text)] dark:text-zinc-100">
                      {<pageConfig.icon className="h-5 w-5 text-[var(--ui-accent)]" />}
                      {getProductListTitle()} ({productsToList.length})
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {productsToList.map(product => {
                      const isActive = product.buyer_product_status && product.seller_product_status;
                      return (
                          <Card
                              key={product.buyer_sku_code}
                              onClick={() => handleProductSelect(product)}
                              className={`flex flex-col justify-between transition-shadow duration-200
                                          ${isSubmittingWithPin ? 'opacity-60 cursor-not-allowed' : isActive ? 'cursor-pointer hover:shadow-lg' : 'opacity-60 cursor-not-allowed'}
                                          ${selectedProduct?.buyer_sku_code === product.buyer_sku_code && isActive ? 'ring-2 ring-[var(--ui-accent)] border-[var(--ui-accent)] shadow-lg' : 'border-[var(--ui-border)] shadow-md'}
                                          ${themedInfoCardClass}`}
                          >
                            <div>
                              <CardHeader className="pb-2">
                                  <div className="flex justify-between items-start">
                                      <CardTitle className="text-md leading-tight text-[var(--ui-text)] dark:text-zinc-100 font-semibold">{product.product_name}</CardTitle>
                                      {selectedProduct?.buyer_sku_code === product.buyer_sku_code && isActive && <ShieldCheck className="h-5 w-5 text-[var(--ui-accent)] flex-shrink-0" />}
                                  </div>
                                  <CardDescription className="text-xs text-[var(--ui-text-muted)] dark:text-zinc-400">
                                    {pageConfig.productCardDescription(product)}
                                  </CardDescription>
                              </CardHeader>
                              <CardContent className="space-y-1.5 pt-0 pb-3">
                                  <p className={`text-lg font-bold ${isActive ? 'text-[var(--ui-accent)]' : 'text-[var(--ui-text-muted)] dark:text-zinc-400'}`}>Rp {product.price.toLocaleString()}</p>
                                  <div className="flex flex-wrap gap-1.5">
                                  {isActive ? (
                                      <Badge variant="default" className="text-xs bg-green-100 text-green-800 border-green-300">
                                          Available
                                      </Badge>
                                  ) : (
                                      <Badge variant="destructive" className="text-xs">
                                          Not Available
                                      </Badge>
                                  )}
                                  </div>
                                  {product.desc && <p className="pt-1 text-xs italic text-[var(--ui-text-muted)] dark:text-zinc-400 truncate" title={product.desc}>Desc: {product.desc}</p>}
                              </CardContent>
                            </div>
                          </Card>
                      );
                    })}
                  </div>
                  {selectedProduct && (
                      <div className="mt-3 rounded-2xl border border-[var(--ui-accent)]/30 bg-[var(--ui-accent-bg)] p-3 text-center">
                          <p className="font-semibold text-[var(--ui-accent)]">Selected: {selectedProduct.product_name} (Modal: Rp {selectedProduct.price.toLocaleString()})</p>
                          {!(selectedProduct.buyer_product_status && selectedProduct.seller_product_status) && (
                              <p className="text-sm text-destructive">(This product is currently not available for purchase)</p>
                          )}
                      </div>
                  )}
                </div>
              ) : (
                <Card className={`${themedInfoCardClass} mt-4 py-10 text-center`}>
                  <CardContent>
                    <p className="text-[var(--ui-text-muted)] dark:text-zinc-400">
                      {selectedCategory || selectedBrand ? "No products match your current filters." : "No products available at the moment."}
                    </p>
                    <p className="mt-2 text-sm text-[var(--ui-text-muted)] dark:text-zinc-400">
                      {selectedCategory || selectedBrand ? "Try adjusting your selections or reset them." : "Please check back later."}
                    </p>
                  </CardContent>
                </Card>
              )}
            </>
          )}

          {selectedProduct && (
            <Card className="mt-8 border-2 border-[var(--ui-accent)]/25 bg-[var(--ui-card)] shadow-xl dark:border-sky-400/20 dark:bg-zinc-950" id="order-confirmation-section">
              <CardHeader className="bg-[var(--ui-accent-bg)]">
                <CardTitle className="text-xl text-[var(--ui-accent)]">Order Confirmation: {selectedProduct.product_name}</CardTitle>
                <CardDescription className="text-[var(--ui-text-muted)] dark:text-zinc-400">
                  Price (Modal): Rp {selectedProduct.price.toLocaleString()} | SKU: {selectedProduct.buyer_sku_code}
                  {!(selectedProduct.buyer_product_status && selectedProduct.seller_product_status) &&
                      <span className="font-semibold text-destructive block"> (Currently Not Available)</span>
                  }
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 pt-6 text-[var(--ui-text)] dark:text-zinc-100">
                <div>
                  <Label htmlFor="customer-no" className={themedLabelClass}>{pageConfig.customerNoPlaceholder(selectedProduct.brand, selectedProduct.desc ?? undefined)}</Label>
                  <div className={`flex items-start gap-2 ${showPlnInquiryButton || showFreeFireInquiryButton || needsZoneId ? 'flex-col sm:flex-row' : ''}`}>
                      <Input
                      id="customer-no"
                      value={customerNo}
                      onChange={(e) => {
                          setCustomerNo(e.target.value);
                          if (plnInquiryResult) setPlnInquiryResult(null);
                          if (ffInquiryResult) setFfInquiryResult(null);
                          if (mlInquiryResult) setMlInquiryResult(null);
                          if (giInquiryResult) setGiInquiryResult(null);
                          if (hsrInquiryResult) setHsrInquiryResult(null);
                      }}
                      placeholder={pageConfig.customerNoPlaceholder(selectedProduct.brand, selectedProduct.desc ?? undefined)}
                      className={themedInputClass}
                      disabled={!(selectedProduct.buyer_product_status && selectedProduct.seller_product_status) || isSubmittingWithPin}
                      />
                      {showPlnInquiryButton && (
                      <Button
                          onClick={handlePlnInquiry}
                          disabled={isCheckingPlnId || !customerNo.trim() || !(selectedProduct.buyer_product_status && selectedProduct.seller_product_status) || isSubmittingWithPin}
                          variant="outline"
                          className={`mt-1 w-full sm:w-auto ${themedOutlineButtonClass}`}
                      >
                          {isCheckingPlnId ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UserCheck className="mr-2 h-4 w-4" />}
                          Cek ID PLN
                      </Button>
                      )}
                      {showFreeFireInquiryButton && (
                      <Button
                          onClick={handleFreeFireNicknameInquiry}
                          disabled={isCheckingFfNickname || !customerNo.trim() || !(selectedProduct.buyer_product_status && selectedProduct.seller_product_status) || isSubmittingWithPin}
                          variant="outline"
                          className={`mt-1 w-full sm:w-auto ${themedOutlineButtonClass}`}
                      >
                          {isCheckingFfNickname ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UserCircle2 className="mr-2 h-4 w-4" />}
                          Cek Nickname FF
                      </Button>
                      )}
                  </div>
                  {selectedProduct.desc && !showPlnInquiryButton && !showFreeFireInquiryButton && !needsZoneId && <p className="mt-1 text-xs italic text-[var(--ui-text-muted)] dark:text-zinc-400">Hint: {selectedProduct.desc}</p>}
                  {showPlnInquiryButton && (
                      <p className="mt-1 text-xs italic text-[var(--ui-text-muted)] dark:text-zinc-400">
                      Untuk produk PLN, masukkan ID Pelanggan atau Nomor Meter. Klik "Cek ID PLN" untuk verifikasi.
                      </p>
                  )}
                  {showFreeFireInquiryButton && (
                      <p className="mt-1 text-xs italic text-[var(--ui-text-muted)] dark:text-zinc-400">
                      Masukkan User ID Free Fire Anda. Klik "Cek Nickname FF" untuk verifikasi (opsional).
                      </p>
                  )}
                </div>

                {needsZoneId && (
                  <div className="space-y-1">
                      <Label htmlFor="zone-id" className={themedLabelClass}>{pageConfig.zoneIdLabel?.(selectedProduct.brand)}</Label>
                      <div className="flex items-start gap-2 flex-col sm:flex-row">
                          {pageConfig.zoneIdOptions?.(selectedProduct.brand) ? (
                              <Select
                                  value={zoneId}
                                  onValueChange={(value) => {
                                      setZoneId(value);
                                      if (mlInquiryResult) setMlInquiryResult(null);
                                      if (giInquiryResult) setGiInquiryResult(null);
                                      if (hsrInquiryResult) setHsrInquiryResult(null);
                                  }}
                                  disabled={!(selectedProduct.buyer_product_status && selectedProduct.seller_product_status) || isSubmittingWithPin}
                              >
                                  <SelectTrigger id="zone-id-select" className={themedInputClass}>
                                      <SelectValue placeholder={pageConfig.zoneIdPlaceholder?.(selectedProduct.brand) || "Select Zone/Server"} />
                                  </SelectTrigger>
                                  <SelectContent className={themedSelectContentClass}>
                                      {pageConfig.zoneIdOptions(selectedProduct.brand)?.map(opt => (
                                          <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                                      ))}
                                  </SelectContent>
                              </Select>
                          ) : (
                              <Input
                                  id="zone-id"
                                  value={zoneId}
                                  onChange={(e) => {
                                      setZoneId(e.target.value);
                                      if (mlInquiryResult) setMlInquiryResult(null);
                                  }}
                                  placeholder={pageConfig.zoneIdPlaceholder?.(selectedProduct.brand)}
                                  className={themedInputClass}
                                  disabled={!(selectedProduct.buyer_product_status && selectedProduct.seller_product_status) || isSubmittingWithPin}
                              />
                          )}

                          {showMobileLegendsInquiryButton && (
                              <Button
                                  onClick={handleMobileLegendsNicknameInquiry}
                                  disabled={isCheckingMlNickname || !customerNo.trim() || !zoneId.trim() || !(selectedProduct.buyer_product_status && selectedProduct.seller_product_status) || isSubmittingWithPin}
                                  variant="outline"
                                  className={`mt-1 w-full sm:w-auto ${themedOutlineButtonClass}`}
                              >
                                  {isCheckingMlNickname ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Server className="mr-2 h-4 w-4" />}
                                  Cek Nickname ML
                              </Button>
                          )}
                          {showGenshinImpactInquiryButton && (
                              <Button
                                  onClick={handleGenshinImpactNicknameInquiry}
                                  disabled={isCheckingGiNickname || !customerNo.trim() || !zoneId.trim() || !(selectedProduct.buyer_product_status && selectedProduct.seller_product_status) || isSubmittingWithPin}
                                  variant="outline"
                                  className={`mt-1 w-full sm:w-auto ${themedOutlineButtonClass}`}
                              >
                                  {isCheckingGiNickname ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Users className="mr-2 h-4 w-4" />}
                                  Cek Nickname GI
                              </Button>
                          )}
                          {showHonkaiStarRailInquiryButton && (
                              <Button
                                  onClick={handleHonkaiStarRailNicknameInquiry}
                                  disabled={isCheckingHsrNickname || !customerNo.trim() || !zoneId.trim() || !(selectedProduct.buyer_product_status && selectedProduct.seller_product_status) || isSubmittingWithPin}
                                  variant="outline"
                                  className={`mt-1 w-full sm:w-auto ${themedOutlineButtonClass}`}
                              >
                                  {isCheckingHsrNickname ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <MapPin className="mr-2 h-4 w-4" />}
                                  Cek Nickname HSR
                              </Button>
                          )}
                      </div>
                      {pageConfig.zoneIdHint?.(selectedProduct.brand) && (
                          <p className="mt-1 text-xs italic text-[var(--ui-text-muted)] dark:text-zinc-400">
                              {pageConfig.zoneIdHint(selectedProduct.brand)}
                          </p>
                      )}
                  </div>
                )}

                {plnInquiryResult && (
                  <div className={`mt-2 p-3 rounded-md text-sm ${plnInquiryResult.isSuccess ? 'bg-green-50 border border-green-200 text-green-700' : 'bg-red-50 border border-red-200 text-red-700'}`}>
                    {plnInquiryResult.isSuccess ? (
                      <>
                        <p className="font-semibold flex items-center"><UserCheck className="h-4 w-4 mr-2" />Data Pelanggan Ditemukan:</p>
                        <p><strong>Nama:</strong> {plnInquiryResult.customerName}</p>
                        {plnInquiryResult.meterNo && <p><strong>No. Meter:</strong> {plnInquiryResult.meterNo}</p>}
                        {plnInquiryResult.subscriberId && <p><strong>ID Pel:</strong> {plnInquiryResult.subscriberId}</p>}
                        {plnInquiryResult.segmentPower && <p><strong>Daya:</strong> {plnInquiryResult.segmentPower}</p>}
                      </>
                    ) : (
                      <p className="font-semibold flex items-center"><AlertTriangle className="h-4 w-4 mr-2" />Gagal Cek ID PLN: <span className="font-normal ml-1">{plnInquiryResult.message}</span></p>
                    )}
                  </div>
                )}

                {ffInquiryResult && (
                  <div className={`mt-2 p-3 rounded-md text-sm ${ffInquiryResult.isSuccess && ffInquiryResult.nickname ? 'bg-green-50 border border-green-200 text-green-700' : ffInquiryResult.isSuccess && !ffInquiryResult.nickname ? 'bg-blue-50 border border-blue-200 text-blue-700' : 'bg-red-50 border border-red-200 text-red-700'}`}>
                    {ffInquiryResult.isSuccess && ffInquiryResult.nickname ? (
                      <>
                        <p className="font-semibold flex items-center"><UserCircle2 className="h-4 w-4 mr-2" />Nickname Ditemukan:</p>
                        <p><strong>Nickname:</strong> {ffInquiryResult.nickname}</p>
                      </>
                    ) : ffInquiryResult.isSuccess && !ffInquiryResult.nickname ? (
                      <>
                        <p className="font-semibold flex items-center"><Info className="h-4 w-4 mr-2" />Catatan Nickname:</p>
                        <p>{ffInquiryResult.message || "User ID ditemukan, tetapi nickname tidak dapat diekstrak dari respons."}</p>
                      </>
                    ) : (
                      <p className="font-semibold flex items-center"><AlertTriangle className="h-4 w-4 mr-2" />Gagal Cek Nickname FF: <span className="font-normal ml-1">{ffInquiryResult.message}</span></p>
                    )}
                  </div>
                )}

                {mlInquiryResult && (
                  <div className={`mt-2 p-3 rounded-md text-sm ${mlInquiryResult.isSuccess && mlInquiryResult.nickname ? 'bg-green-50 border border-green-200 text-green-700' : mlInquiryResult.isSuccess && !mlInquiryResult.nickname ? 'bg-blue-50 border border-blue-200 text-blue-700' : 'bg-red-50 border border-red-200 text-red-700'}`}>
                    {mlInquiryResult.isSuccess && mlInquiryResult.nickname ? (
                      <>
                        <p className="font-semibold flex items-center"><UserCircle2 className="h-4 w-4 mr-2" />Nickname ML Ditemukan:</p>
                        <p><strong>Nickname:</strong> {mlInquiryResult.nickname}</p>
                      </>
                    ) : mlInquiryResult.isSuccess && !mlInquiryResult.nickname ? (
                      <>
                        <p className="font-semibold flex items-center"><Info className="h-4 w-4 mr-2" />Catatan Nickname ML:</p>
                        <p>{mlInquiryResult.message || "User ID/Zone ID ditemukan, tetapi nickname tidak dapat diekstrak."}</p>
                      </>
                    ) : (
                      <p className="font-semibold flex items-center"><AlertTriangle className="h-4 w-4 mr-2" />Gagal Cek Nickname ML: <span className="font-normal ml-1">{mlInquiryResult.message}</span></p>
                    )}
                  </div>
                )}

                {giInquiryResult && (
                  <div className={`mt-2 p-3 rounded-md text-sm ${giInquiryResult.isSuccess && giInquiryResult.nickname ? 'bg-green-50 border border-green-200 text-green-700' : giInquiryResult.isSuccess && !giInquiryResult.nickname ? 'bg-blue-50 border border-blue-200 text-blue-700' : 'bg-red-50 border border-red-200 text-red-700'}`}>
                    {giInquiryResult.isSuccess && giInquiryResult.nickname ? (
                      <>
                        <p className="font-semibold flex items-center"><Users className="h-4 w-4 mr-2" />Nickname Genshin Impact Ditemukan:</p>
                        <p><strong>Nickname:</strong> {giInquiryResult.nickname}</p>
                      </>
                    ) : giInquiryResult.isSuccess && !giInquiryResult.nickname ? (
                      <>
                        <p className="font-semibold flex items-center"><Info className="h-4 w-4 mr-2" />Catatan Nickname GI:</p>
                        <p>{giInquiryResult.message || "User ID/Server ditemukan, tetapi nickname tidak dapat diekstrak."}</p>
                      </>
                    ) : (
                      <p className="font-semibold flex items-center"><AlertTriangle className="h-4 w-4 mr-2" />Gagal Cek Nickname GI: <span className="font-normal ml-1">{giInquiryResult.message}</span></p>
                    )}
                  </div>
                )}

                {hsrInquiryResult && (
                  <div className={`mt-2 p-3 rounded-md text-sm ${hsrInquiryResult.isSuccess && hsrInquiryResult.nickname ? 'bg-green-50 border border-green-200 text-green-700' : hsrInquiryResult.isSuccess && !hsrInquiryResult.nickname ? 'bg-blue-50 border border-blue-200 text-blue-700' : 'bg-red-50 border border-red-200 text-red-700'}`}>
                    {hsrInquiryResult.isSuccess && hsrInquiryResult.nickname ? (
                      <>
                        <p className="font-semibold flex items-center"><MapPin className="h-4 w-4 mr-2" />Nickname Honkai Star Rail Ditemukan:</p>
                        <p><strong>Nickname:</strong> {hsrInquiryResult.nickname}</p>
                      </>
                    ) : hsrInquiryResult.isSuccess && !hsrInquiryResult.nickname ? (
                      <>
                        <p className="font-semibold flex items-center"><Info className="h-4 w-4 mr-2" />Catatan Nickname HSR:</p>
                        <p>{hsrInquiryResult.message || "User ID/Region ditemukan, tetapi nickname tidak dapat diekstrak."}</p>
                      </>
                    ) : (
                      <p className="font-semibold flex items-center"><AlertTriangle className="h-4 w-4 mr-2" />Gagal Cek Nickname HSR: <span className="font-normal ml-1">{hsrInquiryResult.message}</span></p>
                    )}
                  </div>
                )}

                <Button
                  onClick={handleInitiateOrder}
                  className={`${themedPrimaryButtonClass} py-6 text-lg`}
                  disabled={proceedButtonDisabled || isSubmittingWithPin}
                >
                  {isSubmittingWithPin ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <Send className="mr-2 h-5 w-5" />}
                  Proceed to Payment
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
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
          <p><strong>Details:</strong> {lastSubmittedOrder.customerNoDisplay}</p>
          <p><strong>Harga Jual (Estimasi):</strong> Rp {lastSubmittedOrder.sellingPrice.toLocaleString()}</p>
           {lastSubmittedOrder.status === "Sukses" && typeof lastSubmittedOrder.profit === 'number' && (
            <div className="flex items-center text-sm">
                <DollarSign className="h-4 w-4 mr-1 text-green-600"/>
                <span className="text-green-700 font-semibold">Profit (Estimasi): Rp {lastSubmittedOrder.profit.toLocaleString()}</span>
            </div>
          )}
          <div><strong>Status:</strong> <Badge variant={lastSubmittedOrder.status === 'Sukses' ? 'default' : lastSubmittedOrder.status === 'Gagal' ? 'destructive' : 'secondary'} className={`${lastSubmittedOrder.status === 'Sukses' ? 'bg-green-100 text-green-800 border-green-300' : lastSubmittedOrder.status === 'Gagal' ? 'bg-red-100 text-red-800 border-red-300' : 'bg-yellow-100 text-yellow-800 border-yellow-300'}`}>{lastSubmittedOrder.status}</Badge></div>
          {lastSubmittedOrder.message && <p className="text-sm text-[var(--ui-text-muted)] dark:text-zinc-400"><strong>Message:</strong> {lastSubmittedOrder.message}</p>}
          {lastSubmittedOrder.sn && <p><strong>Serial Number (SN):</strong> <span className="font-mono text-[var(--ui-accent)]">{lastSubmittedOrder.sn}</span></p>}
          <p className="text-xs italic text-[var(--ui-text-muted)] dark:text-zinc-400">Catatan: Harga Jual dan Profit yang ditampilkan di sini adalah estimasi. Nilai final tercatat di Riwayat Transaksi.</p>

          <div className="flex flex-col sm:flex-row gap-3 pt-4">
            <Button onClick={() => router.push('/transactions')} className="w-full rounded-xl bg-[var(--ui-accent)] text-white hover:bg-[var(--ui-accent-hover)] sm:w-auto">
              <ListChecks className="mr-2 h-4 w-4" /> View Transaction History
            </Button>
            <Button onClick={() => setLastSubmittedOrder(null)} variant="outline" className={`w-full sm:w-auto ${themedOutlineButtonClass}`}>
              <Tag className="mr-2 h-4 w-4" /> Place New Order
            </Button>
          </div>
        </CardContent>
      </Card>
    )}

    {isConfirmingOrder && orderDetailsToConfirmForPin && (
        <AlertDialog open={isConfirmingOrder} onOpenChange={(open) => {
          if (!open && !isSubmittingWithPin) {
              setIsConfirmingOrder(false);
          } else if (open) {
              setIsConfirmingOrder(true);
          }
        }}>
          <AlertDialogContent className="border-[var(--ui-border)] bg-[var(--ui-card)] text-[var(--ui-text)] dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100">
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2 text-[var(--ui-text)] dark:text-zinc-100">
                <ShieldCheck className="h-6 w-6 text-[var(--ui-accent)]" />
                Confirm Your Order
              </AlertDialogTitle>
              <AlertDialogDescription className="pt-2 text-sm text-[var(--ui-text-muted)] dark:text-zinc-400">
                Please review your order and enter PIN to confirm:
              </AlertDialogDescription>
              <div className="space-y-1 pt-2 text-sm text-[var(--ui-text)] dark:text-zinc-100">
                <div><strong>Product:</strong> {orderDetailsToConfirmForPin.product.product_name}</div>
                <div><strong>Harga Modal:</strong> Rp {orderDetailsToConfirmForPin.product.price.toLocaleString()}</div>
                <div><strong>{orderDetailsToConfirmForPin.zoneId ? "User ID:" : "Customer No/ID:"}</strong> {orderDetailsToConfirmForPin.customerNo}</div>
                {orderDetailsToConfirmForPin.zoneId && (
                  <div><strong>{pageConfig.zoneIdLabel?.(orderDetailsToConfirmForPin.product.brand) || "Zone/Server ID"}:</strong> {orderDetailsToConfirmForPin.zoneId}</div>
                )}
                {orderDetailsToConfirmForPin.plnCustomerName && (
                  <div><strong>PLN Customer Name:</strong> {orderDetailsToConfirmForPin.plnCustomerName}</div>
                )}
                {orderDetailsToConfirmForPin.freeFireNickname && (
                  <div><strong>Free Fire Nickname:</strong> {orderDetailsToConfirmForPin.freeFireNickname}</div>
                )}
                {orderDetailsToConfirmForPin.mobileLegendsNickname && (
                  <div><strong>Mobile Legends Nickname:</strong> {orderDetailsToConfirmForPin.mobileLegendsNickname}</div>
                )}
                {orderDetailsToConfirmForPin.genshinImpactNickname && (
                  <div><strong>Genshin Impact Nickname:</strong> {orderDetailsToConfirmForPin.genshinImpactNickname}</div>
                )}
                {orderDetailsToConfirmForPin.honkaiStarRailNickname && (
                  <div><strong>Honkai Star Rail Nickname:</strong> {orderDetailsToConfirmForPin.honkaiStarRailNickname}</div>
                )}
              </div>
            </AlertDialogHeader>

            <div className="my-4 space-y-2 rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-card-alt)] p-4 py-4 dark:border-zinc-800 dark:bg-zinc-900">
              <Label htmlFor="digitalServicePinInput" className="flex items-center justify-center text-sm font-medium text-[var(--ui-text-muted)] dark:text-zinc-400">
                <KeyRound className="mr-2 h-4 w-4" />
                Transaction PIN
              </Label>
              <Input
                id="digitalServicePinInput"
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
                className="text-center tracking-[0.5em] text-xl rounded-xl border-[var(--ui-input-border)] bg-[var(--ui-input-bg)] text-[var(--ui-text)] focus-visible:ring-[var(--ui-accent)] dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
              />
              {pinError && <p className="text-sm text-destructive text-center pt-2">{pinError}</p>}
            </div>

            <AlertDialogFooter className="pt-2">
                <AlertDialogCancel onClick={() => {
                    setIsConfirmingOrder(false);
                    setPinInput("");
                    setPinError("");
                }} disabled={isSubmittingWithPin} className={themedOutlineButtonClass}>
                    Cancel
                </AlertDialogCancel>
                <Button onClick={handlePinConfirmDigitalService} disabled={isSubmittingWithPin || pinInput.length !== 6} className="rounded-xl bg-[var(--ui-accent)] text-white hover:bg-[var(--ui-accent-hover)]">
                {isSubmittingWithPin && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Confirm & Pay
                </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </>
  );
}
