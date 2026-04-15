// src/app/(app)/profit-report/page.tsx
"use client";

import { useState, useEffect, useMemo, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DollarSign, TrendingUp, TrendingDown, Loader2, AlertTriangle, CalendarIcon as CalendarIconLucide, FilterX, Settings, Printer, ChevronLeft, ChevronRight, Download, FileText, FileSpreadsheet } from "lucide-react";
import { getTransactionsFromDB, type Transaction } from "@/lib/transaction-utils";
import { DateRange } from "react-day-picker";
import { 
  format as formatDateFns, 
  isWithinInterval, 
  startOfDay, 
  endOfDay, 
  isValid, 
  startOfWeek, 
  endOfWeek, 
  startOfMonth, 
  endOfMonth, 
  startOfYear, 
  endOfYear, 
} from "date-fns";
import { useToast } from '@/hooks/use-toast';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import ProtectedRoute from '@/components/core/ProtectedRoute';
import { getEffectiveSellingPrice } from '@/lib/price-settings-utils';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import { formatDateInTimezone } from '@/lib/timezone';

// Extend the jsPDF type to include the autoTable method from the plugin
declare module 'jspdf' {
  interface jsPDF {
    autoTable: (options: any) => jsPDF;
  }
}

export default function ProfitReportPage() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
  const [activeFilterLabel, setActiveFilterLabel] = useState<string>("");
  const { toast } = useToast();
  const printRef = useRef<HTMLDivElement>(null);

  const [currentPage, setCurrentPage] = useState<number>(1);
  const [itemsPerPage] = useState<number>(50); // Items per page for display, print/download will show all

  useEffect(() => {
    async function loadData() {
        setIsLoading(true);
        setError(null);
        try {
          const dbTxs = await getTransactionsFromDB();
          setTransactions(dbTxs);
        } catch (e) {
          console.error("Error loading transactions for profit report:", e);
          setError("Failed to load transaction data from database.");
          toast({ title: "Error", description: "Could not load transaction data.", variant: "destructive" });
        } finally {
          setIsLoading(false);
        }
    }
    loadData();
    // Set default date range on client-side only to avoid hydration mismatch
    setDateRange({ from: startOfMonth(new Date()), to: endOfMonth(new Date()) });
    setActiveFilterLabel("This Month");
  }, [toast]);

  const filteredSuccessfulTransactions = useMemo(() => {
    let successfulTxs = transactions.filter(tx => tx.status === "Sukses");

    if (dateRange?.from) {
      const fromDate = startOfDay(dateRange.from);
      const toDate = dateRange.to ? endOfDay(dateRange.to) : endOfDay(dateRange.from);
      
      if (!isValid(fromDate) || !isValid(toDate)) {
        return successfulTxs; 
      }

      successfulTxs = successfulTxs.filter(tx => {
        const txDate = new Date(tx.timestamp);
        return isValid(txDate) && isWithinInterval(txDate, { start: fromDate, end: toDate });
      });
    }
    return successfulTxs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }, [transactions, dateRange]);

  const { paginatedTransactions, totalPages } = useMemo(() => {
    const total = Math.ceil(filteredSuccessfulTransactions.length / itemsPerPage);
    const start = (currentPage - 1) * itemsPerPage;
    const end = currentPage * itemsPerPage;
    return {
        paginatedTransactions: filteredSuccessfulTransactions.slice(start, end),
        totalPages: total > 0 ? total : 1, 
    };
  }, [filteredSuccessfulTransactions, currentPage, itemsPerPage]);

  const reportData = useMemo(() => {
    const totalRevenue = filteredSuccessfulTransactions.reduce((sum, tx) => sum + getEffectiveSellingPrice(tx.buyerSkuCode, tx.provider, tx.costPrice), 0);
    const totalCost = filteredSuccessfulTransactions.reduce((sum, tx) => sum + tx.costPrice, 0);
    const totalProfit = totalRevenue - totalCost;
    
    return {
      totalRevenue,
      totalCost,
      totalProfit,
      numberOfSuccessfulTransactions: filteredSuccessfulTransactions.length,
    };
  }, [filteredSuccessfulTransactions]);

  const setDateFilter = (range: DateRange | undefined, label: string) => {
    setDateRange(range);
    setActiveFilterLabel(label);
    setCurrentPage(1);
  };

  const clearFilters = () => {
    setDateFilter(undefined, "Overall");
  };

  const handlePrint = () => {
    const printContent = printRef.current?.innerHTML;
    if (printContent) {
        const printWindow = window.open('', '_blank');
        if (printWindow) {
            printWindow.document.write(`
            <html><head><title>Laporan Profit & Statement - ${activeFilterLabel}</title>
            <style>
                body { font-family: Arial, sans-serif; margin: 20px; } table { width: 100%; border-collapse: collapse; font-size: 10pt; }
                th, td { border: 1px solid #ddd; padding: 6px; text-align: left; } th { background-color: #f2f2f2; }
                h1, h2, h3 { color: #333; } .no-print { display: none; } .print-only { display: block; }
                .summary-card { border: 1px solid #eee; padding: 15px; margin-bottom: 20px; border-radius: 8px; break-inside: avoid; }
                .summary-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 20px; }
                .summary-card .card-header { padding: 0 !important; } .summary-card .card-content { padding-top: 8px !important; padding-left: 0 !important; padding-right: 0 !important; padding-bottom: 0 !important; }
                .summary-card h3 { margin: 0 0 5px 0; font-size: 12pt; color: #555; } .summary-card p { margin: 0; font-size: 16pt; font-weight: bold; }
                @media print { .page-break { page-break-after: always; } }
            </style></head><body>
            <h1>Laporan Profit & Statement</h1><h3>Periode: ${activeFilterLabel}</h3><hr style="margin: 20px 0;" />${printContent}</body></html>`);
            printWindow.document.close();
            printWindow.focus();
            setTimeout(() => { printWindow.print(); printWindow.close(); }, 250);
        }
    }
  };

  const handleDownloadPDF = () => {
    const doc = new jsPDF();
    const tableData = filteredSuccessfulTransactions.map(tx => {
        const effectiveSellingPrice = getEffectiveSellingPrice(tx.buyerSkuCode, tx.provider, tx.costPrice);
        const profit = effectiveSellingPrice - tx.costPrice;
        return [
            formatDateInTimezone(tx.timestamp, "dd/MM/yy HH:mm"),
            tx.productName,
            tx.details,
            tx.transactedBy || 'N/A',
            tx.costPrice,
            effectiveSellingPrice,
            profit,
        ];
    });

    doc.setFontSize(18);
    doc.text(`Laporan Profit - Periode: ${activeFilterLabel}`, 14, 22);
    doc.setFontSize(11);
    doc.setTextColor(100);
    doc.text(`Total Pendapatan: Rp ${reportData.totalRevenue.toLocaleString()}`, 14, 32);
    doc.text(`Total Modal: Rp ${reportData.totalCost.toLocaleString()}`, 14, 38);
    doc.text(`Total Profit: Rp ${reportData.totalProfit.toLocaleString()}`, 14, 44);

    doc.autoTable({
        startY: 50,
        head: [['Tanggal', 'Produk', 'Detail', 'User', 'Modal', 'Jual', 'Profit']],
        body: tableData,
        headStyles: { fillColor: [41, 128, 185], textColor: 255 },
        styles: { fontSize: 8 },
        columnStyles: {
            4: { halign: 'right' },
            5: { halign: 'right' },
            6: { halign: 'right' },
        }
    });

    doc.save(`Laporan_Profit_${activeFilterLabel.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`);
  };

  const handleDownloadCSV = () => {
    const headers = ['Tanggal', 'Produk', 'Detail', 'User', 'Modal', 'Jual', 'Profit'];
    const csvContent = [
        headers.join(','),
        ...filteredSuccessfulTransactions.map(tx => {
            const effectiveSellingPrice = getEffectiveSellingPrice(tx.buyerSkuCode, tx.provider, tx.costPrice);
            const profit = effectiveSellingPrice - tx.costPrice;
            const row = [
                `"${formatDateInTimezone(tx.timestamp, "dd/MM/yy HH:mm")}"`,
                `"${tx.productName.replace(/"/g, '""')}"`,
                `"${tx.details.replace(/"/g, '""')}"`,
                `"${tx.transactedBy || 'N/A'}"`,
                tx.costPrice,
                effectiveSellingPrice,
                profit,
            ];
            return row.join(',');
        })
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    if (link.download !== undefined) {
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', `Laporan_Profit_${activeFilterLabel.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
  };


  useEffect(() => {
    if (currentPage > totalPages && totalPages > 0) { 
        setCurrentPage(totalPages);
    } else if (currentPage === 0 && totalPages > 0) {
        setCurrentPage(1);
    } else if (totalPages === 1 && currentPage !==1){ 
        setCurrentPage(1);
    }
  }, [totalPages, currentPage]);

  if (isLoading) {
    return (
      <div className="flex min-h-[calc(100vh-200px)] flex-col items-center justify-center text-[var(--ui-text-muted)] dark:text-zinc-400">
        <Loader2 className="mb-4 h-12 w-12 animate-spin text-[var(--ui-accent)]" />
        <p className="text-lg">Calculating profit report...</p>
      </div>
    );
  }

  if (error) {
     return (
      <Card className="border-destructive bg-destructive/10 py-10 text-center shadow">
        <CardHeader>
          <CardTitle className="text-destructive flex items-center justify-center gap-2">
            <AlertTriangle className="h-6 w-6" /> Error Loading Report
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-destructive/90">{error}</p>
        </CardContent>
      </Card>
    );
  }

  const today = new Date();

  return (
    <ProtectedRoute requiredPermission='laporan_profit'>
    <div className="mx-auto max-w-7xl space-y-8 pb-10">
      <section className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-[var(--ui-accent-gradient-from)] to-[var(--ui-accent-gradient-to)] text-white shadow-lg">
            <DollarSign className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-serif font-bold tracking-tight text-[var(--ui-text)] dark:text-zinc-100 sm:text-3xl">Laporan Profit & Statement</h1>
            <p className="mt-1 text-sm text-[var(--ui-text-muted)] dark:text-zinc-400">Lihat performa pendapatan, modal, dan profit dengan tampilan yang mengikuti UI theme global.</p>
          </div>
        </div>
         <div className="flex flex-col sm:flex-row items-center gap-2 w-full sm:w-auto">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="w-full rounded-xl border-[var(--ui-accent)]/20 text-[var(--ui-accent)] hover:bg-[var(--ui-accent)]/10 hover:text-[var(--ui-accent-hover)]"><Download className="mr-2 h-4 w-4" /> Download Laporan</Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="border-[var(--ui-border)] bg-[var(--ui-card)] text-[var(--ui-text)] dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100">
                <DropdownMenuItem onClick={handlePrint} disabled={filteredSuccessfulTransactions.length === 0} className="focus:bg-[var(--ui-accent-bg)] focus:text-[var(--ui-accent)]">
                  <Printer className="mr-2 h-4 w-4"/> Cetak Laporan
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleDownloadPDF} disabled={filteredSuccessfulTransactions.length === 0} className="focus:bg-[var(--ui-accent-bg)] focus:text-[var(--ui-accent)]">
                  <FileText className="mr-2 h-4 w-4"/> Download PDF
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleDownloadCSV} disabled={filteredSuccessfulTransactions.length === 0} className="focus:bg-[var(--ui-accent-bg)] focus:text-[var(--ui-accent)]">
                  <FileSpreadsheet className="mr-2 h-4 w-4"/> Download CSV (Excel)
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button asChild className="w-full rounded-xl bg-[var(--ui-accent)] text-white hover:bg-[var(--ui-accent-hover)]">
            <Link href="/price-settings">
                <Settings className="mr-2 h-4 w-4" />
                Price Settings
            </Link>
            </Button>
        </div>
      </section>
      
      <Card className="relative overflow-hidden rounded-3xl border-[var(--ui-border)] bg-[var(--ui-surface)] shadow-md no-print dark:border-zinc-800 dark:bg-zinc-950">
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-[var(--ui-top-bar-from)] via-[var(--ui-top-bar-via)] to-[var(--ui-accent-gradient-to)] opacity-80" />
        <CardHeader className="px-6 pt-6 sm:px-8">
          <CardTitle className="text-xl font-headline text-[var(--ui-text)] dark:text-zinc-100">Filter Laporan</CardTitle>
          <CardDescription className="text-[var(--ui-text-muted)] dark:text-zinc-400">Pilih periode untuk melihat laporan profit dan detail transaksi.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 px-6 pb-6 sm:px-8 sm:pb-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-end">
            <div>
              <Label htmlFor="date-filter-popover" className="text-sm font-medium text-[var(--ui-text)] dark:text-zinc-100">Rentang Tanggal Custom</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    id="date-filter-popover"
                    variant={"outline"}
                    className={`mt-1 w-full justify-start rounded-xl border-[var(--ui-input-border)] bg-[var(--ui-input-bg)] text-left font-normal text-[var(--ui-text)] hover:bg-[var(--ui-accent-bg)] hover:text-[var(--ui-accent)] dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 ${!dateRange?.from && "text-[var(--ui-text-secondary)] dark:text-zinc-500"}`}
                  >
                    <CalendarIconLucide className="mr-2 h-4 w-4" />
                    {dateRange?.from ? (
                      dateRange.to ? (
                        <>
                          {formatDateFns(dateRange.from, "LLL dd, y")} - {formatDateFns(dateRange.to, "LLL dd, y")}
                        </>
                      ) : (
                        formatDateFns(dateRange.from, "LLL dd, y")
                      )
                    ) : (
                      <span>Pilih tanggal</span>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto border-[var(--ui-border)] bg-[var(--ui-card)] p-0 dark:border-zinc-800 dark:bg-zinc-950" align="start">
                  <Calendar
                    initialFocus
                    mode="range"
                    defaultMonth={dateRange?.from}
                    selected={dateRange}
                    onSelect={(newRange) => setDateFilter(newRange, newRange?.from && newRange?.to ? `${formatDateFns(newRange.from, "dd/MM/yy")} - ${formatDateFns(newRange.to, "dd/MM/yy")}` : newRange?.from ? formatDateFns(newRange.from, "dd/MM/yy") : "Custom Range")}
                    numberOfMonths={2}
                  />
                </PopoverContent>
              </Popover>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 pt-2 md:pt-0">
              <Button variant="outline" onClick={() => setDateFilter({ from: startOfDay(today), to: endOfDay(today) }, "Today")} className={`w-full rounded-xl ${activeFilterLabel === 'Today' ? 'border-[var(--ui-accent)] bg-[var(--ui-accent)] text-white hover:bg-[var(--ui-accent-hover)]' : 'border-[var(--ui-border)] bg-[var(--ui-card-alt)] text-[var(--ui-text)] hover:bg-[var(--ui-accent-bg)] hover:text-[var(--ui-accent)] dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100'}`}>Hari Ini</Button>
              <Button variant="outline" onClick={() => setDateFilter({ from: startOfWeek(today), to: endOfWeek(today) }, "This Week")} className={`w-full rounded-xl ${activeFilterLabel === 'This Week' ? 'border-[var(--ui-accent)] bg-[var(--ui-accent)] text-white hover:bg-[var(--ui-accent-hover)]' : 'border-[var(--ui-border)] bg-[var(--ui-card-alt)] text-[var(--ui-text)] hover:bg-[var(--ui-accent-bg)] hover:text-[var(--ui-accent)] dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100'}`}>Minggu Ini</Button>
              <Button variant="outline" onClick={() => setDateFilter({ from: startOfMonth(today), to: endOfMonth(today) }, "This Month")} className={`w-full rounded-xl ${activeFilterLabel === 'This Month' ? 'border-[var(--ui-accent)] bg-[var(--ui-accent)] text-white hover:bg-[var(--ui-accent-hover)]' : 'border-[var(--ui-border)] bg-[var(--ui-card-alt)] text-[var(--ui-text)] hover:bg-[var(--ui-accent-bg)] hover:text-[var(--ui-accent)] dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100'}`}>Bulan Ini</Button>
              <Button variant="outline" onClick={() => setDateFilter({ from: startOfYear(today), to: endOfYear(today) }, "This Year")} className={`w-full rounded-xl ${activeFilterLabel === 'This Year' ? 'border-[var(--ui-accent)] bg-[var(--ui-accent)] text-white hover:bg-[var(--ui-accent-hover)]' : 'border-[var(--ui-border)] bg-[var(--ui-card-alt)] text-[var(--ui-text)] hover:bg-[var(--ui-accent-bg)] hover:text-[var(--ui-accent)] dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100'}`}>Tahun Ini</Button>
            </div>
          </div>
          { (dateRange) && (
            <Button onClick={clearFilters} variant="ghost" className="w-full rounded-xl text-destructive hover:bg-destructive/10 hover:text-destructive sm:w-auto">
              <FilterX className="mr-2 h-4 w-4" />
              Reset Filter Tanggal (Tampilkan Semua)
            </Button>
          )}
        </CardContent>
      </Card>
      
      <div ref={printRef}>
          <div className="print-content">
            <CardDescription className="mb-4 text-[var(--ui-text-muted)] dark:text-zinc-400">
                Menampilkan <span className="font-semibold text-[var(--ui-accent)]">{reportData.numberOfSuccessfulTransactions}</span> transaksi SUKSES untuk periode <span className="font-semibold text-[var(--ui-accent)]">{activeFilterLabel}</span>.
            </CardDescription>

            <div className="grid gap-6 md:grid-cols-3 summary-grid">
                <Card className="summary-card rounded-3xl border-[var(--ui-border)] bg-[var(--ui-card)] shadow-md dark:border-zinc-800 dark:bg-zinc-950">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium text-[var(--ui-text-muted)] dark:text-zinc-400">Total Pendapatan (Jual)</CardTitle>
                        <TrendingUp className="h-5 w-5 text-green-500" />
                    </CardHeader>
                    <CardContent>
                        <p className="text-2xl font-bold text-green-600">Rp {reportData.totalRevenue.toLocaleString()}</p>
                    </CardContent>
                </Card>
                <Card className="summary-card rounded-3xl border-[var(--ui-border)] bg-[var(--ui-card)] shadow-md dark:border-zinc-800 dark:bg-zinc-950">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium text-[var(--ui-text-muted)] dark:text-zinc-400">Total Modal (Beli)</CardTitle>
                        <TrendingDown className="h-5 w-5 text-red-500" />
                    </CardHeader>
                    <CardContent>
                        <p className="text-2xl font-bold text-red-600">Rp {reportData.totalCost.toLocaleString()}</p>
                    </CardContent>
                </Card>
                <Card className="summary-card rounded-3xl border-[var(--ui-accent)]/30 bg-[var(--ui-card)] shadow-md dark:border-zinc-800 dark:bg-zinc-950">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium text-[var(--ui-accent)]">Total Profit</CardTitle>
                        <DollarSign className="h-5 w-5 text-[var(--ui-accent)]" />
                    </CardHeader>
                    <CardContent>
                        <p className={`text-2xl font-bold ${reportData.totalProfit >= 0 ? 'text-[var(--ui-accent)]' : 'text-destructive'}`}>Rp {reportData.totalProfit.toLocaleString()}</p>
                    </CardContent>
                </Card>
            </div>
          
            <Card className="mt-8 rounded-3xl border-[var(--ui-border)] bg-[var(--ui-card)] shadow-md dark:border-zinc-800 dark:bg-zinc-950">
                <CardHeader><CardTitle className="text-lg text-[var(--ui-text)] dark:text-zinc-100">Detail Transaksi Sukses</CardTitle></CardHeader>
                <CardContent>
                {filteredSuccessfulTransactions.length > 0 ? (
                    <div className="overflow-x-auto rounded-2xl border border-[var(--ui-border)] dark:border-zinc-800">
                        <Table className="text-[var(--ui-text)] dark:text-zinc-100">
                            <TableHeader className="[&_tr]:border-[var(--ui-border)] dark:[&_tr]:border-zinc-800">
                            <TableRow className="bg-[var(--ui-card-alt)] hover:bg-[var(--ui-card-alt)] dark:bg-zinc-900 dark:hover:bg-zinc-900">
                                <TableHead className="min-w-[150px] text-[var(--ui-text-muted)] dark:text-zinc-400">Tanggal</TableHead>
                                <TableHead className="text-[var(--ui-text-muted)] dark:text-zinc-400">Produk</TableHead>
                                <TableHead className="text-[var(--ui-text-muted)] dark:text-zinc-400">Detail</TableHead>
                                <TableHead className="text-[var(--ui-text-muted)] dark:text-zinc-400">User</TableHead>
                                <TableHead className="text-right text-[var(--ui-text-muted)] dark:text-zinc-400">Modal</TableHead>
                                <TableHead className="text-right text-[var(--ui-text-muted)] dark:text-zinc-400">Jual</TableHead>
                                <TableHead className="text-right text-[var(--ui-text-muted)] dark:text-zinc-400">Profit</TableHead>
                            </TableRow>
                            </TableHeader>
                            <TableBody>
                            {(paginatedTransactions).map((tx) => {
                                const effectiveSellingPrice = getEffectiveSellingPrice(tx.buyerSkuCode, tx.provider, tx.costPrice);
                                const profit = effectiveSellingPrice - tx.costPrice;
                                return (
                                <TableRow key={tx.id} className="border-[var(--ui-border)] hover:bg-[var(--ui-accent-bg)] dark:border-zinc-800 dark:hover:bg-zinc-900/70">
                                <TableCell>{formatDateInTimezone(tx.timestamp)}</TableCell>
                                <TableCell>{tx.productName}</TableCell>
                                <TableCell className="text-[var(--ui-text-muted)] dark:text-zinc-400">{tx.details}</TableCell>
                                <TableCell>{tx.transactedBy || 'N/A'}</TableCell>
                                <TableCell className="text-right">Rp {tx.costPrice.toLocaleString()}</TableCell>
                                <TableCell className="text-right font-medium text-[var(--ui-accent)]">Rp {effectiveSellingPrice.toLocaleString()}</TableCell>
                                <TableCell className="text-right font-medium text-green-600">Rp {profit.toLocaleString()}</TableCell>
                                </TableRow>
                               );
                            })}
                            </TableBody>
                        </Table>
                    </div>
                ) : (
                    <p className="py-4 text-center text-[var(--ui-text-muted)] dark:text-zinc-400">Tidak ada transaksi sukses pada periode ini.</p>
                )}
                </CardContent>
            </Card>
        </div>
      </div>

      {!isLoading && filteredSuccessfulTransactions.length > 0 && totalPages > 1 && (
        <div className="mt-6 flex items-center justify-between border-t border-[var(--ui-border)] pt-4 no-print dark:border-zinc-800">
          <Button variant="outline" size="sm" onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))} disabled={currentPage === 1} className="rounded-xl border-[var(--ui-border)] bg-[var(--ui-card-alt)] text-[var(--ui-text)] hover:bg-[var(--ui-accent-bg)] hover:text-[var(--ui-accent)] dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100">
            <ChevronLeft className="h-4 w-4 mr-1" /> Previous
          </Button>
          <span className="text-sm text-[var(--ui-text-muted)] dark:text-zinc-400">Page {currentPage} of {totalPages}</span>
          <Button variant="outline" size="sm" onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))} disabled={currentPage === totalPages} className="rounded-xl border-[var(--ui-border)] bg-[var(--ui-card-alt)] text-[var(--ui-text)] hover:bg-[var(--ui-accent-bg)] hover:text-[var(--ui-accent)] dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100">
            Next <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      )}

      <Card className="mt-8 rounded-3xl border-[var(--ui-border)] bg-[var(--ui-card)] shadow-md no-print dark:border-zinc-800 dark:bg-zinc-950">
        <CardHeader>
          <CardTitle className="text-lg text-[var(--ui-text)] dark:text-zinc-100">Catatan Laporan</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-[var(--ui-text-muted)] dark:text-zinc-400">
          <div>
            - Laporan ini hanya mencakup transaksi dengan status <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-xs text-emerald-700 dark:text-emerald-300">Sukses</Badge>.
          </div>
          <div>
            - Profit dihitung sebagai (Harga Jual - Harga Modal) untuk setiap transaksi. Harga jual ditentukan oleh pengaturan harga custom Anda atau markup default jika tidak diatur.
          </div>
          <div>
            - Gunakan tombol "Cetak Laporan" untuk mencetak atau menyimpan sebagai PDF. Tampilan cetak akan disesuaikan untuk keterbacaan.
          </div>
        </CardContent>
      </Card>
    </div>
    </ProtectedRoute>
  );
}
