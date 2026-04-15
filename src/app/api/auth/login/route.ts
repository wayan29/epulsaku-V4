// src/app/api/auth/login/route.ts
import { NextResponse, NextRequest } from 'next/server';
import { getUserByUsername, verifyUserPassword, recordLoginSuccess } from '@/lib/user-utils';
import { MAX_ATTEMPTS, LOCKOUT_PERIOD_MS, normalizeUserRole, type User } from '@/lib/auth-utils';
import { repairBetterAuthCredentialAccount, syncLegacyUserToBetterAuth } from '@/lib/better-auth-bridge';
import { auth } from '@/lib/auth';
import { z } from 'zod';

const LoginSchema = z.object({
  username: z.string().min(1, { message: "Username is required." }),
  password: z.string().min(1, { message: "Password is required." }),
  rememberMe: z.boolean().optional(),
});

// --- Start of Rate Limiting Implementation ---
interface LoginAttempt {
  count: number;
  expiry: number; // Timestamp when the lockout expires
}
const loginAttempts = new Map<string, LoginAttempt>(); // Keyed by IP Address

function getClientIp(req: NextRequest): string {
    const forwarded = req.headers.get('x-forwarded-for');
    if (forwarded) {
        return forwarded.split(',')[0].trim();
    }
    return req.headers.get('x-real-ip') || '127.0.0.1';
}

function getPublicOrigin(req: NextRequest): string {
    const forwardedHost = req.headers.get('x-forwarded-host')?.split(',')[0]?.trim();
    const host = forwardedHost || req.headers.get('host');
    const forwardedProto = req.headers.get('x-forwarded-proto')?.split(',')[0]?.trim();
    const proto = forwardedProto || req.nextUrl.protocol.replace(':', '') || 'https';

    if (host) {
        return `${proto}://${host}`;
    }

    return req.nextUrl.origin;
}

function handleFailedLoginAttempt(ip: string) {
    const now = Date.now();
    const existingAttempt = loginAttempts.get(ip);

    let newCount = 1;
    // If there's an existing attempt and it hasn't expired, increment the count
    if (existingAttempt && now < existingAttempt.expiry) {
        newCount = existingAttempt.count + 1;
    }

    // Set a new expiry time from the current moment of failure
    loginAttempts.set(ip, {
        count: newCount,
        expiry: now + LOCKOUT_PERIOD_MS
    });
}

// --- End of Rate Limiting Implementation ---


