// src/components/auth/LoginForm.tsx
"use client";

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
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import Link from "next/link";
import { UserCircle, LockKeyhole, Sparkles, Loader2, Timer, ArrowRight } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useRouter } from 'next/navigation';
import { Alert, AlertDescription } from "@/components/ui/alert";

const formSchema = z.object({
  username: z.string().min(1, "Username cannot be empty"),
  password: z.string().min(1, "Password cannot be empty"),
  rememberMe: z.boolean().default(false).optional(),
});

export default function LoginForm() {
  const { toast } = useToast();
  const { login, isAuthenticated } = useAuth();
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const [lockoutTime, setLockoutTime] = useState(0);
  const isLockedOut = lockoutTime > 0;
  
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      username: "",
      password: "",
      rememberMe: true,
    },
  });

  useEffect(() => {
    if (isAuthenticated) {
        router.replace('/dashboard');
    }
  }, [isAuthenticated, router]);

  useEffect(() => {
    let timer: NodeJS.Timeout | undefined;
    if (isLockedOut) {
      timer = setInterval(() => {
        setLockoutTime((prevTime) => prevTime - 1);
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [isLockedOut]);

  async function onSubmit(values: z.infer<typeof formSchema>) {
    setIsSubmitting(true);
    try {
      await login(values.username, values.password, values.rememberMe);
      toast({
        title: "Welcome back",
        description: "Login berhasil. Membuka dashboard...",
      });
    } catch (error) {
       const err = error as Error & { response?: Response, data?: any };
       const errorMessage = err.data?.message || err.message || "An unknown error occurred.";
       
       if (err.response?.status === 429) {
          const lockout = err.data?.lockoutTime || 120;
          setLockoutTime(lockout);
          toast({
            title: "Access Paused",
            description: errorMessage,
            variant: "destructive",
          });
       } else {
          toast({
            title: err.data?.message?.includes('session dashboard belum tervalidasi') ? "Session belum siap" : "Access Denied",
            description: errorMessage,
            variant: "destructive",
          });
       }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="relative w-full max-w-md mx-auto my-8">
      {/* Layered Backdrop */}
      <div className="absolute inset-0 bg-[#36454F] rounded-3xl transform translate-x-4 translate-y-5 opacity-20 dark:opacity-40 blur-sm pointer-events-none transition-transform duration-700 ease-out"></div>
      <div className="absolute inset-0 bg-[var(--ui-accent)] rounded-3xl transform translate-x-2 translate-y-2 opacity-30 dark:opacity-50 pointer-events-none transition-transform duration-500 ease-out"></div>
      
      {/* Main Signature Card */}
      <Card className="relative bg-[var(--ui-surface)] dark:bg-zinc-950 border-[var(--ui-border)] dark:border-zinc-800 shadow-2xl rounded-3xl overflow-hidden z-10 transition-all duration-300">
        
        {/* Subtle Decorative Top Gradient */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-[var(--ui-accent-gradient-to)] via-[var(--ui-top-bar-via)] to-[#36454F] opacity-80" />

        <CardHeader className="pt-12 pb-6 px-8 text-center sm:px-10">
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-[#36454F] text-[#FDFBF7] shadow-lg transform rotate-3 transition-transform hover:rotate-6">
            <Sparkles className="h-7 w-7 text-[var(--ui-accent)]" />
          </div>
          <CardTitle className="text-3xl font-serif text-[var(--ui-text)] dark:text-zinc-100 tracking-tight mb-2">
            Welcome to the Class
          </CardTitle>
          <CardDescription className="text-[var(--ui-text-muted)] dark:text-zinc-400 text-base">
            Sign in to continue your premium journey.
          </CardDescription>
        </CardHeader>
        
        <CardContent className="px-8 pb-10 sm:px-10">
          {isLockedOut && (
              <Alert variant="destructive" className="mb-6 rounded-xl border-red-200 bg-red-50 text-red-800 dark:border-red-900/50 dark:bg-red-900/20 dark:text-red-200">
                  <Timer className="h-4 w-4" />
                  <AlertDescription className="ml-2">
                      Please pause. Try again in <span className="font-bold">{lockoutTime}</span> seconds.
                  </AlertDescription>
              </Alert>
          )}
          
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <FormField
                control={form.control}
                name="username"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="flex items-center text-[var(--ui-text)] dark:text-zinc-300 font-medium tracking-wide text-sm">
                      <UserCircle className="mr-2 h-4 w-4 text-[var(--ui-accent)] opacity-80" /> Username
                    </FormLabel>
                    <FormControl>
                      <Input 
                        placeholder="Enter your username" 
                        {...field} 
                        disabled={isSubmitting || isLockedOut} 
                        className="bg-white dark:bg-zinc-900 border-[var(--ui-input-border)] dark:border-zinc-800 focus-visible:ring-[var(--ui-accent)] focus-visible:ring-offset-0 rounded-xl py-6 text-[var(--ui-text)] dark:text-zinc-200 shadow-sm transition-all"
                      />
                    </FormControl>
                    <FormMessage className="text-red-500" />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <div className="flex items-center justify-between">
                      <FormLabel className="flex items-center text-[var(--ui-text)] dark:text-zinc-300 font-medium tracking-wide text-sm">
                        <LockKeyhole className="mr-2 h-4 w-4 text-[var(--ui-accent)] opacity-80" /> Password
                      </FormLabel>
                      {/* Optional: Add forgot password link here if needed later */}
                    </div>
                    <FormControl>
                      <Input 
                        type="password" 
                        placeholder="Enter your private key" 
                        {...field} 
                        disabled={isSubmitting || isLockedOut} 
                        className="bg-white dark:bg-zinc-900 border-[var(--ui-input-border)] dark:border-zinc-800 focus-visible:ring-[var(--ui-accent)] focus-visible:ring-offset-0 rounded-xl py-6 text-[var(--ui-text)] dark:text-zinc-200 shadow-sm transition-all"
                      />
                    </FormControl>
                    <FormMessage className="text-red-500" />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="rememberMe"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center space-x-3 space-y-0 mt-2">
                    <FormControl>
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        disabled={isSubmitting || isLockedOut}
                        id="remember-me"
                        className="border-[var(--ui-accent)] text-[var(--ui-accent)] focus-visible:ring-[var(--ui-accent)] data-[state=checked]:bg-[var(--ui-accent)] data-[state=checked]:text-white rounded-md w-5 h-5"
                      />
                    </FormControl>
                    <Label htmlFor="remember-me" className="text-sm font-medium text-[var(--ui-text-muted)] dark:text-zinc-400 cursor-pointer select-none">
                      Remember my login
                    </Label>
                  </FormItem>
                )}
              />
              
              <Button 
                type="submit" 
                className="w-full bg-gradient-to-r from-[var(--ui-accent-gradient-to)] to-[var(--ui-accent-gradient-from)] hover:from-[var(--ui-accent-hover)] hover:to-[var(--ui-accent-gradient-to)] text-white shadow-md hover:shadow-lg transition-all duration-300 rounded-xl py-6 text-base font-medium mt-4 group" 
                disabled={isSubmitting || isLockedOut}
              >
                {isSubmitting ? (
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                ) : (
                  <>
                    {isLockedOut ? `Try again in ${lockoutTime}s` : "Access the Platform"}
                    {!isLockedOut && <ArrowRight className="ml-2 h-5 w-5 opacity-80 group-hover:translate-x-1 transition-transform" />}
                  </>
                )}
              </Button>
            </form>
          </Form>
          
          <div className="mt-8 text-center text-sm">
            <span className="text-[var(--ui-text-muted)] dark:text-zinc-500">
              First time setup?{" "}
            </span>
            <Link href="/signup" className="font-semibold text-[var(--ui-text)] dark:text-zinc-300 hover:text-[var(--ui-accent)] transition-colors underline-offset-4 hover:underline">
              Create Admin Account
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
