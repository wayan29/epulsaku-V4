import "dotenv/config";
import { MongoClient } from "mongodb";

const MONGODB_URI = process.env.MONGODB_URI;
const MONGODB_DB_NAME = process.env.MONGODB_DB_NAME;
const USERS_COLLECTION = "users";

async function main() {
  if (!MONGODB_URI || !MONGODB_DB_NAME) {
    throw new Error("MONGODB_URI and MONGODB_DB_NAME must be defined.");
  }

  const username = process.argv[2]?.trim().toLowerCase();
  if (!username) {
    throw new Error("Username is required. Example: node scripts/promote-user-super-admin.mjs admin");
  }

  const client = new MongoClient(MONGODB_URI);

  try {
    await client.connect();
    const users = client.db(MONGODB_DB_NAME).collection(USERS_COLLECTION);

    const result = await users.updateOne(
      { username },
      {
        $set: {
          role: "super_admin",
        },
        $addToSet: {
          permissions: "all_access",
        },
      }
    );

    const user = await users.findOne(
      { username },
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
          username,
          matched: result.matchedCount,
          modified: result.modifiedCount,
          user,
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
  console.error("[promote-user-super-admin] failed");
  console.error(error);
  process.exitCode = 1;
});
