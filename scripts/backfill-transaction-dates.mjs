import "dotenv/config";
import { MongoClient } from "mongodb";

const MONGODB_URI = process.env.MONGODB_URI;
const MONGODB_DB_NAME = process.env.MONGODB_DB_NAME;
const TRANSACTIONS_COLLECTION = "transactions_log";
const BATCH_SIZE = 500;

function parseTimestamp(value) {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : new Date(value.getTime());
  }

  if (typeof value === "string" || typeof value === "number") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  return null;
}

function buildDateFields(timestampValue) {
  const parsedDate = parseTimestamp(timestampValue);
  if (!parsedDate) return null;

  return {
    timestampDate: parsedDate,
    transactionYear: parsedDate.getFullYear(),
    transactionMonth: parsedDate.getMonth() + 1,
    transactionDayOfMonth: parsedDate.getDate(),
    transactionDayOfWeek: parsedDate.getDay(),
    transactionHour: parsedDate.getHours(),
  };
}

async function flushBatch(collection, operations, dryRun) {
  if (operations.length === 0) return 0;

  if (dryRun) {
    return operations.length;
  }

  const result = await collection.bulkWrite(operations, { ordered: false });
  return result.modifiedCount + result.upsertedCount;
}

async function main() {
  if (!MONGODB_URI || !MONGODB_DB_NAME) {
    throw new Error("MONGODB_URI and MONGODB_DB_NAME must be defined.");
  }

  const dryRun = process.argv.includes("--dry-run");
  const client = new MongoClient(MONGODB_URI);

  let scanned = 0;
  let prepared = 0;
  let updated = 0;
  let skipped = 0;
  let batch = [];

  try {
    await client.connect();
    const collection = client.db(MONGODB_DB_NAME).collection(TRANSACTIONS_COLLECTION);

    const cursor = collection.find(
      {},
      {
        projection: {
          _id: 1,
          timestamp: 1,
          timestampDate: 1,
          transactionYear: 1,
          transactionMonth: 1,
          transactionDayOfMonth: 1,
          transactionDayOfWeek: 1,
          transactionHour: 1,
        },
        sort: { _id: 1 },
      }
    );

    for await (const document of cursor) {
      scanned += 1;

      const dateFields = buildDateFields(document.timestampDate ?? document.timestamp);
      if (!dateFields) {
        skipped += 1;
        continue;
      }

      const needsUpdate =
        !(document.timestampDate instanceof Date) ||
        document.transactionYear !== dateFields.transactionYear ||
        document.transactionMonth !== dateFields.transactionMonth ||
        document.transactionDayOfMonth !== dateFields.transactionDayOfMonth ||
        document.transactionDayOfWeek !== dateFields.transactionDayOfWeek ||
        document.transactionHour !== dateFields.transactionHour;

      if (!needsUpdate) {
        continue;
      }

      prepared += 1;
      batch.push({
        updateOne: {
          filter: { _id: document._id },
          update: {
            $set: dateFields,
          },
        },
      });

      if (batch.length >= BATCH_SIZE) {
        updated += await flushBatch(collection, batch, dryRun);
        batch = [];
      }
    }

    updated += await flushBatch(collection, batch, dryRun);

    if (!dryRun) {
      await collection.createIndex(
        { timestampDate: -1 },
        { name: "timestampDate_desc" }
      );
    }

    console.log(JSON.stringify({
      collection: TRANSACTIONS_COLLECTION,
      dryRun,
      scanned,
      prepared,
      updated,
      skipped,
    }, null, 2));
  } finally {
    await client.close();
  }
}

main().catch((error) => {
  console.error("[backfill:transaction-dates] failed");
  console.error(error);
  process.exitCode = 1;
});
