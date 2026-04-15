// src/app/(app)/management/users/page.tsx
"use client";

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { useToast } from '@/hooks/use-toast';
import { type StoredUser, createUser, getAllUsers, deleteUser, updateUser, toggleUserStatus } from '@/lib/user-utils';
import { ALL_APP_MENUS, hasPermission, isSuperAdminRole, normalizeUserRole } from '@/lib/auth-utils';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, UserPlus, ShieldAlert, UserCog, Lock, KeyRound, Mail, UserCircle2, Trash2, Edit, AlertTriangle, Send, Power, PowerOff, ShieldCheck } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogClose,
  DialogFooter
} from "@/components/ui/dialog";
import { Label } from '@/components/ui/label';
import ProtectedRoute from '@/components/core/ProtectedRoute';


const roleOptions = ['staf', 'admin'] as const;

const menuKeys = ALL_APP_MENUS.map(menu => menu.key);

const baseUserFormSchema = z.object({
  username: z.string().min(3, "Username must be at least 3 characters").optional(),
  email: z.string().email("Invalid email address").optional().or(z.literal('')),
  password: z.string().min(6, "Password must be at least 6 characters").optional().or(z.literal('')),
  pin: z.string().length(6, "PIN must be 6 digits").regex(/^\d+$/, "PIN must be only digits").optional().or(z.literal('')),
  role: z.enum(roleOptions, { required_error: "Role is required" }),
  telegramChatId: z.string().regex(/^\-?\d*$/, "Must be a valid numeric Chat ID").optional().or(z.literal('')),
  permissions: z.array(z.string()).optional().default([]),
});

const addUserFormSchema = baseUserFormSchema.extend({
    username: z.string().min(3, "Username must be at least 3 characters"),
    password: z.string().min(6, "Password must be at least 6 characters"),
    adminPasswordConfirmation: z.string().min(1, "Your password is required to create a user"),
});

type AddUserFormValues = z.infer<typeof addUserFormSchema>;

const editUserFormSchema = baseUserFormSchema.omit({ username: true });

type EditUserFormValues = z.infer<typeof editUserFormSchema>;

const themedInputClass = "rounded-xl border-[var(--ui-input-border)] bg-[var(--ui-input-bg)] text-[var(--ui-text)] placeholder:text-[var(--ui-text-secondary)] focus-visible:ring-[var(--ui-accent)] dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-500";
const themedSelectTriggerClass = "rounded-xl border-[var(--ui-input-border)] bg-[var(--ui-input-bg)] text-[var(--ui-text)] focus:ring-[var(--ui-accent)] dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100";
const themedSelectContentClass = "border-[var(--ui-border)] bg-[var(--ui-card)] text-[var(--ui-text)] dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100";
const themedDialogClass = "max-w-2xl rounded-3xl border-[var(--ui-border)] bg-[var(--ui-card)] text-[var(--ui-text)] shadow-xl dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100";
const themedOutlineButtonClass = "rounded-xl border-[var(--ui-border)] bg-[var(--ui-card-alt)] text-[var(--ui-text)] hover:bg-[var(--ui-accent-bg)] hover:text-[var(--ui-accent)] dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100";
const primaryButtonClass = "rounded-xl bg-[var(--ui-accent)] text-white hover:bg-[var(--ui-accent-hover)]";
const themedLabelClass = "flex items-center text-sm font-medium text-[var(--ui-text)] dark:text-zinc-100";
const themedIconClass = "mr-2 h-4 w-4 text-[var(--ui-text-muted)] dark:text-zinc-400";

