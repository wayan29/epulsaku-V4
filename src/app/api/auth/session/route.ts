import { NextResponse } from 'next/server';
import { verifyAuth } from '@/app/api/auth/actions';

export async function GET() {
  try {
    const result = await verifyAuth();

    return NextResponse.json(result, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
        Pragma: 'no-cache',
        Expires: '0',
      },
    });
  } catch (error) {
    console.error('Session route failed:', error);

    return NextResponse.json(
      {
        isAuthenticated: false,
        user: null,
        message: error instanceof Error ? error.message : 'Session check failed.',
      },
      {
        status: 500,
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate',
          Pragma: 'no-cache',
          Expires: '0',
        },
      }
    );
  }
}
