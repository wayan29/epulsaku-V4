import { betterAuth } from 'better-auth';
import { mongodbAdapter } from 'better-auth/adapters/mongodb';
import { toNextJsHandler, nextCookies } from 'better-auth/next-js';
import { username } from 'better-auth/plugins/username';
import bcrypt from 'bcryptjs';
import { connectToDatabase } from '@/lib/mongodb';

const { client, db } = await connectToDatabase();

const betterAuthSecret = process.env.BETTER_AUTH_SECRET || process.env.JWT_SECRET || 'development-secret-change-me';
const configuredAppUrls = [
  process.env.BETTER_AUTH_URL,
  process.env.NEXT_PUBLIC_APP_URL,
  process.env.NEXT_PUBLIC_BASE_URL,
  'http://localhost:9002',
].filter((value): value is string => Boolean(value));

const appBaseURL = configuredAppUrls[0];

function toOriginCandidate(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

function toHostCandidate(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    return new URL(value).host;
  } catch {
    return null;
  }
}

const staticTrustedOrigins = Array.from(
  new Set(configuredAppUrls.map((value) => toOriginCandidate(value)).filter((value): value is string => Boolean(value)))
);

const allowedHosts = Array.from(
  new Set(
    [
      ...configuredAppUrls.map((value) => toHostCandidate(value)).filter((value): value is string => Boolean(value)),
      'localhost:9003',
      '127.0.0.1:9003',
    ]
  )
);

function getForwardedOrigin(request: Request): string | null {
  const forwardedHostHeader = request.headers.get('x-forwarded-host');
  const forwardedHost = forwardedHostHeader?.split(',')[0]?.trim() || request.headers.get('host');
  if (!forwardedHost) return null;
  const forwardedProtoHeader = request.headers.get('x-forwarded-proto');
  const forwardedProto = forwardedProtoHeader?.split(',')[0]?.trim() || 'https';
  return `${forwardedProto}://${forwardedHost}`;
}

export const auth = betterAuth({
  database: mongodbAdapter(db, { client, transaction: false }),
  baseURL: {
    baseURL: appBaseURL,
    fallback: appBaseURL,
    allowedHeaders: ['x-forwarded-host', 'x-forwarded-proto', 'host'],
    allowedHosts,
  },
  trustedOrigins: async (request) => {
    if (!request) {
      return staticTrustedOrigins;
    }

    const dynamicOrigins = [
      toOriginCandidate(request.headers.get('origin')),
      toOriginCandidate(request.headers.get('referer')),
      toOriginCandidate(request.url),
      toOriginCandidate(getForwardedOrigin(request)),
    ].filter((value): value is string => Boolean(value));

    return Array.from(new Set([...staticTrustedOrigins, ...dynamicOrigins]));
  },
  secret: betterAuthSecret,
  plugins: [
    nextCookies(),
    username(),
  ],
  emailAndPassword: {
    enabled: true,
    disableSignUp: true,
    autoSignIn: true,
    minPasswordLength: 6,
    password: {
      hash: async (password) => bcrypt.hash(password, 10),
      verify: async ({ password, hash }) => bcrypt.compare(password, hash),
    },
  },
  user: {
    additionalFields: {
      role: {
        type: 'string',
        required: false,
        defaultValue: 'staf',
        input: false,
      },
      permissions: {
        type: 'string[]',
        required: false,
        defaultValue: [],
        input: false,
      },
      isDisabled: {
        type: 'boolean',
        required: false,
        defaultValue: false,
        input: false,
      },
      telegramChatId: {
        type: 'string',
        required: false,
        input: false,
      },
    },
  },
  advanced: {
    database: {
      generateId: false,
    },
  },
});

export const authHandler = toNextJsHandler(auth);