export default function UserManagementPage() {
  const { user: currentUser } = useAuth();
  const router = useRouter();
  const { toast } = useToast();
  const [users, setUsers] = useState<StoredUser[]>([]);
  const [isLoadingUsers, setIsLoadingUsers] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const [isDeleting, setIsDeleting] = useState(false);
  const [userToDelete, setUserToDelete] = useState<StoredUser | null>(null);

  const [isEditing, setIsEditing] = useState(false);
  const [userToEdit, setUserToEdit] = useState<StoredUser | null>(null);

  const [isTogglingStatus, setIsTogglingStatus] = useState(false);
  const [userToToggle, setUserToToggle] = useState<StoredUser | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | 'staf' | 'admin' | 'super_admin'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'disabled'>('all');
  const canManageUsers = hasPermission(currentUser, 'manajemen_pengguna');

  const addUserForm = useForm<AddUserFormValues>({
    resolver: zodResolver(addUserFormSchema),
    defaultValues: {
      username: '',
      email: '',
      password: '',
      pin: '',
      role: 'staf',
      telegramChatId: '',
      permissions: [],
      adminPasswordConfirmation: '',
    },
  });

  const editUserForm = useForm<EditUserFormValues>({
    resolver: zodResolver(editUserFormSchema),
    defaultValues: { email: '', role: 'staf', password: '', pin: '', telegramChatId: '', permissions: [] },
  });
  
  const fetchUsers = useCallback(async () => {
      setIsLoadingUsers(true);
      try {
          const allUsers = await getAllUsers();
          setUsers(allUsers);
      } catch (error) {
          toast({ title: "Error", description: "Could not load user list.", variant: "destructive" });
      } finally {
          setIsLoadingUsers(false);
      }
  },[toast]);

  useEffect(() => {
    if (canManageUsers) {
      fetchUsers();
    }
  }, [canManageUsers, currentUser, router, toast, fetchUsers]);

  async function onAddUserSubmit(values: AddUserFormValues) {
    if (!currentUser || !canManageUsers) {
      toast({ title: "Unauthorized", description: "You are not authorized to perform this action.", variant: "destructive" });
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
        toast({ title: "User Created", description: `User '${values.username}' was successfully created.` });
        addUserForm.reset();
        fetchUsers();
      } else {
        toast({ title: "Creation Failed", description: result.message, variant: "destructive" });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "An unknown error occurred.";
      toast({ title: "Error", description: errorMessage, variant: "destructive" });
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
              editorId: currentUser.id
          });

          if (result.success) {
              toast({ title: "User Updated", description: `User '${userToEdit.username}' updated successfully.` });
              setIsEditing(false);
              setUserToEdit(null);
              fetchUsers();
          } else {
              toast({ title: "Update Failed", description: result.message, variant: "destructive" });
          }
      } catch (error) {
           const errorMessage = error instanceof Error ? error.message : "An unknown error occurred.";
           toast({ title: "Error", description: errorMessage, variant: "destructive" });
      } finally {
          setIsSubmitting(false);
      }
  }

  const handleToggleStatusClick = (user: StoredUser) => {
    setUserToToggle(user);
  };
  
  const handleConfirmToggleStatus = async () => {
    if (!userToToggle || !currentUser || !canManageUsers) {
        toast({ title: "Error", description: "Cannot perform this action.", variant: "destructive" });
        return;
    }

    setIsTogglingStatus(true);
    const result = await toggleUserStatus(userToToggle._id, currentUser.id);

    if (result.success) {
        toast({ title: "User Status Changed", description: `User '${userToToggle.username}' has been ${userToToggle.isDisabled ? 'enabled' : 'disabled'}.` });
        fetchUsers();
    } else {
        toast({ title: "Action Failed", description: result.message, variant: "destructive" });
    }
    
    setIsTogglingStatus(false);
    setUserToToggle(null);
  };


  const handleDeleteClick = (user: StoredUser) => {
    setUserToDelete(user);
  };
  
  const handleEditClick = (user: StoredUser) => {
      setUserToEdit(user);
      editUserForm.reset({
          email: user.email || '',
          role: (user.role === 'admin' ? 'admin' : 'staf'),
          password: '',
          pin: '',
          telegramChatId: user.telegramChatId || '',
          permissions: user.permissions || [],
      });
      setIsEditing(true);
  }

  const handleConfirmDelete = async () => {
    if (!userToDelete || !currentUser || !canManageUsers) {
      toast({ title: "Error", description: "Cannot perform delete action.", variant: "destructive" });
      return;
    }

    setIsDeleting(true);
    const result = await deleteUser(userToDelete._id, currentUser.id);

    if (result.success) {
      toast({ title: "User Deleted", description: `User '${userToDelete.username}' has been deleted.` });
      fetchUsers();
    } else {
      toast({ title: "Deletion Failed", description: result.message, variant: "destructive" });
    }
    setIsDeleting(false);
    setUserToDelete(null);
  };

  const filteredUsers = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();

    return users.filter((user) => {
      const matchesSearch = !normalizedSearch ||
        user.username.toLowerCase().includes(normalizedSearch) ||
        (user.email || '').toLowerCase().includes(normalizedSearch) ||
        (user.telegramChatId || '').toLowerCase().includes(normalizedSearch);

      const matchesRole = roleFilter === 'all' || normalizeUserRole(user.role) === roleFilter;
      const matchesStatus = statusFilter === 'all' || (statusFilter === 'active' ? !user.isDisabled : !!user.isDisabled);

      return matchesSearch && matchesRole && matchesStatus;
    });
  }, [users, searchTerm, roleFilter, statusFilter]);

  const renderPermissionsSelector = (formInstance: any) => (
     <div className="col-span-1 space-y-3 rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-surface)] p-4 md:col-span-2 dark:border-zinc-800 dark:bg-zinc-900/60">
        <FormLabel className="flex items-center gap-2 font-semibold text-[var(--ui-text)] dark:text-zinc-100"><ShieldCheck className="h-4 w-4 text-[var(--ui-accent)]"/>Menu Permissions</FormLabel>
        <Controller
            name="permissions"
            control={formInstance.control}
            render={({ field }) => (
                <>
                <div className="flex items-center space-x-2 rounded-xl border border-[var(--ui-border)] bg-[var(--ui-card-alt)] p-3 dark:border-zinc-800 dark:bg-zinc-900">
                    <Checkbox
                        id="select-all"
                        onCheckedChange={(checked) => field.onChange(checked ? menuKeys : [])}
                        checked={field.value?.length === menuKeys.length}
                    />
                    <Label htmlFor="select-all" className="text-sm font-semibold text-[var(--ui-text)] dark:text-zinc-100">Select All Menus</Label>
                </div>
                <div className="grid max-h-64 grid-cols-1 gap-2 overflow-y-auto rounded-xl border border-[var(--ui-border)] bg-[var(--ui-card)] p-2 sm:grid-cols-2 lg:grid-cols-3 dark:border-zinc-800 dark:bg-zinc-950">
                    {ALL_APP_MENUS.filter(menu => menu.key !== 'manajemen_pengguna').map((menu) => (
                    <FormItem key={menu.key} className="flex flex-row items-start space-x-3 space-y-0 rounded-xl border border-transparent p-3 hover:border-[var(--ui-accent)]/20 hover:bg-[var(--ui-accent-bg)]">
                        <FormControl>
                        <Checkbox
                            checked={field.value?.includes(menu.key)}
                            onCheckedChange={(checked) => {
                            return checked
                                ? field.onChange([...(field.value || []), menu.key])
                                : field.onChange((field.value || []).filter((value:string) => value !== menu.key));
                            }}
                        />
                        </FormControl>
                        <div className="space-y-1 leading-none">
                            <FormLabel className="cursor-pointer font-medium text-[var(--ui-text)] dark:text-zinc-100">{menu.label}</FormLabel>
                            <p className="text-xs text-[var(--ui-text-muted)] dark:text-zinc-400">{menu.description}</p>
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
    <ProtectedRoute requiredPermission='manajemen_pengguna'>
    <div className="mx-auto max-w-7xl space-y-8 pb-10">
      <div className="mb-2 flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-[var(--ui-accent-gradient-from)] to-[var(--ui-accent-gradient-to)] text-white shadow-lg">
            <UserCog className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold font-headline tracking-tight text-[var(--ui-text)] dark:text-zinc-100">User Management</h1>
            <p className="text-[var(--ui-text-muted)] dark:text-zinc-400">Add, edit, or remove admin or staf users and manage their permissions.</p>
          </div>
        </div>
        <Dialog>
          <DialogTrigger asChild>
              <Button className={`w-full sm:w-auto ${primaryButtonClass}`}><UserPlus className="mr-2 h-4 w-4"/> Add New User</Button>
          </DialogTrigger>
          <DialogContent className={themedDialogClass}>
              <DialogHeader>
              <DialogTitle className="text-[var(--ui-text)] dark:text-zinc-100">Add New User</DialogTitle>
              <DialogDescription className="text-[var(--ui-text-muted)] dark:text-zinc-400">Create a new account and set their permissions. PIN and Telegram Chat ID are optional.</DialogDescription>
              </DialogHeader>
              <Form {...addUserForm}>
              <form onSubmit={addUserForm.handleSubmit(onAddUserSubmit)} className="space-y-4 max-h-[70vh] overflow-y-auto p-1">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <FormField
                    control={addUserForm.control}
                    name="username"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className={themedLabelClass}><UserCircle2 className={themedIconClass}/>Username</FormLabel>
                        <FormControl><Input placeholder="e.g., jane.doe" {...field} disabled={isSubmitting} className={themedInputClass} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={addUserForm.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className={themedLabelClass}><Mail className={themedIconClass}/>Email (Optional)</FormLabel>
                        <FormControl><Input placeholder="user@example.com" {...field} disabled={isSubmitting} className={themedInputClass} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={addUserForm.control}
                    name="password"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className={themedLabelClass}><Lock className={themedIconClass}/>Password</FormLabel>
                        <FormControl><Input type="password" placeholder="••••••••" {...field} disabled={isSubmitting} className={themedInputClass} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={addUserForm.control}
                    name="pin"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className={themedLabelClass}><KeyRound className={themedIconClass}/>6-Digit PIN (Optional)</FormLabel>
                        <FormControl><Input type="password" placeholder="●●●●●●" {...field} maxLength={6} disabled={isSubmitting} className={themedInputClass} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={addUserForm.control}
                    name="role"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className={themedLabelClass}><ShieldAlert className={themedIconClass}/>Role</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value} disabled={isSubmitting}>
                          <FormControl><SelectTrigger className={themedSelectTriggerClass}><SelectValue placeholder="Select a role" /></SelectTrigger></FormControl>
                          <SelectContent className={themedSelectContentClass}>{roleOptions.map(role => (<SelectItem key={role} value={role} className="capitalize">{role}</SelectItem>))}</SelectContent>
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
                        <FormLabel className={themedLabelClass}><Send className={themedIconClass}/>Telegram Chat ID (Optional)</FormLabel>
                        <FormControl><Input placeholder="e.g., 123456789" {...field} disabled={isSubmitting} className={themedInputClass} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  {renderPermissionsSelector(addUserForm)}
                   <div className="col-span-1 rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4 md:col-span-2 dark:border-amber-400/20 dark:bg-amber-500/10">
                      <FormField
                      control={addUserForm.control}
                      name="adminPasswordConfirmation"
                      render={({ field }) => (
                          <FormItem>
                          <FormLabel className="flex items-center text-md font-semibold text-amber-700 dark:text-amber-300"><Lock className="mr-2 h-5 w-5 text-amber-600 dark:text-amber-300" />Confirm with Your Password</FormLabel>
                          <FormControl>
                              <Input type="password" placeholder="Enter your super admin password" {...field} disabled={isSubmitting} className={`${themedInputClass} mt-2 border-amber-500/40 focus-visible:ring-amber-500 dark:border-amber-400/30`} />
                          </FormControl>
                          <FormMessage />
                          </FormItem>
                      )}
                      />
                  </div>
                </div>
                <DialogFooter>
                  <DialogClose asChild><Button type="button" variant="outline" disabled={isSubmitting} className={themedOutlineButtonClass}>Cancel</Button></DialogClose>
                  <Button type="submit" disabled={isSubmitting} className={primaryButtonClass}>{isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <UserPlus className="mr-2 h-4 w-4"/>}Create User</Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>
      
      <Card className="rounded-3xl border-[var(--ui-border)] bg-[var(--ui-card)] shadow-md dark:border-zinc-800 dark:bg-zinc-950">
        <CardHeader>
          <CardTitle className="text-[var(--ui-text)] dark:text-zinc-100">Existing Users</CardTitle>
          <CardDescription className="text-[var(--ui-text-muted)] dark:text-zinc-400">List of all users in the system.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <Input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search username, email, or Telegram Chat ID"
              className={themedInputClass}
            />
            <Select value={roleFilter} onValueChange={(value) => setRoleFilter(value as 'all' | 'staf' | 'admin' | 'super_admin')}>
              <SelectTrigger className={themedSelectTriggerClass}>
                <SelectValue placeholder="Filter by role" />
              </SelectTrigger>
              <SelectContent className={themedSelectContentClass}>
                <SelectItem value="all">All Roles</SelectItem>
                <SelectItem value="super_admin">Super Admin</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
                <SelectItem value="staf">Staf</SelectItem>
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as 'all' | 'active' | 'disabled')}>
              <SelectTrigger className={themedSelectTriggerClass}>
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent className={themedSelectContentClass}>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="disabled">Disabled</SelectItem>
              </SelectContent>
            </Select>
          </div>
           {isLoadingUsers ? (
             <div className="flex justify-center p-4"><Loader2 className="h-6 w-6 animate-spin text-[var(--ui-accent)]"/></div>
           ) : (
            <>
            <div className="overflow-x-auto rounded-2xl border border-[var(--ui-border)] dark:border-zinc-800">
                <Table className="text-[var(--ui-text)] dark:text-zinc-100">
                <TableHeader className="[&_tr]:border-[var(--ui-border)] dark:[&_tr]:border-zinc-800">
                    <TableRow className="bg-[var(--ui-card-alt)] hover:bg-[var(--ui-card-alt)] dark:bg-zinc-900 dark:hover:bg-zinc-900">
                    <TableHead className="text-[var(--ui-text-muted)] dark:text-zinc-400">Username</TableHead>
                    <TableHead className="text-[var(--ui-text-muted)] dark:text-zinc-400">Email</TableHead>
                    <TableHead className="text-[var(--ui-text-muted)] dark:text-zinc-400">Role</TableHead>
                    <TableHead className="text-[var(--ui-text-muted)] dark:text-zinc-400">Status</TableHead>
                    <TableHead className="text-[var(--ui-text-muted)] dark:text-zinc-400">Telegram Chat ID</TableHead>
                    <TableHead className="text-[var(--ui-text-muted)] dark:text-zinc-400">Created By</TableHead>
                    <TableHead className="text-right text-[var(--ui-text-muted)] dark:text-zinc-400">Actions</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {filteredUsers.map((user) => {
                      const isCurrentUser = currentUser?.id === user._id;
                      return (
                    <TableRow key={user._id} className="border-[var(--ui-border)] hover:bg-[var(--ui-accent-bg)] dark:border-zinc-800 dark:hover:bg-zinc-900/70">
                        <TableCell className="font-medium">{user.username}</TableCell>
                        <TableCell className="text-[var(--ui-text-muted)] dark:text-zinc-400">{user.email || 'N/A'}</TableCell>
                        <TableCell>
                          <Badge variant={isSuperAdminRole(user.role) ? 'destructive' : normalizeUserRole(user.role) === 'admin' ? 'secondary' : 'default'} className="capitalize">
                            {(normalizeUserRole(user.role) || user.role).replace('_', ' ')}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant={user.isDisabled ? 'destructive' : 'default'} className={user.isDisabled ? 'bg-red-100 text-red-800 border-red-300' : 'bg-green-100 text-green-800 border-green-300'}>
                              {user.isDisabled ? 'Disabled' : 'Active'}
                          </Badge>
                        </TableCell>
                        <TableCell>{user.telegramChatId || 'N/A'}</TableCell>
                        <TableCell className="text-[var(--ui-text-muted)] dark:text-zinc-400">{user.createdBy || 'N/A'}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                             <Button variant="ghost" size="icon" onClick={() => handleToggleStatusClick(user)} disabled={isSuperAdminRole(user.role) || isCurrentUser} title={isCurrentUser ? 'You cannot change your own status here' : user.isDisabled ? 'Enable User' : 'Disable User'} className="text-[var(--ui-text-muted)] hover:bg-[var(--ui-accent-bg)] hover:text-[var(--ui-accent)] dark:text-zinc-400">
                                {user.isDisabled ? <Power className="h-4 w-4 text-green-600"/> : <PowerOff className="h-4 w-4 text-yellow-600" />}
                             </Button>
                             <Button variant="ghost" size="icon" onClick={() => handleEditClick(user)} disabled={isSuperAdminRole(user.role) || isCurrentUser} title={isCurrentUser ? 'Edit your own account from Account settings' : 'Edit user'} className="text-[var(--ui-text-muted)] hover:bg-[var(--ui-accent-bg)] hover:text-[var(--ui-accent)] dark:text-zinc-400">
                              <Edit className="h-4 w-4"/>
                            </Button>
                             <AlertDialog onOpenChange={(open) => { if (!open) setUserToDelete(null); }}>
                                <AlertDialogTrigger asChild>
                                    <Button variant="ghost" size="icon" onClick={() => handleDeleteClick(user)} disabled={isSuperAdminRole(user.role) || isCurrentUser} title={isCurrentUser ? 'You cannot delete your own account here' : 'Delete user'} className="text-[var(--ui-text-muted)] hover:bg-destructive/10 hover:text-destructive dark:text-zinc-400">
                                        <Trash2 className="h-4 w-4 text-destructive"/>
                                    </Button>
                                </AlertDialogTrigger>
                                {userToDelete && userToDelete._id === user._id && (
                                    <AlertDialogContent className={themedDialogClass}>
                                    <AlertDialogHeader>
                                        <AlertDialogTitle className="flex items-center gap-2"><AlertTriangle className="h-6 w-6 text-destructive" />Confirm Deletion</AlertDialogTitle>
                                        <AlertDialogDescription className="space-y-2 text-[var(--ui-text-muted)] dark:text-zinc-400">
                                          <p>Are you sure you want to delete this user? This action cannot be undone.</p>
                                          <div className="rounded-xl border border-[var(--ui-border)] bg-[var(--ui-card-alt)] p-3 text-sm dark:border-zinc-800 dark:bg-zinc-900">
                                            <p><strong>Username:</strong> {userToDelete?.username}</p>
                                            <p><strong>Email:</strong> {userToDelete?.email || 'N/A'}</p>
                                            <p><strong>Role:</strong> {(normalizeUserRole(userToDelete?.role) || userToDelete?.role || 'N/A').replace('_', ' ')}</p>
                                            <p><strong>Status:</strong> {userToDelete?.isDisabled ? 'Disabled' : 'Active'}</p>
                                          </div>
                                        </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                        <AlertDialogCancel disabled={isDeleting} className={themedOutlineButtonClass}>Cancel</AlertDialogCancel>
                                        <Button variant="destructive" onClick={handleConfirmDelete} disabled={isDeleting}>
                                        {isDeleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                        Delete User
                                        </Button>
                                    </AlertDialogFooter>
                                    </AlertDialogContent>
                                )}
                             </AlertDialog>
                          </div>
                        </TableCell>
                    </TableRow>
                      );
                    })}
                </TableBody>
                </Table>
            </div>
            {filteredUsers.length === 0 && (
              <div className="rounded-2xl border border-dashed border-[var(--ui-border)] p-6 text-center text-[var(--ui-text-muted)] dark:border-zinc-800 dark:text-zinc-400">
                No users match the current search/filter.
              </div>
            )}
            </>
           )}
        </CardContent>
      </Card>
      
      <Dialog open={isEditing} onOpenChange={setIsEditing}>
        <DialogContent className={themedDialogClass}>
            <DialogHeader>
                <DialogTitle className="text-[var(--ui-text)] dark:text-zinc-100">Edit User: {userToEdit?.username}</DialogTitle>
                <DialogDescription className="text-[var(--ui-text-muted)] dark:text-zinc-400">Update user details and permissions. Leave password or PIN fields blank to keep them unchanged.</DialogDescription>
            </DialogHeader>
            <Form {...editUserForm}>
                <form onSubmit={editUserForm.handleSubmit(onEditUserSubmit)} className="space-y-4 max-h-[70vh] overflow-y-auto p-1">
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                        <FormField control={editUserForm.control} name="email" render={({ field }) => (<FormItem><FormLabel className={themedLabelClass}><Mail className={themedIconClass}/>Email</FormLabel><FormControl><Input {...field} disabled={isSubmitting} className={themedInputClass} /></FormControl><FormMessage /></FormItem>)}/>
                        <FormField control={editUserForm.control} name="role" render={({ field }) => (<FormItem><FormLabel className={themedLabelClass}><ShieldAlert className={themedIconClass}/>Role</FormLabel><Select onValueChange={field.onChange} value={field.value} disabled={isSubmitting}><FormControl><SelectTrigger className={themedSelectTriggerClass}><SelectValue /></SelectTrigger></FormControl><SelectContent className={themedSelectContentClass}>{roleOptions.map(role => (<SelectItem key={role} value={role} className="capitalize">{role}</SelectItem>))}</SelectContent></Select><FormMessage /></FormItem>)}/>
                        <FormField control={editUserForm.control} name="telegramChatId" render={({ field }) => (<FormItem><FormLabel className={themedLabelClass}><Send className={themedIconClass}/>Telegram Chat ID (Optional)</FormLabel><FormControl><Input {...field} placeholder="e.g. 123456789" disabled={isSubmitting} className={themedInputClass} /></FormControl><FormMessage /></FormItem>)}/>
                        <FormField control={editUserForm.control} name="password" render={({ field }) => (<FormItem><FormLabel className={themedLabelClass}><Lock className={themedIconClass}/>New Password (Optional)</FormLabel><FormControl><Input type="password" {...field} placeholder="Leave blank to keep current password" disabled={isSubmitting} className={themedInputClass} /></FormControl><FormMessage /></FormItem>)}/>
                        <FormField control={editUserForm.control} name="pin" render={({ field }) => (<FormItem><FormLabel className={themedLabelClass}><KeyRound className={themedIconClass}/>New PIN (Optional)</FormLabel><FormControl><Input type="password" {...field} placeholder="Leave blank to keep current PIN" maxLength={6} disabled={isSubmitting} className={themedInputClass} /></FormControl><FormMessage /></FormItem>)}/>
                        {renderPermissionsSelector(editUserForm)}
                    </div>
                    <DialogFooter>
                        <DialogClose asChild><Button type="button" variant="outline" disabled={isSubmitting} className={themedOutlineButtonClass}>Cancel</Button></DialogClose>
                        <Button type="submit" disabled={isSubmitting} className={primaryButtonClass}>{isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin"/>}Save Changes</Button>
                    </DialogFooter>
                </form>
            </Form>
        </DialogContent>
      </Dialog>
      
      <AlertDialog open={!!userToToggle} onOpenChange={(open) => { if(!open) setUserToToggle(null)}}>
        <AlertDialogContent className={themedDialogClass}>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2"><AlertTriangle className="h-6 w-6 text-yellow-500" />Confirm Status Change</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2 text-[var(--ui-text-muted)] dark:text-zinc-400">
              <p>Are you sure you want to {userToToggle?.isDisabled ? 'enable' : 'disable'} this user?{userToToggle && !userToToggle.isDisabled && ' They will be logged out and unable to log in.'}</p>
              <div className="rounded-xl border border-[var(--ui-border)] bg-[var(--ui-card-alt)] p-3 text-sm dark:border-zinc-800 dark:bg-zinc-900">
                <p><strong>Username:</strong> {userToToggle?.username}</p>
                <p><strong>Email:</strong> {userToToggle?.email || 'N/A'}</p>
                <p><strong>Role:</strong> {(normalizeUserRole(userToToggle?.role) || userToToggle?.role || 'N/A').replace('_', ' ')}</p>
                <p><strong>Status:</strong> {userToToggle?.isDisabled ? 'Disabled' : 'Active'}</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isTogglingStatus} className={themedOutlineButtonClass}>Cancel</AlertDialogCancel>
            <Button variant={userToToggle?.isDisabled ? 'default' : 'destructive'} onClick={handleConfirmToggleStatus} disabled={isTogglingStatus} className={userToToggle?.isDisabled ? primaryButtonClass : undefined}>{isTogglingStatus && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{userToToggle?.isDisabled ? 'Enable' : 'Disable'} User</Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </div>
    </ProtectedRoute>
  );
}
