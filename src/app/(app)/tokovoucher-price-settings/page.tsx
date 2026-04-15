// src/app/(app)/tokovoucher-price-settings/page.tsx
"use client";

import { useState, useEffect, useCallback, useMemo } from 'react';
import { fetchTokoVoucherCategories, type TokoVoucherCategory } from '@/ai/flows/tokovoucher/fetchTokoVoucherCategories-flow';
import { fetchTokoVoucherOperators, type TokoVoucherOperator } from '@/ai/flows/tokovoucher/fetchTokoVoucherOperators-flow';
import { fetchTokoVoucherProductTypes, type TokoVoucherProductType } from '@/ai/flows/tokovoucher/fetchTokoVoucherProductTypes-flow';
import { fetchTokoVoucherProducts, type TokoVoucherProduct } from '@/ai/flows/tokovoucher/fetchTokoVoucherProducts-flow';

import { fetchPriceSettingsFromDB, storePriceSettingsInDB, type PriceSettings as DbPriceSettings } from '@/lib/db-price-settings-utils';
import { savePriceSettings as savePriceSettingsToLocalStorage, type PriceSettings as LocalStoragePriceSettings } from '@/lib/price-settings-utils';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Loader2, Settings, Save, AlertTriangle, RefreshCw, Filter, Lock, ShoppingCart } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import ProtectedRoute from '@/components/core/ProtectedRoute';

const ALL_FILTER_VAL = "all_filter_val";
const PROVIDER_NAME = 'tokovoucher'; // Specific to this page

const themedPanelClass = "rounded-3xl border-[var(--ui-border)] bg-[var(--ui-card)] shadow-md dark:border-zinc-800 dark:bg-zinc-950";
const themedInputClass = "rounded-xl border-[var(--ui-input-border)] bg-[var(--ui-input-bg)] text-[var(--ui-text)] placeholder:text-[var(--ui-text-secondary)] focus-visible:ring-[var(--ui-accent)] dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-500";
const themedSelectTriggerClass = "rounded-xl border-[var(--ui-input-border)] bg-[var(--ui-input-bg)] text-[var(--ui-text)] focus:ring-[var(--ui-accent)] dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100";
const themedSelectContentClass = "border-[var(--ui-border)] bg-[var(--ui-card)] text-[var(--ui-text)] dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100";
const themedOutlineButtonClass = "rounded-xl border-[var(--ui-border)] bg-[var(--ui-card-alt)] text-[var(--ui-text)] hover:bg-[var(--ui-accent-bg)] hover:text-[var(--ui-accent)] dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100";

function getNamespacedProductIdentifier(productCode: string): string {
  return `${PROVIDER_NAME}::${productCode}`;
}

