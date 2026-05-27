// src/lib/user-utils.ts
'use server';

import { connectToDatabase, readDb, writeDb } from './mongodb';
import bcrypt from 'bcryptjs';
import type { StoredUser, User, UserRole, LoginActivity, UserUpdatePayload } from './auth-utils';
export type { StoredUser, LoginActivity } from './auth-utils';
import { SALT_ROUNDS, hasAllAccess, isSuperAdminRole, normalizeUserRole } from './auth-utils';
import type { UiThemeName } from './ui-theme';
import { isUiThemeName } from './ui-theme';
import { subDays } from 'date-fns';
import { trySendTelegramNotification } from './notification-utils';
import { verifyAuth } from '@/app/api/auth/actions';
import { findBetterAuthUserByUsername, syncLegacyUserByIdToBetterAuth } from '@/lib/better-auth-bridge';

// Helper to make user objects serializable for client components
const makeUserSerializable = (user: any): StoredUser => {
  if (user._id && typeof user._id !== 'string') {
    user._id = user._id.toHexString();
  }
  const normalizedRole = normalizeUserRole(user.role);
  if (normalizedRole) {
    user.role = normalizedRole;
  }
  return user as StoredUser;
};

function canManageUsers(user: { role?: string; permissions?: string[] } | null | undefined): boolean {
  return !!user && (
    isSuperAdminRole(user.role) ||
    hasAllAccess(user.permissions) ||
    user.permissions?.includes('manajemen_pengguna') === true
  );
}

export async function getActingUserFromSession(fallbackUserId?: string): Promise<StoredUser | null> {
  const { isAuthenticated, user } = await verifyAuth();
  if (!isAuthenticated || !user) return null;

  let sessionUser = user.id
    ? await readDb<any>("users", { query: { _id: user.id } })
    : null;

  if (!sessionUser && user.username) {
    sessionUser = await readDb<any>("users", { query: { username: user.username.toLowerCase() } });
  }

  if (!sessionUser && fallbackUserId) {
    sessionUser = await readDb<any>("users", { query: { _id: fallbackUserId } });
  }

  return sessionUser ? makeUserSerializable(sessionUser) : null;
}

export async function getCurrentUserThemePreference(): Promise<UiThemeName | null> {
  const sessionUser = await getActingUserFromSession();
  if (!sessionUser?.uiThemePreference) return null;

  return isUiThemeName(sessionUser.uiThemePreference) ? sessionUser.uiThemePreference : null;
}

export async function setCurrentUserThemePreference(theme: UiThemeName): Promise<{ success: boolean; message: string }> {
  try {
    const sessionUser = await getActingUserFromSession();
    if (!sessionUser) {
      return { success: false, message: "Unauthorized: You must be signed in to change your UI theme." };
    }

    await writeDb("users", { uiThemePreference: theme }, { mode: 'updateOne', query: { _id: sessionUser._id } });

    return { success: true, message: "UI theme updated successfully." };
  } catch (error) {
    console.error("Error updating current user theme preference:", error);
    return { success: false, message: error instanceof Error ? error.message : "Failed to update UI theme." };
  }
}

// --- Login Activity Pruning ---
async function pruneOldLoginActivity(): Promise<void> {
  try {
    const allActivities = await readDb<LoginActivity[]>("login_activity");
    if (!allActivities || allActivities.length === 0) return;

    const sixtyDaysAgo = subDays(new Date(), 60);
    
    const recentActivityIds = allActivities
      .filter(activity => {
        const activityDate = new Date(activity.loginTimestamp);
        return !(isNaN(activityDate.getTime()) || activityDate < sixtyDaysAgo);
      })
      .map(activity => activity._id);

    const activitiesToDelete = allActivities.filter(activity => !recentActivityIds.includes(activity._id));

    if (activitiesToDelete.length > 0) {
      console.log(`[DB Pruning] Deleting ${activitiesToDelete.length} login activity records older than 60 days.`);
      const deleteIds = activitiesToDelete.map(a => a._id);
      await writeDb("login_activity", null, { mode: 'deleteMany', query: { _id: { $in: deleteIds } } });
    }
  } catch (error) {
     console.error("Error pruning old login activity from DB:", error);
  }
}

export async function checkIfUsersExist(): Promise<boolean> {
  try {
    const count = await readDb<number>("users", { count: true });
    return count > 0;
  } catch (error) {
    console.error("Error checking if users exist:", error);
    return true; 
  }
}