export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  
  try {
    // --- Rate Limiting Check ---
    const now = Date.now();
    const attempt = loginAttempts.get(ip);
    if (attempt && now < attempt.expiry && attempt.count >= MAX_ATTEMPTS) {
        const timeLeft = Math.ceil((attempt.expiry - now) / 1000);
        return NextResponse.json(
            { message: `Too many failed login attempts. Please try again in ${timeLeft} seconds.`, lockoutTime: timeLeft }, 
            { status: 429 }
        );
    } else if (attempt && now >= attempt.expiry) {
        // Clear expired attempts
        loginAttempts.delete(ip);
    }
    // --- End Rate Limiting Check ---
    
    const body = await req.json();
    const parseResult = LoginSchema.safeParse(body);

    if (!parseResult.success) {
      return NextResponse.json({ message: parseResult.error.errors.map(e => e.message).join(', ') }, { status: 400 });
    }
    
    const { username, password, rememberMe } = parseResult.data;

    const userFromDb = await getUserByUsername(username);
    if (!userFromDb || !userFromDb.hashedPassword) {
      handleFailedLoginAttempt(ip);
      return NextResponse.json({ message: 'Invalid username or password.' }, { status: 401 });
    }

    // Check if user is disabled
    if (userFromDb.isDisabled) {
        return NextResponse.json({ message: 'Your account has been disabled. Please contact an administrator.' }, { status: 403 }); // 403 Forbidden
    }

    const isPasswordValid = await verifyUserPassword(password, userFromDb.hashedPassword);
    if (!isPasswordValid) {
      handleFailedLoginAttempt(ip);
      return NextResponse.json({ message: 'Invalid username or password.' }, { status: 401 });
    }
    
    // On success, clear any previous failed attempts for this IP
    loginAttempts.delete(ip);
    
    // Record login activity using headers from the request object
    const headersList = req.headers;
    const userAgent = headersList.get('user-agent');
    await recordLoginSuccess(userFromDb, userAgent, ip);

    const normalizedRole = normalizeUserRole(userFromDb.role);
    if (!normalizedRole) {
      return NextResponse.json({ message: 'Invalid role configuration on this account.' }, { status: 500 });
    }

    await syncLegacyUserToBetterAuth(userFromDb);

    const publicOrigin = getPublicOrigin(req);
    const publicUrl = new URL(publicOrigin);
    const forwardedHost = req.headers.get('x-forwarded-host')?.split(',')[0]?.trim();
    const forwardedProto = req.headers.get('x-forwarded-proto')?.split(',')[0]?.trim();

    const betterAuthRequestHeaders = new Headers({
      'content-type': 'application/json',
      cookie: req.headers.get('cookie') || '',
      'user-agent': req.headers.get('user-agent') || '',
      origin: publicOrigin,
      referer: `${publicOrigin}/login`,
    });

    if (req.headers.get('x-forwarded-for')) {
      betterAuthRequestHeaders.set('x-forwarded-for', req.headers.get('x-forwarded-for') || '');
    }

    if (req.headers.get('x-real-ip')) {
      betterAuthRequestHeaders.set('x-real-ip', req.headers.get('x-real-ip') || '');
    }

    if (forwardedProto) {
      betterAuthRequestHeaders.set('x-forwarded-proto', forwardedProto);
    }

    if (forwardedHost) {
      betterAuthRequestHeaders.set('x-forwarded-host', forwardedHost);
    }

    betterAuthRequestHeaders.set('host', req.headers.get('host') || publicUrl.host);

    const betterAuthRequest = new Request(new URL('/api/auth/sign-in/username', publicOrigin), {
      method: 'POST',
      headers: betterAuthRequestHeaders,
      body: JSON.stringify({ username, password, rememberMe }),
    });

    let betterAuthResponse = await auth.handler(betterAuthRequest);
    if (!betterAuthResponse.ok && userFromDb.hashedPassword) {
      await repairBetterAuthCredentialAccount(userFromDb.username, userFromDb.hashedPassword);
      betterAuthResponse = await auth.handler(betterAuthRequest);
    }

    if (!betterAuthResponse.ok) {
      const errorPayload = await betterAuthResponse.json().catch(() => ({ message: 'Login failed.' }));
      console.error('Better Auth sign-in failed after legacy password verification.', {
        username: userFromDb.username,
        status: betterAuthResponse.status,
        errorPayload,
      });
      handleFailedLoginAttempt(ip);
      return NextResponse.json(
        { message: errorPayload?.message || 'Invalid username or password.' },
        { status: betterAuthResponse.status || 401 }
      );
    }

    const payload = await betterAuthResponse.json().catch(() => null);
    const response = NextResponse.json(
      {
        success: true,
        message: 'Login successful.',
        user: {
          id: userFromDb._id,
          username: userFromDb.username,
          role: normalizedRole,
          permissions: userFromDb.permissions || [],
        } satisfies User,
        session: payload,
      },
      {
        status: betterAuthResponse.status,
      }
    );

    const setCookieHeader = betterAuthResponse.headers.get('set-cookie');
    if (setCookieHeader) {
      response.headers.set('set-cookie', setCookieHeader);
    }

    response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate');
    response.headers.set('Pragma', 'no-cache');
    response.headers.set('Expires', '0');

    return response;

  } catch (error) {
    console.error('API Login Error:', error);
    if (error instanceof SyntaxError) {
      return NextResponse.json({ message: 'Invalid JSON body.' }, { status: 400 });
    }
    return NextResponse.json({ message: 'An internal server error occurred.' }, { status: 500 });
  }
}
