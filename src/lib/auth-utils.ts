// src/lib/auth-utils.ts

import { LayoutDashboard, ShoppingCart, History, TrendingUp, Wrench, MessageSquare, UserCog, Settings, DollarSign, ShieldAlert, UserPlus, KeyRound, ShieldCheck, Contact, Phone, Zap } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { UiThemeName } from './ui-theme';

// --- CONSTANTS ---
export const SALT_ROUNDS = 10;
export const MAX_ATTEMPTS = 5;
export const LOCKOUT_PERIOD_MS = 2 * 60 * 1000;

// --- TYPES & INTERFACES ---
export type UserRole = 'staf' | 'admin' | 'super_admin';

export interface User {
  id: string;
  username: string;
  role: UserRole;
  permissions: string[]; // Added user-specific permissions
  uiThemePreference?: UiThemeName;
}

export interface StoredUser {
  _id: string;
  username: string;
  email?: string;
  hashedPassword?: string;
  hashedPin?: string;
  role: UserRole;
  permissions: string[]; // Added user-specific permissions
  createdBy?: string;
  telegramChatId?: string;
  isDisabled?: boolean;
  failedPinAttempts?: number;
  uiThemePreference?: UiThemeName;
}

export interface LoginActivity {
  _id: string;
  userId: string;
  username: string;
  loginTimestamp: Date;
  userAgent?: string;
  ipAddress?: string;
}

export interface UserUpdatePayload {
    email?: string;
    role?: UserRole;
    permissions?: string[];
    newPassword?: string;
    newPin?: string;
    telegramChatId?: string;
}

type UserLike = Pick<User, 'role' | 'permissions'> | null | undefined;

export function normalizeUserRole(role: string | null | undefined): UserRole | null {
    if (!role) return null;

    const normalized = role.trim().toLowerCase().replace(/[\s-]+/g, '_');

    if (normalized === 'super_admin' || normalized === 'superadmin' || normalized === 'owner') return 'super_admin';
    if (normalized === 'admin') return 'admin';
    if (normalized === 'staf' || normalized === 'staff') return 'staf';

    return null;
}

export function isSuperAdminRole(role: string | null | undefined): boolean {
    return normalizeUserRole(role) === 'super_admin';
}

export function hasAllAccess(permissions: string[] | null | undefined): boolean {
    return !!permissions?.includes('all_access');
}

export function hasPermission(user: UserLike, requiredPermission: string): boolean {
    if (!user) return false;

    const effectivePermission = requiredPermission === 'shift_handover'
      ? 'riwayat_transaksi'
      : requiredPermission;

    return (
        isSuperAdminRole(user.role) ||
        hasAllAccess(user.permissions) ||
        user.permissions?.includes(effectivePermission) === true ||
        user.permissions?.includes(requiredPermission) === true
    );
}

// --- Menu Permissions ---
export interface AppMenu {
    key: string;
    href: string;
    label: string;
    description: string;
    icon?: LucideIcon;
    roles?: UserRole[]; // Optional: for default roles if needed
}

export const ALL_APP_MENUS: AppMenu[] = [
  { key: 'dashboard', href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, description: 'Halaman ringkasan utama.' },
  { key: 'layanan_digiflazz', href: '/layanan/digiflazz', label: 'Layanan Digiflazz', icon: ShoppingCart, description: 'Akses produk dari Digiflazz.' },
  { key: 'layanan_tokovoucher', href: '/order/tokovoucher', label: 'Layanan TokoVoucher', icon: ShoppingCart, description: 'Akses produk dari TokoVoucher.' },
  { key: 'riwayat_transaksi', href: '/transactions', label: 'Riwayat Transaksi', icon: History, description: 'Lihat semua log transaksi.' },
  { key: 'shift_handover', href: '/shift-handover', label: 'Shift Handover', icon: ShieldCheck, description: 'Catatan operasional pergantian sif.' },
  { key: 'laporan_profit', href: '/profit-report', label: 'Laporan Profit & Statement', icon: TrendingUp, description: 'Analisis keuntungan dan detail transaksi.' },
  { key: 'cek_nickname_game', href: '/tools/game-nickname-checker', label: 'Cek Nickname Game', icon: Contact, description: 'Alat bantu cek ID game.' },
  { key: 'cek_id_pln', href: '/tools/pln-checker', label: 'Cek ID Pelanggan PLN', icon: Zap, description: 'Alat bantu cek ID PLN.' },
  { key: 'cek_operator_seluler', href: '/tools/operator-checker', label: 'Cek Operator Seluler', icon: Phone, description: 'Alat bantu cek nomor HP.' },
  { key: 'chat_ai', href: '/tools/chat', label: 'Chat AI Gemini', icon: MessageSquare, description: 'Asisten AI untuk membantu Anda.' },
  { key: 'pengaturan_akun', href: '/account', label: 'Pengaturan Akun & Keamanan', icon: UserCog, description: 'Ganti password, PIN, dll.' },
  { key: 'pengaturan_admin', href: '/admin-settings', label: 'Pengaturan Kredensial Admin', icon: ShieldAlert, description: 'Kelola API Key provider.' },
  { key: 'pengaturan_harga_digiflazz', href: '/price-settings', label: 'Pengaturan Harga Digiflazz', icon: DollarSign, description: 'Set harga jual produk Digiflazz.' },
  { key: 'pengaturan_harga_tokovoucher', href: '/tokovoucher-price-settings', label: 'Pengaturan Harga TokoVoucher', icon: DollarSign, description: 'Set harga jual produk TokoVoucher.' },
  { key: 'manajemen_pengguna', href: '/management/users', label: 'Manajemen Pengguna', icon: UserPlus, description: 'Tambah atau kelola staf/admin.', roles: ['super_admin'] },
];
