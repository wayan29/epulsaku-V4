import type { Metadata, Viewport } from 'next';
import './globals.css';
import { Toaster } from "@/components/ui/toaster";
import { Providers } from '@/components/core/providers';
import { AuthProvider } from '@/contexts/AuthContext';
import { getResolvedUiTheme } from '@/lib/ui-theme-actions';

export const metadata: Metadata = {
  title: 'ePulsaku - Digital Product Transactions',
  description: 'Buy phone credit, electricity tokens, and game top-ups easily.',
  manifest: '/manifest.json',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  minimumScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const resolvedUiTheme = await getResolvedUiTheme();

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter&display=swap" rel="stylesheet" />
        <meta name="theme-color" content="#4338ca" />
      </head>
      <body className="font-body antialiased">
        <Providers resolvedUiTheme={resolvedUiTheme}>
          <AuthProvider>
            {children}
            <Toaster />
          </AuthProvider>
        </Providers>
      </body>
    </html>
  );
}
