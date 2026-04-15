// src/app/(app)/admin-settings/page.tsx
"use client";

import { useEffect, useState } from 'react';
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
  FormDescription,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea"; 
import { Card, CardContent, CardDescription as PageCardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { Loader2, Save, Smartphone, Globe, Settings, ShoppingCart, Lock, Send as SendIcon, UserCircle2, Info } from "lucide-react"; 
import { getAdminSettingsFromDB, saveAdminSettingsToDB, type AdminSettings } from '@/lib/admin-settings-utils';
import ProtectedRoute from '@/components/core/ProtectedRoute';

const adminSettingsFormSchema = z.object({
  digiflazzUsername: z.string().optional(),
  digiflazzApiKey: z.string().optional(),
  digiflazzWebhookSecret: z.string().optional(),
  allowedDigiflazzIPs: z.string().optional(),
  allowedTokoVoucherIPs: z.string().optional(),
  tokovoucherMemberCode: z.string().optional(),
  tokovoucherSignature: z.string().optional(),
  tokovoucherKey: z.string().optional(),
  telegramBotToken: z.string().optional(),
  telegramChatId: z.string().optional(),
  adminPasswordConfirmation: z.string().min(1, "Admin password is required to save settings"),
});

type AdminSettingsFormValues = z.infer<typeof adminSettingsFormSchema>;

const themedInputClass = "rounded-xl border-[var(--ui-input-border)] bg-[var(--ui-input-bg)] text-[var(--ui-text)] placeholder:text-[var(--ui-text-secondary)] focus-visible:ring-[var(--ui-accent)] dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-500";
const themedTextareaClass = "min-h-[110px] rounded-xl border-[var(--ui-input-border)] bg-[var(--ui-input-bg)] text-[var(--ui-text)] placeholder:text-[var(--ui-text-secondary)] focus-visible:ring-[var(--ui-accent)] dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-500";
const themedLabelClass = "flex items-center text-sm font-medium text-[var(--ui-text)] dark:text-zinc-100";
const themedIconClass = "mr-2 h-4 w-4 text-[var(--ui-text-muted)] dark:text-zinc-400";
const themedDescriptionClass = "text-xs text-[var(--ui-text-secondary)] dark:text-zinc-500";

export default function AdminSettingsPage() {
  const { toast } = useToast();
  const { user: authUser } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [isFetchingInitial, setIsFetchingInitial] = useState(true);

  const form = useForm<AdminSettingsFormValues>({
    resolver: zodResolver(adminSettingsFormSchema),
    defaultValues: {
      digiflazzUsername: "",
      digiflazzApiKey: "",
      digiflazzWebhookSecret: "",
      allowedDigiflazzIPs: "",
      allowedTokoVoucherIPs: "",
      tokovoucherMemberCode: "",
      tokovoucherSignature: "",
      tokovoucherKey: "",
      telegramBotToken: "",
      telegramChatId: "",
      adminPasswordConfirmation: "",
    },
  });

  useEffect(() => {
    async function fetchInitialSettings() {
      setIsFetchingInitial(true);
      try {
        const storedSettings = await getAdminSettingsFromDB(); 
        if (storedSettings) {
          form.reset({
            digiflazzUsername: storedSettings.digiflazzUsername || "",
            digiflazzApiKey: "", // Always empty for security
            digiflazzWebhookSecret: "", // Always empty
            allowedDigiflazzIPs: storedSettings.allowedDigiflazzIPs || "",
            allowedTokoVoucherIPs: storedSettings.allowedTokoVoucherIPs || "",
            tokovoucherMemberCode: storedSettings.tokovoucherMemberCode || "",
            tokovoucherSignature: "", // Always empty
            tokovoucherKey: "", // Always empty
            telegramBotToken: storedSettings.telegramBotToken || "", // Show stored value
            telegramChatId: storedSettings.telegramChatId || "",
            adminPasswordConfirmation: "", 
          });
        }
      } catch (error) {
        console.error("Failed to fetch initial admin settings:", error);
        toast({
          title: "Error Loading Settings",
          description: "Could not fetch existing settings from the database.",
          variant: "destructive",
        });
      } finally {
        setIsFetchingInitial(false);
      }
    }
    fetchInitialSettings();
  }, [form, toast]);

  async function onSubmit(values: AdminSettingsFormValues) {
    if (!authUser) {
      toast({ title: "Authentication Error", description: "Admin user not authenticated.", variant: "destructive" });
      return;
    }
    setIsLoading(true);
    try {
      // Create a payload that only includes fields that the user has entered a value for.
      // This prevents overwriting existing encrypted values with empty strings.
      const settingsToSave: Partial<AdminSettings> = {};
      if (values.digiflazzUsername) settingsToSave.digiflazzUsername = values.digiflazzUsername;
      if (values.digiflazzApiKey) settingsToSave.digiflazzApiKey = values.digiflazzApiKey;
      if (values.digiflazzWebhookSecret) settingsToSave.digiflazzWebhookSecret = values.digiflazzWebhookSecret;
      if (values.allowedDigiflazzIPs) settingsToSave.allowedDigiflazzIPs = values.allowedDigiflazzIPs;
      if (values.allowedTokoVoucherIPs) settingsToSave.allowedTokoVoucherIPs = values.allowedTokoVoucherIPs;
      if (values.tokovoucherMemberCode) settingsToSave.tokovoucherMemberCode = values.tokovoucherMemberCode;
      if (values.tokovoucherSignature) settingsToSave.tokovoucherSignature = values.tokovoucherSignature;
      if (values.tokovoucherKey) settingsToSave.tokovoucherKey = values.tokovoucherKey;
      
      // Handle telegram fields, allowing them to be cleared with an empty string
      if (typeof values.telegramBotToken === 'string') {
        settingsToSave.telegramBotToken = values.telegramBotToken;
      }
      if (typeof values.telegramChatId === 'string') {
        settingsToSave.telegramChatId = values.telegramChatId;
      }


      const result = await saveAdminSettingsToDB({
        settings: settingsToSave,
        adminPasswordConfirmation: values.adminPasswordConfirmation,
        adminUsername: authUser.username,
      });

      if (result.success) {
        toast({
          title: "Settings Saved",
          description: "Admin settings have been successfully updated.",
        });
        // Reset password fields but keep other values
        form.reset({
          ...values,
          digiflazzApiKey: "",
          digiflazzWebhookSecret: "",
          tokovoucherSignature: "",
          tokovoucherKey: "",
          adminPasswordConfirmation: "",
        });
      } else {
        toast({
          title: "Error Saving Settings",
          description: result.message || "Could not save settings.",
          variant: "destructive",
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "An unknown error occurred.";
      toast({
        title: "Error Saving Settings",
        description: `Could not save settings to the database: ${message}`,
        variant: "destructive",
      });
      console.error("Error saving admin settings:", error);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <ProtectedRoute requiredPermission='pengaturan_admin'>
    <div className="mx-auto max-w-4xl space-y-8 pb-10">
      <Card className="relative overflow-hidden rounded-3xl border-[var(--ui-border)] bg-[var(--ui-surface)] shadow-xl dark:border-zinc-800 dark:bg-zinc-950">
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-[var(--ui-top-bar-from)] via-[var(--ui-top-bar-via)] to-[var(--ui-accent-gradient-to)] opacity-80" />
        <CardHeader className="px-6 pt-6 sm:px-8">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[var(--ui-accent-gradient-from)] to-[var(--ui-accent-gradient-to)] text-white shadow-lg">
              <Settings className="h-6 w-6" />
            </div>
            <div className="space-y-1">
              <CardTitle className="text-2xl font-headline text-[var(--ui-text)] dark:text-zinc-100">
                Admin Settings
              </CardTitle>
              <PageCardDescription className="max-w-2xl text-[var(--ui-text-muted)] dark:text-zinc-400">
            Manage application credentials and webhook configurations. Sensitive data (API keys, secrets) will be encrypted at rest. Password confirmation is required to save any changes.
              </PageCardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="px-6 pb-6 sm:px-8 sm:pb-8">
          <Card className="mb-6 rounded-2xl border-[var(--ui-accent)]/20 bg-[var(--ui-accent-bg)] shadow-none dark:border-zinc-800 dark:bg-zinc-900/70">
            <CardContent className="flex items-start gap-3 p-4 text-sm text-[var(--ui-text-muted)] dark:text-zinc-400">
              <Info className="mt-0.5 h-5 w-5 flex-shrink-0 text-[var(--ui-accent)]" />
              <div>
                <strong className="font-semibold text-[var(--ui-text)] dark:text-zinc-100">Note on Encryption:</strong> Fields marked with a lock icon are encrypted. They will always appear empty for security. To update a value, simply type the new value. To leave it unchanged, leave the field blank.
              </div>
            </CardContent>
          </Card>

          {isFetchingInitial ? (
            <div className="flex items-center justify-center py-10 text-[var(--ui-text-muted)] dark:text-zinc-400">
              <Loader2 className="h-8 w-8 animate-spin text-[var(--ui-accent)]" />
              <p className="ml-2">Loading settings...</p>
            </div>
          ) : (
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <fieldset className="space-y-4 rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-card-alt)]/70 p-5 dark:border-zinc-800 dark:bg-zinc-900/70">
                  <legend className="px-2 text-lg font-medium text-[var(--ui-text)] dark:text-zinc-100">Digiflazz Credentials</legend>
                  <FormField
                    control={form.control}
                    name="digiflazzUsername"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className={themedLabelClass}><Smartphone className={themedIconClass} />Digiflazz Username</FormLabel>
                        <FormControl>
                          <Input placeholder="Your Digiflazz Username" {...field} className={themedInputClass} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="digiflazzApiKey"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className={themedLabelClass}><Lock className={themedIconClass} />Digiflazz API Key (Production)</FormLabel>
                        <FormControl>
                          <Input type="password" placeholder="Leave blank to keep existing key" {...field} className={themedInputClass} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="digiflazzWebhookSecret"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className={themedLabelClass}><Lock className={themedIconClass} />Digiflazz Webhook Secret</FormLabel>
                        <FormControl>
                          <Input type="password" placeholder="Leave blank to keep existing secret" {...field} className={themedInputClass} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="allowedDigiflazzIPs"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className={themedLabelClass}><Globe className={themedIconClass} />Allowed Digiflazz IPs</FormLabel>
                        <FormControl>
                          <Textarea placeholder="e.g., 1.2.3.4,5.6.7.8 (comma-separated, optional)" {...field} className={themedTextareaClass} />
                        </FormControl>
                         <FormDescription className={themedDescriptionClass}>Leave blank if IP filtering is not desired or handled elsewhere. Separate multiple IPs with a comma.</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </fieldset>

                <fieldset className="space-y-4 rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-card-alt)]/70 p-5 dark:border-zinc-800 dark:bg-zinc-900/70">
                  <legend className="px-2 text-lg font-medium text-[var(--ui-text)] dark:text-zinc-100">TokoVoucher Credentials</legend>
                  <FormField
                    control={form.control}
                    name="tokovoucherMemberCode"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className={themedLabelClass}><ShoppingCart className={themedIconClass} />TokoVoucher Member Code</FormLabel>
                        <FormControl>
                          <Input placeholder="Your TokoVoucher Member Code" {...field} className={themedInputClass} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="tokovoucherSignature"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className={themedLabelClass}><Lock className={themedIconClass} />TokoVoucher Signature (for API Info)</FormLabel>
                        <FormControl>
                          <Input type="password" placeholder="Leave blank to keep existing signature" {...field} className={themedInputClass} />
                        </FormControl>
                        <FormDescription className={themedDescriptionClass}>Usually for API calls like get balance, get products.</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                   <FormField
                    control={form.control}
                    name="tokovoucherKey"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className={themedLabelClass}><Lock className={themedIconClass} />TokoVoucher Key/Secret (for Transactions & Webhook)</FormLabel>
                        <FormControl>
                           <Input type="password" placeholder="Leave blank to keep existing key" {...field} className={themedInputClass} />
                        </FormControl>
                         <FormDescription className={themedDescriptionClass}>Used for placing orders and verifying webhooks.</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                   <FormField
                    control={form.control}
                    name="allowedTokoVoucherIPs"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className={themedLabelClass}><Globe className={themedIconClass} />Allowed TokoVoucher IPs</FormLabel>
                        <FormControl>
                          <Textarea placeholder="e.g., 188.166.243.56 (comma-separated, optional)" {...field} className={themedTextareaClass} />
                        </FormControl>
                        <FormDescription className={themedDescriptionClass}>Leave blank if IP filtering is not desired. Separate multiple IPs with a comma.</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </fieldset>

                <fieldset className="space-y-4 rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-card-alt)]/70 p-5 dark:border-zinc-800 dark:bg-zinc-900/70">
                  <legend className="px-2 text-lg font-medium text-[var(--ui-text)] dark:text-zinc-100">Telegram Notifications</legend>
                  <FormField
                    control={form.control}
                    name="telegramBotToken"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className={themedLabelClass}><SendIcon className={themedIconClass} />Telegram Bot Token</FormLabel>
                        <FormControl>
                           <Input type="text" placeholder="Enter your Telegram Bot Token" {...field} className={themedInputClass} />
                        </FormControl>
                        <FormDescription className={themedDescriptionClass}>Get this from BotFather on Telegram. Stored as plain text.</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="telegramChatId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className={themedLabelClass}><UserCircle2 className={themedIconClass} />Telegram Chat ID(s)</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g., 12345,67890,-100123" {...field} className={themedInputClass} />
                        </FormControl>
                        <FormDescription className={themedDescriptionClass}>Your personal Chat ID or Group IDs. Separate multiple Chat IDs with a comma.</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </fieldset>

                <FormField
                  control={form.control}
                  name="adminPasswordConfirmation"
                  render={({ field }) => (
                    <FormItem className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4 dark:border-amber-400/20 dark:bg-amber-500/10">
                      <FormLabel className="flex items-center text-md font-semibold text-amber-700 dark:text-amber-300"><Lock className="mr-2 h-5 w-5 text-amber-600 dark:text-amber-300" />Confirm with Admin Password</FormLabel>
                      <FormControl>
                        <Input
                          type="password"
                          placeholder="Enter your current admin password"
                          {...field}
                          className={`${themedInputClass} mt-2 border-amber-500/40 focus-visible:ring-amber-500 dark:border-amber-400/30`}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <Button
                  type="submit"
                  className="w-full rounded-xl bg-[var(--ui-accent)] text-white hover:bg-[var(--ui-accent-hover)]"
                  disabled={isLoading || isFetchingInitial}
                >
                  {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                  Save Settings
                </Button>
              </form>
            </Form>
          )}
        </CardContent>
      </Card>
    </div>
    </ProtectedRoute>
  );
}
