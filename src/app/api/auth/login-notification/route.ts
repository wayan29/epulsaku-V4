import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/app/api/auth/actions';
import { getUserByUsername, recordLoginSuccess } from '@/lib/user-utils';
import { trySendLoginTelegramNotification } from '@/lib/notification-utils';

function getClientIp(req: NextRequest): string {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  return req.headers.get('x-real-ip') || '127.0.0.1';
}

export async function POST(req: NextRequest) {
  const { isAuthenticated, user } = await verifyAuth();

  if (!isAuthenticated || !user) {
    return NextResponse.json({ success: false, message: 'Unauthorized.' }, { status: 401 });
  }

  const storedUser = await getUserByUsername(user.username);
  if (!storedUser) {
    return NextResponse.json({ success: false, message: 'User tidak ditemukan.' }, { status: 404 });
  }

  const ipAddress = getClientIp(req);
  const userAgent = req.headers.get('user-agent');

  await recordLoginSuccess(storedUser, userAgent, ipAddress);
  void trySendLoginTelegramNotification({
    username: user.username,
    role: user.role,
    ipAddress,
    userAgent,
    timestamp: new Date(),
    twoFactorUsed: true,
  });

  return NextResponse.json({ success: true });
}
