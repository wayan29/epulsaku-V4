// src/components/account/ChangePinForm.tsx
"use client";

import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Loader2, KeyRound, Lock } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { changePin } from "@/lib/user-utils"; // Server Action

const formSchema = z.object({
  newPin: z.string().length(6, "PIN must be 6 digits").regex(/^\d+$/, "PIN must be only digits"),
  confirmNewPin: z.string().length(6, "PIN must be 6 digits").regex(/^\d+$/, "PIN must be only digits"),
  currentPassword: z.string().min(1, "Current password is required to authorize PIN change"),
}).refine((data) => data.newPin === data.confirmNewPin, {
  message: "New PINs don't match",
  path: ["confirmNewPin"],
});

type ChangePinFormValues = z.infer<typeof formSchema>;

const themedLabelClass = "flex items-center text-sm font-medium text-[var(--ui-text)] dark:text-zinc-100";
const themedIconClass = "mr-2 h-4 w-4 text-[var(--ui-text-muted)] dark:text-zinc-400";
const themedInputClass = "rounded-xl border-[var(--ui-input-border)] bg-[var(--ui-input-bg)] text-[var(--ui-text)] placeholder:text-[var(--ui-text-secondary)] focus-visible:ring-[var(--ui-accent)] dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-500";
const primaryButtonClass = "w-full rounded-xl bg-[var(--ui-accent)] text-white hover:bg-[var(--ui-accent-hover)]";

export default function ChangePinForm() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [isLoading, setIsLoading] = useState(false);

  const form = useForm<ChangePinFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      newPin: "",
      confirmNewPin: "",
      currentPassword: "",
    },
  });

  async function onSubmit(values: ChangePinFormValues) {
    if (!user) {
      toast({ title: "Error", description: "You must be logged in.", variant: "destructive" });
      return;
    }
    setIsLoading(true);
    try {
      const result = await changePin(user.username, values.currentPassword, values.newPin);
      if (result.success) {
        toast({
          title: "PIN Changed",
          description: "Your transaction PIN has been updated successfully. Failed attempt counter has been reset.",
        });
        form.reset();
      } else {
        toast({
          title: "Failed to Change PIN",
          description: result.message || "An error occurred.",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error("Change PIN error:", error);
      toast({
        title: "Error",
        description: "An unexpected error occurred while changing PIN.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className="space-y-6 rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-card-alt)]/70 p-5 dark:border-zinc-800 dark:bg-zinc-900/70"
      >
        <FormField
          control={form.control}
          name="newPin"
          render={({ field }) => (
            <FormItem>
              <FormLabel className={themedLabelClass}>
                <KeyRound className={themedIconClass} />
                New 6-Digit PIN
              </FormLabel>
              <FormControl>
                <Input
                  type="password"
                  placeholder="●●●●●●"
                  {...field}
                  maxLength={6}
                  disabled={isLoading}
                  className={themedInputClass}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="confirmNewPin"
          render={({ field }) => (
            <FormItem>
              <FormLabel className={themedLabelClass}>
                <KeyRound className={themedIconClass} />
                Confirm New PIN
              </FormLabel>
              <FormControl>
                <Input
                  type="password"
                  placeholder="●●●●●●"
                  {...field}
                  maxLength={6}
                  disabled={isLoading}
                  className={themedInputClass}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="currentPassword"
          render={({ field }) => (
            <FormItem>
              <FormLabel className={themedLabelClass}>
                <Lock className={themedIconClass} />
                Current Account Password
              </FormLabel>
              <FormControl>
                <Input
                  type="password"
                  placeholder="Enter your account password"
                  {...field}
                  disabled={isLoading}
                  className={themedInputClass}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" className={primaryButtonClass} disabled={isLoading}>
          {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Change PIN
        </Button>
      </form>
    </Form>
  );
}
