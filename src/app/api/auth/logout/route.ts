import { NextResponse } from 'next/server';

export async function POST() {
  return NextResponse.json({
    success: true,
    message: 'Use /api/auth/sign-out for logout.',
  });
}