export async function createUser({
  username,
  email,
  passwordPlain,
  pinPlain,
  role,
  permissions,
  creatorId,
  telegramChatId,
  adminPasswordConfirmation,
}: {
  username: string;
  email?: string;
  passwordPlain: string;
  pinPlain?: string;
  role?: UserRole;
  permissions?: string[];
  creatorId?: string;
  telegramChatId?: string;
  adminPasswordConfirmation?: string;
}): Promise<{ success: boolean; message: string; user?: User }> {
  try {
    const userCount = await checkIfUsersExist();
    let finalRole: UserRole;

    if (!userCount) {
      finalRole = 'super_admin';
    } else {
       if (!creatorId) {
        return { success: false, message: "Creator ID wajib ada untuk membuat user baru." };
      }
      const creator = await getActingUserFromSession(creatorId);
      if (!creator || !canManageUsers(creator)) {
         return { success: false, message: "Akun Anda tidak memiliki izin untuk membuat user baru." };
      }
      if (!role || (role !== 'admin' && role !== 'staf')) {
        return { success: false, message: "Role yang valid ('admin' atau 'staf') harus dipilih oleh super admin." };
      }

      if (!adminPasswordConfirmation) {
        return { success: false, message: "Password admin wajib diisi untuk membuat user baru." };
      }
      if (!creator.hashedPassword) {
        return { success: false, message: "Akun pembuat tidak memiliki password yang tersimpan." };
      }
      const isPasswordValid = await verifyUserPassword(adminPasswordConfirmation, creator.hashedPassword);
      if (!isPasswordValid) {
        return { success: false, message: "Password admin salah. Pembuatan user dibatalkan." };
      }

      finalRole = role;
    }

    const existingUser = await getUserByUsername(username);
    if (existingUser) {
      return { success: false, message: "Username sudah digunakan." };
    }

    const hashedPassword = await bcrypt.hash(passwordPlain, SALT_ROUNDS);
    const hashedPin = pinPlain ? await bcrypt.hash(pinPlain, SALT_ROUNDS) : undefined;

    const newUser: Omit<StoredUser, '_id'> = {
      username: username.toLowerCase(),
      email: email?.toLowerCase(),
      hashedPassword: hashedPassword,
      hashedPin: hashedPin,
      role: finalRole,
      permissions: finalRole === 'super_admin' ? ['all_access'] : (permissions || []),
      createdBy: !userCount ? 'system_signup' : creatorId,
      telegramChatId: telegramChatId,
      isDisabled: false,
      failedPinAttempts: 0,
    };
    
    const result = await writeDb("users", newUser, { mode: 'insertOne' });
    const newUserId = result.insertedId.toHexString();
    await syncLegacyUserByIdToBetterAuth(newUserId);
    const userForToken: User = { id: newUserId, username: newUser.username, role: newUser.role, permissions: newUser.permissions };

    return {
      success: true,
      message: `User ${username} berhasil dibuat dengan role ${finalRole}.`,
      user: userForToken,
    };
  } catch (error) {
    console.error("Error creating user:", error);
    const message = error instanceof Error ? error.message : "Terjadi kesalahan yang tidak diketahui.";
    return { success: false, message };
  }
}

export async function recordLoginSuccess(user: StoredUser, userAgent: string | null, ipAddress: string | null): Promise<void> {
    try {
        await pruneOldLoginActivity();
        const activityRecord: Omit<LoginActivity, '_id'> = {
            userId: user._id,
            username: user.username,
            loginTimestamp: new Date(),
            userAgent: userAgent || 'Unknown UA',
            ipAddress: ipAddress || 'Unknown IP',
        };
        await writeDb("login_activity", activityRecord, { mode: 'insertOne' });
    } catch(e) {
        console.error("Failed to record login activity:", e);
    }
}

export async function deleteUser(userIdToDelete: string, currentAdminId: string): Promise<{ success: boolean; message: string }> {
    try {
        const admin = await getActingUserFromSession(currentAdminId);

        if (!canManageUsers(admin)) {
            return { success: false, message: "Permission denied. Your account cannot delete users." };
        }
        if (admin && admin._id === userIdToDelete) {
            return { success: false, message: "You cannot delete your own account from this page." };
        }
        const userToDelete = await readDb<any>("users", { query: { _id: userIdToDelete } });
        if (!userToDelete) {
            return { success: false, message: "User to delete not found." };
        }
        if (isSuperAdminRole(userToDelete.role)) {
            return { success: false, message: "Cannot delete the super_admin account." };
        }

        await writeDb("users", null, { mode: 'deleteOne', query: { _id: userIdToDelete } });

        return { success: true, message: `User ${userToDelete.username} deleted successfully.` };
    } catch (error) {
        console.error("Error deleting user:", error);
        return { success: false, message: error instanceof Error ? error.message : "An unknown error occurred." };
    }
}

