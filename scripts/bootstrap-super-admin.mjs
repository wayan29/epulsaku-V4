import "dotenv/config";
import { MongoClient } from "mongodb";
import bcrypt from "bcryptjs";

const MONGODB_URI = process.env.MONGODB_URI;
const MONGODB_DB_NAME = process.env.MONGODB_DB_NAME;
const USERS_COLLECTION = "users";
const SALT_ROUNDS = 10;

async function main() {
  if (!MONGODB_URI || !MONGODB_DB_NAME) {
    throw new Error("MONGODB_URI and MONGODB_DB_NAME must be defined.");
  }

  const username = process.argv[2]?.trim().toLowerCase();
  const email = process.argv[3]?.trim().toLowerCase();
  const password = process.argv[4];
  const pin = process.argv[5];

  if (!username || !password) {
    throw new Error(
      "Usage: node scripts/bootstrap-super-admin.mjs <username> <email> <password> [pin]"
    );
  }

  const client = new MongoClient(MONGODB_URI);

  try {
    await client.connect();
    const users = client.db(MONGODB_DB_NAME).collection(USERS_COLLECTION);

    const existingUser = await users.findOne({ username });
    if (existingUser) {
      throw new Error(`User '${username}' already exists.`);
    }

    const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);
    const hashedPin = pin ? await bcrypt.hash(pin, SALT_ROUNDS) : undefined;

    const result = await users.insertOne({
      username,
      email: email || undefined,
      hashedPassword,
      hashedPin,
      role: "super_admin",
      permissions: ["all_access"],
      createdBy: "bootstrap_script",
      telegramChatId: undefined,
      isDisabled: false,
      failedPinAttempts: 0,
    });

    const createdUser = await users.findOne(
      { _id: result.insertedId },
      {
        projection: {
          _id: 0,
          username: 1,
          email: 1,
          role: 1,
          permissions: 1,
          isDisabled: 1,
        },
      }
    );

    console.log(
      JSON.stringify(
        {
          insertedId: result.insertedId.toString(),
          user: createdUser,
        },
        null,
        2
      )
    );
  } finally {
    await client.close();
  }
}

main().catch((error) => {
  console.error("[bootstrap-super-admin] failed");
  console.error(error);
  process.exitCode = 1;
});
