
// src/app/(app)/order/pulsa/page.tsx
"use client";

import { useState, useEffect, useMemo } from 'react';
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
import { Smartphone, AlertTriangle, Loader2, ShieldCheck, Send, Search, RefreshCw, KeyRound, CheckCircle, Clock, ListChecks, Tag, DollarSign } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from '@/contexts/AuthContext';
import { verifyPin } from '@/ai/flows/verify-pin-flow';
import { fetchDigiflazzProducts, type DigiflazzProduct } from '@/ai/flows/fetch-digiflazz-products-flow';
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
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface OperatorInfo {
  name: string;
  prefixes: string[];
  digiflazzBrand: string;
}

const operatorData: OperatorInfo[] = [
  { name: "Telkomsel", prefixes: ["0811", "0812", "0813", "0821", "0822", "0823", "0852", "0853", "0851"], digiflazzBrand: "TELKOMSEL" },
  { name: "Indosat", prefixes: ["0814", "0815", "0816", "0855", "0856", "0857", "0858"], digiflazzBrand: "INDOSAT" },
  { name: "XL", prefixes: ["0859", "0877", "0878", "0817", "0818", "0819"], digiflazzBrand: "XL" },
  { name: "Tri", prefixes: ["0898", "0899", "0895", "0896", "0897"], digiflazzBrand: "THREE" },
  { name: "Smartfren", prefixes: ["0889", "0881", "0882", "0883", "0886", "0887", "0888", "0884", "0885"], digiflazzBrand: "SMARTFREN" },
  { name: "AXIS", prefixes: ["0832", "0833", "0838", "0831"], digiflazzBrand: "AXIS" },
];

const pulsaOrderFormSchema = z.object({
  phoneNumber: z.string().min(10, "Phone number must be at least 10 digits").regex(/^0\d+$/, "Must start with 0 and be only digits"),
});

type PulsaOrderFormValues = z.infer<typeof pulsaOrderFormSchema>;

const RELEVANT_PULSA_CATEGORIES_UPPER = ["PULSA"];

interface SubmittedPulsaOrderInfo {
  refId: string;
  productName: string;
  phoneNumber: string;
  operatorName?: string;
  costPrice: number;
  sellingPrice: number;
  profit?: number;
  status: TransactionStatus;
  message?: string | null;
  sn?: string | null;
}

