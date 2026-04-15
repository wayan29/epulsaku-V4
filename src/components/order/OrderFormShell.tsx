// src/components/order/OrderFormShell.tsx
import type { ReactNode } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { LucideIcon } from 'lucide-react';

interface OrderFormShellProps {
  title: string;
  description: string;
  icon: LucideIcon;
  children: ReactNode;
}

export default function OrderFormShell({ title, description, icon: Icon, children }: OrderFormShellProps) {
  return (
    <div className="max-w-2xl mx-auto">
      <Card className="relative overflow-hidden rounded-3xl border-[var(--ui-border)] bg-[var(--ui-surface)] shadow-xl dark:border-zinc-800 dark:bg-zinc-950">
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-[var(--ui-top-bar-from)] via-[var(--ui-top-bar-via)] to-[var(--ui-accent-gradient-to)] opacity-80" />
        <CardHeader className="px-6 pt-6 sm:px-8">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[var(--ui-accent-gradient-from)] to-[var(--ui-accent-gradient-to)] text-white shadow-lg">
              <Icon className="h-6 w-6" />
            </div>
            <div className="space-y-1">
              <CardTitle className="text-xl sm:text-2xl font-headline text-[var(--ui-text)] dark:text-zinc-100">{title}</CardTitle>
              <CardDescription className="text-[var(--ui-text-muted)] dark:text-zinc-400">{description}</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="px-6 pb-6 sm:px-8 sm:pb-8">
          {children}
        </CardContent>
      </Card>
    </div>
  );
}