export async function updateUser({ userId, updates, editorId }: { userId: string, updates: UserUpdatePayload, editorId: string }): Promise<{ success: boolean; message: string }> {
    try {
        const editor = await getActingUserFromSession(editorId);
        if (!canManageUsers(editor)) {
            return { success: false, message: "Permission denied. Your account cannot edit users." };
        }
        if (editor && editor._id === userId) {
            return { success: false, message: "You cannot edit your own account from this page." };
        }

        const userToUpdate = await readDb<any>("users", { query: { _id: userId } });
        if (!userToUpdate) {
            return { success: false, message: "User not found." };
        }
        
        if (isSuperAdminRole(userToUpdate.role)) {
            return { success: false, message: "Cannot modify the super_admin account via this form." };
        }
        
        const updatePayload: Partial<StoredUser> = {};
        if (updates.email) updatePayload.email = updates.email;
        if (updates.role && (updates.role === 'admin' || updates.role === 'staf')) updatePayload.role = updates.role;
        if(updates.permissions) updatePayload.permissions = updates.permissions;
        if (updates.newPassword) updatePayload.hashedPassword = await bcrypt.hash(updates.newPassword, SALT_ROUNDS);
        if (updates.newPin) {
            updatePayload.hashedPin = await bcrypt.hash(updates.newPin, SALT_ROUNDS);
            updatePayload.failedPinAttempts = 0;
        }
        if (typeof updates.telegramChatId !== 'undefined') updatePayload.telegramChatId = updates.telegramChatId;
        
        await writeDb("users", updatePayload, { mode: 'updateOne', query: { _id: userId } });
        await syncLegacyUserByIdToBetterAuth(userId);

        return { success: true, message: "User updated successfully." };
    } catch (error) {
        console.error("Error updating user:", error);
        return { success: false, message: error instanceof Error ? error.message : "An unknown error occurred during update." };
    }
}

export async function getUserByUsername(username: string): Promise<StoredUser | null> {
  try {
    const user = await readDb<any>("users", { query: { username: username.toLowerCase() } });
    if (!user) return null;
    return makeUserSerializable(user);
  } catch (error) {
    console.error("Error fetching user by username:", error);
    return null;
  }
}

export async function getAllUsers(): Promise<StoredUser[]> {
    try {
        const usersFromDb = await readDb<any[]>("users");
        if (!usersFromDb) return [];

        const creatorIds = usersFromDb
            .map(u => u.createdBy)
            .filter(id => id && id !== 'system_signup');

        const creators = await readDb<any[]>("users", { query: { _id: { $in: creatorIds } } });
        const creatorUsernameMap = new Map<string, string>();
        creators.forEach(c => creatorUsernameMap.set(c._id.toHexString(), c.username));
        
        return usersFromDb.map(u => {
            const serializableUser = makeUserSerializable(u);
            serializableUser.createdBy = u.createdBy === 'system_signup' 
                ? 'System' 
                : creatorUsernameMap.get(u.createdBy) || u.createdBy || 'N/A';
            return serializableUser;
        });
    } catch (error) {
        console.error("Error fetching all users:", error);
        return [];
    }
}

export async function verifyUserPassword(passwordPlain: string, hashedPasswordFromDb: string): Promise<boolean> {
  return bcrypt.compare(passwordPlain, hashedPasswordFromDb);
}

export async function verifyUserPin(pinPlain: string, hashedPinFromDb: string): Promise<boolean> {
  return bcrypt.compare(pinPlain, hashedPinFromDb);
}

export async function getLoginHistory(username: string): Promise<LoginActivity[]> {
  const activitiesFromDb = await readDb<any[]>("login_activity", { 
      query: { username: username.toLowerCase() },
      options: { sort: { loginTimestamp: -1 }, limit: 20 }
  });
  return activitiesFromDb.map(makeUserSerializable) as unknown as LoginActivity[];
}

