// src/ai/flows/verify-pin-flow.ts
'use server';
/**
 * @fileOverview A Genkit flow for verifying a user's PIN against MongoDB.
 * Implements an auto-disable feature for admin/staf accounts after 3 failed attempts.
 *
 * - verifyPin - A function that calls the PIN verification flow.
 * - VerifyPinInput - The input type for the verifyPin function.
 * - VerifyPinOutput - The return type for the verifyPin function.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';
import { getUserByUsername, verifyUserPin, updateUserFailedPinAttempts, resetUserFailedPinAttempts, disableUserAccount } from '@/lib/user-utils';
import { trySendTelegramNotification } from '@/lib/notification-utils';

const VerifyPinInputSchema = z.object({
  username: z.string().describe('The username of the user whose PIN is being verified.'),
  pin: z.string().length(6, "PIN must be 6 digits").regex(/^\d+$/, "PIN must be only digits").describe('The 6-digit PIN to verify.'),
});
export type VerifyPinInput = z.infer<typeof VerifyPinInputSchema>;

const VerifyPinOutputSchema = z.object({
  isValid: z.boolean().describe('Whether the provided PIN is valid for the user.'),
  message: z.string().optional().describe('An optional message, e.g., error message.'),
  accountDisabled: z.boolean().optional().default(false).describe('Indicates if the account was disabled due to this attempt.'),
});
export type VerifyPinOutput = z.infer<typeof VerifyPinOutputSchema>;

export async function verifyPin(input: VerifyPinInput): Promise<VerifyPinOutput> {
  return verifyPinFlow(input);
}

const verifyPinFlow = ai.defineFlow(
  {
    name: 'verifyPinFlow',
    inputSchema: VerifyPinInputSchema,
    outputSchema: VerifyPinOutputSchema,
  },
  async (input) => {
    const user = await getUserByUsername(input.username);

    if (!user) {
      return { isValid: false, message: 'User not found.', accountDisabled: false };
    }
     if (user.isDisabled) {
      return { isValid: false, message: 'Your account is disabled. Please contact an administrator.', accountDisabled: true };
    }
    if (!user.hashedPin) {
      return { isValid: false, message: 'User does not have a PIN configured.', accountDisabled: false };
    }

    const isPinValid = await verifyUserPin(input.pin, user.hashedPin);

    if (isPinValid) {
      // PIN is correct, reset any failed attempts
      if (user.failedPinAttempts && user.failedPinAttempts > 0) {
        await resetUserFailedPinAttempts(user._id);
      }
      return { isValid: true, message: 'PIN verified successfully.', accountDisabled: false };
    } else {
      // PIN is incorrect, handle failure logic
      
      // super_admin is immune to PIN lockouts
      if (user.role === 'super_admin') {
        return { isValid: false, message: 'Invalid PIN.', accountDisabled: false };
      }

      const newAttemptCount = await updateUserFailedPinAttempts(user._id);
      const MAX_ATTEMPTS = 3;

      if (newAttemptCount >= MAX_ATTEMPTS) {
        await disableUserAccount(user._id);
        
        // Send Telegram notification to admin about the disabled account
        trySendTelegramNotification({
            provider: 'System',
            productName: 'Account Security Alert',
            status: 'Account Disabled',
            failureReason: 'Too many failed PIN attempts',
            transactedBy: user.username,
            timestamp: new Date(),
            // These fields are not relevant for this type of notification but are required by the type
            refId: `SECURITY_ALERT_${user._id}`,
            customerNoDisplay: `User: ${user.username}`,
        });
        
        return { 
          isValid: false, 
          message: `Too many failed PIN attempts. Your account has been disabled for security. Please contact a super administrator.`,
          accountDisabled: true
        };
      } else {
        const attemptsRemaining = MAX_ATTEMPTS - newAttemptCount;
        return { isValid: false, message: `Invalid PIN. You have ${attemptsRemaining} attempt(s) remaining before your account is locked.`, accountDisabled: false };
      }
    }
  }
);
