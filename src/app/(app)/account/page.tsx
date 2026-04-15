// src/app/(app)/account/page.tsx
"use client";

import Link from 'next/link';
import { ArrowRight, ShieldCheck, Settings, DollarSign, ShieldAlert, History, UserPlus, KeyRound as KeyIcon, TrendingUp, Wrench, Contact, Phone, Zap, UserCog, KeyRound, Activity, Palette } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { ALL_APP_MENUS, hasPermission } from '@/lib/auth-utils';

// Define sub-menus for the account section explicitly
const accountSubMenus = [
  { href: '/account/change-password', label: 'Ganti Password', description: 'Perbarui password akun Anda.', icon: KeyRound, key: 'pengaturan_akun' },
  { href: '/account/change-pin', label: 'Ganti PIN Transaksi', description: 'Perbarui PIN 6-digit Anda.', icon: KeyIcon, key: 'pengaturan_akun' },
  { href: '/account/login-activity', label: 'Aktivitas Login', description: 'Lihat riwayat login terakhir.', icon: Activity, key: 'pengaturan_akun' },
  { href: '/account/ui-theme', label: 'Tema Tampilan UI', description: 'Pilih tema visual untuk akun Anda.', icon: Palette, key: 'pengaturan_akun' },
];

const adminLinks = ALL_APP_MENUS.filter(m => !['pengaturan_akun', 'manajemen_pengguna'].includes(m.key) && !m.href.startsWith('/tools'));
const managementLinks = ALL_APP_MENUS.filter(m => ['manajemen_pengguna'].includes(m.key));
const toolsLinks = ALL_APP_MENUS.filter(m => m.href.startsWith('/tools'));

export default function AccountHubPage() {
  const { user } = useAuth();
  
  if (!user) return null;

  const themedSectionIconClass = "h-6 w-6 text-[var(--ui-accent)]";
  const themedRowClass =
    "flex items-center justify-between rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-card)] p-4 text-[var(--ui-text)] shadow-sm transition-colors hover:bg-[var(--ui-accent-bg)] dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100";
  const themedRowIconClass = "h-6 w-6 text-[var(--ui-text-muted)] dark:text-zinc-400";
  const themedDescriptionClass = "text-sm text-[var(--ui-text-muted)] dark:text-zinc-400";
  const themedArrowClass = "h-5 w-5 text-[var(--ui-text-muted)] dark:text-zinc-400";

  const hasAccess = (key: string) => {
    return hasPermission(user, key);
  };

  const visibleAccountSubMenus = accountSubMenus.filter(link => hasAccess(link.key));
  const visibleAdminLinks = adminLinks.filter(link => hasAccess(link.key));
  const visibleManagementLinks = managementLinks.filter(link => hasAccess(link.key));
  const visibleToolsLinks = toolsLinks.filter(link => hasAccess(link.key));

  return (
    <div className="space-y-6">
      {visibleAccountSubMenus.length > 0 && (
        <div>
            <div className="flex items-center gap-3 mb-3">
              <ShieldCheck className={themedSectionIconClass}/>
              <h2 className="text-xl font-semibold font-headline text-[var(--ui-text)] dark:text-zinc-100">Keamanan Akun</h2>
            </div>
            <div className="space-y-3">
            {visibleAccountSubMenus.map((link) => {
              const Icon = link.icon;
              return (
              <Link href={link.href} key={link.href} className="block">
                <div className={themedRowClass}>
                  <div className="flex items-center gap-4">
                    <Icon className={themedRowIconClass} />
                    <div>
                      <h3 className="font-semibold text-[var(--ui-text)] dark:text-zinc-100">{link.label}</h3>
                      <p className={themedDescriptionClass}>{link.description}</p>
                    </div>
                  </div>
                  <ArrowRight className={themedArrowClass} />
                </div>
              </Link>
            )})}
            </div>
        </div>
      )}
      
      {visibleAdminLinks.length > 0 && (
        <div>
          <div className="flex items-center gap-3 mb-3">
              <Settings className={themedSectionIconClass}/>
              <h2 className="text-xl font-semibold font-headline text-[var(--ui-text)] dark:text-zinc-100">Pengaturan & Laporan</h2>
            </div>
          <div className="space-y-3">
            {visibleAdminLinks.map((link) => {
                 let Icon = Zap;
                 if (link.key.includes('harga')) Icon = DollarSign;
                 if (link.key.includes('riwayat')) Icon = History;
                 if (link.key.includes('laporan')) Icon = TrendingUp;
                 if (link.key.includes('admin')) Icon = ShieldAlert;
                return (
                <Link href={link.href} key={link.href} className="block">
                  <div className={themedRowClass}>
                    <div className="flex items-center gap-4">
                        <Icon className={themedRowIconClass} />
                        <div>
                          <h3 className="font-semibold text-[var(--ui-text)] dark:text-zinc-100">{link.label}</h3>
                          <p className={themedDescriptionClass}>{link.description}</p>
                        </div>
                    </div>
                    <ArrowRight className={themedArrowClass} />
                  </div>
                </Link>
            )})}
          </div>
        </div>
      )}

      {visibleManagementLinks.length > 0 && (
        <div>
          <div className="flex items-center gap-3 mb-3">
              <UserPlus className={themedSectionIconClass}/>
              <h2 className="text-xl font-semibold font-headline text-[var(--ui-text)] dark:text-zinc-100">Manajemen</h2>
            </div>
          <div className="space-y-3">
            {visibleManagementLinks.map((link) => (
              <Link href={link.href} key={link.href} className="block">
                <div className={themedRowClass}>
                  <div className="flex items-center gap-4">
                    <UserCog className={themedRowIconClass} />
                    <div>
                      <h3 className="font-semibold text-[var(--ui-text)] dark:text-zinc-100">{link.label}</h3>
                      <p className={themedDescriptionClass}>{link.description}</p>
                    </div>
                  </div>
                  <ArrowRight className={themedArrowClass} />
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {visibleToolsLinks.length > 0 && (
        <div>
          <div className="flex items-center gap-3 mb-3">
              <Wrench className={themedSectionIconClass}/>
              <h2 className="text-xl font-semibold font-headline text-[var(--ui-text)] dark:text-zinc-100">Alat & Utilitas</h2>
            </div>
          <div className="space-y-3">
            {visibleToolsLinks.map((link) => {
                 let Icon = Wrench;
                 if (link.key.includes('game')) Icon = Contact;
                 if (link.key.includes('pln')) Icon = Zap;
                 if (link.key.includes('operator')) Icon = Phone;
                 return (
              <Link href={link.href} key={link.href} className="block">
                <div className={themedRowClass}>
                  <div className="flex items-center gap-4">
                    <Icon className={themedRowIconClass} />
                    <div>
                      <h3 className="font-semibold text-[var(--ui-text)] dark:text-zinc-100">{link.label}</h3>
                      <p className={themedDescriptionClass}>{link.description}</p>
                    </div>
                  </div>
                  <ArrowRight className={themedArrowClass} />
                </div>
              </Link>
            )})}
          </div>
        </div>
      )}

    </div>
  );
}
