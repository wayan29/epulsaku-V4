// src/lib/admin-settings-utils.ts
'use server';

import { readDb, writeDb } from './mongodb';
import { getUserByUsername, verifyUserPassword } from './user-utils';
import crypto from 'crypto';

const ADMIN_SETTINGS_DB = 'admin_settings';
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
const ENCRYPTION_PREFIX = 'enc::';

// Get the encryption key from environment variables.
// It MUST be 32 characters (256 bits) long for aes-256-gcm.
const encryptionKey = process.env.ENCRYPTION_KEY;

if (!encryptionKey || Buffer.from(encryptionKey, 'hex').length !== 32) {
  console.error("FATAL: ENCRYPTION_KEY is not defined or is not a 32-byte hex string in .env file. Please generate a secure key.");
  // In a real app, you might want to prevent the app from starting.
}

const key = encryptionKey ? Buffer.from(encryptionKey, 'hex') : Buffer.alloc(32); // Fallback to empty buffer if not set to avoid crash, but logs error.

// Helper function to encrypt a value
function encrypt(text: string): string {
  if (!text) return text;
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  // Store as "prefix::iv:authtag:encrypted"
  return `${ENCRYPTION_PREFIX}${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}

// Helper function to decrypt a value. Returns null on failure.
function decrypt(encryptedText: string): string | null {
    if (!encryptedText || !encryptedText.startsWith(ENCRYPTION_PREFIX)) {
        return encryptedText; // Not encrypted, return as-is
    }
    try {
        const parts = encryptedText.substring(ENCRYPTION_PREFIX.length).split(':');
        if (parts.length !== 3) {
            console.error("[Decrypt] Invalid encrypted format. Expected iv:authtag:encrypted. Value starts with:", encryptedText.substring(0, 30));
            return null; // Return null on format error
        }
        const iv = Buffer.from(parts[0], 'hex');
        const authTag = Buffer.from(parts[1], 'hex');
        const encrypted = Buffer.from(parts[2], 'hex');

        const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
        decipher.setAuthTag(authTag);
        const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
        return decrypted.toString('utf8');
    } catch (error) {
        console.error("[Decrypt] Decryption failed. This often happens if the ENCRYPTION_KEY has changed or if the data is corrupt.", error);
        return null; // Return null on any decryption failure
    }
}


export interface AdminSettings {
  _id?: string;
  digiflazzUsername?: string;
  digiflazzApiKey?: string;
  digiflazzWebhookSecret?: string;
  allowedDigiflazzIPs?: string;
  allowedTokoVoucherIPs?: string;
  tokovoucherMemberCode?: string;
  tokovoucherSignature?: string;
  tokovoucherKey?: string;
  telegramBotToken?: string;
  telegramChatId?: string;
  globalUiTheme?: string;
}

const sensitiveFields: (keyof AdminSettings)[] = [
  'digiflazzApiKey', 'digiflazzWebhookSecret', 
  'tokovoucherKey', 'tokovoucherSignature'
];

// Server Action to fetch admin settings
export async function getAdminSettingsFromDB(): Promise<AdminSettings> {
  try {
    const settingsDoc = await readDb<any>(ADMIN_SETTINGS_DB);
    if (!settingsDoc) return {};

    const settings: AdminSettings = { ...settingsDoc };
    
    // Decrypt sensitive fields
    for (const field of sensitiveFields) {
        if (settings[field]) {
            const decryptedValue = decrypt(settings[field]!);
            // If decryption fails, it returns null. We should not set the field.
            // A non-null, empty string is a valid (cleared) value.
            if (decryptedValue !== null) {
                settings[field] = decryptedValue;
            } else {
                // If decryption fails, treat it as if the field doesn't exist to prevent using a null value.
                delete settings[field]; 
                console.warn(`[Admin Settings] Failed to decrypt '${field}'. It will be treated as not set.`);
            }
        }
    }
    
    // Convert ObjectId to string to make it serializable for client components
    if (settings._id) {
        delete settings._id;
    }

    return settings;
  } catch (error) {
    console.error("Error fetching admin settings from DB:", error);
    return {};
  }
}

export interface SaveAdminSettingsData {
  settings: Partial<AdminSettings>; // Use Partial to only update fields that are provided
  adminPasswordConfirmation: string;
  adminUsername: string;
}

// Server Action to save settings from the Admin Settings page
export async function saveAdminSettingsToDB(data: SaveAdminSettingsData): Promise<{ success: boolean; message: string }> {
  if (!encryptionKey || Buffer.from(encryptionKey, 'hex').length !== 32) {
    return { success: false, message: "Server configuration error: Encryption key is missing or invalid. Settings not saved." };
  }
  
  try {
    const { settings, adminPasswordConfirmation, adminUsername } = data;

    const adminUser = await getUserByUsername(adminUsername);
    if (!adminUser || !adminUser.hashedPassword) {
      return { success: false, message: "Admin user not found or password not set." };
    }
    const isPasswordValid = await verifyUserPassword(adminPasswordConfirmation, adminUser.hashedPassword);
    if (!isPasswordValid) {
      return { success: false, message: "Incorrect admin password. Settings not saved." };
    }
    
    // Fetch existing settings to merge with new ones
    const existingSettings = await readDb<AdminSettings>(ADMIN_SETTINGS_DB) || {};
    const settingsToSave: AdminSettings = { ...existingSettings };

    // Encrypt and update only the fields provided in the payload
    for (const key in settings) {
      const fieldKey = key as keyof AdminSettings;
      const value = settings[fieldKey];
      if (typeof value !== 'undefined') {
        if (sensitiveFields.includes(fieldKey) && value) {
          settingsToSave[fieldKey] = encrypt(value);
        } else {
          // For non-sensitive fields or when a sensitive field is being cleared (empty string)
          settingsToSave[fieldKey] = value;
        }
      }
    }

    await writeDb(ADMIN_SETTINGS_DB, settingsToSave);

    return { success: true, message: "Admin settings saved successfully." };
  } catch (error) {
    console.error("Error saving admin settings to DB:", error);
    const message = error instanceof Error ? error.message : "An unknown error occurred.";
    return { success: false, message: `Failed to save settings: ${message}` };
  }
}
