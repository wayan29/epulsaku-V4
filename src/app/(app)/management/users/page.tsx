// src/app/(app)/management/users/page.tsx
"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import {
  type StoredUser,
  createUser,
  deleteUser,
  getAllUsers,
  resetUserTwoFactor,
  toggleUserStatus,
  updateUser,
} from "@/lib/user-utils";
import {
  ALL_APP_MENUS,
  hasPermission,
  isSuperAdminRole,
  normalizeUserRole,
} from "@/lib/auth-utils";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  AlertTriangle,
  Edit,
  KeyRound,
  Loader2,
  Lock,
  Mail,
  Power,
  PowerOff,
  Search,
  Send,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  UserCircle2,
  UserCog,
  UserPlus,
  Users,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import ProtectedRoute from "@/components/core/ProtectedRoute";

const roleOptions = ["staf", "admin"] as const;
const menuKeys = ALL_APP_MENUS.map((menu) => menu.key);

const baseUserFormSchema = z.object({
  username: z.string().min(3, "Username minimal 3 karakter").optional(),
  email: z.string().email("Format email tidak valid").optional().or(z.literal("")),
  password: z.string().min(6, "Password minimal 6 karakter").optional().or(z.literal("")),
  pin: z
    .string()
    .length(6, "PIN harus 6 digit")
    .regex(/^\d+$/, "PIN hanya boleh berisi angka")
    .optional()
    .or(z.literal("")),
  role: z.enum(roleOptions, { required_error: "Role wajib dipilih" }),
  telegramChatId: z
    .string()
    .regex(/^\-?\d*$/, "Chat ID harus berupa angka yang valid")
    .optional()
    .or(z.literal("")),
  permissions: z.array(z.string()).optional().default([]),
});

const addUserFormSchema = baseUserFormSchema.extend({
  username: z.string().min(3, "Username minimal 3 karakter"),
  password: z.string().min(6, "Password minimal 6 karakter"),
  adminPasswordConfirmation: z.string().min(1, "Password admin wajib diisi untuk membuat user"),
});

const editUserFormSchema = baseUserFormSchema.omit({ username: true });

type AddUserFormValues = z.infer<typeof addUserFormSchema>;
type EditUserFormValues = z.infer<typeof editUserFormSchema>;

const addUserDefaultValues: AddUserFormValues = {
  username: "",
  email: "",
  password: "",
  pin: "",
  role: "staf",
  telegramChatId: "",
  permissions: [],
  adminPasswordConfirmation: "",
};

const editUserDefaultValues: EditUserFormValues = {
  email: "",
  role: "staf",
  password: "",
  pin: "",
  telegramChatId: "",
  permissions: [],
};

const themedInputClass =
  "rounded-2xl border-[var(--ui-input-border)] bg-[var(--ui-input-bg)] text-[var(--ui-text)] placeholder:text-[var(--ui-text-secondary)] shadow-sm focus-visible:ring-[var(--ui-accent)] dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-500";
const themedSelectTriggerClass =
  "rounded-2xl border-[var(--ui-input-border)] bg-[var(--ui-input-bg)] text-[var(--ui-text)] shadow-sm focus:ring-[var(--ui-accent)] dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100";
const themedSelectContentClass =
  "border-[var(--ui-border)] bg-[var(--ui-card)] text-[var(--ui-text)] dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100";
const themedDialogClass =
  "max-w-3xl rounded-[28px] border-[var(--ui-border)] bg-[var(--ui-card)] text-[var(--ui-text)] shadow-xl dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100";
const themedOutlineButtonClass =
  "rounded-2xl border-[var(--ui-border)] bg-[var(--ui-card-alt)] text-[var(--ui-text)] hover:bg-[var(--ui-accent-bg)] hover:text-[var(--ui-accent)] dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100";
const primaryButtonClass =
  "rounded-2xl bg-gradient-to-r from-[var(--ui-accent-gradient-to)] to-[var(--ui-accent-gradient-from)] text-white shadow-md transition-all duration-300 hover:from-[var(--ui-accent-hover)] hover:to-[var(--ui-accent-gradient-to)] hover:shadow-lg";
const themedLabelClass = "flex items-center text-sm font-medium text-[var(--ui-text)] dark:text-zinc-100";
const themedIconClass = "mr-2 h-4 w-4 text-[var(--ui-accent)]";

function getRoleLabel(role?: string) {
  const normalizedRole = normalizeUserRole(role);

  if (normalizedRole === "super_admin") return "Super Admin";
  if (normalizedRole === "admin") return "Admin";
  return "Staf";
}

function getRoleBadgeClass(role?: string) {
  const normalizedRole = normalizeUserRole(role);

  if (normalizedRole === "super_admin") {
    return "border-red-300 bg-red-100 text-red-800 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-200";
  }

  if (normalizedRole === "admin") {
    return "border-sky-300 bg-sky-100 text-sky-800 dark:border-sky-900/40 dark:bg-sky-950/30 dark:text-sky-200";
  }

  return "border-emerald-300 bg-emerald-100 text-emerald-800 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-200";
}

