
// src/app/(app)/tools/operator-checker/page.tsx
"use client";

import { useState, useEffect } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CardContent } from "@/components/ui/card";
import { Phone, Search, ShieldCheck } from "lucide-react";
import ProtectedRoute from "@/components/core/ProtectedRoute";

interface OperatorInfo {
  name: string;
  prefixes: string[];
}

const operatorData: OperatorInfo[] = [
  { name: "Telkomsel", prefixes: ["0811", "0812", "0813", "0821", "0822", "0823", "0852", "0853", "0851"] },
  { name: "Indosat", prefixes: ["0814", "0815", "0816", "0855", "0856", "0857", "0858"] },
  { name: "XL", prefixes: ["0859", "0877", "0878", "0817", "0818", "0819"] },
  { name: "Tri", prefixes: ["0898", "0899", "0895", "0896", "0897"] },
  { name: "Smartfren", prefixes: ["0889", "0881", "0882", "0883", "0886", "0887", "0888", "0884", "0885"] },
  { name: "AXIS", prefixes: ["0832", "0833", "0838", "0831"] },
];

const formSchema = z.object({
  phoneNumber: z.string().min(4, "Enter at least 4 digits").regex(/^\d+$/, "Must be only digits"),
});

type FormValues = z.infer<typeof formSchema>;

export default function OperatorCheckerPage() {
  const [detectedOperator, setDetectedOperator] = useState<string | null>(null);

  const { register, watch } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { phoneNumber: "" },
    mode: "onBlur"
  });

  const phoneNumber = watch("phoneNumber");

  useEffect(() => {
    let rawPhoneNumberValue = phoneNumber || "";
    let normalizedPhoneNumber = rawPhoneNumberValue;

    if (typeof rawPhoneNumberValue === 'string') {
      let digitsOnly = rawPhoneNumberValue.replace(/\D/g, '');
      if (digitsOnly.startsWith('62')) {
          normalizedPhoneNumber = '0' + digitsOnly.substring(2);
      } else {
          normalizedPhoneNumber = digitsOnly;
      }
    }

    if (normalizedPhoneNumber && normalizedPhoneNumber.length >= 4) {
      let found = false;
      for (const op of operatorData) {
        if (op.prefixes.some(prefix => normalizedPhoneNumber.startsWith(prefix))) {
          setDetectedOperator(op.name);
          found = true;
          break;
        }
      }
      if (!found) {
        setDetectedOperator("Operator not found or not supported.");
      }
    } else {
      setDetectedOperator(null);
    }
  }, [phoneNumber]);

  return (
    <ProtectedRoute requiredPermission="cek_operator_seluler">
      <CardContent className="px-6 pb-6 sm:px-8 sm:pb-8">
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="phoneNumber" className="flex items-center text-[var(--ui-text)] dark:text-zinc-100">
              <Phone className="mr-2 h-4 w-4 text-[var(--ui-text-secondary)] dark:text-zinc-500" />
              Enter Phone Number
            </Label>
            <Input id="phoneNumber" placeholder="e.g., 081234567890" {...register("phoneNumber")} className="border-[var(--ui-input-border)] bg-[var(--ui-input-bg)] text-[var(--ui-text)] placeholder:text-[var(--ui-text-secondary)] focus-visible:ring-[var(--ui-accent)] dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100" />
          </div>

          {detectedOperator && (
            <div className={`mt-4 flex items-center gap-2 rounded-2xl border p-4 text-sm font-semibold ${detectedOperator.includes("not found") ? 'border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300' : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'}`}>
              <ShieldCheck className="h-5 w-5" />
              Operator: {detectedOperator}
            </div>
          )}
        </div>
      </CardContent>
    </ProtectedRoute>
  );
}
