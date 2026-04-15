// src/app/api/auth/signup/route.ts
import { NextResponse } from 'next/server';
import { createUser } from '@/lib/user-utils';
import { syncLegacyCredentialsOnSignup } from '@/lib/better-auth-bridge';
import { z } from 'zod';

const SignupSchema = z.object({
  username: z.string().min(3, "Username must be at least 3 characters"),
  email: z.string().email("Invalid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  pin: z.string().length(6, "PIN must be 6 digits").regex(/^\d+$/, "PIN must be only digits"),
});


export async function POST(req: Request) {
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
      return NextResponse.json({ message: result.message || "Could not create account." }, { status: 409 }); // 409 Conflict for existing user
    }
  } catch (error) {
    console.error('API Signup Error:', error);
    if (error instanceof SyntaxError) {
      return NextResponse.json({ message: 'Invalid JSON body.' }, { status: 400 });
    }
    return NextResponse.json({ message: 'An internal server error occurred.' }, { status: 500 });
  }
}
