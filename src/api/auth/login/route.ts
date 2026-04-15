import { NextResponse } from 'next/server';

export async function POST() {
  return NextResponse.json(
    {
      success: false,
      message: 'Legacy src/api auth route is obsolete. Use App Router auth endpoints.',
    },
    { status: 410 }
  );
}
