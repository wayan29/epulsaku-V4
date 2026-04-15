
// src/app/(app)/tools/pln-checker/page.tsx
"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CardContent } from "@/components/ui/card";
import { Loader2, Zap, Search, AlertTriangle, UserCheck } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { inquirePlnCustomer, type InquirePlnCustomerOutput } from '@/ai/flows/inquire-pln-customer-flow';
import ProtectedRoute from "@/components/core/ProtectedRoute";

const formSchema = z.object({
  customerNo: z.string().min(10, "Customer number must be at least 10 characters"),
});

type FormValues = z.infer<typeof formSchema>;

export default function PlnCheckerPage() {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [inquiryResult, setInquiryResult] = useState<InquirePlnCustomerOutput | null>(null);

  const { register, handleSubmit, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { customerNo: "" },
  });

  const onSubmit = async (data: FormValues) => {
    setIsLoading(true);
    setInquiryResult(null);
    try {
      const result = await inquirePlnCustomer({ customerNo: data.customerNo });
      setInquiryResult(result);
      if (result.isSuccess) {
        toast({ title: "Inquiry Successful", description: `Customer found: ${result.customerName}` });
      } else {
        toast({ title: "Inquiry Failed", description: result.message || "Could not verify customer ID.", variant: "destructive" });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "An unknown error occurred.";
      setInquiryResult({ isSuccess: false, message: `Error: ${errorMessage}` });
      toast({ title: "Error", description: errorMessage, variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  const renderResult = () => {
    if (!inquiryResult) return null;

    const resultClass = inquiryResult.isSuccess
      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
      : "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300";

    return (
      <div className={`mt-6 rounded-2xl border p-4 text-sm ${resultClass}`}>
        {inquiryResult.isSuccess ? (
          <>
            <p className="flex items-center font-semibold"><UserCheck className="mr-2 h-4 w-4" />Customer Found:</p>
            <div className="mt-3 space-y-2 text-sm">
              <p><strong>Name:</strong> {inquiryResult.customerName}</p>
              {inquiryResult.meterNo && <p><strong>Meter No:</strong> {inquiryResult.meterNo}</p>}
              {inquiryResult.subscriberId && <p><strong>Subscriber ID:</strong> {inquiryResult.subscriberId}</p>}
              {inquiryResult.segmentPower && <p><strong>Segment/Power:</strong> {inquiryResult.segmentPower}</p>}
            </div>
          </>
        ) : (
          <p className="flex items-center font-semibold"><AlertTriangle className="mr-2 h-4 w-4" />Inquiry Failed: <span className="ml-1 font-normal">{inquiryResult.message}</span></p>
        )}
      </div>
    );
  };

  return (
    <ProtectedRoute requiredPermission="cek_id_pln">
      <CardContent className="px-6 pb-6 sm:px-8 sm:pb-8">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="customerNo" className="flex items-center text-[var(--ui-text)] dark:text-zinc-100">
              <Zap className="mr-2 h-4 w-4 text-[var(--ui-text-secondary)] dark:text-zinc-500" />
              PLN Customer Number / Meter ID
            </Label>
            <Input id="customerNo" placeholder="Enter PLN Customer Number" {...register("customerNo")} disabled={isLoading} className="border-[var(--ui-input-border)] bg-[var(--ui-input-bg)] text-[var(--ui-text)] placeholder:text-[var(--ui-text-secondary)] focus-visible:ring-[var(--ui-accent)] dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100" />
            {errors.customerNo && <p className="text-sm text-destructive">{errors.customerNo.message}</p>}
          </div>
          <Button type="submit" className="w-full rounded-xl bg-[var(--ui-accent)] text-white hover:bg-[var(--ui-accent-hover)]" disabled={isLoading}>
            {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
            Check Customer ID
          </Button>
        </form>
        {renderResult()}
      </CardContent>
    </ProtectedRoute>
  );
}
