"use client";

import Link from "next/link";
import {
  Activity,
  ArrowRight,
  Contact,
  DollarSign,
  History,
  KeyRound,
  Palette,
  Phone,
  Settings,
  ShieldAlert,
  ShieldCheck,
  TrendingUp,
  UserCog,
  UserPlus,
  Wrench,
  Zap,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { ALL_APP_MENUS, hasPermission } from "@/lib/auth-utils";

const accountSubMenus = [
  { href: "/account/change-password", label: "Ganti Password", icon: KeyRound, key: "pengaturan_akun" },
  { href: "/account/change-pin", label: "Ganti PIN Transaksi", icon: KeyRound, key: "pengaturan_akun" },
  { href: "/account/two-factor", label: "Keamanan 2FA", icon: ShieldCheck, key: "pengaturan_akun" },
  { href: "/account/login-activity", label: "Aktivitas Login", icon: Activity, key: "pengaturan_akun" },
  { href: "/account/ui-theme", label: "Tema Tampilan", icon: Palette, key: "pengaturan_akun" },
];

const adminLinks = ALL_APP_MENUS.filter((menu) => !["pengaturan_akun", "manajemen_pengguna"].includes(menu.key) && !menu.href.startsWith("/tools"));
const managementLinks = ALL_APP_MENUS.filter((menu) => ["manajemen_pengguna"].includes(menu.key));
const toolsLinks = ALL_APP_MENUS.filter((menu) => menu.href.startsWith("/tools"));

function getAdminLinkIcon(key: string) {
  if (key.includes("harga")) return DollarSign;
  if (key.includes("riwayat")) return History;
  if (key.includes("laporan")) return TrendingUp;
  if (key.includes("admin")) return ShieldAlert;
  return Settings;
}

function getToolsLinkIcon(key: string) {
  if (key.includes("game")) return Contact;
  if (key.includes("pln")) return Zap;
  if (key.includes("operator")) return Phone;
  return Wrench;
}

export default function AccountHubPage() {
  const { user } = useAuth();

  if (!user) return null;

  const hasAccess = (key: string) => hasPermission(user, key);

  const visibleAccountSubMenus = accountSubMenus.filter((link) => hasAccess(link.key));
  const visibleAdminLinks = adminLinks
    .filter((link) => hasAccess(link.key))
    .map((link) => ({ ...link, icon: getAdminLinkIcon(link.key) }));
  const visibleManagementLinks = managementLinks
    .filter((link) => hasAccess(link.key))
    .map((link) => ({ ...link, icon: UserCog }));
  const visibleToolsLinks = toolsLinks
    .filter((link) => hasAccess(link.key))
    .map((link) => ({ ...link, icon: getToolsLinkIcon(link.key) }));

  const sections: Array<{ title: string; icon: typeof ShieldCheck; links: Array<{ href: string; label: string; icon?: typeof ShieldCheck }> }> = [
    { title: "Keamanan akun", icon: ShieldCheck, links: visibleAccountSubMenus },
    { title: "Pengaturan & laporan", icon: Settings, links: visibleAdminLinks },
    { title: "Manajemen", icon: UserPlus, links: visibleManagementLinks },
    { title: "Alat & utilitas", icon: Wrench, links: visibleToolsLinks },
  ].filter((s) => s.links.length > 0);

  return (
    <div className="space-y-6">
      {sections.map((section) => (
        <section key={section.title} className="rounded-[26px] border border-[var(--ui-border)] bg-[var(--ui-card)] p-4 dark:border-zinc-800 dark:bg-zinc-950 sm:p-5">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--ui-accent-bg)] text-[var(--ui-accent)] dark:bg-[var(--ui-accent)]/10">
              <section.icon className="h-4 w-4" />
            </div>
            <h2 className="text-sm font-semibold text-[var(--ui-text)] dark:text-zinc-100">{section.title}</h2>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            {section.links.map((link) => {
              const LinkIcon = link.icon ?? ArrowRight;
              return (
                <Link
                  href={link.href}
                  key={link.href}
                  className="group flex items-center gap-3 rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-card-alt)]/50 px-4 py-3 text-[var(--ui-text)] transition-colors hover:border-[var(--ui-accent)]/30 hover:bg-[var(--ui-accent-bg)]/50 dark:border-zinc-800 dark:bg-zinc-900/40 dark:text-zinc-100 dark:hover:border-[var(--ui-accent)]/30 dark:hover:bg-zinc-900/80"
                >
                  <LinkIcon className="h-4 w-4 flex-shrink-0 text-[var(--ui-accent)]" />
                  <span className="text-sm font-medium">{link.label}</span>
                  <ArrowRight className="ml-auto h-3.5 w-3.5 flex-shrink-0 text-[var(--ui-text-muted)] opacity-0 transition-opacity group-hover:opacity-100 dark:text-zinc-500" />
                </Link>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