export default function UserManagementPage() {
  const { user: currentUser } = useAuth();
  const { toast } = useToast();

  const [users, setUsers] = useState<StoredUser[]>([]);
  const [isLoadingUsers, setIsLoadingUsers] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isTogglingStatus, setIsTogglingStatus] = useState(false);
  const [isResettingTwoFactor, setIsResettingTwoFactor] = useState(false);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [userToDelete, setUserToDelete] = useState<StoredUser | null>(null);
  const [userToEdit, setUserToEdit] = useState<StoredUser | null>(null);
  const [userToToggle, setUserToToggle] = useState<StoredUser | null>(null);
  const [userToResetTwoFactor, setUserToResetTwoFactor] = useState<StoredUser | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [roleFilter, setRoleFilter] = useState<"all" | "staf" | "admin" | "super_admin">("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "disabled">("all");

  const canManageUsers = hasPermission(currentUser, "manajemen_pengguna");

  const addUserForm = useForm<AddUserFormValues>({
    resolver: zodResolver(addUserFormSchema),
    defaultValues: addUserDefaultValues,
  });

  const editUserForm = useForm<EditUserFormValues>({
    resolver: zodResolver(editUserFormSchema),
    defaultValues: editUserDefaultValues,
  });

  const fetchUsers = useCallback(async () => {
    setIsLoadingUsers(true);
    try {
      const allUsers = await getAllUsers();
      setUsers(allUsers);
    } catch (error) {
      toast({
        title: "Gagal memuat user",
        description: "Daftar user tidak dapat dimuat saat ini.",
        variant: "destructive",
      });
    } finally {
      setIsLoadingUsers(false);
    }
  }, [toast]);

  useEffect(() => {
    if (canManageUsers) {
      fetchUsers();
    }
  }, [canManageUsers, fetchUsers]);

  const userStats = useMemo(() => {
    const total = users.length;
    const active = users.filter((user) => !user.isDisabled).length;
    const disabled = users.filter((user) => user.isDisabled).length;
    const admins = users.filter((user) => {
      const role = normalizeUserRole(user.role);
      return role === "admin" || role === "super_admin";
    }).length;

    return { total, active, disabled, admins };
  }, [users]);

  const filteredUsers = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();

    return users.filter((user) => {
      const matchesSearch =
        !normalizedSearch ||
        user.username.toLowerCase().includes(normalizedSearch) ||
        (user.email || "").toLowerCase().includes(normalizedSearch) ||
        (user.telegramChatId || "").toLowerCase().includes(normalizedSearch);

      const matchesRole = roleFilter === "all" || normalizeUserRole(user.role) === roleFilter;
      const matchesStatus = statusFilter === "all" || (statusFilter === "active" ? !user.isDisabled : !!user.isDisabled);

      return matchesSearch && matchesRole && matchesStatus;
    });
  }, [roleFilter, searchTerm, statusFilter, users]);

  async function onAddUserSubmit(values: AddUserFormValues) {
    if (!currentUser || !canManageUsers) {
      toast({
        title: "Akses ditolak",
        description: "Anda tidak memiliki izin untuk membuat user baru.",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await createUser({
        username: values.username,
        email: values.email,
        passwordPlain: values.password,
        pinPlain: values.pin,
        role: values.role,
        permissions: values.permissions,
        creatorId: currentUser.id,
        telegramChatId: values.telegramChatId,
        adminPasswordConfirmation: values.adminPasswordConfirmation,
      });

      if (result.success) {
        toast({
          title: "User berhasil dibuat",
          description: `Akun "${values.username}" berhasil ditambahkan ke sistem.`,
        });
        addUserForm.reset(addUserDefaultValues);
        setIsAddDialogOpen(false);
        fetchUsers();
      } else {
        toast({
          title: "Gagal membuat user",
          description: result.message,
          variant: "destructive",
        });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Terjadi kesalahan yang tidak diketahui.";
      toast({
        title: "Terjadi kesalahan",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  async function onEditUserSubmit(values: EditUserFormValues) {
    if (!userToEdit || !currentUser || !canManageUsers) return;

    setIsSubmitting(true);
    try {
      const result = await updateUser({
        userId: userToEdit._id,
        updates: {
          email: values.email,
          role: values.role,
          permissions: values.permissions,
          newPassword: values.password,
          newPin: values.pin,
          telegramChatId: values.telegramChatId,
        },
        editorId: currentUser.id,
      });

      if (result.success) {
        toast({
          title: "User berhasil diperbarui",
          description: `Data akun "${userToEdit.username}" telah diperbarui.`,
        });
        setIsEditing(false);
        setUserToEdit(null);
        fetchUsers();
      } else {
        toast({
          title: "Gagal memperbarui user",
          description: result.message,
          variant: "destructive",
        });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Terjadi kesalahan yang tidak diketahui.";
      toast({
        title: "Terjadi kesalahan",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  const handleEditClick = (user: StoredUser) => {
    setUserToEdit(user);
    editUserForm.reset({
      email: user.email || "",
      role: user.role === "admin" ? "admin" : "staf",
      password: "",
      pin: "",
      telegramChatId: user.telegramChatId || "",
      permissions: user.permissions || [],
    });
    setIsEditing(true);
  };

  const handleDeleteClick = (user: StoredUser) => {
    setUserToDelete(user);
  };

  const handleToggleStatusClick = (user: StoredUser) => {
    setUserToToggle(user);
  };

  const handleResetTwoFactorClick = (user: StoredUser) => {
    setUserToResetTwoFactor(user);
  };

  const handleConfirmDelete = async () => {
    if (!userToDelete || !currentUser || !canManageUsers) {
      toast({
        title: "Aksi tidak tersedia",
        description: "User tidak dapat dihapus saat ini.",
        variant: "destructive",
      });
      return;
    }

    setIsDeleting(true);
    const result = await deleteUser(userToDelete._id, currentUser.id);

    if (result.success) {
      toast({
        title: "User berhasil dihapus",
        description: `Akun "${userToDelete.username}" telah dihapus dari sistem.`,
      });
      fetchUsers();
    } else {
      toast({
        title: "Gagal menghapus user",
        description: result.message,
        variant: "destructive",
      });
    }

    setIsDeleting(false);
    setUserToDelete(null);
  };

  const handleConfirmToggleStatus = async () => {
    if (!userToToggle || !currentUser || !canManageUsers) {
      toast({
        title: "Aksi tidak tersedia",
        description: "Status user tidak dapat diubah saat ini.",
        variant: "destructive",
      });
      return;
    }

    setIsTogglingStatus(true);
    const result = await toggleUserStatus(userToToggle._id, currentUser.id);

    if (result.success) {
      toast({
        title: "Status user diperbarui",
        description: `Akun "${userToToggle.username}" berhasil ${userToToggle.isDisabled ? "diaktifkan" : "dinonaktifkan"}.`,
      });
      fetchUsers();
    } else {
      toast({
        title: "Gagal mengubah status",
        description: result.message,
        variant: "destructive",
      });
    }

    setIsTogglingStatus(false);
    setUserToToggle(null);
  };

  const handleConfirmResetTwoFactor = async () => {
    if (!userToResetTwoFactor || !currentUser || !canManageUsers) {
      toast({
        title: "Aksi tidak tersedia",
        description: "2FA user tidak dapat direset saat ini.",
        variant: "destructive",
      });
      return;
    }

    setIsResettingTwoFactor(true);
    const result = await resetUserTwoFactor(userToResetTwoFactor._id, currentUser.id);

    if (result.success) {
      toast({
        title: "2FA user dinonaktifkan",
        description: `Akun "${userToResetTwoFactor.username}" harus setup 2FA ulang jika dibutuhkan.`,
      });
      fetchUsers();
    } else {
      toast({
        title: "Gagal reset 2FA",
        description: result.message,
        variant: "destructive",
      });
    }

    setIsResettingTwoFactor(false);
    setUserToResetTwoFactor(null);
  };

  const renderPermissionsSelector = (formInstance: any, selectAllId: string) => (
    <div className="col-span-1 space-y-3 rounded-[26px] border border-[var(--ui-border)] bg-[var(--ui-card-alt)]/70 p-4 md:col-span-2 dark:border-zinc-800 dark:bg-zinc-900/60">
      <div>
        <FormLabel className="flex items-center gap-2 text-base font-semibold text-[var(--ui-text)] dark:text-zinc-100">
          <ShieldCheck className="h-4 w-4 text-[var(--ui-accent)]" />
          Hak akses menu
        </FormLabel>
        <p className="mt-1 text-sm text-[var(--ui-text-muted)] dark:text-zinc-400">
          Pilih menu yang boleh diakses oleh user ini pada dashboard operasional.
        </p>
      </div>

      <Controller
        name="permissions"
        control={formInstance.control}
        render={({ field }) => (
          <>
            <div className="flex items-center space-x-3 rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-card)] px-4 py-3 dark:border-zinc-800 dark:bg-zinc-950">
              <Checkbox
                id={selectAllId}
                onCheckedChange={(checked) => field.onChange(checked ? menuKeys : [])}
                checked={field.value?.length === menuKeys.length}
              />
              <Label htmlFor={selectAllId} className="cursor-pointer text-sm font-semibold text-[var(--ui-text)] dark:text-zinc-100">
                Pilih semua menu
              </Label>
            </div>

            <div className="grid max-h-64 grid-cols-1 gap-2 overflow-y-auto rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-card)] p-2 sm:grid-cols-2 lg:grid-cols-3 dark:border-zinc-800 dark:bg-zinc-950">
              {ALL_APP_MENUS.filter((menu) => menu.key !== "manajemen_pengguna").map((menu) => (
                <FormItem
                  key={menu.key}
                  className="flex flex-row items-start space-x-3 space-y-0 rounded-2xl border border-transparent p-3 hover:border-[var(--ui-accent)]/20 hover:bg-[var(--ui-accent-bg)]/60"
                >
                  <FormControl>
                    <Checkbox
                      checked={field.value?.includes(menu.key)}
                      onCheckedChange={(checked) => {
                        return checked
                          ? field.onChange([...(field.value || []), menu.key])
                          : field.onChange((field.value || []).filter((value: string) => value !== menu.key));
                      }}
                    />
                  </FormControl>
                  <div className="space-y-1 leading-none">
                    <FormLabel className="cursor-pointer font-medium text-[var(--ui-text)] dark:text-zinc-100">
                      {menu.label}
                    </FormLabel>
                    <p className="text-xs leading-5 text-[var(--ui-text-muted)] dark:text-zinc-400">
                      {menu.description}
                    </p>
                  </div>
                </FormItem>
              ))}
            </div>
          </>
        )}
      />
    </div>
  );

  return (
    <ProtectedRoute requiredPermission="manajemen_pengguna">
      <div className="mx-auto max-w-7xl space-y-6 pb-10">
        <section className="overflow-hidden rounded-[28px] border border-[var(--ui-border)] bg-[var(--ui-card)] text-[var(--ui-text)] shadow-[0_24px_70px_rgba(15,23,42,0.08)] dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100">
          <div className="h-1 w-full bg-gradient-to-r from-[var(--ui-top-bar-from)] via-[var(--ui-top-bar-via)] to-[var(--ui-top-bar-to)]" />
          <div className="grid gap-5 px-5 py-5 sm:px-6 sm:py-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start lg:px-8 lg:py-8">
            <div className="flex items-start gap-4">
              <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-[1.35rem] bg-gradient-to-br from-[var(--ui-accent-gradient-from)] to-[var(--ui-accent-gradient-to)] text-white shadow-lg">
                <UserCog className="h-6 w-6" />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--ui-text-secondary)] dark:text-zinc-500">
                  Manajemen akses
                </p>
                <h1 className="mt-2 text-2xl font-bold tracking-tight text-[var(--ui-text)] dark:text-zinc-100 sm:text-3xl lg:text-[2.15rem]">
                  Kelola user operasional
                </h1>
                <p className="mt-3 max-w-3xl text-sm leading-6 text-[var(--ui-text-muted)] dark:text-zinc-400 sm:text-base">
                  Tambah, edit, aktifkan, atau nonaktifkan akun staf dan admin agar akses kerja, handover, dan kontrol dashboard tetap tertata.
                </p>
              </div>
            </div>

            <Dialog
              open={isAddDialogOpen}
              onOpenChange={(open) => {
                setIsAddDialogOpen(open);
                if (!open) {
                  addUserForm.reset(addUserDefaultValues);
                }
              }}
            >
              <DialogTrigger asChild>
                <Button className={`w-full sm:w-auto ${primaryButtonClass}`}>
                  <UserPlus className="mr-2 h-4 w-4" />
                  Tambah user baru
                </Button>
              </DialogTrigger>
              <DialogContent className={themedDialogClass}>
                <DialogHeader>
                  <DialogTitle className="text-[var(--ui-text)] dark:text-zinc-100">Buat user baru</DialogTitle>
                  <DialogDescription className="text-[var(--ui-text-muted)] dark:text-zinc-400">
                    Tambahkan akun baru beserta role, hak akses menu, dan data opsional seperti PIN transaksi atau Telegram Chat ID.
                  </DialogDescription>
                </DialogHeader>

                <Form {...addUserForm}>
                  <form onSubmit={addUserForm.handleSubmit(onAddUserSubmit)} className="max-h-[70vh] space-y-4 overflow-y-auto p-1">
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                      <FormField
                        control={addUserForm.control}
                        name="username"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className={themedLabelClass}>
                              <UserCircle2 className={themedIconClass} />
                              Username
                            </FormLabel>
                            <FormControl>
                              <Input placeholder="mis. admin.shift" {...field} disabled={isSubmitting} className={themedInputClass} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={addUserForm.control}
                        name="email"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className={themedLabelClass}>
                              <Mail className={themedIconClass} />
                              Email (opsional)
                            </FormLabel>
                            <FormControl>
                              <Input placeholder="user@perusahaan.com" {...field} disabled={isSubmitting} className={themedInputClass} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={addUserForm.control}
                        name="password"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className={themedLabelClass}>
                              <Lock className={themedIconClass} />
                              Password login
                            </FormLabel>
                            <FormControl>
                              <Input type="password" placeholder="Masukkan password login" {...field} disabled={isSubmitting} className={themedInputClass} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={addUserForm.control}
                        name="pin"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className={themedLabelClass}>
                              <KeyRound className={themedIconClass} />
                              PIN 6 digit (opsional)
                            </FormLabel>
                            <FormControl>
                              <Input type="password" placeholder="Masukkan PIN transaksi" {...field} maxLength={6} disabled={isSubmitting} className={themedInputClass} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={addUserForm.control}
                        name="role"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className={themedLabelClass}>
                              <ShieldAlert className={themedIconClass} />
                              Role
                            </FormLabel>
                            <Select onValueChange={field.onChange} defaultValue={field.value} disabled={isSubmitting}>
                              <FormControl>
                                <SelectTrigger className={themedSelectTriggerClass}>
                                  <SelectValue placeholder="Pilih role user" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent className={themedSelectContentClass}>
                                {roleOptions.map((role) => (
                                  <SelectItem key={role} value={role} className="capitalize">
                                    {role}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={addUserForm.control}
                        name="telegramChatId"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className={themedLabelClass}>
                              <Send className={themedIconClass} />
                              Telegram Chat ID (opsional)
                            </FormLabel>
                            <FormControl>
                              <Input placeholder="mis. 123456789" {...field} disabled={isSubmitting} className={themedInputClass} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      {renderPermissionsSelector(addUserForm, "add-user-select-all")}

                      <div className="col-span-1 rounded-[26px] border border-amber-500/30 bg-amber-500/5 p-4 md:col-span-2 dark:border-amber-400/20 dark:bg-amber-500/10">
                        <FormField
                          control={addUserForm.control}
                          name="adminPasswordConfirmation"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="flex items-center text-sm font-semibold text-amber-700 dark:text-amber-300">
                                <Lock className="mr-2 h-4 w-4 text-amber-600 dark:text-amber-300" />
                                Konfirmasi dengan password admin Anda
                              </FormLabel>
                              <FormControl>
                                <Input
                                  type="password"
                                  placeholder="Masukkan password admin saat ini"
                                  {...field}
                                  disabled={isSubmitting}
                                  className={`${themedInputClass} mt-2 border-amber-500/40 focus-visible:ring-amber-500 dark:border-amber-400/30`}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                    </div>

                    <DialogFooter>
                      <DialogClose asChild>
                        <Button type="button" variant="outline" disabled={isSubmitting} className={themedOutlineButtonClass}>
                          Batal
                        </Button>
                      </DialogClose>
                      <Button type="submit" disabled={isSubmitting} className={primaryButtonClass}>
                        {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UserPlus className="mr-2 h-4 w-4" />}
                        Simpan user
                      </Button>
                    </DialogFooter>
                  </form>
                </Form>
              </DialogContent>
            </Dialog>
          </div>
        </section>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-[26px] border border-[var(--ui-border)] bg-[var(--ui-card)] px-5 py-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--ui-text-secondary)] dark:text-zinc-500">Total user</p>
            <p className="mt-2 text-3xl font-bold tracking-tight text-[var(--ui-text)] dark:text-zinc-100">{userStats.total}</p>
            <p className="mt-1 text-sm text-[var(--ui-text-muted)] dark:text-zinc-400">Seluruh akun yang terdaftar di sistem.</p>
          </div>
          <div className="rounded-[26px] border border-[var(--ui-border)] bg-[var(--ui-card)] px-5 py-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--ui-text-secondary)] dark:text-zinc-500">User aktif</p>
            <p className="mt-2 text-3xl font-bold tracking-tight text-[var(--ui-text)] dark:text-zinc-100">{userStats.active}</p>
            <p className="mt-1 text-sm text-[var(--ui-text-muted)] dark:text-zinc-400">Akun yang saat ini bisa login dan digunakan.</p>
          </div>
          <div className="rounded-[26px] border border-[var(--ui-border)] bg-[var(--ui-card)] px-5 py-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--ui-text-secondary)] dark:text-zinc-500">Admin aktif</p>
            <p className="mt-2 text-3xl font-bold tracking-tight text-[var(--ui-text)] dark:text-zinc-100">{userStats.admins}</p>
            <p className="mt-1 text-sm text-[var(--ui-text-muted)] dark:text-zinc-400">Akun admin dan super admin yang tercatat.</p>
          </div>
          <div className="rounded-[26px] border border-[var(--ui-border)] bg-[var(--ui-card)] px-5 py-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--ui-text-secondary)] dark:text-zinc-500">Dinonaktifkan</p>
            <p className="mt-2 text-3xl font-bold tracking-tight text-[var(--ui-text)] dark:text-zinc-100">{userStats.disabled}</p>
            <p className="mt-1 text-sm text-[var(--ui-text-muted)] dark:text-zinc-400">Akun yang sedang diblokir dari akses login.</p>
          </div>
        </div>

        <Card className="overflow-hidden rounded-[28px] border-[var(--ui-border)] bg-[var(--ui-card)] shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          <CardContent className="space-y-5 px-4 py-4 sm:px-5 sm:py-5 lg:px-6 lg:py-6">
            <div className="rounded-[26px] border border-[var(--ui-border)] bg-[var(--ui-card-alt)]/70 p-4 dark:border-zinc-800 dark:bg-zinc-900/60 sm:p-5">
              <div className="flex items-start gap-3">
                <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl bg-[var(--ui-accent-bg)] text-[var(--ui-accent)] dark:bg-[var(--ui-accent)]/10">
                  <Users className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold tracking-tight text-[var(--ui-text)] dark:text-zinc-100 sm:text-xl">
                    Daftar user sistem
                  </h2>
                  <p className="mt-1 text-sm leading-6 text-[var(--ui-text-muted)] dark:text-zinc-400">
                    Cari user berdasarkan username, email, atau Telegram Chat ID lalu kelola status dan izinnya sesuai kebutuhan operasional.
                  </p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
              <div className="relative lg:col-span-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--ui-text-muted)]" />
                <Input
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="Cari username, email, atau Chat ID"
                  className={`pl-10 ${themedInputClass}`}
                />
              </div>

              <Select value={roleFilter} onValueChange={(value) => setRoleFilter(value as "all" | "staf" | "admin" | "super_admin") }>
                <SelectTrigger className={themedSelectTriggerClass}>
                  <SelectValue placeholder="Filter role" />
                </SelectTrigger>
                <SelectContent className={themedSelectContentClass}>
                  <SelectItem value="all">Semua role</SelectItem>
                  <SelectItem value="super_admin">Super Admin</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="staf">Staf</SelectItem>
                </SelectContent>
              </Select>

              <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as "all" | "active" | "disabled") }>
                <SelectTrigger className={themedSelectTriggerClass}>
                  <SelectValue placeholder="Filter status" />
                </SelectTrigger>
                <SelectContent className={themedSelectContentClass}>
                  <SelectItem value="all">Semua status</SelectItem>
                  <SelectItem value="active">Aktif</SelectItem>
                  <SelectItem value="disabled">Nonaktif</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {isLoadingUsers ? (
              <div className="flex items-center justify-center gap-3 rounded-[26px] border border-[var(--ui-border)] bg-[var(--ui-card-alt)]/60 px-6 py-10 dark:border-zinc-800 dark:bg-zinc-900/50">
                <Loader2 className="h-6 w-6 animate-spin text-[var(--ui-accent)]" />
                <p className="text-sm text-[var(--ui-text-muted)] dark:text-zinc-400">Memuat daftar user...</p>
              </div>
            ) : (
              <>
                <div className="overflow-x-auto rounded-[26px] border border-[var(--ui-border)] dark:border-zinc-800">
                  <Table className="text-[var(--ui-text)] dark:text-zinc-100">
                    <TableHeader className="[&_tr]:border-[var(--ui-border)] dark:[&_tr]:border-zinc-800">
                      <TableRow className="bg-[var(--ui-card-alt)]/85 hover:bg-[var(--ui-card-alt)]/85 dark:bg-zinc-900/80 dark:hover:bg-zinc-900/80">
                        <TableHead className="text-[var(--ui-text-muted)] dark:text-zinc-400">Username</TableHead>
                        <TableHead className="text-[var(--ui-text-muted)] dark:text-zinc-400">Email</TableHead>
                        <TableHead className="text-[var(--ui-text-muted)] dark:text-zinc-400">Role</TableHead>
                        <TableHead className="text-[var(--ui-text-muted)] dark:text-zinc-400">Status</TableHead>
                        <TableHead className="text-[var(--ui-text-muted)] dark:text-zinc-400">Telegram Chat ID</TableHead>
                        <TableHead className="text-[var(--ui-text-muted)] dark:text-zinc-400">Dibuat oleh</TableHead>
                        <TableHead className="text-right text-[var(--ui-text-muted)] dark:text-zinc-400">Aksi</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredUsers.map((user) => {
                        const isCurrentUser = currentUser?.id === user._id;

                        return (
                          <TableRow
                            key={user._id}
                            className="border-[var(--ui-border)] hover:bg-[var(--ui-accent-bg)]/60 dark:border-zinc-800 dark:hover:bg-zinc-900/70"
                          >
                            <TableCell className="font-medium">{user.username}</TableCell>
                            <TableCell className="text-[var(--ui-text-muted)] dark:text-zinc-400">{user.email || "N/A"}</TableCell>
                            <TableCell>
                              <Badge className={getRoleBadgeClass(user.role)}>{getRoleLabel(user.role)}</Badge>
                            </TableCell>
                            <TableCell>
                              <Badge
                                className={
                                  user.isDisabled
                                    ? "border-red-300 bg-red-100 text-red-800 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-200"
                                    : "border-emerald-300 bg-emerald-100 text-emerald-800 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-200"
                                }
                              >
                                {user.isDisabled ? "Nonaktif" : "Aktif"}
                              </Badge>
                            </TableCell>
                            <TableCell>{user.telegramChatId || "N/A"}</TableCell>
                            <TableCell className="text-[var(--ui-text-muted)] dark:text-zinc-400">{user.createdBy || "N/A"}</TableCell>
                            <TableCell className="text-right">
                              <div className="flex items-center justify-end gap-1">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => handleToggleStatusClick(user)}
                                  disabled={isSuperAdminRole(user.role) || isCurrentUser}
                                  title={
                                    isCurrentUser
                                      ? "Status akun sendiri diubah dari area akun"
                                      : user.isDisabled
                                        ? "Aktifkan user"
                                        : "Nonaktifkan user"
                                  }
                                  className="text-[var(--ui-text-muted)] hover:bg-[var(--ui-accent-bg)] hover:text-[var(--ui-accent)] dark:text-zinc-400"
                                >
                                  {user.isDisabled ? <Power className="h-4 w-4 text-emerald-600" /> : <PowerOff className="h-4 w-4 text-amber-600" />}
                                </Button>

                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => handleEditClick(user)}
                                  disabled={isSuperAdminRole(user.role) || isCurrentUser}
                                  title={isCurrentUser ? "Edit akun sendiri dari menu akun" : "Edit user"}
                                  className="text-[var(--ui-text-muted)] hover:bg-[var(--ui-accent-bg)] hover:text-[var(--ui-accent)] dark:text-zinc-400"
                                >
                                  <Edit className="h-4 w-4" />
                                </Button>

                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => handleResetTwoFactorClick(user)}
                                  disabled={isSuperAdminRole(user.role) || isCurrentUser}
                                  title={isCurrentUser ? "Reset 2FA akun sendiri dari menu akun" : "Nonaktifkan 2FA user"}
                                  className="text-[var(--ui-text-muted)] hover:bg-amber-500/10 hover:text-amber-600 dark:text-zinc-400 dark:hover:text-amber-300"
                                >
                                  <KeyRound className="h-4 w-4 text-amber-600 dark:text-amber-300" />
                                </Button>

                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => handleDeleteClick(user)}
                                  disabled={isSuperAdminRole(user.role) || isCurrentUser}
                                  title={isCurrentUser ? "Akun sendiri tidak dapat dihapus dari halaman ini" : "Hapus user"}
                                  className="text-[var(--ui-text-muted)] hover:bg-destructive/10 hover:text-destructive dark:text-zinc-400"
                                >
                                  <Trash2 className="h-4 w-4 text-destructive" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>

                {filteredUsers.length === 0 && (
                  <div className="rounded-[26px] border border-dashed border-[var(--ui-border)] bg-[var(--ui-card-alt)]/40 px-6 py-10 text-center dark:border-zinc-800 dark:bg-zinc-900/30">
                    <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--ui-accent-bg)] text-[var(--ui-accent)] dark:bg-[var(--ui-accent)]/10">
                      <Users className="h-5 w-5" />
                    </div>
                    <h3 className="mt-4 text-lg font-semibold text-[var(--ui-text)] dark:text-zinc-100">Tidak ada user yang cocok</h3>
                    <p className="mt-2 text-sm text-[var(--ui-text-muted)] dark:text-zinc-400">
                      Coba ubah kata pencarian atau filter untuk melihat hasil lainnya.
                    </p>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>

        <Dialog
          open={isEditing}
          onOpenChange={(open) => {
            setIsEditing(open);
            if (!open) {
              setUserToEdit(null);
              editUserForm.reset(editUserDefaultValues);
            }
          }}
        >
          <DialogContent className={themedDialogClass}>
            <DialogHeader>
              <DialogTitle className="text-[var(--ui-text)] dark:text-zinc-100">Edit user: {userToEdit?.username}</DialogTitle>
              <DialogDescription className="text-[var(--ui-text-muted)] dark:text-zinc-400">
                Perbarui detail akun dan hak akses. Kosongkan password atau PIN jika tidak ingin mengubahnya.
              </DialogDescription>
            </DialogHeader>

            <Form {...editUserForm}>
              <form onSubmit={editUserForm.handleSubmit(onEditUserSubmit)} className="max-h-[70vh] space-y-4 overflow-y-auto p-1">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <FormField
                    control={editUserForm.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className={themedLabelClass}>
                          <Mail className={themedIconClass} />
                          Email
                        </FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="user@perusahaan.com" disabled={isSubmitting} className={themedInputClass} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={editUserForm.control}
                    name="role"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className={themedLabelClass}>
                          <ShieldAlert className={themedIconClass} />
                          Role
                        </FormLabel>
                        <Select onValueChange={field.onChange} value={field.value} disabled={isSubmitting}>
                          <FormControl>
                            <SelectTrigger className={themedSelectTriggerClass}>
                              <SelectValue placeholder="Pilih role user" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent className={themedSelectContentClass}>
                            {roleOptions.map((role) => (
                              <SelectItem key={role} value={role} className="capitalize">
                                {role}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={editUserForm.control}
                    name="telegramChatId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className={themedLabelClass}>
                          <Send className={themedIconClass} />
                          Telegram Chat ID (opsional)
                        </FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="mis. 123456789" disabled={isSubmitting} className={themedInputClass} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={editUserForm.control}
                    name="password"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className={themedLabelClass}>
                          <Lock className={themedIconClass} />
                          Password baru (opsional)
                        </FormLabel>
                        <FormControl>
                          <Input
                            type="password"
                            {...field}
                            placeholder="Kosongkan jika tidak diubah"
                            disabled={isSubmitting}
                            className={themedInputClass}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={editUserForm.control}
                    name="pin"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className={themedLabelClass}>
                          <KeyRound className={themedIconClass} />
                          PIN baru (opsional)
                        </FormLabel>
                        <FormControl>
                          <Input
                            type="password"
                            {...field}
                            placeholder="Kosongkan jika tidak diubah"
                            maxLength={6}
                            disabled={isSubmitting}
                            className={themedInputClass}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {renderPermissionsSelector(editUserForm, "edit-user-select-all")}
                </div>

                <DialogFooter>
                  <DialogClose asChild>
                    <Button type="button" variant="outline" disabled={isSubmitting} className={themedOutlineButtonClass}>
                      Batal
                    </Button>
                  </DialogClose>
                  <Button type="submit" disabled={isSubmitting} className={primaryButtonClass}>
                    {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Simpan perubahan
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>

        <AlertDialog open={!!userToDelete} onOpenChange={(open) => !open && setUserToDelete(null)}>
          <AlertDialogContent className={themedDialogClass}>
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2 text-[var(--ui-text)] dark:text-zinc-100">
                <AlertTriangle className="h-6 w-6 text-destructive" />
                Hapus user
              </AlertDialogTitle>
              <AlertDialogDescription className="space-y-2 text-[var(--ui-text-muted)] dark:text-zinc-400">
                <p>Tindakan ini akan menghapus akun user secara permanen dan tidak bisa dibatalkan.</p>
                <div className="rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-card-alt)] p-4 text-sm dark:border-zinc-800 dark:bg-zinc-900">
                  <p><strong>Username:</strong> {userToDelete?.username}</p>
                  <p><strong>Email:</strong> {userToDelete?.email || "N/A"}</p>
                  <p><strong>Role:</strong> {getRoleLabel(userToDelete?.role)}</p>
                  <p><strong>Status:</strong> {userToDelete?.isDisabled ? "Nonaktif" : "Aktif"}</p>
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isDeleting} className={themedOutlineButtonClass}>
                Batal
              </AlertDialogCancel>
              <Button variant="destructive" onClick={handleConfirmDelete} disabled={isDeleting}>
                {isDeleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Hapus user
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <AlertDialog open={!!userToToggle} onOpenChange={(open) => !open && setUserToToggle(null)}>
          <AlertDialogContent className={themedDialogClass}>
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2 text-[var(--ui-text)] dark:text-zinc-100">
                <AlertTriangle className="h-6 w-6 text-yellow-500" />
                Ubah status user
              </AlertDialogTitle>
              <AlertDialogDescription className="space-y-2 text-[var(--ui-text-muted)] dark:text-zinc-400">
                <p>
                  {userToToggle?.isDisabled
                    ? "Aktifkan kembali user ini agar bisa login dan melanjutkan akses dashboard."
                    : "Nonaktifkan user ini agar akses login dihentikan dan sesi aktifnya ditutup."}
                </p>
                <div className="rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-card-alt)] p-4 text-sm dark:border-zinc-800 dark:bg-zinc-900">
                  <p><strong>Username:</strong> {userToToggle?.username}</p>
                  <p><strong>Email:</strong> {userToToggle?.email || "N/A"}</p>
                  <p><strong>Role:</strong> {getRoleLabel(userToToggle?.role)}</p>
                  <p><strong>Status saat ini:</strong> {userToToggle?.isDisabled ? "Nonaktif" : "Aktif"}</p>
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isTogglingStatus} className={themedOutlineButtonClass}>
                Batal
              </AlertDialogCancel>
              <Button
                variant={userToToggle?.isDisabled ? "default" : "destructive"}
                onClick={handleConfirmToggleStatus}
                disabled={isTogglingStatus}
                className={userToToggle?.isDisabled ? primaryButtonClass : undefined}
              >
                {isTogglingStatus && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {userToToggle?.isDisabled ? "Aktifkan user" : "Nonaktifkan user"}
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <AlertDialog open={!!userToResetTwoFactor} onOpenChange={(open) => !open && setUserToResetTwoFactor(null)}>
          <AlertDialogContent className={themedDialogClass}>
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2 text-[var(--ui-text)] dark:text-zinc-100">
                <KeyRound className="h-6 w-6 text-amber-500" />
                Nonaktifkan 2FA user
              </AlertDialogTitle>
              <AlertDialogDescription className="space-y-2 text-[var(--ui-text-muted)] dark:text-zinc-400">
                <p>
                  Tindakan ini akan menghapus secret authenticator dan backup code user. Login berikutnya tidak akan meminta kode 2FA sampai user setup ulang.
                </p>
                <div className="rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-card-alt)] p-4 text-sm dark:border-zinc-800 dark:bg-zinc-900">
                  <p><strong>Username:</strong> {userToResetTwoFactor?.username}</p>
                  <p><strong>Email:</strong> {userToResetTwoFactor?.email || "N/A"}</p>
                  <p><strong>Role:</strong> {getRoleLabel(userToResetTwoFactor?.role)}</p>
                  <p><strong>Status:</strong> {userToResetTwoFactor?.isDisabled ? "Nonaktif" : "Aktif"}</p>
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isResettingTwoFactor} className={themedOutlineButtonClass}>
                Batal
              </AlertDialogCancel>
              <Button variant="destructive" onClick={handleConfirmResetTwoFactor} disabled={isResettingTwoFactor}>
                {isResettingTwoFactor && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Nonaktifkan 2FA
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </ProtectedRoute>
  );
}