export default function TokoVoucherPriceSettingsPage() {
  const { toast } = useToast();
  const { user: authUser } = useAuth();

  const [categories, setCategories] = useState<TokoVoucherCategory[]>([]);
  const [operators, setOperators] = useState<TokoVoucherOperator[]>([]);
  const [productTypes, setProductTypes] = useState<TokoVoucherProductType[]>([]);
  const [products, setProducts] = useState<TokoVoucherProduct[]>([]);

  const [selectedCategoryId, setSelectedCategoryId] = useState<string>(ALL_FILTER_VAL);
  const [selectedOperatorId, setSelectedOperatorId] = useState<string>(ALL_FILTER_VAL);
  const [selectedProductTypeId, setSelectedProductTypeId] = useState<string>(ALL_FILTER_VAL);

  const [isLoadingCategories, setIsLoadingCategories] = useState(true);
  const [isLoadingOperators, setIsLoadingOperators] = useState(false);
  const [isLoadingProductTypes, setIsLoadingProductTypes] = useState(false);
  const [isLoadingProducts, setIsLoadingProducts] = useState(false);
  
  const [customPrices, setCustomPrices] = useState<DbPriceSettings>({});
  const [isSaving, setIsSaving] = useState(false);
  const [isLoadingInitialSettings, setIsLoadingInitialSettings] = useState(true);
  const [adminPasswordConfirmation, setAdminPasswordConfirmation] = useState("");
  const [overallError, setOverallError] = useState<string | null>(null);

  const loadInitialData = useCallback(async () => {
    setIsLoadingCategories(true);
    setIsLoadingInitialSettings(true);
    setOverallError(null);
    try {
      const [categoriesResult, dbPriceSettings] = await Promise.all([
        fetchTokoVoucherCategories(),
        fetchPriceSettingsFromDB()
      ]);

      if (categoriesResult.isSuccess && categoriesResult.data) {
        setCategories(categoriesResult.data);
      } else {
        setOverallError(categoriesResult.message || "Failed to load TokoVoucher categories.");
        toast({ title: "Error Loading Categories", description: categoriesResult.message, variant: "destructive" });
      }
      setCustomPrices(dbPriceSettings); // dbPriceSettings already have namespaced keys
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Unknown error during initial load.";
      setOverallError(`Failed to load initial data: ${msg}`);
      toast({ title: "Error Loading Data", description: msg, variant: "destructive" });
    } finally {
      setIsLoadingCategories(false);
      setIsLoadingInitialSettings(false);
    }
  }, [toast]);

  useEffect(() => {
    loadInitialData();
  }, [loadInitialData]);

  useEffect(() => {
    if (selectedCategoryId === ALL_FILTER_VAL) {
      setOperators([]);
      setSelectedOperatorId(ALL_FILTER_VAL);
      return;
    }
    const loadOps = async () => {
      setIsLoadingOperators(true);
      setOverallError(null);
      const result = await fetchTokoVoucherOperators({ categoryId: parseInt(selectedCategoryId) });
      if (result.isSuccess && result.data) {
        setOperators(result.data);
      } else {
        setOperators([]);
        setOverallError(result.message || "Failed to load operators.");
        toast({ title: "Error Operators", description: result.message, variant: "destructive" });
      }
      setSelectedOperatorId(ALL_FILTER_VAL);
      setIsLoadingOperators(false);
    };
    loadOps();
  }, [selectedCategoryId, toast]);

  useEffect(() => {
    if (selectedOperatorId === ALL_FILTER_VAL) {
      setProductTypes([]);
      setSelectedProductTypeId(ALL_FILTER_VAL);
      return;
    }
    const loadTypes = async () => {
      setIsLoadingProductTypes(true);
      setOverallError(null);
      const result = await fetchTokoVoucherProductTypes({ operatorId: parseInt(selectedOperatorId) });
      if (result.isSuccess && result.data) {
        setProductTypes(result.data);
      } else {
        setProductTypes([]);
        setOverallError(result.message || "Failed to load product types.");
        toast({ title: "Error Product Types", description: result.message, variant: "destructive" });
      }
      setSelectedProductTypeId(ALL_FILTER_VAL);
      setIsLoadingProductTypes(false);
    };
    loadTypes();
  }, [selectedOperatorId, toast]);

  useEffect(() => {
    if (selectedProductTypeId === ALL_FILTER_VAL) {
      setProducts([]);
      return;
    }
    const loadProds = async () => {
      setIsLoadingProducts(true);
      setOverallError(null);
      const result = await fetchTokoVoucherProducts({ productTypeId: parseInt(selectedProductTypeId) });
      if (result.isSuccess && result.data) {
        setProducts(result.data.sort((a,b) => a.price - b.price));
      } else {
        setProducts([]);
        setOverallError(result.message || "Failed to load products.");
        toast({ title: "Error Products", description: result.message, variant: "destructive" });
      }
      setIsLoadingProducts(false);
    };
    loadProds();
  }, [selectedProductTypeId, toast]);

  const handlePriceChange = (productCode: string, newPrice: string) => {
    const priceNum = parseInt(newPrice, 10);
    const namespacedKey = getNamespacedProductIdentifier(productCode);
    setCustomPrices(prev => ({
      ...prev,
      [namespacedKey]: isNaN(priceNum) ? 0 : priceNum,
    }));
  };

  const handleClearCustomPrice = (productCode: string) => {
    const namespacedKey = getNamespacedProductIdentifier(productCode);
    setCustomPrices(prev => {
      const newPrices = { ...prev };
      delete newPrices[namespacedKey];
      return newPrices;
    });
    toast({
      title: "Custom Price Cleared",
      description: `Custom price for product code ${productCode} will revert to default markup upon saving.`,
    });
  };

  const handleSaveSettings = async () => {
    if (!authUser) {
      toast({ title: "Authentication Error", description: "Admin user not authenticated.", variant: "destructive" });
      return;
    }
    if (!adminPasswordConfirmation) {
      toast({ title: "Password Required", description: "Please enter your admin password.", variant: "destructive" });
      return;
    }
    setIsSaving(true);
    // customPrices already uses namespaced keys
    const settingsForDb: DbPriceSettings = {};
    for (const key in customPrices) {
        // Filter only TokoVoucher prices for this page and ensure price is positive
      if (key.startsWith(`${PROVIDER_NAME}::`) && customPrices[key] && customPrices[key] > 0) {
        settingsForDb[key] = customPrices[key];
      }
    }
    // Also include any non-TokoVoucher prices that were already in the DB
    const allDbSettings = await fetchPriceSettingsFromDB();
    for (const key in allDbSettings) {
        if (!key.startsWith(`${PROVIDER_NAME}::`)) {
            settingsForDb[key] = allDbSettings[key];
        }
    }

    const result = await storePriceSettingsInDB(settingsForDb, authUser.username, adminPasswordConfirmation);
    if (result.success) {
      toast({ title: "Settings Saved", description: "TokoVoucher price settings saved to database." });
      savePriceSettingsToLocalStorage(settingsForDb as LocalStoragePriceSettings);
      setAdminPasswordConfirmation("");
    } else {
      toast({ title: "Error Saving", description: result.message, variant: "destructive" });
    }
    setIsSaving(false);
  };

  const getDefaultMarkupPrice = (costPrice: number): number => {
    if (costPrice < 20000) return costPrice + 1000;
    if (costPrice <= 50000) return costPrice + 1500;
    return costPrice + 2000;
  };

  const handleRefreshData = () => {
    // This logic is simplified to re-trigger the useEffects by resetting selections
    // or reload all if no specific filter is active
    if (selectedProductTypeId !== ALL_FILTER_VAL) {
        const currentSelection = selectedProductTypeId;
        setSelectedProductTypeId(ALL_FILTER_VAL); // Trigger reload of products
        setTimeout(() => setSelectedProductTypeId(currentSelection), 0);
        toast({title: "Data Refreshed", description: "Product list for current selection updated."})
    } else if (selectedOperatorId !== ALL_FILTER_VAL) {
        const currentSelection = selectedOperatorId;
        setSelectedOperatorId(ALL_FILTER_VAL); // Trigger reload of types
        setTimeout(() => setSelectedOperatorId(currentSelection), 0);
        toast({title: "Data Refreshed", description: "Product types for current operator updated."})
    } else if (selectedCategoryId !== ALL_FILTER_VAL) {
        const currentSelection = selectedCategoryId;
        setSelectedCategoryId(ALL_FILTER_VAL); // Trigger reload of operators
        setTimeout(() => setSelectedCategoryId(currentSelection), 0);
        toast({title: "Data Refreshed", description: "Operators for current category updated."})
    } else {
        loadInitialData();
        toast({title: "Data Refreshed", description: "Categories and price settings reloaded."})
    }
  };

  if (isLoadingInitialSettings && isLoadingCategories) {
    return (
      <div className="flex min-h-[calc(100vh-200px)] flex-col items-center justify-center text-[var(--ui-text-muted)] dark:text-zinc-400">
        <Loader2 className="mb-4 h-12 w-12 animate-spin text-[var(--ui-accent)]" />
        <p className="text-lg">Loading TokoVoucher data and price settings...</p>
      </div>
    );
  }
  
  if (overallError && categories.length === 0) {
     return (
      <Card className="text-center py-10 shadow border-destructive bg-destructive/10">
        <CardHeader><CardTitle className="text-destructive flex items-center justify-center gap-2"><AlertTriangle className="h-6 w-6" /> Error Loading Data</CardTitle></CardHeader>
        <CardContent><p className="text-destructive/90">{overallError}</p><Button onClick={loadInitialData} className="mt-4">Try Reload</Button></CardContent>
      </Card>
    );
  }

  return (
    <ProtectedRoute requiredPermission='pengaturan_harga_tokovoucher'>
    <div className="mx-auto max-w-7xl space-y-8 pb-10">
      <section className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-[var(--ui-accent-gradient-from)] to-[var(--ui-accent-gradient-to)] text-white shadow-lg">
            <ShoppingCart className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold font-headline tracking-tight text-[var(--ui-text)] dark:text-zinc-100">TokoVoucher Price Settings</h1>
            <p className="mt-1 text-sm text-[var(--ui-text-muted)] dark:text-zinc-400">Atur harga jual custom TokoVoucher dengan surface, border, dan CTA yang mengikuti UI theme global.</p>
          </div>
        </div>
         <Button onClick={handleRefreshData} disabled={isSaving || isLoadingCategories || isLoadingOperators || isLoadingProductTypes || isLoadingProducts} variant="outline" className={`w-full sm:w-auto ${themedOutlineButtonClass}`}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh Current Data
        </Button>
      </section>
      <CardDescription className="max-w-4xl text-sm leading-6 text-[var(--ui-text-muted)] dark:text-zinc-400">
        Set custom selling prices for TokoVoucher products. Select Category, Operator, then Product Type to view and set prices.
        Changes require admin password confirmation.
      </CardDescription>

      <Card className={themedPanelClass}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-xl font-headline text-[var(--ui-text)] dark:text-zinc-100">
            <Filter className="h-5 w-5 text-[var(--ui-accent)]" />
            Select Product Group
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <Label htmlFor="tv-category-filter" className="text-[var(--ui-text)] dark:text-zinc-100">Category</Label>
            <Select value={selectedCategoryId} onValueChange={setSelectedCategoryId} disabled={isLoadingCategories || isSaving}>
              <SelectTrigger id="tv-category-filter" className={themedSelectTriggerClass}><SelectValue placeholder="Select Category" /></SelectTrigger>
              <SelectContent className={themedSelectContentClass}>
                <SelectItem value={ALL_FILTER_VAL}>All Categories</SelectItem>
                {categories.map(cat => <SelectItem key={cat.id} value={String(cat.id)}>{cat.nama}</SelectItem>)}
              </SelectContent>
            </Select>
            {isLoadingCategories && <Loader2 className="mt-1 h-4 w-4 animate-spin text-[var(--ui-accent)]" />}
          </div>
          <div>
            <Label htmlFor="tv-operator-filter" className="text-[var(--ui-text)] dark:text-zinc-100">Operator</Label>
            <Select value={selectedOperatorId} onValueChange={setSelectedOperatorId} disabled={selectedCategoryId === ALL_FILTER_VAL || isLoadingOperators || isSaving}>
              <SelectTrigger id="tv-operator-filter" className={themedSelectTriggerClass}><SelectValue placeholder={selectedCategoryId === ALL_FILTER_VAL ? "Select Category First" : "Select Operator"} /></SelectTrigger>
              <SelectContent className={themedSelectContentClass}>
                <SelectItem value={ALL_FILTER_VAL}>All Operators</SelectItem>
                {operators.map(op => <SelectItem key={op.id} value={String(op.id)}>{op.nama}</SelectItem>)}
              </SelectContent>
            </Select>
            {isLoadingOperators && <Loader2 className="mt-1 h-4 w-4 animate-spin text-[var(--ui-accent)]" />}
          </div>
          <div>
            <Label htmlFor="tv-product-type-filter" className="text-[var(--ui-text)] dark:text-zinc-100">Product Type</Label>
            <Select value={selectedProductTypeId} onValueChange={setSelectedProductTypeId} disabled={selectedOperatorId === ALL_FILTER_VAL || isLoadingProductTypes || isSaving}>
              <SelectTrigger id="tv-product-type-filter" className={themedSelectTriggerClass}><SelectValue placeholder={selectedOperatorId === ALL_FILTER_VAL ? "Select Operator First" : "Select Product Type"} /></SelectTrigger>
              <SelectContent className={themedSelectContentClass}>
                <SelectItem value={ALL_FILTER_VAL}>All Product Types</SelectItem>
                {productTypes.map(pt => <SelectItem key={pt.id} value={String(pt.id)}>{pt.nama}</SelectItem>)}
              </SelectContent>
            </Select>
            {isLoadingProductTypes && <Loader2 className="mt-1 h-4 w-4 animate-spin text-[var(--ui-accent)]" />}
          </div>
        </CardContent>
      </Card>

      {selectedProductTypeId !== ALL_FILTER_VAL && (
        <Card className={`${themedPanelClass} overflow-hidden`}>
          <CardHeader>
            <CardTitle className="text-[var(--ui-text)] dark:text-zinc-100">Products for {products[0]?.category_name || categories.find(c=>String(c.id)===selectedCategoryId)?.nama} &gt; {products[0]?.op_name || operators.find(o=>String(o.id)===selectedOperatorId)?.nama} &gt; {products[0]?.jenis_name || productTypes.find(pt=>String(pt.id)===selectedProductTypeId)?.nama}</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {isLoadingProducts && <div className="flex justify-center py-6 text-[var(--ui-text-muted)] dark:text-zinc-400"><Loader2 className="h-8 w-8 animate-spin text-[var(--ui-accent)]" /> <span className="ml-2">Loading products...</span></div>}
            {!isLoadingProducts && products.length === 0 && <p className="py-4 text-center text-[var(--ui-text-muted)] dark:text-zinc-400">No products found for this selection.</p>}
            {!isLoadingProducts && overallError && products.length === 0 && <p className="text-destructive text-center py-4">{overallError}</p>}
            {!isLoadingProducts && products.length > 0 && (
              <div className="overflow-x-auto rounded-2xl border border-[var(--ui-border)] dark:border-zinc-800">
                <Table className="text-[var(--ui-text)] dark:text-zinc-100">
                  <TableHeader className="[&_tr]:border-[var(--ui-border)] dark:[&_tr]:border-zinc-800">
                    <TableRow className="bg-[var(--ui-card-alt)] hover:bg-[var(--ui-card-alt)] dark:bg-zinc-900 dark:hover:bg-zinc-900">
                      <TableHead className="min-w-[200px] text-[var(--ui-text-muted)] dark:text-zinc-400">Product Name</TableHead>
                      <TableHead className="min-w-[100px] text-[var(--ui-text-muted)] dark:text-zinc-400">Code</TableHead>
                      <TableHead className="text-right min-w-[120px] text-[var(--ui-text-muted)] dark:text-zinc-400">Cost Price</TableHead>
                      <TableHead className="text-right min-w-[180px] text-[var(--ui-text-muted)] dark:text-zinc-400">Custom Selling Price</TableHead>
                      <TableHead className="text-right min-w-[120px] text-[var(--ui-text-muted)] dark:text-zinc-400">Est. Profit</TableHead>
                      <TableHead className="text-center min-w-[100px] text-[var(--ui-text-muted)] dark:text-zinc-400">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {products.map((product) => {
                      const costPrice = product.price;
                      const namespacedKey = getNamespacedProductIdentifier(product.code);
                      const customSellingPrice = customPrices[namespacedKey];
                      const effectiveSellingPrice = (customSellingPrice && customSellingPrice > 0) ? customSellingPrice : getDefaultMarkupPrice(costPrice);
                      const profit = effectiveSellingPrice - costPrice;
                      const isInactive = product.status !== 1;

                      return (
                        <TableRow
                          key={product.code}
                          className={`border-[var(--ui-border)] hover:bg-[var(--ui-accent-bg)] dark:border-zinc-800 dark:hover:bg-zinc-900/70 ${isInactive ? 'bg-[var(--ui-card-alt)] opacity-60 dark:bg-zinc-900' : ''}`}
                        >
                          <TableCell className="font-medium">
                            {product.nama_produk}
                            {isInactive && <span className="text-xs text-red-500 ml-1">(Inactive)</span>}
                          </TableCell>
                          <TableCell className="text-xs font-mono text-[var(--ui-text-secondary)] dark:text-zinc-500">{product.code}</TableCell>
                          <TableCell className="text-right">Rp {costPrice.toLocaleString()}</TableCell>
                          <TableCell className="text-right">
                            <Input
                              type="number"
                              placeholder={`Default: Rp ${getDefaultMarkupPrice(costPrice).toLocaleString()}`}
                              value={customPrices[namespacedKey] || ''}
                              onChange={(e) => handlePriceChange(product.code, e.target.value)}
                              className={`${themedInputClass} h-9 min-w-[150px] text-right`}
                              disabled={isSaving || isLoadingProducts}
                            />
                          </TableCell>
                          <TableCell className={`text-right font-semibold ${profit < 0 ? 'text-red-600' : 'text-green-600'}`}>
                            Rp {profit.toLocaleString()}
                          </TableCell>
                          <TableCell className="text-center">
                            <Button variant="ghost" size="sm" onClick={() => handleClearCustomPrice(product.code)}
                              disabled={isSaving || isLoadingProducts || typeof customPrices[namespacedKey] === 'undefined'}
                              className="text-xs text-[var(--ui-text-muted)] hover:bg-destructive/10 hover:text-destructive dark:text-zinc-400"
                              title="Clear custom price & use default markup">
                              Clear
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      )}
      {products.length > 0 && selectedProductTypeId !== ALL_FILTER_VAL && (
        <Card className={`${themedPanelClass} mt-6`}>
            <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg font-medium text-[var(--ui-accent)]"><Lock className="h-5 w-5" />Confirm Changes</CardTitle>
                <CardDescription className="text-[var(--ui-text-muted)] dark:text-zinc-400">Enter your admin password to save all TokoVoucher price settings to the database. This will preserve existing settings for other providers.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <div>
                    <Label htmlFor="tv-admin-password" className="text-[var(--ui-text)] dark:text-zinc-100">Admin Password</Label>
                    <Input id="tv-admin-password" type="password" value={adminPasswordConfirmation}
                        onChange={(e) => setAdminPasswordConfirmation(e.target.value)}
                        placeholder="Enter admin password"
                        className={`${themedInputClass} mt-1 border-[var(--ui-accent)]/30 focus-visible:ring-[var(--ui-accent)]`}
                        disabled={isSaving || isLoadingProducts}
                    />
                </div>
                <Button onClick={handleSaveSettings} disabled={isSaving || isLoadingProducts || !adminPasswordConfirmation} className="w-full rounded-xl bg-[var(--ui-accent)] text-white hover:bg-[var(--ui-accent-hover)] sm:w-auto">
                    {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                    Save TokoVoucher Prices
                </Button>
            </CardContent>
        </Card>
      )}
    </div>
    </ProtectedRoute>
  );
}
