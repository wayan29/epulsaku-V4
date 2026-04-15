import bcrypt from 'bcryptjs';
import { ObjectId } from 'mongodb';
import { connectToDatabase } from '@/lib/mongodb';
import { normalizeUserRole, type StoredUser } from '@/lib/auth-utils';

const fallbackEmailForUsername = (username: string) => `${username.toLowerCase()}@users.epulsaku.local`;

export async function findBetterAuthUserByUsername(username: string) {
  const { db } = await connectToDatabase();
  return db.collection('user').findOne({ username: username.toLowerCase() });
}

export async function repairBetterAuthCredentialAccount(username: string, hashedPassword: string) {
  const { db } = await connectToDatabase();
  const betterAuthUser = await db.collection('user').findOne({ username: username.toLowerCase() });
  if (!betterAuthUser) {
    return null;
  }

  await db.collection('account').deleteMany({
    providerId: 'credential',
    $or: [
      { userId: betterAuthUser._id },
      { userId: String(betterAuthUser._id) },
      { accountId: betterAuthUser._id },
      { accountId: String(betterAuthUser._id) },
    ],
  });

  const now = new Date();
  await db.collection('account').insertOne({
    accountId: betterAuthUser._id,
    providerId: 'credential',
    userId: betterAuthUser._id,
    password: hashedPassword,
    createdAt: now,
    updatedAt: now,
  });

  return betterAuthUser;
}

export async function syncLegacyUserToBetterAuth(legacyUser: StoredUser) {
  const { db } = await connectToDatabase();
  const now = new Date();
  const normalizedRole = normalizeUserRole(legacyUser.role) || 'staf';
  const username = legacyUser.username.toLowerCase();
  const email = (legacyUser.email || fallbackEmailForUsername(username)).toLowerCase();
  const existingUser = await db.collection('user').findOne({ username });

  if (existingUser) {
    await db.collection('user').updateOne(
      { _id: existingUser._id },
      {
        $set: {
          email,
          name: legacyUser.username,
          username,
          displayUsername: legacyUser.username,
          role: normalizedRole,
          permissions: legacyUser.permissions || [],
          isDisabled: !!legacyUser.isDisabled,
          telegramChatId: legacyUser.telegramChatId,
          emailVerified: !!legacyUser.email,
          updatedAt: now,
        },
      }
    );

    if (legacyUser.hashedPassword) {
      const credentialAccount = await db.collection('account').findOne({
        providerId: 'credential',
        $or: [
          { userId: existingUser._id },
          { userId: String(existingUser._id) },
          { accountId: existingUser._id },
          { accountId: String(existingUser._id) },
        ],
      });
      if (!credentialAccount) {
        await db.collection('account').insertOne({
          accountId: existingUser._id,
          providerId: 'credential',
          userId: existingUser._id,
          password: legacyUser.hashedPassword,
          createdAt: now,
          updatedAt: now,
        });
      } else {
        await db.collection('account').updateOne(
          { _id: credentialAccount._id },
          {
            $set: {
              accountId: existingUser._id,
              userId: existingUser._id,
              password: legacyUser.hashedPassword,
              updatedAt: now,
            },
          }
        );
      }
    }

    return existingUser;
  }

  const insertResult = await db.collection('user').insertOne({
    name: legacyUser.username,
    email,
    emailVerified: !!legacyUser.email,
    image: null,
    username,
    displayUsername: legacyUser.username,
    role: normalizedRole,
    permissions: legacyUser.permissions || [],
    isDisabled: !!legacyUser.isDisabled,
    telegramChatId: legacyUser.telegramChatId,
    createdAt: now,
    updatedAt: now,
  });

  if (legacyUser.hashedPassword) {
    await db.collection('account').insertOne({
      accountId: insertResult.insertedId,
      providerId: 'credential',
      userId: insertResult.insertedId,
      password: legacyUser.hashedPassword,
      createdAt: now,
      updatedAt: now,
    });
  }

  return db.collection('user').findOne({ _id: insertResult.insertedId });
}

export async function syncLegacyCredentialsOnSignup({
  username,
  email,
  passwordPlain,
  role,
  permissions,
  isDisabled,
  telegramChatId,
}: {
  username: string;
  email?: string;
  passwordPlain: string;
  role: string;
  permissions?: string[];
  isDisabled?: boolean;
  telegramChatId?: string;
}) {
  const { db } = await connectToDatabase();
  const now = new Date();
  const normalizedRole = normalizeUserRole(role) || 'staf';
  const normalizedUsername = username.toLowerCase();
  const normalizedEmail = (email || fallbackEmailForUsername(normalizedUsername)).toLowerCase();
  const existingUser = await db.collection('user').findOne({ username: normalizedUsername });

  if (existingUser) {
    return existingUser;
  }

  const hashedPassword = await bcrypt.hash(passwordPlain, 10);
  const inserted = await db.collection('user').insertOne({
    name: username,
    email: normalizedEmail,
    emailVerified: !!email,
    image: null,
    username: normalizedUsername,
    displayUsername: username,
    role: normalizedRole,
    permissions: permissions || [],
    isDisabled: !!isDisabled,
    telegramChatId,
    createdAt: now,
    updatedAt: now,
  });

  await db.collection('account').insertOne({
    accountId: inserted.insertedId,
    providerId: 'credential',
    userId: inserted.insertedId,
    password: hashedPassword,
    createdAt: now,
    updatedAt: now,
  });

  return db.collection('user').findOne({ _id: inserted.insertedId });
}

export async function getBetterAuthUserByLegacyUserId(legacyUserId: string) {
  const { db } = await connectToDatabase();
  if (ObjectId.isValid(legacyUserId)) {
    const byId = await db.collection('user').findOne({ _id: new ObjectId(legacyUserId) });
    if (byId) return byId;
  }
  return null;
}

export async function syncLegacyUserByIdToBetterAuth(legacyUserId: string) {
  const { db } = await connectToDatabase();
  const legacyUser = await db.collection('users').findOne({ _id: new ObjectId(legacyUserId) });
  if (!legacyUser) return null;
  return syncLegacyUserToBetterAuth({
    _id: legacyUser._id.toString(),
    username: legacyUser.username,
    email: legacyUser.email,
    hashedPassword: legacyUser.hashedPassword,
    hashedPin: legacyUser.hashedPin,
    role: legacyUser.role,
    permissions: legacyUser.permissions || [],
    createdBy: legacyUser.createdBy,
    telegramChatId: legacyUser.telegramChatId,
    isDisabled: legacyUser.isDisabled,
    failedPinAttempts: legacyUser.failedPinAttempts,
  });
}
