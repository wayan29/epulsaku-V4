// src/app/(app)/receipt/[transactionId]/page.tsx
"use client";

import { useEffect, useState, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { getTransactionByIdFromDB } from '@/lib/transaction-utils'; 
import type { Transaction } from '@/components/transactions/TransactionItem';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowLeft, Printer, CheckCircle2, XCircle, Loader2, Info, Share2 } from 'lucide-react';
import { productIconsMapping } from '@/components/transactions/TransactionItem';
import html2canvas from 'html2canvas';
import { useToast } from '@/hooks/use-toast';
import { getEffectiveSellingPrice } from '@/lib/price-settings-utils'; // Import the new utility
import { formatDateInTimezone } from '@/lib/timezone';

type PaperSize = "a4" | "thermal" | "dot-matrix" | "small";

const paperSizeOptions: { value: PaperSize; label: string }[] = [
  { value: "a4", label: "A4 Paper" },
  { value: "thermal", label: "Thermal Printer (80mm)" },
  { value: "dot-matrix", label: "Dot Matrix" },
  { value: "small", label: "Small Slip" },
];

export default function ReceiptPage() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const transactionId = params.transactionId as string;
  const [transaction, setTransaction] = useState<Transaction | null | undefined>(undefined); 
  const receiptContentRef = useRef<HTMLDivElement>(null);
  const [selectedPaperSize, setSelectedPaperSize] = useState<PaperSize>("a4");
  const [isLoading, setIsLoading] = useState(true);
  const [formattedDate, setFormattedDate] = useState<string>('');

  const [customSellingPrice, setCustomSellingPrice] = useState<number>(0);
  
  const themedPageCardClass =
    "border-[var(--ui-border)] bg-[var(--ui-card)] text-[var(--ui-text)] shadow-sm dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100";
  const themedMutedTextClass = "text-[var(--ui-text-muted)] dark:text-zinc-400";
  const themedOutlineButtonClass =
    "rounded-xl border-[var(--ui-border)] bg-[var(--ui-card-alt)] text-[var(--ui-text)] hover:bg-[var(--ui-accent-bg)] hover:text-[var(--ui-accent)] dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100";
  const themedPrimaryButtonClass =
    "rounded-xl bg-[var(--ui-accent)] text-white hover:bg-[var(--ui-accent-hover)]";
  const themedInputClass =
    "rounded-xl border-[var(--ui-input-border)] bg-[var(--ui-input-bg)] text-[var(--ui-text)] placeholder:text-[var(--ui-text-secondary)] focus-visible:ring-[var(--ui-accent)] dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100";


  useEffect(() => {
    async function fetchTransaction() {
      if (transactionId) {
        setIsLoading(true);
        const foundTransaction = await getTransactionByIdFromDB(transactionId);
        setTransaction(foundTransaction);
        setIsLoading(false);
      } else {
        setTransaction(null); 
        setIsLoading(false);
      }
    }
    fetchTransaction();
  }, [transactionId]);

  useEffect(() => {
    if (transaction) {
      setFormattedDate(formatDateInTimezone(transaction.timestamp));
      const price = getEffectiveSellingPrice(transaction.buyerSkuCode, transaction.provider, transaction.costPrice);
      setCustomSellingPrice(price);
    }
  }, [transaction]);


  const handlePrint = () => {
    const printContent = receiptContentRef.current;
    if (printContent) {
      const printWindow = window.open('', '_blank', 'height=800,width=800');
      if (printWindow) {
        printWindow.document.write('<html><head><title>Print Receipt</title>');
        
        const stylesheets = Array.from(document.styleSheets)
          .map(sheet => {
            try {
              return sheet.href ? `<link rel="stylesheet" href="${sheet.href}">` : '';
            } catch (e) {
              console.warn('Could not access stylesheet:', sheet.href, e);
              return '';
            }
          })
          .filter(Boolean)
          .join('');
        printWindow.document.write(stylesheets);

        printWindow.document.write(`
          <style>
            body { font-family: 'Inter', Arial, sans-serif; margin: 0; padding:0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            .receipt-container { margin: 20px; box-sizing: border-box; }
            .no-print-in-new-window { display: none !important; }
            .receipt-price-input { display: none !important; }
            .receipt-price-display { display: block !important; }
            .receipt-accent-text { color: var(--ui-accent, #8000FF) !important; }
            .receipt-success-text { color: #16A34A !important; }
            .receipt-header-surface, .receipt-accent-surface { background-color: var(--ui-accent-bg, rgba(128, 0, 255, 0.08)) !important; }
            .receipt-muted-surface { background-color: var(--ui-card-alt, #F0E6FF) !important; }
            .receipt-accent-border { border-color: color-mix(in srgb, var(--ui-accent, #8000FF) 25%, transparent) !important; }
            .receipt-muted-text { color: var(--ui-text-muted, #6b7280) !important; }
            @media print {
              body { margin:0; padding:0; background-color: white !important; color: black !important; }
              .no-print-in-new-window { display: none !important; }
              .receipt-container { margin: 0 !important; padding: 0 !important; width: 100%; box-sizing: border-box; }
              
              .print-a4 .receipt-container { width: 190mm; padding: 10mm; margin: auto;}

              .print-thermal .receipt-container { width: 72mm; font-size: 10pt; line-height: 1.3; margin: 0; padding: 4mm; }
              .print-thermal .text-lg { font-size: 11pt; }
              .print-thermal .text-xl { font-size: 12pt; }
              .print-thermal .text-2xl { font-size: 13pt; }
              .print-thermal .text-xs { font-size: 8pt; }
              .print-thermal .font-mono { font-family: 'Courier New', Courier, monospace; }
              .print-thermal .separator-line { border-top: 1px dashed #555 !important; margin: 6px 0 !important; } 
              .print-thermal .details-item { display: flex; justify-content: space-between; margin-bottom: 2px;}
              .print-thermal .details-item span:first-child { flex-basis: 40%; text-align: left; padding-right: 5px; }
              .print-thermal .details-item span:last-child { flex-basis: 60%; text-align: right; }
              .print-thermal .card-header { padding: 8px !important; text-align: center !important; }
              .print-thermal .card-content { padding: 8px !important; }
              .print-thermal .card-title { font-size: 13pt !important; }
              .print-thermal .icon-large { width: 32px !important; height: 32px !important; margin-bottom: 4px !important;}
              .print-thermal .icon-small { width: 16px !important; height: 16px !important; }
              .print-thermal .receipt-header-surface, .print-thermal .receipt-accent-surface, .print-thermal .receipt-muted-surface { background-color: transparent !important; }
              .print-thermal .receipt-accent-border, .print-thermal .border { border: none !important; }
              .print-thermal .shadow-lg { box-shadow: none !important; }
              .print-thermal .rounded-full, .print-thermal .rounded-t-lg, .print-thermal .rounded-md { border-radius: 0 !important; }
              .print-thermal .receipt-accent-text, .print-thermal .receipt-success-text { color: black !important; }
              .print-thermal .receipt-muted-text { color: #333 !important; }

              .print-dot-matrix .receipt-container { width: 100%; font-family: 'Courier New', Courier, monospace; font-size: 10pt; padding: 5mm; }
              .print-dot-matrix .separator-line { border-top: 1px solid #333 !important; margin: 5px 0 !important; }
              .print-dot-matrix .receipt-header-surface, .print-dot-matrix .receipt-accent-surface, .print-dot-matrix .receipt-muted-surface { background-color: transparent !important; }
              .print-dot-matrix .receipt-accent-border, .print-dot-matrix .border { border: none !important; }
              .print-dot-matrix .shadow-lg { box-shadow: none !important; }
              .print-dot-matrix .receipt-accent-text, .print-dot-matrix .receipt-success-text { color: black !important; }

              .print-small .receipt-container { width: 90mm; font-size: 9pt; padding: 5mm; margin: auto; }
              .print-small .separator-line { border-top: 1px dashed #777 !important; margin: 6px 0 !important; }
            }
          </style>
        `);
        
        printWindow.document.write(`</head><body class="print-${selectedPaperSize}">`);
        printWindow.document.write('<div class="receipt-container">');
        const clonedContent = printContent.cloneNode(true) as HTMLElement;
        if (selectedPaperSize === 'thermal') {
            const mainIcon = clonedContent.querySelector('.receipt-success-icon');
            if (mainIcon) {
                mainIcon.classList.remove('h-16', 'w-16');
                mainIcon.classList.add('icon-large');
            }
            const productIconElement = clonedContent.querySelector('.receipt-product-icon');
            if (productIconElement) {
                productIconElement.classList.remove('h-6', 'w-6');
                productIconElement.classList.add('icon-small');
            }
        }
        printWindow.document.write(clonedContent.innerHTML);
        printWindow.document.write('</div>');
        printWindow.document.write('</body></html>');
        printWindow.document.close();
        
        printWindow.onload = function() {
          setTimeout(() => { 
            printWindow.focus();
            printWindow.print();
            // printWindow.close(); // Consider closing after print
          }, 250);
        };
      } else {
        toast({ title: "Print Error", description: "Could not open print window. Please check your browser's popup blocker settings.", variant: "destructive" });
      }
    }
  };

  const handleShare = async () => {
    if (!transaction || !receiptContentRef.current) {
      toast({ title: "Share Error", description: "Receipt data not available.", variant: "destructive" });
      return;
    }

    const shareData = {
      title: `Receipt: ${transaction.productName}`,
      text: `My ePulsaku receipt for ${transaction.productName} (Rp ${customSellingPrice.toLocaleString()}). Transaction ID: ${transaction.id.slice(-8)}. SN: ${transaction.serialNumber || 'N/A'}`,
      url: window.location.href,
    };

    if (navigator.share) {
      try {
        await navigator.share(shareData);
        toast({ title: "Shared Successfully", description: "Receipt details shared." });
      } catch (error) {
        if ((error as Error).name !== 'AbortError') {
          console.error('Error sharing:', error);
          toast({ title: "Share Failed", description: (error as Error).message || "Could not share the receipt using native share.", variant: "destructive" });
          downloadReceiptAsImage();
        } 
      }
    } else {
      toast({ title: "Native Share Not Supported", description: "Downloading receipt as an image instead.", variant: "default" });
      downloadReceiptAsImage();
    }
  };

  const downloadReceiptAsImage = async () => {
    if (!receiptContentRef.current || !transaction) return;
    try {
      const canvas = await html2canvas(receiptContentRef.current, {
        scale: 2, 
        useCORS: true, 
        backgroundColor: null, 
      });
      const image = canvas.toDataURL("image/png", 1.0);
      const link = document.createElement('a');
      link.href = image;
      link.download = `ePulsaku_Receipt_${transaction.id.slice(-6)}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      toast({ title: "Download Started", description: "Receipt image is downloading." });
    } catch (error) {
      console.error("Error generating receipt image:", error);
      toast({ title: "Download Failed", description: "Could not generate receipt image.", variant: "destructive" });
    }
  };


  if (isLoading || transaction === undefined) { 
    return (
      <div className={`flex min-h-[calc(100vh-200px)] flex-col items-center justify-center ${themedMutedTextClass}`}>
        <Loader2 className="mb-4 h-12 w-12 animate-spin text-[var(--ui-accent)]" />
        <p className="text-lg">Loading receipt...</p>
      </div>
    );
  }

  if (!transaction) { 
    return (
      <div className="mx-auto flex min-h-[calc(100vh-200px)] max-w-md items-center justify-center px-4">
        <Card className={`w-full rounded-3xl ${themedPageCardClass}`}>
          <CardContent className="flex flex-col items-center px-6 py-10 text-center">
            <XCircle className="mb-4 h-16 w-16 text-destructive" />
            <h1 className="mb-2 text-2xl font-bold text-[var(--ui-text)] dark:text-zinc-100">Transaction Not Found</h1>
            <p className={`mb-6 ${themedMutedTextClass}`}>The transaction ID provided does not match any recorded transaction.</p>
            <Button onClick={() => router.push('/transactions')} className={themedPrimaryButtonClass}>
              <ArrowLeft className="mr-2 h-4 w-4" /> Go to Transactions
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }
  
  if (transaction.status !== "Sukses") {
     return (
      <div className="mx-auto flex min-h-[calc(100vh-200px)] max-w-md items-center justify-center px-4">
        <Card className={`w-full rounded-3xl ${themedPageCardClass}`}>
          <CardContent className="flex flex-col items-center px-6 py-10 text-center">
            <Info className="mb-4 h-16 w-16 text-yellow-500" />
            <h1 className="mb-2 text-2xl font-bold text-[var(--ui-text)] dark:text-zinc-100">Receipt Not Available</h1>
            <p className={`mb-6 ${themedMutedTextClass}`}>
              A receipt can only be generated for successful transactions. This transaction is currently:{" "}
              <strong className={
                transaction.status === "Pending" ? "text-yellow-600" :
                transaction.status === "Gagal" ? "text-red-600" : ""
              }>{transaction.status}</strong>.
            </p>
            <Button onClick={() => router.push('/transactions')} className={themedPrimaryButtonClass}>
              <ArrowLeft className="mr-2 h-4 w-4" /> Go to Transactions
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const ProductIcon = productIconsMapping[transaction.iconName] || productIconsMapping['Default'];

  return (
    <div className="mx-auto max-w-md px-4 py-8">
      <Button variant="outline" onClick={() => router.back()} className={`mb-6 ${themedOutlineButtonClass}`}>
        <ArrowLeft className="mr-2 h-4 w-4" /> Back
      </Button>

      <div id="receipt-content-printable" ref={receiptContentRef}> 
        <Card className={`receipt-accent-border overflow-hidden rounded-3xl border shadow-lg ${themedPageCardClass}`}>
          <CardHeader className="receipt-header-surface card-header rounded-t-3xl px-6 pb-4 pt-6 text-center">
            <div className="mx-auto mb-3">
               <CheckCircle2 className="receipt-success-icon icon-large h-16 w-16 text-green-500" />
            </div>
            <CardTitle className="receipt-accent-text card-title text-2xl font-bold">Transaction Successful</CardTitle>
            <CardDescription className={`receipt-muted-text text-sm ${themedMutedTextClass}`}>Receipt ID: {transaction.id}</CardDescription>
          </CardHeader>
          <CardContent className="card-content space-y-4 p-6 text-[var(--ui-text)] dark:text-zinc-100">
            <div className="flex items-center space-x-3">
              <div className="receipt-accent-surface rounded-full p-2">
                <ProductIcon className="receipt-accent-text receipt-product-icon icon-small h-6 w-6" />
              </div>
              <div>
                <p className="text-lg font-semibold text-[var(--ui-text)] dark:text-zinc-100">{transaction.productName}</p>
                <p className={`receipt-muted-text text-sm ${themedMutedTextClass}`}>{transaction.details}</p>
              </div>
            </div>

            <Separator className="separator-line bg-[var(--ui-border)] dark:bg-zinc-800" />

            <div className="space-y-2 text-sm">
              <div className="details-item flex justify-between">
                <span className={`receipt-muted-text ${themedMutedTextClass}`}>Status:</span>
                <span className="receipt-success-text font-semibold">{transaction.status}</span>
              </div>
              <div className="details-item flex justify-between">
                <span className={`receipt-muted-text ${themedMutedTextClass}`}>Date & Time:</span>
                <span className="font-medium text-[var(--ui-text)] dark:text-zinc-100">{formattedDate || 'Loading...'}</span>
              </div>
              {transaction.productCategoryFromProvider && (
                  <div className="details-item flex justify-between pt-1 text-xs">
                      <span className={`receipt-muted-text ${themedMutedTextClass}`}>Category:</span>
                      <span className="text-[var(--ui-text)] dark:text-zinc-100">{transaction.productCategoryFromProvider}</span>
                  </div>
              )}
              {transaction.productBrandFromProvider && (
                  <div className="details-item flex justify-between text-xs">
                      <span className={`receipt-muted-text ${themedMutedTextClass}`}>Brand:</span>
                      <span className="text-[var(--ui-text)] dark:text-zinc-100">{transaction.productBrandFromProvider}</span>
                  </div>
              )}
               <div className="details-item flex flex-col justify-between pt-2 sm:flex-row sm:items-center">
                <span className={`receipt-muted-text mb-1 sm:mb-0 ${themedMutedTextClass}`}>Total Payment:</span>
                <div className="receipt-price-input">
                  <Input 
                    type="number"
                    value={customSellingPrice}
                    onChange={(e) => setCustomSellingPrice(Number(e.target.value))}
                    className={`receipt-accent-text h-9 w-full p-1 text-right text-lg font-bold sm:max-w-[150px] ${themedInputClass}`}
                  />
                </div>
                <span className="receipt-accent-text receipt-price-display hidden text-lg font-bold">
                  Rp {customSellingPrice.toLocaleString()}
                </span>
              </div>
              {transaction.serialNumber && (
                <div className="pt-3">
                  <p className={`receipt-muted-text mb-1 text-xs ${themedMutedTextClass}`}>Serial Number (SN) / Token:</p>
                  <div className="receipt-muted-surface rounded-md border border-[var(--ui-border)] p-3 text-center dark:border-zinc-800">
                    <p className="receipt-accent-text break-all font-mono text-lg font-semibold">{transaction.serialNumber}</p>
                  </div>
                </div>
              )}
            </div>
            
            <Separator className="separator-line my-6 bg-[var(--ui-border)] dark:bg-zinc-800" />
            
            <p className={`receipt-muted-text text-center text-xs ${themedMutedTextClass}`}>
              Thank you for your purchase at ePulsaku!
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="no-print mt-6 space-y-3">
        <div>
          <Label htmlFor="paper-size-select" className="text-sm font-medium text-[var(--ui-text)] dark:text-zinc-100">Paper Size (for Print)</Label>
          <Select value={selectedPaperSize} onValueChange={(value) => setSelectedPaperSize(value as PaperSize)}>
            <SelectTrigger id="paper-size-select" className={`mt-1 w-full ${themedInputClass}`}>
              <SelectValue placeholder="Select paper size" />
            </SelectTrigger>
            <SelectContent className="border-[var(--ui-border)] bg-[var(--ui-card)] text-[var(--ui-text)] dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100">
              {paperSizeOptions.map(option => (
                <SelectItem key={option.value} value={option.value} className="focus:bg-[var(--ui-accent-bg)] focus:text-[var(--ui-accent)] dark:focus:bg-zinc-900">
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Button onClick={handlePrint} className={`w-full ${themedPrimaryButtonClass}`}>
            <Printer className="mr-2 h-4 w-4" /> Print
          </Button>
          <Button onClick={handleShare} className={`w-full ${themedOutlineButtonClass}`} variant="outline">
            <Share2 className="mr-2 h-4 w-4" /> Share
          </Button>
        </div>
      </div>
    </div>
  );
}
