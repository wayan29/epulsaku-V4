// src/app/api/auth/actions.ts
'use server';

import { headers } from 'next/headers';
import { auth } from '@/lib/auth';
import { normalizeUserRole, type User } from '@/lib/auth-utils';
import { connectToDatabase } from '@/lib/mongodb';

function isExpectedDynamicServerUsageError(error: unknown): boolean {
  return error instanceof Error && error.message.includes('Dynamic server usage');
}

export async function verifyAuth(): Promise<{ isAuthenticated: boolean; user: User | null }> {
  try {
    const requestHeaders = await headers();
    const session = await auth.api.getSession({ headers: requestHeaders });

    if (!session?.user) {
      return { isAuthenticated: false, user: null };
    }

    const normalizedRole = normalizeUserRole((session.user as any).role);
    if (!normalizedRole) {
      return { isAuthenticated: false, user: null };
    }

    const sessionUsername = String((session.user as any).username || session.user.name || session.user.email || '');
    let appUserId = String(session.user.id);

    if (sessionUsername) {
      try {
        const { db } = await connectToDatabase();
        const legacyUser = await db.collection('users').findOne(
          { username: sessionUsername.toLowerCase() },
          { projection: { _id: 1 } }
        );

        if (legacyUser?._id) {
          appUserId = legacyUser._id.toString();
        }
      } catch (error) {
        console.log('Legacy user lookup failed during session verification:', (error as Error).message);
      }
    }

    return {
      isAuthenticated: true,
      user: {
        id: appUserId,
        username: sessionUsername,
        role: normalizedRole,
        permissions: Array.isArray((session.user as any).permissions) ? (session.user as any).permissions : [],
      },
    };
  } catch (error) {
    if (!isExpectedDynamicServerUsageError(error)) {
      console.log('Session verification failed:', error instanceof Error ? error.message : error);
    }
    return { isAuthenticated: false, user: null };
  }
}
