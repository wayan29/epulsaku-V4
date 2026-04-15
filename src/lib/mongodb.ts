// src/lib/mongodb.ts
import { MongoClient, Db, ObjectId, FindOptions, AggregateOptions, Document } from 'mongodb';

const MONGODB_URI = process.env.MONGODB_URI;
const MONGODB_DB_NAME = process.env.MONGODB_DB_NAME;

// Increase the listener limit to prevent MaxListenersExceededWarning in development
// This is often needed when multiple libraries (like Genkit, Next.js dev server)
// add listeners for graceful shutdowns during hot-reloading.
process.setMaxListeners(20);

if (!MONGODB_URI) {
  throw new Error('Please define the MONGODB_URI environment variable inside .env');
}
if (!MONGODB_DB_NAME) {
  throw new Error('Please define the MONGODB_DB_NAME environment variable inside .env');
}

let cachedClient: MongoClient | null = null;
let cachedDb: Db | null = null;

interface QueryOptions {
    query?: object;
    options?: FindOptions;
    count?: boolean;
}

export async function connectToDatabase() {
  if (cachedClient && cachedDb) {
    return { client: cachedClient, db: cachedDb };
  }

  const client = new MongoClient(MONGODB_URI!);
  await client.connect();
  const db = client.db(MONGODB_DB_NAME);

  cachedClient = client;
  cachedDb = db;

  return { client, db };
}

function convertQueryIds(query: any): any {
    if (!query) return query;
    const newQuery = { ...query };
    for (const key in newQuery) {
        if (key === '_id' && typeof newQuery[key] === 'string' && ObjectId.isValid(newQuery[key])) {
            newQuery[key] = new ObjectId(newQuery[key]);
        } else if (key === '_id' && newQuery[key]?.$in && Array.isArray(newQuery[key].$in)) {
            newQuery[key].$in = newQuery[key].$in.map((id: any) => typeof id === 'string' && ObjectId.isValid(id) ? new ObjectId(id) : id);
        }
    }
    return newQuery;
}

/**
 * Determines if a query is likely to return a single document.
 * This is a heuristic based on common unique identifiers.
 * @param query The MongoDB query object.
 * @returns True if the query is likely for a single document.
 */
function isSingleDocQuery(collectionName: string, query: object): boolean {
    const collectionUniqueKeys: Record<string, string[]> = {
        users: ['username'],
    };
    const uniqueKeys = new Set(['_id', 'id', ...(collectionUniqueKeys[collectionName] || [])]);
    return Object.keys(query).some((key) => {
        if (!uniqueKeys.has(key)) return false;
        const value = (query as any)[key];
        if (value === null || typeof value === 'undefined') return false;
        if (key === '_id' || key === 'id') return !Array.isArray(value) && !value?.$in;
        return typeof value !== 'object';
    });
}


export async function readDb<T>(collectionName: string, queryOptions?: QueryOptions): Promise<T> {
  const { db } = await connectToDatabase();
  const collection = db.collection(collectionName);
  
  const query = convertQueryIds(queryOptions?.query) || {};
  const options = queryOptions?.options || {};

  if(queryOptions?.count) {
    return await collection.countDocuments(query, options) as T;
  }

  // Collections that are *always* a single document representing a config object.
  const singleDocConfigCollections = ['admin_settings', 'price_settings'];

  // If the query is for a unique field OR it's a known single-doc config collection
  // without a query, fetch one document.
  if (isSingleDocQuery(collectionName, query) || (singleDocConfigCollections.includes(collectionName) && Object.keys(query).length === 0)) {
    const document = await collection.findOne(query, options);
    return document as T;
  }

  // Otherwise, assume it's a query for multiple documents.
  const documents = await collection.find(query, options).toArray();
  return documents as unknown as T;
}

export async function aggregateDb<T extends Document = Document>(
  collectionName: string,
  pipeline: Document[],
  options?: AggregateOptions
): Promise<T[]> {
  const { db } = await connectToDatabase();
  const collection = db.collection(collectionName);

  const documents = await collection.aggregate<T>(pipeline, options).toArray();
  return documents;
}

interface WriteOptions {
    mode?: 'updateOne' | 'insertOne' | 'replaceCollection' | 'deleteOne' | 'deleteMany';
    query?: object;
    upsert?: boolean;
}

export async function writeDb<T>(collectionName: string, data: T | Partial<T> | null, options?: WriteOptions): Promise<any> {
    const { db } = await connectToDatabase();
    const collection = db.collection(collectionName);
    const mode = options?.mode || 'replaceCollection';
    const query = convertQueryIds(options?.query);
    const upsert = options?.upsert ?? false;

    switch (mode) {
        case 'insertOne':
            if (data === null) throw new Error("Data cannot be null for insertOne operation");
            return await collection.insertOne(data as any);
        case 'updateOne':
            if (data === null) throw new Error("Data cannot be null for updateOne operation");
            if (!query) throw new Error("Query is required for updateOne operation");
            const updateData: any = {};
            // Separate $set and $inc operators
            const setOps: any = {};
            const incOps: any = {};

            for (const key in data) {
                if(key === '$inc') {
                    Object.assign(incOps, (data as any)[key]);
                } else {
                    setOps[key] = (data as any)[key];
                }
            }
            if (Object.keys(setOps).length > 0) updateData.$set = setOps;
            if (Object.keys(incOps).length > 0) updateData.$inc = incOps;
            
            return await collection.updateOne(query, updateData, { upsert });
        case 'deleteOne':
             if (!query) throw new Error("Query is required for deleteOne operation");
             return await collection.deleteOne(query);
        case 'deleteMany':
            if (!query) throw new Error("Query is required for deleteMany operation");
            return await collection.deleteMany(query);
        case 'replaceCollection':
            await collection.deleteMany({});
            if (Array.isArray(data) && data.length > 0) {
                return await collection.insertMany(data as any[]);
            } else if (!Array.isArray(data) && data !== null) {
                return await collection.insertOne(data as any);
            }
            return;
        default: // For single-doc collections or when no mode is specified
            if (!Array.isArray(data) && data !== null) {
                return await collection.updateOne({}, { $set: data as object }, { upsert: true });
            }
            throw new Error(`Unsupported data type for default write operation: ${typeof data}`);
    }
}
