import { createAuthClient } from 'better-auth/react';
import { twoFactorClient, usernameClient } from 'better-auth/client/plugins';

const authBaseURL =
  typeof window === 'undefined'
    ? process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:9003'
    : window.location.origin;

export const authClient = createAuthClient({
  baseURL: authBaseURL,
  plugins: [
    usernameClient(),
    twoFactorClient({ twoFactorPage: '/two-factor' }),
  ],
});
