import "dotenv/config";
import { MongoClient } from "mongodb";

const MONGODB_URI = process.env.MONGODB_URI;
const MONGODB_DB_NAME = process.env.MONGODB_DB_NAME;
const USERS_COLLECTION = "users";

function normalizeUserRole(role) {
  if (!role || typeof role !== "string") return null;

  const normalized = role.trim().toLowerCase().replace(/[\s-]+/g, "_");

  if (normalized === "super_admin" || normalized === "superadmin") return "super_admin";
  if (normalized === "admin") return "admin";
  if (normalized === "staf" || normalized === "staff") return "staf";

  return null;
}

async function main() {
  if (!MONGODB_URI || !MONGODB_DB_NAME) {
    throw new Error("MONGODB_URI and MONGODB_DB_NAME must be defined.");
  }

  const dryRun = process.argv.includes("--dry-run");
  const listOnly = process.argv.includes("--list");
  const client = new MongoClient(MONGODB_URI);

  let scanned = 0;
  let prepared = 0;
  let updated = 0;
  let skipped = 0;
  let invalidRoles = 0;
  const operations = [];

  try {
    await client.connect();
    const collection = client.db(MONGODB_DB_NAME).collection(USERS_COLLECTION);

    const cursor = collection.find(
      {},
      {
        projection: {
          _id: 1,
          username: 1,
          role: 1,
          permissions: 1,
          email: 1,
          isDisabled: 1,
        },
        sort: { _id: 1 },
      }
    );

    const listedUsers = [];

    for await (const user of cursor) {
      scanned += 1;
      listedUsers.push({
        id: user._id?.toString?.() || String(user._id),
        username: user.username,
        email: user.email || null,
        role: user.role,
        normalizedRole: normalizeUserRole(user.role),
        permissions: Array.isArray(user.permissions) ? user.permissions : [],
        isDisabled: !!user.isDisabled,
      });

      const normalizedRole = normalizeUserRole(user.role);
      if (!normalizedRole) {
        invalidRoles += 1;
        skipped += 1;
        continue;
      }

      const currentPermissions = Array.isArray(user.permissions) ? user.permissions : [];
      const nextPermissions =
        normalizedRole === "super_admin" && !currentPermissions.includes("all_access")
          ? [...currentPermissions, "all_access"]
          : currentPermissions;

      const needsRoleUpdate = user.role !== normalizedRole;
      const needsPermissionUpdate =
        nextPermissions.length !== currentPermissions.length ||
        nextPermissions.some((permission, index) => permission !== currentPermissions[index]);

      if (!needsRoleUpdate && !needsPermissionUpdate) {
        skipped += 1;
        continue;
      }

      prepared += 1;
      operations.push({
        updateOne: {
          filter: { _id: user._id },
          update: {
            $set: {
              role: normalizedRole,
              permissions: nextPermissions,
            },
          },
        },
      });
    }

    if (!dryRun && operations.length > 0) {
      const result = await collection.bulkWrite(operations, { ordered: false });
      updated = result.modifiedCount + result.upsertedCount;
    } else {
      updated = operations.length;
    }

    const output = {
      collection: USERS_COLLECTION,
      dryRun,
      listOnly,
      scanned,
      prepared,
      updated,
      skipped,
      invalidRoles,
      users: listOnly ? listedUsers : undefined,
    };

    console.log(JSON.stringify(output, null, 2));
  } finally {
    await client.close();
  }
}

main().catch((error) => {
  console.error("[backfill:user-roles] failed");
  console.error(error);
  process.exitCode = 1;
});