export async function changePassword(username: string, oldPasswordPlain: string, newPasswordPlain: string): Promise<{ success: boolean; message: string }> {
  const user = await readDb<any>("users", { query: { username: username.toLowerCase() } });
  if (!user || !user.hashedPassword) {
    return { success: false, message: "User not found." };
  }
  
  const isOldPasswordValid = await verifyUserPassword(oldPasswordPlain, user.hashedPassword!);
  if (!isOldPasswordValid) {
    return { success: false, message: "Incorrect old password." };
  }
  
  const newHashedPassword = await bcrypt.hash(newPasswordPlain, SALT_ROUNDS);
  await writeDb("users", { hashedPassword: newHashedPassword }, { mode: 'updateOne', query: { _id: user._id } });
  await syncLegacyUserByIdToBetterAuth(user._id.toHexString());

  return { success: true, message: "Password changed successfully. Please log in again." };
}

export async function changePin(username: string, currentPasswordPlain: string, newPinPlain: string): Promise<{ success: boolean; message: string }> {
    const user = await readDb<any>("users", { query: { username: username.toLowerCase() } });
    if (!user || !user.hashedPassword) {
        return { success: false, message: "User not found." };
    }

    const isPasswordValid = await verifyUserPassword(currentPasswordPlain, user.hashedPassword!);
    if (!isPasswordValid) {
        return { success: false, message: "Incorrect account password." };
    }

    const newHashedPin = await bcrypt.hash(newPinPlain, SALT_ROUNDS);
    await writeDb("users", { hashedPin: newHashedPin, failedPinAttempts: 0 }, { mode: 'updateOne', query: { _id: user._id } });

    return { success: true, message: "PIN changed successfully." };
}

export async function deleteLoginActivityEntry(activityId: string | null): Promise<{ success: boolean, message?: string }> {
  if (!activityId) {
    return { success: false, message: "Activity ID is required." };
  }
  const result = await writeDb("login_activity", null, { mode: 'deleteOne', query: { _id: activityId } });
  if (result.deletedCount > 0) {
      return { success: true, message: "Login activity record deleted." };
  }
  return { success: false, message: "Activity record not found." };
}

export async function toggleUserStatus(userIdToToggle: string, adminId: string): Promise<{ success: boolean; message: string }> {
  try {
    const admin = await getActingUserFromSession(adminId);
    if (!admin || !canManageUsers(admin)) {
      return { success: false, message: "Permission denied. Your account cannot change user status." };
    }
    if (admin._id === userIdToToggle) {
      return { success: false, message: "You cannot disable your own account from this page." };
    }
    const userToToggle = await readDb<any>("users", { query: { _id: userIdToToggle } });
    if (!userToToggle) {
      return { success: false, message: "User not found." };
    }
    if (isSuperAdminRole(userToToggle.role)) {
      return { success: false, message: "Cannot disable the super_admin account." };
    }
    const newDisabledStatus = !userToToggle.isDisabled;
    const updatePayload: Partial<StoredUser> = { isDisabled: newDisabledStatus };
    if (newDisabledStatus === false) {
        updatePayload.failedPinAttempts = 0;
    }
    await writeDb("users", updatePayload, { mode: 'updateOne', query: { _id: userToToggle._id } });
    await syncLegacyUserByIdToBetterAuth(userToToggle._id.toHexString());

    trySendTelegramNotification({
        provider: 'System',
        productName: 'Account Security Alert',
        status: `Account ${newDisabledStatus ? 'Disabled' : 'Enabled'}`,
        failureReason: `Status changed by super_admin: ${admin.username}`,
        transactedBy: userToToggle.username,
        timestamp: new Date(),
        refId: `STATUS_CHG_${userToToggle._id.toHexString()}`,
        customerNoDisplay: `User: ${userToToggle.username}`,
    });

    return { success: true, message: `User '${userToToggle.username}' has been ${newDisabledStatus ? 'disabled' : 'enabled'}.` };
  } catch (error) {
    console.error("Error toggling user status:", error);
    return { success: false, message: error instanceof Error ? error.message : "An unknown error occurred." };
  }
}

export async function getCurrentUserTwoFactorStatus(): Promise<{ enabled: boolean; configured: boolean }> {
  try {
    const sessionUser = await getActingUserFromSession();
    if (!sessionUser) {
      return { enabled: false, configured: false };
    }

    const betterAuthUser = await findBetterAuthUserByUsername(sessionUser.username);
    if (!betterAuthUser) {
      return { enabled: false, configured: false };
    }

    const { db } = await connectToDatabase();
    const configured = await db.collection('twoFactor').countDocuments({
      $or: [
        { userId: betterAuthUser._id },
        { userId: String(betterAuthUser._id) },
      ],
    }) > 0;

    return { enabled: betterAuthUser.twoFactorEnabled === true, configured };
  } catch (error) {
    console.error("Error fetching current user 2FA status:", error);
    return { enabled: false, configured: false };
  }
}

