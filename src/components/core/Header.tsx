// src/components/core/Header.tsx
"use client";

import Link from "next/link";
import { usePathname } from 'next/navigation';
import React, { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { Zap, LayoutDashboard, History, LogOut, UserCircle2, Menu, DollarSign, Settings, KeyRound, ShieldCheck, TrendingUp, Shield, ShieldAlert, ShoppingCart, Cog, PackageSearch, BarChart3, Home, Wrench, Contact, Phone, UserCog, UserPlus, FileText, MessageSquare } from "lucide-react";
import { Sheet, SheetContent, SheetTrigger, SheetClose, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ModeToggle } from "./ModeToggle";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { ALL_APP_MENUS, AppMenu, hasPermission, normalizeUserRole } from "@/lib/auth-utils";
import { listShiftHandoversFromDB } from "@/lib/transaction-utils";
import { cn } from "@/lib/utils";
import { ScrollArea } from "../ui/scroll-area";
import { Separator } from "../ui/separator";

interface NavLinkProps {
  href: string;
  children: React.ReactNode;
  icon?: React.ReactNode;
  onClick?: () => void;
  isActive: boolean;
}

const NavLink = ({ href, children, icon, onClick, isActive }: NavLinkProps) => (
  <Button 
    variant="ghost" 
    asChild 
    className={cn(
        "h-auto w-full justify-start rounded-xl border px-0 py-0 shadow-sm transition-all duration-200 sm:rounded-2xl",
        isActive
          ? "border-[var(--ui-accent)]/20 bg-[var(--ui-accent-bg)] text-[var(--ui-accent)] hover:bg-[var(--ui-accent-bg-hover)] hover:text-[var(--ui-accent-hover)]"
          : "border-transparent text-[var(--ui-text-muted)] hover:border-[var(--ui-border)] hover:bg-[var(--ui-card-alt)] hover:text-[var(--ui-text)]"
    )}
    onClick={onClick}
  >
    <Link href={href} className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 sm:gap-3 sm:rounded-2xl sm:px-3 sm:py-2.5">
      {icon ? React.cloneElement(icon as React.ReactElement, { className: cn("h-4 w-4", isActive ? "text-[var(--ui-accent)]" : "text-[var(--ui-text-secondary)]") }) : null}
      <span className="text-[13px] sm:text-sm">{children}</span>
    </Link>
  </Button>
);

export default function Header() {
  const { user, logout } = useAuth();
  const { toast } = useToast();
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [openHandoverCount, setOpenHandoverCount] = useState(0);
  const pathname = usePathname();

  const handleLogout = async () => {
    logout();
    toast({ title: "Logged Out", description: "You have been successfully logged out." });
  };
  
  const hasAccess = (menuKey: string) => {
    return hasPermission(user, menuKey);
  };

  useEffect(() => {
    let isCancelled = false;

    async function loadOpenHandoverCount() {
      if (!user || !hasAccess('shift_handover')) {
        setOpenHandoverCount(0);
        return;
      }

      try {
        const handovers = await listShiftHandoversFromDB();
        if (!isCancelled) {
          setOpenHandoverCount(
            handovers.filter((handover) => handover.status === 'open').length
          );
        }
      } catch {
        if (!isCancelled) {
          setOpenHandoverCount(0);
        }
      }
    }

    void loadOpenHandoverCount();

    return () => {
      isCancelled = true;
    };
  }, [pathname, user]);

  const sidebarNavGroups = [
    {
      label: "Utama",
      icon: <Home className="h-5 w-5" />,
      items: ALL_APP_MENUS.filter(m => ['dashboard'].includes(m.key) && hasAccess(m.key))
    },
    {
      label: "Produk",
      icon: <PackageSearch className="h-5 w-5" />,
      items: ALL_APP_MENUS.filter(m => ['layanan_digiflazz', 'layanan_tokovoucher'].includes(m.key) && hasAccess(m.key))
    },
    {
      label: "Riwayat & Laporan",
      icon: <BarChart3 className="h-5 w-5" />,
      items: ALL_APP_MENUS.filter(m => ['riwayat_transaksi', 'shift_handover', 'laporan_profit'].includes(m.key) && hasAccess(m.key))
    },
    {
      label: "Alat",
      icon: <Wrench className="h-5 w-5" />,
      items: ALL_APP_MENUS.filter(m => ['cek_nickname_game', 'cek_id_pln', 'cek_operator_seluler', 'chat_ai'].includes(m.key) && hasAccess(m.key))
    },
  ];

  const roleDisplayMap: Record<string, string> = {
    'staf': 'Staf',
    'admin': 'Admin',
    'super_admin': 'Super Admin',
  };
  const roleColorMap: Record<string, string> = {
    'staf': 'border-[var(--ui-border)] bg-[var(--ui-card)] text-[var(--ui-text-muted)] dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300',
    'admin': 'border-[var(--ui-accent)]/20 bg-[var(--ui-accent-bg)] text-[var(--ui-accent)] dark:border-sky-400/20 dark:bg-sky-500/10 dark:text-sky-300',
    'super_admin': 'border-[var(--ui-highlight-border)] bg-[var(--ui-highlight-bg)] text-[var(--ui-accent-hover)] dark:border-emerald-400/20 dark:bg-emerald-500/10 dark:text-emerald-300',
  };


  return (
    <header className="sticky top-0 z-50 w-full border-b border-[var(--ui-border)] bg-[var(--ui-surface)] text-[var(--ui-text)] shadow-sm backdrop-blur dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100">
      <div className="container flex h-16 max-w-screen-2xl items-center justify-between px-3 sm:px-4">
        <div className="flex items-center gap-2">
          <Sheet open={isSheetOpen} onOpenChange={setIsSheetOpen}>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="rounded-xl text-[var(--ui-accent)] hover:bg-[var(--ui-accent-bg)] hover:text-[var(--ui-accent-hover)]"
              >
                <Menu className="h-6 w-6" />
              </Button>
            </SheetTrigger>
            <SheetContent
              side="left"
              className="flex w-[268px] flex-col border-[var(--ui-border)] bg-[var(--ui-card)] p-0 text-[var(--ui-text)] dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100 sm:w-[280px]"
            >
              <SheetHeader className="relative border-b border-[var(--ui-border)] px-3 py-3 text-left dark:border-zinc-800 sm:px-4 sm:py-4">
                <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-[var(--ui-top-bar-from)] via-[var(--ui-top-bar-via)] to-[var(--ui-top-bar-to)] opacity-80" />
                <SheetTitle className="flex items-center gap-2.5 pt-2 text-lg font-bold font-headline text-[var(--ui-text)] dark:text-zinc-100 sm:gap-3 sm:text-xl">
                  <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-[var(--ui-accent-gradient-from)] to-[var(--ui-accent-gradient-to)] text-white shadow-lg sm:h-10 sm:w-10 sm:rounded-2xl">
                    <Zap className="h-4 w-4 sm:h-5 sm:w-5" />
                  </div>
                  ePulsaku Menu
                </SheetTitle>
              </SheetHeader>
              
              <ScrollArea className="flex-1">
                <nav className="flex flex-col gap-1.5 p-3 sm:gap-2 sm:p-4">
                  {sidebarNavGroups.filter(g => g.items.length > 0).map((group, index) => {
                    const Icon = group.icon;
                    return (
                      <div key={group.label} className="space-y-0.5 sm:space-y-1">
                          <h3 className="px-2.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--ui-text-secondary)] dark:text-zinc-500 sm:px-3 sm:text-xs sm:tracking-wider">{group.label}</h3>
                          <div className="flex flex-col gap-0.5">
                              {group.items.map((item) => (
                                  <SheetClose asChild key={`sidebar-${item.href}`} onClick={() => setIsSheetOpen(false)}>
                                      <NavLink href={item.href} icon={item.icon ? <item.icon /> : <Zap className="h-4 w-4"/>} isActive={pathname === item.href}>
                                          <span className="flex items-center gap-2">
                                            <span>{item.label}</span>
                                            {item.key === 'shift_handover' && openHandoverCount > 0 ? (
                                              <Badge className="rounded-full bg-amber-500 px-1.5 py-0 text-[10px] text-white hover:bg-amber-500">
                                                {openHandoverCount}
                                              </Badge>
                                            ) : null}
                                          </span>
                                      </NavLink>
                                  </SheetClose>
                              ))}
                          </div>
                          {index < sidebarNavGroups.filter(g => g.items.length > 0).length - 1 && <Separator className="my-1.5 bg-[var(--ui-border)] dark:bg-zinc-800 sm:my-2"/>}
                      </div>
                    )
                  })}
                </nav>
              </ScrollArea>

              {user && (
                <div className="mt-auto space-y-2.5 border-t border-[var(--ui-border)] bg-[var(--ui-card-alt)] p-3 dark:border-zinc-800 dark:bg-zinc-900 sm:space-y-3 sm:p-4">
                   {(() => {
                     const normalizedRole = normalizeUserRole(user.role) || 'staf';
                     return (
                   <div className="mb-1.5 flex items-center justify-between gap-2 px-1.5 text-sm sm:mb-2 sm:px-2">
                      <div className="flex flex-col">
                        <span className="font-semibold text-[var(--ui-text)] dark:text-zinc-100">{user.username}</span>
                        <Badge variant="outline" className={cn('capitalize text-xs w-fit mt-1', roleColorMap[normalizedRole] || 'border-gray-300')}>
                           {roleDisplayMap[normalizedRole] || user.role}
                        </Badge>
                      </div>
                      <SheetClose asChild onClick={() => setIsSheetOpen(false)}>
                         <Link href="/account">
                           <Button
                              variant="ghost"
                              size="icon"
                              className="rounded-xl text-[var(--ui-text-muted)] hover:bg-[var(--ui-accent-bg)] hover:text-[var(--ui-accent)] dark:text-zinc-400"
                            >
                              <Settings className="h-4 w-4 sm:h-5 sm:w-5" />
                              <span className="sr-only">Account Settings</span>
                           </Button>
                         </Link>
                      </SheetClose>
                   </div>
                     );
                   })()}
                  
                    <Button onClick={handleLogout} variant="ghost" className="w-full justify-start rounded-xl px-2.5 py-2 text-sm text-red-600 hover:bg-red-500/10 hover:text-red-700 dark:text-red-400 dark:hover:bg-red-500/10 dark:hover:text-red-300 sm:px-3 sm:py-2.5">
                          <LogOut className="mr-2.5 h-4 w-4 sm:mr-3 sm:h-5 sm:w-5" /> Logout
                    </Button>
                </div>
              )}
            </SheetContent>
          </Sheet>

          <Link href="/dashboard" className="ml-1 flex items-center gap-1.5 text-[var(--ui-accent)] sm:ml-2 sm:gap-2">
            <Zap className="h-6 w-6 sm:h-7 sm:w-7" />
            <span className="text-lg font-bold font-headline sm:text-xl">ePulsaku</span>
          </Link>
        </div>
        <div className="flex items-center gap-2">
            <ModeToggle />
        </div>
      </div>
    </header>
  );
}
