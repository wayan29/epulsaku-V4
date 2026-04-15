// src/app/(app)/price-settings/page.tsx
"use client";

import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { fetchDigiflazzProducts, type DigiflazzProduct } from '@/ai/flows/fetch-digiflazz-products-flow';
import { fetchPriceSettingsFromDB, storePriceSettingsInDB, type PriceSettings as DbPriceSettings } from '@/lib/db-price-settings-utils';
import { savePriceSettings as savePriceSettingsToLocalStorage, type PriceSettings as LocalStoragePriceSettings } from '@/lib/price-settings-utils';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Loader2, Settings, Save, AlertTriangle, RefreshCw, Filter, Lock } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import ProtectedRoute from '@/components/core/ProtectedRoute';

const ALL_FILTER = "all";
const PROVIDER_NAME = 'digiflazz'; // Specific to this page

const themedPanelClass = "rounded-3xl border-[var(--ui-border)] bg-[var(--ui-card)] shadow-md dark:border-zinc-800 dark:bg-zinc-950";
const themedInputClass = "rounded-xl border-[var(--ui-input-border)] bg-[var(--ui-input-bg)] text-[var(--ui-text)] placeholder:text-[var(--ui-text-secondary)] focus-visible:ring-[var(--ui-accent)] dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-500";
const themedSelectTriggerClass = "rounded-xl border-[var(--ui-input-border)] bg-[var(--ui-input-bg)] text-[var(--ui-text)] focus:ring-[var(--ui-accent)] dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100";
const themedSelectContentClass = "border-[var(--ui-border)] bg-[var(--ui-card)] text-[var(--ui-text)] dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100";
const themedOutlineButtonClass = "rounded-xl border-[var(--ui-border)] bg-[var(--ui-card-alt)] text-[var(--ui-text)] hover:bg-[var(--ui-accent-bg)] hover:text-[var(--ui-accent)] dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100";

function getNamespacedProductIdentifier(productCode: string): string {
  return `${PROVIDER_NAME}::${productCode}`;
}

