
"use client";

import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";
import Image from 'next/image';
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { verifyPin } from '@/ai/flows/verify-pin-flow';
import {
    createTokoVoucherDeposit,
    type CreateTokoVoucherDepositOutput,
    type TokoVoucherPaymentMethodCode
} from "@/ai/flows/tokovoucher/createTokoVoucherDeposit-flow";
import { PiggyBank, Landmark, KeyRound, Info, CheckCircle, AlertTriangle, Copy, Loader2, QrCode, CreditCard } from "lucide-react";

const baseTokoVoucherDepositFormSchema = z.object({
  nominal: z.number().min(10000, "Minimum deposit Rp 10,000").describe('The amount of deposit requested.'),
  kode_bayar: z.enum(["bca", "qris", "briva"] as [TokoVoucherPaymentMethodCode, ...TokoVoucherPaymentMethodCode[]]).describe('Payment method code.'),
});

const tokoVoucherDepositFormSchema = baseTokoVoucherDepositFormSchema.extend({
  pin: z.string().length(6, "PIN must be 6 digits").regex(/^\d+$/, "PIN must be only digits"),
});

type TokoVoucherDepositFormValues = z.infer<typeof tokoVoucherDepositFormSchema>;

interface TokoVoucherDepositDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDepositSuccess?: () => void;
}