export default function PulsaOrderPage() {
  const { toast } = useToast();
  const { user: authUser, logout } = useAuth();
  const router = useRouter();

  const [allApiProducts, setAllApiProducts] = useState<DigiflazzProduct[]>([]);
  const [isLoadingApiProducts, setIsLoadingApiProducts] = useState(true);
  const [apiProductsError, setApiProductsError] = useState<string | null>(null);

  const [detectedOperator, setDetectedOperator] = useState<OperatorInfo | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<DigiflazzProduct | null>(null);

  const [isConfirmingOrder, setIsConfirmingOrder] = useState(false);
  const [pinInput, setPinInput] = useState("");
  const [pinError, setPinError] = useState("");
  const [isSubmittingWithPin, setIsSubmittingWithPin] = useState(false);

  const [isOperatorChecked, setIsOperatorChecked] = useState(false);
  const [isCheckingOperator, setIsCheckingOperator] = useState(false);
  const [operatorCheckError, setOperatorCheckError] = useState<string | null>(null);
  const [isRefreshingPricelist, setIsRefreshingPricelist] = useState(false);
  const [lastSubmittedOrder, setLastSubmittedOrder] = useState<SubmittedPulsaOrderInfo | null>(null);


  const form = useForm<PulsaOrderFormValues>({
    resolver: zodResolver(pulsaOrderFormSchema),
    defaultValues: {
      phoneNumber: "",
    },
  });
  const watchedPhoneNumber = form.watch('phoneNumber');

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
      console.error("Failed to load Digiflazz API products:", error);
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handlePhoneNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawValue = e.target.value;
    form.setValue('phoneNumber', rawValue, { shouldValidate: true });
  };


  useEffect(() => {
    let rawPhoneNumberValue = watchedPhoneNumber || "";
    let normalizedPhoneNumber = rawPhoneNumberValue;

    if (typeof rawPhoneNumberValue === 'string') {
        const digitsOnly = rawPhoneNumberValue.replace(/\D/g, '');
        if (digitsOnly.startsWith('62')) {
            normalizedPhoneNumber = '0' + digitsOnly.substring(2);
        } else {
            normalizedPhoneNumber = digitsOnly;
        }

        if (normalizedPhoneNumber !== rawPhoneNumberValue) {
            form.setValue('phoneNumber', normalizedPhoneNumber, { shouldValidate: true });
        }
    }

    if (isOperatorChecked) {
      setIsOperatorChecked(false);
      setDetectedOperator(null);
      setSelectedProduct(null);
      setOperatorCheckError(null);
      setLastSubmittedOrder(null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watchedPhoneNumber]);

  const handleCheckOperator = () => {
    setIsCheckingOperator(true);
    setOperatorCheckError(null);
    setDetectedOperator(null);
    setSelectedProduct(null);
    setLastSubmittedOrder(null);

    const currentPhoneNumber = form.getValues('phoneNumber');

    if (!currentPhoneNumber || currentPhoneNumber.length < 4 || !currentPhoneNumber.startsWith('0')) {
      setOperatorCheckError("Please enter a valid Indonesian phone number (e.g., 0812...).");
      setIsOperatorChecked(true);
      setIsCheckingOperator(false);
      return;
    }

    if (isLoadingApiProducts && allApiProducts.length === 0) {
      setOperatorCheckError("Product list is still loading, please wait and try again.");
      setIsOperatorChecked(true);
      setIsCheckingOperator(false);
      return;
    }
    if (apiProductsError && allApiProducts.length === 0) {
      setOperatorCheckError(`Failed to load products: ${apiProductsError}. Cannot check operator.`);
      setIsOperatorChecked(true);
      setIsCheckingOperator(false);
      return;
    }

    let foundOperator: OperatorInfo | null = null;
    for (const op of operatorData) {
      if (op.prefixes.some(prefix => currentPhoneNumber.startsWith(prefix))) {
        foundOperator = op;
        break;
      }
    }

    if (foundOperator) {
      setDetectedOperator(foundOperator);
    } else {
      setOperatorCheckError("Operator not recognized or not supported.");
    }
    setIsOperatorChecked(true);
    setIsCheckingOperator(false);
  };

  const availableProducts = useMemo(() => {
    if (!isOperatorChecked || !detectedOperator || isLoadingApiProducts || apiProductsError) {
        return [];
    }

    const operatorBrandTargetUpper = detectedOperator.digiflazzBrand.toUpperCase();
    const relevantProducts = allApiProducts.filter(p => {
        const productBrandUpper = p.brand.toUpperCase();
        const productCategoryUpper = p.category.toUpperCase();

        const brandMatch = productBrandUpper === operatorBrandTargetUpper;
        const categoryMatch = RELEVANT_PULSA_CATEGORIES_UPPER.some(cat => productCategoryUpper.includes(cat));

        return brandMatch && categoryMatch;
    }).sort((a, b) => a.price - b.price);

    if (relevantProducts.length === 0 && isOperatorChecked && detectedOperator && !operatorCheckError) {
        setTimeout(() => setOperatorCheckError(`No pulsa products found for ${detectedOperator.name}.`), 0);
    } else if (relevantProducts.length > 0 && operatorCheckError && operatorCheckError.startsWith("No pulsa products")) {
         setTimeout(() => setOperatorCheckError(null), 0);
    }

    return relevantProducts;
  }, [allApiProducts, detectedOperator, isOperatorChecked, isLoadingApiProducts, apiProductsError, operatorCheckError]);


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
    setLastSubmittedOrder(null);
  };

  const onSubmitOrder = () => {
    if (!selectedProduct) {
      toast({
        title: "No Product Selected",
        description: "Please select an active product to purchase.",
        variant: "destructive",
      });
      return;
    }
    const isActive = selectedProduct.buyer_product_status && selectedProduct.seller_product_status;
    if (!isActive) {
        toast({
            title: "Cannot Order Inactive Product",
            description: "The selected product is not available for purchase. Please select an active one.",
            variant: "destructive",
        });
        return;
    }
    setIsConfirmingOrder(true);
    setPinInput("");
    setPinError("");
  };

  const handlePinConfirm = async () => {
    if (!selectedProduct || !authUser) {
      setPinError("Order details or user session is missing. Please try again.");
      setIsSubmittingWithPin(false);
      return;
    }
    const isActive = selectedProduct.buyer_product_status && selectedProduct.seller_product_status;
    if (!isActive) {
      setPinError("Cannot process order for an inactive product. The product may have become unavailable.");
      setIsSubmittingWithPin(false);
      return;
    }

    setIsSubmittingWithPin(true);
    setPinError("");

    const refId = `DF-${generateRefId()}`;
    const phoneNumber = form.getValues("phoneNumber");

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
        buyerSkuCode: selectedProduct.buyer_sku_code,
        customerNo: phoneNumber,
        refId: refId,
      });

      const clientSideSellingPriceEstimate = getCustomSellingPrice(selectedProduct.buyer_sku_code, 'digiflazz') || 
                                          (selectedProduct.price < 20000 ? selectedProduct.price + 1000 : 
                                          selectedProduct.price <= 50000 ? selectedProduct.price + 1500 : 
                                          selectedProduct.price + 2000);

      const newTxInput: NewTransactionInput = {
        id: refId,
        productName: selectedProduct.product_name,
        details: `${phoneNumber} (${detectedOperator?.name || selectedProduct.brand})`,
        costPrice: selectedProduct.price,
        sellingPrice: clientSideSellingPriceEstimate,
        status: purchaseResponse.status as TransactionStatus || "Gagal",
        timestamp: new Date().toISOString(),
        serialNumber: purchaseResponse.sn || undefined,
        failureReason: purchaseResponse.status === "Gagal" ? purchaseResponse.message : undefined,
        buyerSkuCode: selectedProduct.buyer_sku_code,
        originalCustomerNo: phoneNumber,
        productCategoryFromProvider: selectedProduct.category,
        productBrandFromProvider: selectedProduct.brand,
        provider: 'digiflazz',
        transactedBy: authUser.username,
      };
      
      await addTransactionToDB(newTxInput, authUser.username); 

      let profitForSummary: number | undefined = undefined;
      if (purchaseResponse.status === "Sukses") {
        profitForSummary = clientSideSellingPriceEstimate - selectedProduct.price;
      }

      const notificationDetails: TelegramNotificationDetails = {
        refId: refId,
        productName: selectedProduct.product_name,
        customerNoDisplay: `${phoneNumber} (${detectedOperator?.name || selectedProduct.brand})`,
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
          description: purchaseResponse.message || `Your order for ${selectedProduct.product_name} is ${purchaseResponse.status.toLowerCase()}. SN: ${purchaseResponse.sn || 'N/A'}`,
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
        productName: selectedProduct.product_name,
        phoneNumber: phoneNumber,
        operatorName: detectedOperator?.name || selectedProduct.brand,
        costPrice: selectedProduct.price,
        sellingPrice: clientSideSellingPriceEstimate, 
        profit: profitForSummary,
        status: purchaseResponse.status as TransactionStatus || "Gagal",
        message: purchaseResponse.message,
        sn: purchaseResponse.sn,
      });

      form.reset({ phoneNumber: "" });
      setSelectedProduct(null);
      setDetectedOperator(null);
      setIsConfirmingOrder(false);
      setIsOperatorChecked(false);
      setPinInput("");
      setPinError("");

    } catch (error) {
      console.error("Order processing error:", error);
      const message = error instanceof Error ? error.message : "An unexpected error occurred.";
      setPinError(`Order error: ${message}`);
      toast({ title: "Order Failed", description: message, variant: "destructive" });

      const failedTxInput : NewTransactionInput = {
        id: refId,
        productName: selectedProduct.product_name,
        details: `${phoneNumber} (${detectedOperator?.name || selectedProduct.brand})`,
        costPrice: selectedProduct.price,
        sellingPrice: 0,
        status: "Gagal",
        timestamp: new Date().toISOString(),
        failureReason: message,
        buyerSkuCode: selectedProduct.buyer_sku_code,
        originalCustomerNo: phoneNumber,
        productCategoryFromProvider: selectedProduct.category,
        productBrandFromProvider: selectedProduct.brand,
        provider: 'digiflazz',
        transactedBy: authUser.username,
      };
      await addTransactionToDB(failedTxInput, authUser.username);
      const notificationDetails: TelegramNotificationDetails = {
        refId: refId,
        productName: selectedProduct.product_name,
        customerNoDisplay: `${phoneNumber} (${detectedOperator?.name || selectedProduct.brand})`,
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


  if (isLoadingApiProducts && allApiProducts.length === 0 && !isRefreshingPricelist) {
    return (
      <OrderFormShell title="Buy Phone Credit (Pulsa)" description="Enter phone number to find products." icon={Smartphone}>
        <div className="flex flex-col items-center justify-center py-10 text-[var(--ui-text-muted)] dark:text-zinc-400">
          <Loader2 className="mb-4 h-12 w-12 animate-spin text-[var(--ui-accent)]" />
          <p className="text-lg">Loading available products from Digiflazz...</p>
        </div>
      </OrderFormShell>
    );
  }

  if (apiProductsError && allApiProducts.length === 0 && !isLoadingApiProducts && !isRefreshingPricelist) {
    return (
      <OrderFormShell title="Buy Phone Credit (Pulsa)" description="Enter phone number to find products." icon={Smartphone}>
        <Card className="border-destructive bg-destructive/10 py-10 text-center shadow">
            <CardContent>
              <div className="mb-2 flex items-center justify-center gap-2 text-destructive">
                    <AlertTriangle className="h-6 w-6" /> <span className="font-semibold">Error Loading Products</span>
              </div>
              <p className="text-destructive/90">{apiProductsError}</p>
              <Button onClick={() => loadAllApiProducts(false)} className={`mt-4 ${themedPrimaryButtonClass}`}>Try Reload</Button>
            </CardContent>
          </Card>
      </OrderFormShell>
    );
  }


  return (
    <>
    {!lastSubmittedOrder ? (
      <OrderFormShell title="Buy Phone Credit (Pulsa)" description="Enter phone number, check operator, then choose product." icon={Smartphone}>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmitOrder)} className="space-y-6">
            <FormField
              control={form.control}
              name="phoneNumber"
              render={({ field }) => (
                <FormItem>
                  <Label className={themedLabelClass}>
                    <Smartphone className="mr-2 h-4 w-4 text-[var(--ui-accent)]" />
                    Phone Number
                  </Label>
                  <FormControl>
                    <Input
                      placeholder="081234567890"
                      {...field}
                      value={field.value || ''}
                      onChange={handlePhoneNumberChange}
                      type="tel"
                      disabled={isCheckingOperator || isRefreshingPricelist || isSubmittingWithPin}
                      maxLength={20}
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
                onClick={handleCheckOperator}
                className={`w-full sm:flex-grow ${themedPrimaryButtonClass}`}
                disabled={isCheckingOperator || !watchedPhoneNumber || watchedPhoneNumber.length < 4 || isRefreshingPricelist || (isLoadingApiProducts && allApiProducts.length === 0) || isSubmittingWithPin}
                >
                {isCheckingOperator ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                    <Search className="mr-2 h-4 w-4" />
                )}
                {isCheckingOperator ? "Checking..." : "Check Operator"}
                </Button>
                <Button
                    type="button"
                    onClick={handleRefreshPricelist}
                    variant="outline"
                    className={`w-full sm:w-auto ${themedOutlineButtonClass}`}
                    disabled={isRefreshingPricelist || (isLoadingApiProducts && allApiProducts.length === 0) || isSubmittingWithPin }
                >
                    {isRefreshingPricelist ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                        <RefreshCw className="mr-2 h-4 w-4" />
                    )}
                    {isRefreshingPricelist ? 'Refreshing...' : 'Refresh Pricelist'}
                </Button>
            </div>


            {isOperatorChecked && (
              <>
                {operatorCheckError && (
                  <div className="mt-2 text-sm text-destructive flex items-center gap-1.5 p-3 bg-destructive/10 rounded-md border border-destructive/30">
                    <AlertTriangle className="h-4 w-4 flex-shrink-0" /> {operatorCheckError}
                  </div>
                )}

                {detectedOperator && !operatorCheckError && (
                     <div className="mt-2 flex items-center gap-1.5 rounded-2xl border border-green-300 bg-green-100 p-3 text-sm text-green-700">
                        <ShieldCheck className="h-5 w-5 text-green-600" />
                        Operator: <span className="font-semibold">{detectedOperator.name}</span>
                     </div>
                )}

                {detectedOperator && !operatorCheckError && availableProducts.length > 0 && (
                  <div className="space-y-4 pt-4">
                    <h3 className="text-lg font-semibold text-[var(--ui-text)] dark:text-zinc-100">Select Product for {detectedOperator.name}:</h3>
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
                                    <Badge variant="outline" className="border-[var(--ui-border)] bg-[var(--ui-card-alt)] text-xs text-[var(--ui-text)] dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100">{product.category}</Badge>
                                    {isActive ? (
                                      <Badge variant="default" className="text-xs bg-green-100 text-green-800 border-green-300">Available</Badge>
                                    ) : (
                                      <Badge variant="destructive" className="text-xs">Not Available</Badge>
                                    )}
                                </div>
                            </CardContent>
                            </Card>
                        );
                      })}
                    </div>
                     {selectedProduct && (
                        <div className="mt-2 rounded-2xl border border-[var(--ui-accent)]/30 bg-[var(--ui-accent-bg)] p-3 text-center">
                            <p className="font-semibold text-[var(--ui-accent)]">Selected: {selectedProduct.product_name} (Modal: Rp {selectedProduct.price.toLocaleString()})</p>
                             {!(selectedProduct.buyer_product_status && selectedProduct.seller_product_status) && (
                                <p className="text-sm text-destructive">(This product is currently not available for purchase)</p>
                            )}
                        </div>
                    )}
                  </div>
                )}
                 {isOperatorChecked && detectedOperator && !operatorCheckError && availableProducts.length === 0 && !isLoadingApiProducts && (
                  <div className="mt-4 rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-card)] p-4 text-center text-[var(--ui-text-muted)] dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400">
                    No pulsa products found for {detectedOperator.name} at the moment. Try refreshing or check another number.
                  </div>
                )}
              </>
            )}

            {selectedProduct && isOperatorChecked && detectedOperator && !operatorCheckError && hasActiveProductsAvailable && (
              <Button
                type="submit"
                className={`mt-6 w-full ${themedPrimaryButtonClass}`}
                disabled={isRefreshingPricelist || isSubmittingWithPin || !selectedProduct || !(selectedProduct.buyer_product_status && selectedProduct.seller_product_status)}
              >
                <Send className="mr-2 h-4 w-4" /> Proceed to Pay
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
          <p><strong>Phone Number:</strong> {lastSubmittedOrder.phoneNumber} ({lastSubmittedOrder.operatorName})</p>
          <p><strong>Harga Jual (Estimasi):</strong> Rp {lastSubmittedOrder.sellingPrice.toLocaleString()}</p>
          {lastSubmittedOrder.status === "Sukses" && typeof lastSubmittedOrder.profit === 'number' && (
                <div className="flex items-center text-sm">
                    <DollarSign className="h-4 w-4 mr-1 text-green-600"/>
                    <span className="text-green-700 font-semibold">Profit (Estimasi): Rp {lastSubmittedOrder.profit.toLocaleString()}</span>
                </div>
            )}
          <div><strong>Status:</strong> <Badge variant={lastSubmittedOrder.status === 'Sukses' ? 'default' : lastSubmittedOrder.status === 'Gagal' ? 'destructive' : 'secondary'}  className={`${lastSubmittedOrder.status === 'Sukses' ? 'bg-green-100 text-green-800 border-green-300' : lastSubmittedOrder.status === 'Gagal' ? 'bg-red-100 text-red-800 border-red-300' : 'bg-yellow-100 text-yellow-800 border-yellow-300'}`}>{lastSubmittedOrder.status}</Badge></div>
          {lastSubmittedOrder.message && <p className="text-sm text-[var(--ui-text-muted)] dark:text-zinc-400"><strong>Message:</strong> {lastSubmittedOrder.message}</p>}
          {lastSubmittedOrder.sn && <p><strong>Serial Number (SN):</strong> <span className="font-mono text-[var(--ui-accent)]">{lastSubmittedOrder.sn}</span></p>}
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


      {isConfirmingOrder && selectedProduct && (
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
                Please review your order details and enter PIN to confirm:
              </AlertDialogDescription>
              <div className="space-y-1 pt-2 text-sm text-[var(--ui-text)] dark:text-zinc-100">
                <div><strong>Phone Number:</strong> {form.getValues("phoneNumber")}</div>
                {detectedOperator && <div><strong>Operator:</strong> {detectedOperator.name}</div>}
                <div><strong>Product:</strong> {selectedProduct.product_name}</div>
                <div><strong>Harga Modal:</strong> Rp {selectedProduct.price.toLocaleString()}</div>
              </div>
            </AlertDialogHeader>

            <div className="my-4 space-y-2 rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-card-alt)] p-4 py-4 dark:border-zinc-800 dark:bg-zinc-900">
              <Label htmlFor="pinInputPulsa" className="flex items-center justify-center text-sm font-medium text-[var(--ui-text-muted)] dark:text-zinc-400">
                <KeyRound className="mr-2 h-4 w-4" />
                Transaction PIN
              </Label>
              <Input
                id="pinInputPulsa"
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
                    Cancel
                </AlertDialogCancel>
                <Button onClick={handlePinConfirm} disabled={isSubmittingWithPin || pinInput.length !== 6} className={themedPrimaryButtonClass}>
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
