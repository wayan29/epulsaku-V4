
"use client";

import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";
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
import { createDigiflazzDepositTicket, type CreateDigiflazzDepositTicketOutput, type BankEnum } from "@/ai/flows/create-digiflazz-deposit-flow";
import { PiggyBank, Landmark, User, KeyRound, Info, CheckCircle, AlertTriangle, Copy, Loader2 } from "lucide-react";

// Define the base schema locally, matching CreateDigiflazzDepositTicketInput structure
const baseDepositFormSchema = z.object({
  amount: z.number().min(10000, "Minimum deposit amount is Rp 10,000").describe('The amount of deposit requested.'),
  bank: z.enum(["BCA", "MANDIRI", "BRI", "BNI"] as [BankEnum, ...BankEnum[]]).describe('The destination bank for the deposit (BCA, MANDIRI, BRI, or BNI).'),
  ownerName: z.string().min(2, "Owner name must be at least 2 characters").describe('The name of the bank account owner making the transfer.'),
});

const depositFormSchema = baseDepositFormSchema.extend({
  pin: z.string().length(6, "PIN must be 6 digits").regex(/^\d+$/, "PIN must be only digits"),
});

type DepositFormValues = z.infer<typeof depositFormSchema>;

interface DigiflazzDepositDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDepositSuccess?: () => void;
}

export default function DigiflazzDepositDialog({ open, onOpenChange, onDepositSuccess }: DigiflazzDepositDialogProps) {
  const { toast } = useToast();
  const { user: authUser, logout } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [depositResult, setDepositResult] = useState<CreateDigiflazzDepositTicketOutput | null>(null);

  const form = useForm<DepositFormValues>({
    resolver: zodResolver(depositFormSchema),
    defaultValues: {
      amount: undefined,
      bank: undefined,
      ownerName: "",
      pin: "",
    },
  });

  const bankOptions: { label: string; value: BankEnum }[] = [
    { label: "BCA", value: "BCA" },
    { label: "Bank Mandiri", value: "MANDIRI" },
    { label: "BRI", value: "BRI" },
    { label: "BNI", value: "BNI" },
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

  const onSubmit = async (values: DepositFormValues) => {
    if (!authUser) {
      toast({ title: "Authentication Error", description: "User not authenticated. Please log in again.", variant: "destructive" });
      return;
    }
    setIsLoading(true);
    setDepositResult(null);

    try {
      const pinResponse = await verifyPin({ username: authUser.username, pin: values.pin });
      if (!pinResponse.isValid) {
        toast({ title: "PIN Invalid", description: pinResponse.message || "The PIN you entered is incorrect.", variant: "destructive" });
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
        amount: values.amount,
        bank: values.bank,
        ownerName: values.ownerName,
      };
      const result = await createDigiflazzDepositTicket(depositInput);
      setDepositResult(result);

      if (result.isSuccess) {
        toast({
          title: "Deposit Ticket Created",
          description: "Please complete your transfer as instructed.",
          duration: 7000,
        });
        onDepositSuccess?.();
      } else {
        toast({
          title: "Deposit Failed",
          description: result.message || "Could not create deposit ticket.",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error("Deposit process error:", error);
      const errorMessage = error instanceof Error ? error.message : "An unexpected error occurred.";
      toast({ title: "Error", description: errorMessage, variant: "destructive" });
      setDepositResult({ isSuccess: false, message: errorMessage });
    } finally {
      setIsLoading(false);
    }
  };

  const copyToClipboard = (text: string | number | undefined, fieldName: string) => {
    if (text === undefined) return;
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
            Request Digiflazz Deposit Ticket
          </DialogTitle>
          <DialogDescription className={themedMutedTextClass}>
            {depositResult
              ? "Review the result of your Digiflazz deposit request and complete the transfer with the payment details shown below."
              : "Fill in the details below to request a deposit ticket for Digiflazz. Your PIN is required to authorize this request."}
          </DialogDescription>
        </DialogHeader>

        {!depositResult ? (
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-2">
              <FormField
                control={form.control}
                name="amount"
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
                name="bank"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className={themedLabelClass}><Landmark className="mr-2 h-4 w-4 text-[var(--ui-accent)]" />Bank</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger className={themedSelectTriggerClass}>
                          <SelectValue placeholder="Select your bank for transfer" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent className={themedSelectContentClass}>
                        {bankOptions.map(option => (
                          <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="ownerName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className={themedLabelClass}><User className="mr-2 h-4 w-4 text-[var(--ui-accent)]" />Bank Account Owner Name</FormLabel>
                    <FormControl>
                      <Input placeholder="Your full name as on bank account" className={themedInputClass} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className={`space-y-2 rounded-2xl p-4 py-4 ${themedInfoCardClass}`}>
                <FormLabel htmlFor="pinDigiflazzDeposit" className={`flex items-center justify-center text-sm font-medium ${themedMutedTextClass}`}>
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
                          id="pinDigiflazzDeposit"
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
            {depositResult.isSuccess && depositResult.finalAmount && depositResult.notes ? (
              <>
                <div className="space-y-2 rounded-2xl border border-green-200 bg-green-50 p-4 text-green-700">
                  <h3 className="font-semibold text-lg flex items-center"><CheckCircle className="h-5 w-5 mr-2"/>Deposit Ticket Created!</h3>
                  <p>Please transfer the exact amount below to the Digiflazz account (details will be provided by Digiflazz system, this app does not show their bank account). Make sure to include the notes in your transfer description.</p>
                </div>
                <div className="space-y-3 text-sm text-[var(--ui-text)] dark:text-zinc-100">
                  <div className={`flex items-center justify-between rounded-2xl p-3 ${themedInfoCardClass}`}>
                    <div>
                      <span className={themedMutedTextClass}>Amount to Transfer:</span>
                      <p className="font-bold text-xl text-[var(--ui-accent)]">Rp {depositResult.finalAmount.toLocaleString()}</p>
                    </div>
                    <Button variant="ghost" size="sm" className="text-[var(--ui-text)] hover:bg-[var(--ui-accent-bg)] hover:text-[var(--ui-accent)] dark:text-zinc-100" onClick={() => copyToClipboard(depositResult.finalAmount, 'Amount')}>
                      <Copy className="h-4 w-4 mr-1" /> Copy
                    </Button>
                  </div>
                  <div className={`flex items-center justify-between rounded-2xl p-3 ${themedInfoCardClass}`}>
                    <div>
                      <span className={themedMutedTextClass}>Transfer Notes / Berita:</span>
                      <p className="font-bold text-lg text-[var(--ui-accent)]">{depositResult.notes}</p>
                    </div>
                    <Button variant="ghost" size="sm" className="text-[var(--ui-text)] hover:bg-[var(--ui-accent-bg)] hover:text-[var(--ui-accent)] dark:text-zinc-100" onClick={() => copyToClipboard(depositResult.notes, 'Notes')}>
                      <Copy className="h-4 w-4 mr-1" /> Copy
                    </Button>
                  </div>
                   <p className={`pt-2 text-center text-xs ${themedMutedTextClass}`}>Transfer to the Digiflazz account (BCA/Mandiri/BRI/BNI) as selected previously. Account details are provided by Digiflazz through their official channels if needed.</p>
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