export default function TokoVoucherDepositDialog({ open, onOpenChange, onDepositSuccess }: TokoVoucherDepositDialogProps) {
  const { toast } = useToast();
  const { user: authUser, logout } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [depositResult, setDepositResult] = useState<CreateTokoVoucherDepositOutput | null>(null);

  const form = useForm<TokoVoucherDepositFormValues>({
    resolver: zodResolver(tokoVoucherDepositFormSchema),
    defaultValues: {
      nominal: undefined,
      kode_bayar: undefined,
      pin: "",
    },
  });

  const paymentMethodOptions: { label: string; value: TokoVoucherPaymentMethodCode, icon?: React.ElementType }[] = [
    { label: "QRIS (All Payment)", value: "qris", icon: QrCode },
    { label: "BCA Transfer", value: "bca", icon: CreditCard },
    { label: "BRI Virtual Account", value: "briva", icon: CreditCard },
  ];

  const themedDialogClass =
    "sm:max-w-lg border-[var(--ui-border)] bg-[var(--ui-card)] text-[var(--ui-text)] dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100";
  const themedLabelClass =
    "flex items-center font-medium text-[var(--ui-text)] dark:text-zinc-100";
  const themedInputClass =
    "rounded-xl border-[var(--ui-input-border)] bg-[var(--ui-input-bg)] text-[var(--ui-text)] placeholder:text-[var(--ui-text-secondary)] focus-visible:ring-[var(--ui-accent)] dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100";
  const themedSelectTriggerClass =
    "rounded-xl border-[var(--ui-input-border)] bg-[var(--ui-input-bg)] text-[var(--ui-text)] focus:ring-[var(--ui-accent)] dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100";
  const themedSelectContentClass =
    "border-[var(--ui-border)] bg-[var(--ui-card)] text-[var(--ui-text)] dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100";
  const themedOutlineButtonClass =
    "rounded-xl border-[var(--ui-border)] bg-[var(--ui-card-alt)] text-[var(--ui-text)] hover:bg-[var(--ui-accent-bg)] hover:text-[var(--ui-accent)] dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100";
  const themedPrimaryButtonClass =
    "rounded-xl bg-[var(--ui-accent)] text-white hover:bg-[var(--ui-accent-hover)]";
  const themedMutedTextClass =
    "text-[var(--ui-text-muted)] dark:text-zinc-400";
  const themedInfoCardClass =
    "rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-card-alt)] dark:border-zinc-800 dark:bg-zinc-900";

  const handleDialogClose = () => {
    form.reset();
    setIsLoading(false);
    setDepositResult(null);
    onOpenChange(false);
  };

  const onSubmit = async (values: TokoVoucherDepositFormValues) => {
    if (!authUser) {
      toast({ title: "Authentication Error", description: "User not authenticated.", variant: "destructive" });
      return;
    }
    setIsLoading(true);
    setDepositResult(null);

    try {
      const pinResponse = await verifyPin({ username: authUser.username, pin: values.pin });
      if (!pinResponse.isValid) {
        toast({ title: "PIN Invalid", description: pinResponse.message || "Incorrect PIN.", variant: "destructive" });
        form.setError("pin", { type: "manual", message: pinResponse.message || "Invalid PIN." });
        setIsLoading(false);
        if (pinResponse.accountDisabled) {
            toast({
                title: "Account Disabled",
                description: "Your account has been locked due to too many failed PIN attempts.",
                variant: "destructive",
                duration: 7000
            });
            await logout();
        }
        return;
      }

      const depositInput = {
        nominal: values.nominal,
        kode_bayar: values.kode_bayar,
      };
      const result = await createTokoVoucherDeposit(depositInput);
      setDepositResult(result);

      if (result.isSuccess && result.data) {
        toast({
          title: "Deposit Ticket Created (TokoVoucher)",
          description: "Please complete your payment as instructed.",
          duration: 7000,
        });
        onDepositSuccess?.();
      } else {
        toast({
          title: "Deposit Failed (TokoVoucher)",
          description: result.message || "Could not create deposit ticket.",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error("TokoVoucher Deposit process error:", error);
      const errorMessage = error instanceof Error ? error.message : "An unexpected error occurred.";
      toast({ title: "Error", description: errorMessage, variant: "destructive" });
      setDepositResult({ isSuccess: false, message: errorMessage });
    } finally {
      setIsLoading(false);
    }
  };

  const copyToClipboard = (text: string | number | undefined | null, fieldName: string) => {
    if (!text) return;
    const textToCopy = typeof text === 'number' ? text.toString() : text;
    navigator.clipboard.writeText(textToCopy).then(() => {
      toast({ title: "Copied to Clipboard", description: `${fieldName} copied successfully.` });
    }).catch(err => {
      toast({ title: "Copy Failed", description: `Could not copy ${fieldName}.`, variant: "destructive" });
    });
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isLoading || !isOpen) handleDialogClose(); else onOpenChange(isOpen);}}>
      <DialogContent className={themedDialogClass}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-[var(--ui-text)] dark:text-zinc-100">
            <PiggyBank className="h-6 w-6 text-[var(--ui-accent)]" />
            Request TokoVoucher Deposit
          </DialogTitle>
          <DialogDescription className={themedMutedTextClass}>
            {depositResult
              ? "Review the result of your TokoVoucher deposit request and complete the payment with the instructions shown below."
              : "Fill in to request a TokoVoucher deposit ticket. PIN required."}
          </DialogDescription>
        </DialogHeader>

        {!depositResult ? (
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-2">
              <FormField
                control={form.control}
                name="nominal"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className={themedLabelClass}><Info className="mr-2 h-4 w-4 text-[var(--ui-accent)]" />Amount</FormLabel>
                    <FormControl>
                      <Input type="number" placeholder="e.g., 50000" className={themedInputClass} {...field} onChange={e => field.onChange(parseInt(e.target.value,10) || undefined)} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="kode_bayar"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className={themedLabelClass}><Landmark className="mr-2 h-4 w-4 text-[var(--ui-accent)]" />Payment Method</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger className={themedSelectTriggerClass}>
                          <SelectValue placeholder="Select payment method" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent className={themedSelectContentClass}>
                        {paymentMethodOptions.map(option => (
                          <SelectItem key={option.value} value={option.value}>
                            <div className="flex items-center gap-2">
                              {option.icon && <option.icon className={`h-4 w-4 ${themedMutedTextClass}`} />}
                              {option.label}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className={`my-2 space-y-2 rounded-2xl p-4 py-4 ${themedInfoCardClass}`}>
                <FormLabel htmlFor="pinTokoVoucherDeposit" className={`flex items-center justify-center text-sm font-medium ${themedMutedTextClass}`}>
                  <KeyRound className="mr-2 h-4 w-4" />
                  Transaction PIN
                </FormLabel>
                <FormField
                  control={form.control}
                  name="pin"
                  render={({ field }) => (
                    <FormItem className="space-y-0">
                      <FormControl>
                        <Input
                          id="pinTokoVoucherDeposit"
                          type="password"
                          placeholder="● ● ● ● ● ●"
                          maxLength={6}
                          className={`text-center tracking-[0.5em] text-xl ${themedInputClass}`}
                          {...field}
                        />
                      </FormControl>
                      <FormMessage className="text-center pt-2" />
                    </FormItem>
                  )}
                />
              </div>
              <DialogFooter className="pt-2">
                <DialogClose asChild>
                  <Button type="button" variant="outline" disabled={isLoading} className={themedOutlineButtonClass}>Cancel</Button>
                </DialogClose>
                <Button type="submit" disabled={isLoading} className={themedPrimaryButtonClass}>
                  {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Request Ticket
                </Button>
              </DialogFooter>
            </form>
          </Form>
        ) : (
          <div className="py-4 space-y-4">
            {depositResult.isSuccess && depositResult.data ? (
              <>
                <div className="space-y-2 rounded-2xl border border-green-200 bg-green-50 p-4 text-green-700">
                  <h3 className="font-semibold text-lg flex items-center"><CheckCircle className="h-5 w-5 mr-2"/>Deposit Ticket Created!</h3>
                  <p>Please complete your payment using the details below. RC: {depositResult.rc}</p>
                </div>
                <div className="space-y-3 text-sm text-[var(--ui-text)] dark:text-zinc-100">
                  <p><strong>Metode:</strong> {depositResult.data.metode}</p>

                  {depositResult.data.metode.toLowerCase().includes("qris") && depositResult.data.pay.startsWith("https://") ? (
                    <div className="text-center">
                       <p className="mb-2">Scan QRIS below:</p>
                      <Image src={depositResult.data.pay} alt="QRIS Payment" width={250} height={250} className="mx-auto rounded-md border shadow-md" data-ai-hint="qr code" />
                    </div>
                  ) : (
                    <div className={`flex items-center justify-between rounded-2xl p-3 ${themedInfoCardClass}`}>
                      <div>
                        <span className={themedMutedTextClass}>{depositResult.data.metode.toLowerCase().includes("virtual") ? "Virtual Account:" : "No. Rekening:"}</span>
                        <p className="text-lg font-bold text-[var(--ui-accent)]">{depositResult.data.pay}</p>
                      </div>
                       <Button variant="ghost" size="sm" className="text-[var(--ui-text)] hover:bg-[var(--ui-accent-bg)] hover:text-[var(--ui-accent)] dark:text-zinc-100" onClick={() => copyToClipboard(depositResult.data!.pay, 'Payment Number')}>
                         <Copy className="h-4 w-4 mr-1" /> Copy
                       </Button>
                    </div>
                  )}

                  {depositResult.data.pay_name && <p><strong>Atas Nama:</strong> {depositResult.data.pay_name}</p>}

                  <div className={`flex items-center justify-between rounded-2xl p-3 ${themedInfoCardClass}`}>
                    <div>
                      <span className={themedMutedTextClass}>Total Transfer:</span>
                      <p className="text-xl font-bold text-[var(--ui-accent)]">Rp {depositResult.data.total_transfer.toLocaleString()}</p>
                    </div>
                     <Button variant="ghost" size="sm" className="text-[var(--ui-text)] hover:bg-[var(--ui-accent-bg)] hover:text-[var(--ui-accent)] dark:text-zinc-100" onClick={() => copyToClipboard(depositResult.data!.total_transfer, 'Total Transfer')}>
                       <Copy className="h-4 w-4 mr-1" /> Copy
                     </Button>
                  </div>

                  <p className={`text-xs ${themedMutedTextClass}`}>Nominal: Rp {depositResult.data.nominal.toLocaleString()}</p>
                  {typeof depositResult.data.kode_unik === 'number' && <p className={`text-xs ${themedMutedTextClass}`}>Kode Unik: {depositResult.data.kode_unik}</p>}
                  {typeof depositResult.data.biaya_admin === 'number' && <p className={`text-xs ${themedMutedTextClass}`}>Biaya Admin: Rp {depositResult.data.biaya_admin.toLocaleString()}</p>}
                  <p className={`text-xs ${themedMutedTextClass}`}>Dibuat: {new Date(depositResult.data.created).toLocaleDateString('id-ID')}</p>
                  <p className={`text-xs ${themedMutedTextClass}`}>Kadaluarsa: {new Date(depositResult.data.expired_at).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })}</p>
                </div>
                <DialogFooter className="pt-4">
                  <Button onClick={handleDialogClose} className={`w-full ${themedPrimaryButtonClass}`}>Close</Button>
                </DialogFooter>
              </>
            ) : (
              <div className="space-y-2 rounded-2xl border border-red-200 bg-red-50 p-4 text-red-700">
                <h3 className="font-semibold text-lg flex items-center"><AlertTriangle className="h-5 w-5 mr-2"/>Deposit Request Failed</h3>
                <p>{depositResult.message || "An unknown error occurred."}</p>
                {depositResult.rc && <p className="text-xs">Response Code: {depositResult.rc}</p>}
                <DialogFooter className="pt-4">
                    <Button variant="outline" onClick={() => setDepositResult(null)} className={`w-full sm:w-auto ${themedOutlineButtonClass}`}>Try Again</Button>
                    <Button onClick={handleDialogClose} className={`w-full sm:w-auto ${themedPrimaryButtonClass}`}>Close</Button>
                </DialogFooter>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
