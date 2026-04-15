// src/components/core/ProtectedRoute.tsx
"use client";

import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertTriangle, Home } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { type ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { hasPermission } from '@/lib/auth-utils';

interface ProtectedRouteProps {
  children: ReactNode;
  requiredPermission: string;
}

export default function ProtectedRoute({ children, requiredPermission }: ProtectedRouteProps) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex h-[calc(100vh-20rem)] w-full flex-col items-center justify-center">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="mt-4 text-muted-foreground">Verifying permissions...</p>
      </div>
    );
  }

  const hasAccess = hasPermission(user, requiredPermission);

  if (!hasAccess) {
    return (
      <div className="flex items-center justify-center py-12">
        <Card className="w-full max-w-md text-center shadow-lg border-destructive bg-destructive/10">
          <CardHeader>
            <div className="mx-auto bg-destructive/20 rounded-full p-3 w-fit">
              <AlertTriangle className="h-10 w-10 text-destructive" />
            </div>
            <CardTitle className="text-2xl font-bold text-destructive mt-4">Access Denied</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-destructive/90 mb-6">
              You do not have the required permissions to view this page. Please contact a super administrator if you believe this is an error.
            </p>
            <Button asChild>
              <Link href="/dashboard">
                <Home className="mr-2 h-4 w-4" /> Go to Dashboard
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return <>{children}</>;
}
