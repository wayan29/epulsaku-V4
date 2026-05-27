// src/app/api/auth/signup/route.ts
import { NextResponse } from 'next/server';
import { createUser } from '@/lib/user-utils';
import { syncLegacyCredentialsOnSignup } from '@/lib/better-auth-bridge';
import { z } from 'zod';

const SignupSchema = z.object({
  username: z.string().min(3, "Username minimal 3 karakter"),
  email: z.string().email("Format email tidak valid"),
  password: z.string().min(6, "Password minimal 6 karakter"),
  pin: z.string().length(6, "PIN harus 6 digit").regex(/^\d+$/, "PIN hanya boleh berisi angka"),
});

const SIGNUP_WINDOW_MS = 10 * 60 * 1000;
const SIGNUP_MAX_ATTEMPTS = 5;
const signupAttempts = new Map<string, { count: number; expiresAt: number }>();

function getClientIp(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return forwarded || req.headers.get('x-real-ip') || '127.0.0.1';
}

function checkSignupRateLimit(ip: string): { limited: boolean; retryAfter: number } {
  const now = Date.now();
  const attempt = signupAttempts.get(ip);

  if (!attempt || now >= attempt.expiresAt) {
    signupAttempts.set(ip, { count: 1, expiresAt: now + SIGNUP_WINDOW_MS });
    return { limited: false, retryAfter: 0 };
  }

  if (attempt.count >= SIGNUP_MAX_ATTEMPTS) {
    return { limited: true, retryAfter: Math.ceil((attempt.expiresAt - now) / 1000) };
  }

  attempt.count += 1;
  signupAttempts.set(ip, attempt);
  return { limited: false, retryAfter: 0 };
}


export async function POST(req: Request) {
  const ip = getClientIp(req);
  const rateLimit = checkSignupRateLimit(ip);

  if (rateLimit.limited) {
    return NextResponse.json(
      { message: `Terlalu banyak percobaan signup. Silakan coba lagi dalam ${rateLimit.retryAfter} detik.` },
      { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfter) } }
    );
  }

  try {
    const body = await req.json();
    const parseResult = SignupSchema.safeParse(body);

    if (!parseResult.success) {
      return NextResponse.json({ message: parseResult.error.errors.map(e => e.message).join(', ') }, { status: 400 });
    }
    
    const { username, email, password, pin } = parseResult.data;

    // Server action already checks if users exist. It will assign 'super_admin' to the first user.
    const result = await createUser({
      username: username,
      email: email,
      passwordPlain: password,
      pinPlain: pin,
      role: 'super_admin' // This will only apply if it's the first user, as per the logic in createUser
    });

    if (result.success) {
      await syncLegacyCredentialsOnSignup({
        username,
        email,
        passwordPlain: password,
        role: result.user?.role || 'super_admin',
        permissions: result.user?.permissions || ['all_access'],
      });
      return NextResponse.json({ success: true, user: result.user });
    } else {
      return NextResponse.json({ message: result.message || "Akun tidak dapat dibuat." }, { status: 409 }); // 409 Conflict for existing user
    }
  } catch (error) {
    console.error('API Signup Error:', error);
    if (error instanceof SyntaxError) {
      return NextResponse.json({ message: 'Body JSON tidak valid.' }, { status: 400 });
    }
    return NextResponse.json({ message: 'Terjadi kesalahan internal pada server.' }, { status: 500 });
  }
}