export default function PriceSettingsPage() {
  const { toast } = useToast();
  const { user: authUser } = useAuth();
  const [products, setProducts] = useState<DigiflazzProduct[]>([]);
  const [isLoadingProducts, setIsLoadingProducts] = useState(true);
  const [productError, setProductError] = useState<string | null>(null);
  const [customPrices, setCustomPrices] = useState<DbPriceSettings>({});
  const [isSaving, setIsSaving] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isLoadingInitialSettings, setIsLoadingInitialSettings] = useState(true);
  const [adminPasswordConfirmation, setAdminPasswordConfirmation] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>(ALL_FILTER);
  const [selectedBrand, setSelectedBrand] = useState<string>(ALL_FILTER);

  const loadProductsAndDbSettings = useCallback(async (forceRefreshProducts = false) => {
    if (forceRefreshProducts) setIsRefreshing(true);
    else setIsLoadingProducts(true);
    
    setIsLoadingInitialSettings(true);
    setProductError(null);
    try {
      const fetchedProducts = await fetchDigiflazzProducts({ forceRefresh: forceRefreshProducts });
      setProducts(fetchedProducts.sort((a,b) => a.brand.localeCompare(b.brand) || a.product_name.localeCompare(b.product_name)));
      
      const dbPriceSettings = await fetchPriceSettingsFromDB();
      setCustomPrices(dbPriceSettings); // dbPriceSettings already have namespaced keys

      if (forceRefreshProducts) {
        toast({
          title: "Product List Refreshed",
          description: "Successfully updated products and reloaded price settings from database.",
        });
      }
    } catch (error) {
      console.error("Failed to load products/settings:", error);
      const msg = error instanceof Error ? error.message : "Unknown error.";
      setProductError(`Failed to load data: ${msg}`);
      toast({ title: "Error Loading Data", description: msg, variant: "destructive" });
    } finally {
      if (forceRefreshProducts) setIsRefreshing(false);
      else setIsLoadingProducts(false);
      setIsLoadingInitialSettings(false);
    }
  }, [toast]);

  useEffect(() => {
    loadProductsAndDbSettings();
  }, [loadProductsAndDbSettings]);

  const handlePriceChange = (buyerSkuCode: string, newPrice: string) => {
    const priceNum = parseInt(newPrice, 10);
    const namespacedKey = getNamespacedProductIdentifier(buyerSkuCode);
    setCustomPrices(prev => ({
      ...prev,
      [namespacedKey]: isNaN(priceNum) ? 0 : priceNum,
    }));
  };
  
  const handleClearCustomPrice = (buyerSkuCode: string) => {
    const namespacedKey = getNamespacedProductIdentifier(buyerSkuCode);
    setCustomPrices(prev => {
      const newPrices = { ...prev };
      delete newPrices[namespacedKey];
      return newPrices;
    });
     toast({
      title: "Custom Price Cleared",
      description: `Custom price for SKU ${buyerSkuCode} will revert to default markup upon saving.`,
      variant: "default"
    });
  };

  const handleSaveSettings = async () => {
    if (!authUser) {
        toast({ title: "Authentication Error", description: "Admin user not authenticated.", variant: "destructive" });
        return;
    }
    if (!adminPasswordConfirmation) {
        toast({ title: "Password Required", description: "Please enter your admin password to confirm changes.", variant: "destructive" });
        return;
    }

    setIsSaving(true);
    // customPrices already uses namespaced keys internally due to handlePriceChange
    const settingsForDb: DbPriceSettings = {};
    for (const key in customPrices) {
      // Filter only Digiflazz prices for this page and ensure price is positive
      if (key.startsWith(`${PROVIDER_NAME}::`) && customPrices[key] && customPrices[key] > 0) {
        settingsForDb[key] = customPrices[key];
      }
    }
    // Also include any non-Digiflazz prices that were already in the DB to not overwrite them
    const allDbSettings = await fetchPriceSettingsFromDB();
    for (const key in allDbSettings) {
        if (!key.startsWith(`${PROVIDER_NAME}::`)) {
            settingsForDb[key] = allDbSettings[key];
        }
    }


    const result = await storePriceSettingsInDB(settingsForDb, authUser.username, adminPasswordConfirmation);

    if (result.success) {
      toast({
        title: "Settings Saved to Database",
        description: "Your custom price settings have been saved to the database.",
      });
      savePriceSettingsToLocalStorage(settingsForDb as LocalStoragePriceSettings);
      setAdminPasswordConfirmation("");
    } else {
      toast({
        title: "Error Saving Settings",
        description: result.message || "Could not save settings to database.",
        variant: "destructive",
      });
    }
    setIsSaving(false);
  };
  
  const getDefaultMarkupPrice = (costPrice: number): number => {
    if (costPrice < 20000) return costPrice + 1000;
    if (costPrice <= 50000) return costPrice + 1500;
    return costPrice + 2000;
  };

  const uniqueCategories = useMemo(() => {
    return [ALL_FILTER, ...new Set(products.map(p => p.category))].sort((a, b) => a === ALL_FILTER ? -1 : b === ALL_FILTER ? 1 : a.localeCompare(b));
  }, [products]);

  const uniqueBrands = useMemo(() => {
    const filteredByCategory = selectedCategory === ALL_FILTER 
      ? products 
      : products.filter(p => p.category === selectedCategory);
    return [ALL_FILTER, ...new Set(filteredByCategory.map(p => p.brand))].sort((a, b) => a === ALL_FILTER ? -1 : b === ALL_FILTER ? 1 : a.localeCompare(b));
  }, [products, selectedCategory]);

  useEffect(() => {
    setSelectedBrand(ALL_FILTER);
  }, [selectedCategory]);

  const filteredProducts = useMemo(() => {
    return products.filter(product => {
      const categoryMatch = selectedCategory === ALL_FILTER || product.category === selectedCategory;
      const brandMatch = selectedBrand === ALL_FILTER || product.brand === selectedBrand;
      return categoryMatch && brandMatch;
    });
  }, [products, selectedCategory, selectedBrand]);

  if ((isLoadingProducts || isLoadingInitialSettings) && !isRefreshing) {
    return (
      <div className="flex min-h-[calc(100vh-200px)] flex-col items-center justify-center text-[var(--ui-text-muted)] dark:text-zinc-400">
        <Loader2 className="mb-4 h-12 w-12 animate-spin text-[var(--ui-accent)]" />
        <p className="text-lg">Loading products and price settings...</p>
      </div>
    );
  }

  if (productError && !isRefreshing) {
    return (
      <Card className="text-center py-10 shadow border-destructive bg-destructive/10">
        <CardHeader>
          <CardTitle className="text-destructive flex items-center justify-center gap-2">
            <AlertTriangle className="h-6 w-6" /> Error Loading Data
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-destructive/90">{productError}</p>
          <Button onClick={() => loadProductsAndDbSettings(false)} className="mt-4">Try Reload</Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <ProtectedRoute requiredPermission='pengaturan_harga_digiflazz'>
    <div className="mx-auto max-w-7xl space-y-8 pb-10">
      <section className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-[var(--ui-accent-gradient-from)] to-[var(--ui-accent-gradient-to)] text-white shadow-lg">
            <Settings className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold font-headline tracking-tight text-[var(--ui-text)] dark:text-zinc-100">Digiflazz Price Settings (Database)</h1>
            <p className="mt-1 text-sm text-[var(--ui-text-muted)] dark:text-zinc-400">Atur harga jual custom Digiflazz dengan tampilan yang mengikuti UI theme global.</p>
          </div>
        </div>
        <Button onClick={() => loadProductsAndDbSettings(true)} disabled={isRefreshing || isSaving} className={`w-full sm:w-auto ${themedOutlineButtonClass}`} variant="outline">
            {isRefreshing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
            {isRefreshing ? 'Refreshing...' : 'Refresh Product List'}
        </Button>
      </section>
      <CardDescription className="max-w-4xl text-sm leading-6 text-[var(--ui-text-muted)] dark:text-zinc-400">
        Set custom selling prices for <strong>Digiflazz products</strong>. Prices are stored in the database. 
        If a custom price is not set or is 0, a default markup will be applied.
        Confirm changes with your admin password. For TokoVoucher price settings, please visit the{' '}
        <Link href="/tokovoucher-price-settings" className="font-semibold text-[var(--ui-accent)] underline underline-offset-4 hover:text-[var(--ui-accent-hover)]">
          TokoVoucher Price Settings page
        </Link>.
      </CardDescription>

      <Card className={themedPanelClass}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-xl font-headline text-[var(--ui-text)] dark:text-zinc-100">
            <Filter className="h-5 w-5 text-[var(--ui-accent)]"/>
            Filter Digiflazz Products
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="category-filter" className="text-sm font-medium text-[var(--ui-text)] dark:text-zinc-100">Category</Label>
            <Select 
              value={selectedCategory} 
              onValueChange={setSelectedCategory}
              disabled={isLoadingProducts || isRefreshing || isLoadingInitialSettings}
            >
              <SelectTrigger id="category-filter" className={themedSelectTriggerClass}>
                <SelectValue placeholder="Select Category" />
              </SelectTrigger>
              <SelectContent className={themedSelectContentClass}>
                {uniqueCategories.map(cat => (
                  <SelectItem key={cat} value={cat}>
                    {cat === ALL_FILTER ? "All Categories" : cat}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="brand-filter" className="text-sm font-medium text-[var(--ui-text)] dark:text-zinc-100">Brand</Label>
            <Select 
              value={selectedBrand} 
              onValueChange={setSelectedBrand}
              disabled={isLoadingProducts || isRefreshing || isLoadingInitialSettings || (selectedCategory !== ALL_FILTER && uniqueBrands.length <=1)}
            >
              <SelectTrigger id="brand-filter" className={themedSelectTriggerClass}>
                <SelectValue placeholder="Select Brand" />
              </SelectTrigger>
              <SelectContent className={themedSelectContentClass}>
                {uniqueBrands.map(brand => (
                  <SelectItem key={brand} value={brand}>
                    {brand === ALL_FILTER ? "All Brands" : brand}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card className={`${themedPanelClass} overflow-hidden`}>
        <CardContent className="pt-6">
          {(isLoadingProducts || isLoadingInitialSettings) && isRefreshing && (
             <div className="flex flex-col items-center justify-center py-10 text-[var(--ui-text-muted)] dark:text-zinc-400">
                <Loader2 className="mb-3 h-8 w-8 animate-spin text-[var(--ui-accent)]" />
                <p>Refreshing product list and settings...</p>
            </div>
          )}
          {!isRefreshing && products.length === 0 && !isLoadingProducts && !isLoadingInitialSettings &&(
            <p className="py-4 text-center text-[var(--ui-text-muted)] dark:text-zinc-400">No products found from Digiflazz.</p>
          )}
          {!isRefreshing && filteredProducts.length === 0 && products.length > 0 && !isLoadingInitialSettings && (
             <p className="py-4 text-center text-[var(--ui-text-muted)] dark:text-zinc-400">No products match the current filters.</p>
          )}
          {!isRefreshing && !isLoadingInitialSettings && filteredProducts.length > 0 && (
            <div className="overflow-x-auto rounded-2xl border border-[var(--ui-border)] dark:border-zinc-800">
              <Table className="text-[var(--ui-text)] dark:text-zinc-100">
                <TableHeader className="[&_tr]:border-[var(--ui-border)] dark:[&_tr]:border-zinc-800">
                  <TableRow className="bg-[var(--ui-card-alt)] hover:bg-[var(--ui-card-alt)] dark:bg-zinc-900 dark:hover:bg-zinc-900">
                    <TableHead className="min-w-[200px] text-[var(--ui-text-muted)] dark:text-zinc-400">Product Name</TableHead>
                    <TableHead className="min-w-[120px] text-[var(--ui-text-muted)] dark:text-zinc-400">Brand</TableHead>
                    <TableHead className="min-w-[120px] text-[var(--ui-text-muted)] dark:text-zinc-400">Category</TableHead>
                    <TableHead className="min-w-[100px] text-[var(--ui-text-muted)] dark:text-zinc-400">SKU</TableHead>
                    <TableHead className="text-right min-w-[120px] text-[var(--ui-text-muted)] dark:text-zinc-400">Cost Price (Modal)</TableHead>
                    <TableHead className="text-right min-w-[180px] text-[var(--ui-text-muted)] dark:text-zinc-400">Custom Selling Price (DB)</TableHead>
                    <TableHead className="text-right min-w-[120px] text-[var(--ui-text-muted)] dark:text-zinc-400">Est. Profit</TableHead>
                    <TableHead className="text-center min-w-[100px] text-[var(--ui-text-muted)] dark:text-zinc-400">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredProducts.map((product) => {
                    const costPrice = product.price;
                    const namespacedKey = getNamespacedProductIdentifier(product.buyer_sku_code);
                    const customSellingPrice = customPrices[namespacedKey];
                    const effectiveSellingPrice = (customSellingPrice && customSellingPrice > 0) ? customSellingPrice : getDefaultMarkupPrice(costPrice);
                    const profit = effectiveSellingPrice - costPrice;

                    return (
                      <TableRow
                        key={product.buyer_sku_code}
                        className={`border-[var(--ui-border)] hover:bg-[var(--ui-accent-bg)] dark:border-zinc-800 dark:hover:bg-zinc-900/70 ${!product.buyer_product_status || !product.seller_product_status ? 'bg-[var(--ui-card-alt)] opacity-60 dark:bg-zinc-900' : ''}`}
                      >
                        <TableCell className="font-medium">
                          {product.product_name}
                          {(!product.buyer_product_status || !product.seller_product_status) && <span className="text-xs text-red-500 ml-1">(Inactive)</span>}
                        </TableCell>
                        <TableCell>{product.brand}</TableCell>
                        <TableCell>{product.category}</TableCell>
                        <TableCell className="text-xs font-mono text-[var(--ui-text-secondary)] dark:text-zinc-500">{product.buyer_sku_code}</TableCell>
                        <TableCell className="text-right">Rp {costPrice.toLocaleString()}</TableCell>
                        <TableCell className="text-right">
                          <Input
                            type="number"
                            placeholder={`Default: Rp ${getDefaultMarkupPrice(costPrice).toLocaleString()}`}
                            value={customPrices[namespacedKey] || ''}
                            onChange={(e) => handlePriceChange(product.buyer_sku_code, e.target.value)}
                            className={`${themedInputClass} h-9 min-w-[150px] text-right`}
                            disabled={isSaving || isRefreshing || isLoadingProducts || isLoadingInitialSettings}
                          />
                        </TableCell>
                        <TableCell className={`text-right font-semibold ${profit < 0 ? 'text-red-600' : 'text-green-600'}`}>
                          Rp {profit.toLocaleString()}
                        </TableCell>
                        <TableCell className="text-center">
                           <Button 
                            variant="ghost" 
                            size="sm" 
                            onClick={() => handleClearCustomPrice(product.buyer_sku_code)}
                            disabled={isSaving || isRefreshing || isLoadingProducts || isLoadingInitialSettings || typeof customPrices[namespacedKey] === 'undefined'}
                            className="text-xs text-[var(--ui-text-muted)] hover:bg-destructive/10 hover:text-destructive dark:text-zinc-400"
                            title="Clear custom price & use default markup"
                           >
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
      <Card className={`${themedPanelClass} mt-6`}>
          <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg font-medium text-[var(--ui-accent)]">
                  <Lock className="h-5 w-5" />
                  Confirm Changes
              </CardTitle>
              <CardDescription className="text-[var(--ui-text-muted)] dark:text-zinc-400">
                  Enter your admin password to save all price settings to the database. This will save settings for Digiflazz and preserve existing settings for other providers.
              </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
              <div>
                  <Label htmlFor="admin-password-confirmation" className="text-sm font-medium text-[var(--ui-text)] dark:text-zinc-100">Admin Password</Label>
                  <Input
                      id="admin-password-confirmation"
                      type="password"
                      value={adminPasswordConfirmation}
                      onChange={(e) => setAdminPasswordConfirmation(e.target.value)}
                      placeholder="Enter your admin password"
                      className={`${themedInputClass} mt-1 border-[var(--ui-accent)]/30 focus-visible:ring-[var(--ui-accent)]`}
                      disabled={isSaving || isRefreshing || isLoadingProducts || isLoadingInitialSettings}
                  />
              </div>
              <Button 
                onClick={handleSaveSettings} 
                disabled={isSaving || isRefreshing || isLoadingProducts || isLoadingInitialSettings || !adminPasswordConfirmation} 
                className="w-full rounded-xl bg-[var(--ui-accent)] text-white hover:bg-[var(--ui-accent-hover)] sm:w-auto"
              >
                  {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                  Save All Settings to Database
              </Button>
          </CardContent>
      </Card>
    </div>
    </ProtectedRoute>
  );
}