export async function markCurrentUserTwoFactorEnabled(): Promise<{ success: boolean; message: string }> {
  try {
    const sessionUser = await getActingUserFromSession();
    if (!sessionUser) {
      return { success: false, message: "Unauthorized." };
    }

    const betterAuthUser = await findBetterAuthUserByUsername(sessionUser.username);
    if (!betterAuthUser) {
      return { success: false, message: "Data Better Auth user tidak ditemukan." };
    }

    const { db } = await connectToDatabase();
    const twoFactorRecord = await db.collection('twoFactor').findOne({
      $or: [
        { userId: betterAuthUser._id },
        { userId: String(betterAuthUser._id) },
      ],
    });

    if (!twoFactorRecord) {
      return { success: false, message: "Secret 2FA belum dibuat." };
    }

    await db.collection('user').updateOne(
      { _id: betterAuthUser._id },
      {
        $set: {
          twoFactorEnabled: true,
          updatedAt: new Date(),
        },
      }
    );

    return { success: true, message: "2FA berhasil diaktifkan." };
  } catch (error) {
    console.error("Error marking current user 2FA enabled:", error);
    return { success: false, message: error instanceof Error ? error.message : "An unknown error occurred." };
  }
}

export async function resetUserTwoFactor(userIdToReset: string, adminId: string): Promise<{ success: boolean; message: string }> {
  try {
    const admin = await getActingUserFromSession(adminId);
    if (!admin || !canManageUsers(admin)) {
      return { success: false, message: "Permission denied. Your account cannot reset user 2FA." };
    }
    if (admin._id === userIdToReset) {
      return { success: false, message: "Anda tidak dapat reset 2FA akun sendiri dari halaman ini." };
    }

    const userToReset = await readDb<any>("users", { query: { _id: userIdToReset } });
    if (!userToReset) {
      return { success: false, message: "User not found." };
    }
    if (isSuperAdminRole(userToReset.role)) {
      return { success: false, message: "Cannot reset 2FA for the super_admin account." };
    }

    let betterAuthUser = await findBetterAuthUserByUsername(userToReset.username);
    if (!betterAuthUser) {
      betterAuthUser = await syncLegacyUserByIdToBetterAuth(userToReset._id.toHexString());
    }
    if (!betterAuthUser) {
      return { success: false, message: "Data Better Auth user tidak ditemukan." };
    }

    const { db } = await connectToDatabase();
    await db.collection('twoFactor').deleteMany({
      $or: [
        { userId: betterAuthUser._id },
        { userId: String(betterAuthUser._id) },
      ],
    });
    await db.collection('user').updateOne(
      { _id: betterAuthUser._id },
      {
        $set: {
          twoFactorEnabled: false,
          updatedAt: new Date(),
        },
      }
    );

    void trySendTelegramNotification({
      provider: 'System',
      productName: 'Account Security Alert',
      status: '2FA Reset',
      failureReason: `2FA reset by admin: ${admin.username}`,
      transactedBy: userToReset.username,
      timestamp: new Date(),
      refId: `2FA_RESET_${userToReset._id.toHexString()}`,
      customerNoDisplay: `User: ${userToReset.username}`,
    });

    return { success: true, message: `2FA user '${userToReset.username}' berhasil dinonaktifkan.` };
  } catch (error) {
    console.error("Error resetting user 2FA:", error);
    return { success: false, message: error instanceof Error ? error.message : "An unknown error occurred." };
  }
}

export async function updateUserFailedPinAttempts(userId: string): Promise<number> {
    const result = await writeDb("users", { $inc: { failedPinAttempts: 1 } }, { mode: 'updateOne', query: { _id: userId } });
    if(result.modifiedCount > 0) {
        const updatedUser = await readDb<any>("users", { query: { _id: userId } });
        return updatedUser.failedPinAttempts || 1;
    }
    return 0;
}

export async function resetUserFailedPinAttempts(userId: string): Promise<void> {
    await writeDb("users", { failedPinAttempts: 0 }, { mode: 'updateOne', query: { _id: userId } });
}

export async function disableUserAccount(userId: string): Promise<void> {
    await writeDb("users", { isDisabled: true }, { mode: 'updateOne', query: { _id: userId } });
    console.log(`Account for user ID ${userId} has been disabled due to too many failed PIN attempts.`);
}
