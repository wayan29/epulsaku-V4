// src/lib/transaction-utils.ts
'use server';

import type {
  TransactionStatus,
  NewTransactionInput,
  TransactionCore,
  TransactionInternalPriority,
} from "@/components/transactions/TransactionItem";
import { productIconsMapping } from "@/components/transactions/TransactionItem";
import { aggregateDb, readDb, writeDb } from './mongodb';
import { revalidatePath } from 'next/cache';
import { fetchSingleCustomPriceFromDB } from '@/lib/db-price-settings-utils'; 
import { endOfDay, startOfDay } from 'date-fns';
import type { ObjectId } from 'mongodb';
import { coerceToDate, normalizeDateInput } from '@/lib/date-utils';
import { verifyAuth } from '@/app/api/auth/actions';
import { getActingUserFromSession } from '@/lib/user-utils';
import { checkTokoVoucherTransactionStatus } from '@/ai/flows/tokovoucher/checkTokoVoucherTransactionStatus-flow';
import {
  trySendTelegramNotification,
  type TelegramNotificationDetails,
} from '@/lib/notification-utils';

const TRANSACTIONS_DB = "transactions_log";
const TRANSACTION_INTERNAL_NOTES_DB = "transaction_internal_notes";
const SHIFT_HANDOVERS_DB = "shift_handovers";

const RELEVANT_PULSA_CATEGORIES_UPPER = ["PULSA", "PAKET DATA"];
const RELEVANT_PLN_CATEGORIES_UPPER = ["PLN", "TOKEN LISTRIK", "TOKEN"];
const RELEVANT_GAME_CATEGORIES_UPPER = ["GAME", "TOPUP", "VOUCHER GAME", "DIAMOND", "UC"];
const RELEVANT_EMONEY_CATEGORIES_UPPER = ["E-MONEY", "E-WALLET", "SALDO DIGITAL", "DANA", "OVO", "GOPAY", "SHOPEEPAY", "MAXIM"];


export interface Transaction extends TransactionCore {
  iconName: string;
  categoryKey: string;
  _id: string;
  claimedByUserId?: string;
  claimedByUsername?: string;
  claimedAt?: string;
  internalPriority?: TransactionInternalPriority;
  lastInternalNoteAt?: string;
  lastInternalNotePreview?: string;
}

export type TransactionOperationalFilter = 'all' | 'unclaimed' | 'mine' | 'others' | 'handover';

export interface TransactionListInput {
  page?: number;
  limit?: number;
  search?: string;
  category?: string;
  status?: TransactionStatus;
  provider?: 'digiflazz' | 'tokovoucher';
  from?: string;
  to?: string;
  operationalFilter?: TransactionOperationalFilter;
}

export interface TransactionInternalNote {
  _id?: string;
  transactionId: string;
  note: string;
  createdAt: string;
  createdByUserId: string;
  createdByUsername: string;
}

export interface ShiftHandoverRecord {
  _id?: string;
  createdAt: string;
  createdByUserId: string;
  createdByUsername: string;
  summary: string;
  pendingTransactionIds: string[];
  status: 'open' | 'acknowledged';
  acknowledgedAt?: string;
  acknowledgedByUserId?: string;
  acknowledgedByUsername?: string;
}

export interface TransactionListResponse {
  transactions: Transaction[];
  total: number;
  totalPages: number;
  page: number;
  limit: number;
  availableCategories: string[];
}

export interface PendingTransactionRefreshItem {
  id: string;
  provider: 'digiflazz' | 'tokovoucher';
  previousStatus: TransactionStatus;
  currentStatus: TransactionStatus;
  changed: boolean;
  skipped: boolean;
  message?: string;
}

export interface PendingTransactionRefreshResponse {
  success: boolean;
  checkedCount: number;
  changedCount: number;
  skippedCount: number;
  items: PendingTransactionRefreshItem[];
  message?: string;
}

interface TransactionCategoryRow {
  value: string;
}

const transactionListProjection = {
  id: 1,
  productName: 1,
  details: 1,
  costPrice: 1,
  sellingPrice: 1,
  status: 1,
  timestamp: 1,
  serialNumber: 1,
  failureReason: 1,
  buyerSkuCode: 1,
  originalCustomerNo: 1,
  productCategoryFromProvider: 1,
  productBrandFromProvider: 1,
  provider: 1,
  source: 1,
  providerTransactionId: 1,
  transactionYear: 1,
  transactionMonth: 1,
  transactionDayOfMonth: 1,
  transactionDayOfWeek: 1,
  transactionHour: 1,
  transactedBy: 1,
  iconName: 1,
  categoryKey: 1,
  claimedByUserId: 1,
  claimedByUsername: 1,
  claimedAt: 1,
  internalPriority: 1,
  lastInternalNoteAt: 1,
  lastInternalNotePreview: 1,
} as const;

function determineTransactionCategoryDetails(
  productCategory: string,
  productBrand: string,
  provider?: 'digiflazz' | 'tokovoucher' 
): { categoryKey: string; iconName: string } {
  const categoryUpper = productCategory.toUpperCase();
  const brandUpper = productBrand.toUpperCase();

  if (RELEVANT_PULSA_CATEGORIES_UPPER.some(cat => categoryUpper.includes(cat) || brandUpper.includes(cat))) {
    return { categoryKey: "Pulsa", iconName: "Pulsa" };
  }
  if (brandUpper.includes("PLN") || RELEVANT_PLN_CATEGORIES_UPPER.some(cat => categoryUpper.includes(cat))) {
    return { categoryKey: "Token Listrik", iconName: "Token Listrik" };
  }
  if (brandUpper.includes("FREE FIRE")) return { categoryKey: "FREE FIRE", iconName: "FREE FIRE" };
  if (brandUpper.includes("MOBILE LEGENDS")) return { categoryKey: "MOBILE LEGENDS", iconName: "MOBILE LEGENDS" };
  if (brandUpper.includes("GENSHIN IMPACT")) return { categoryKey: "GENSHIN IMPACT", iconName: "GENSHIN IMPACT" };
  if (brandUpper.includes("HONKAI STAR RAIL")) return { categoryKey: "HONKAI STAR RAIL", iconName: "HONKAI STAR RAIL" };
  
  if (RELEVANT_GAME_CATEGORIES_UPPER.some(cat => categoryUpper.includes(cat) || brandUpper.includes(cat))) {
    return { categoryKey: "Game Topup", iconName: "Game Topup" };
  }
  if (RELEVANT_EMONEY_CATEGORIES_UPPER.some(cat => categoryUpper.includes(cat) || brandUpper.includes(cat))) {
    return { categoryKey: "E-Money", iconName: "E-Money" };
  }
  
  const fallbackKey = productCategory || "Digital Service";
  const iconMatch = Object.keys(productIconsMapping).find(k => fallbackKey.toUpperCase().includes(k.toUpperCase()));
  
  if (iconMatch) {
    return { categoryKey: iconMatch, iconName: iconMatch };
  }

  return { 
    categoryKey: "Default", 
    iconName: "Default"
  };
}

async function calculateSellingPrice (costPrice: number, productCode: string, provider: 'digiflazz' | 'tokovoucher'): Promise<number> {
  const customPrice = await fetchSingleCustomPriceFromDB(productCode, provider); 
  if (customPrice && customPrice > 0) {
    return customPrice;
  }
  if (costPrice < 20000) {
    return costPrice + 1000;
  } else if (costPrice >= 20000 && costPrice <= 50000) {
    return costPrice + 1500;
  } else {
    return costPrice + 2000;
  }
};

const normalizeStoredTimestamp = (timestamp: unknown): string => {
  const normalizedTimestamp = normalizeDateInput(timestamp as string | Date | number | null | undefined);
  if (normalizedTimestamp) {
    return normalizedTimestamp;
  }

  return typeof timestamp === 'string' ? timestamp : '';
};

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function assertTransactionHistoryAccess() {
  const { isAuthenticated, user } = await verifyAuth();

  if (!isAuthenticated || !user) {
    throw new Error("Unauthorized");
  }

  const hasAccess =
    user.role === "super_admin" ||
    user.permissions?.includes("all_access") ||
    user.permissions?.includes("riwayat_transaksi");

  if (!hasAccess) {
    throw new Error("Forbidden");
  }

  return { user };
}

function buildTransactionListQuery(
  input?: TransactionListInput,
  userContext?: { userId?: string }
): Record<string, unknown> {
  const query: Record<string, unknown> = {};

  if (input?.category) {
    query.categoryKey = input.category;
  }

  if (input?.status) {
    query.status = input.status;
  }

  if (input?.provider) {
    query.provider = input.provider;
  }

  if (input?.operationalFilter === 'unclaimed') {
    query.status = 'Pending';
    query.claimedByUserId = { $in: [null, ''] };
  }

  if (input?.operationalFilter === 'mine' && userContext?.userId) {
    query.status = 'Pending';
    query.claimedByUserId = userContext.userId;
  }

  if (input?.operationalFilter === 'others' && userContext?.userId) {
    query.status = 'Pending';
    query.claimedByUserId = { $nin: [null, '', userContext.userId] };
  }

  if (input?.operationalFilter === 'handover') {
    query.status = 'Pending';
    query.internalPriority = 'handover';
  }

  if (input?.from) {
    const fromDate = coerceToDate(input.from);
    const toCandidate = input.to ? coerceToDate(input.to) : new Date();

    if (!Number.isNaN(fromDate.getTime()) && !Number.isNaN(toCandidate.getTime())) {
      query.timestampDate = {
        $gte: startOfDay(fromDate),
        $lte: endOfDay(toCandidate),
      };
    }
  }

  const trimmedSearch = input?.search?.trim();
  if (trimmedSearch) {
    const safeSearch = escapeRegex(trimmedSearch.slice(0, 100));
    query.$or = [
      { id: { $regex: safeSearch, $options: 'i' } },
      { productName: { $regex: safeSearch, $options: 'i' } },
      { details: { $regex: safeSearch, $options: 'i' } },
      { originalCustomerNo: { $regex: safeSearch, $options: 'i' } },
      { serialNumber: { $regex: safeSearch, $options: 'i' } },
      { providerTransactionId: { $regex: safeSearch, $options: 'i' } },
      { buyerSkuCode: { $regex: safeSearch, $options: 'i' } },
      { productBrandFromProvider: { $regex: safeSearch, $options: 'i' } },
    ];
  }

  return query;
}

function buildTransactionDateFields(timestamp: unknown) {
  const normalizedTimestamp = normalizeStoredTimestamp(timestamp);
  const transactionDate = coerceToDate(normalizedTimestamp);
  const hasValidTransactionDate = !Number.isNaN(transactionDate.getTime());

  return {
    timestamp: normalizedTimestamp,
    timestampDate: hasValidTransactionDate ? transactionDate : undefined,
    transactionYear: hasValidTransactionDate ? transactionDate.getFullYear() : undefined,
    transactionMonth: hasValidTransactionDate ? transactionDate.getMonth() + 1 : undefined,
    transactionDayOfMonth: hasValidTransactionDate ? transactionDate.getDate() : undefined,
    transactionDayOfWeek: hasValidTransactionDate ? transactionDate.getDay() : undefined,
    transactionHour: hasValidTransactionDate ? transactionDate.getHours() : undefined,
  };
}

const makeTransactionSerializable = (tx: any): Transaction => {
  const serializableTx = { ...tx };

  if (serializableTx._id && typeof serializableTx._id !== 'string') {
    serializableTx._id = serializableTx._id.toHexString();
  }

  serializableTx.timestamp = normalizeStoredTimestamp(serializableTx.timestamp);
  return serializableTx as Transaction;
};

async function buildTransactionUpdatePayload(
  existingTransaction: Transaction,
  updatedTxData: Partial<TransactionCore> & { id: string }
): Promise<Record<string, unknown>> {
  const updatePayload: Record<string, unknown> = { ...updatedTxData };
  delete updatePayload.id;

  if ('timestamp' in updatePayload) {
    Object.assign(updatePayload, buildTransactionDateFields(updatePayload.timestamp));
  }

  if (
    existingTransaction.status === "Pending" &&
    updatedTxData.status &&
    (updatedTxData.status === "Sukses" || updatedTxData.status === "Gagal")
  ) {
    Object.assign(updatePayload, buildTransactionDateFields(new Date()));
  }

  if (
    updatedTxData.costPrice !== undefined &&
    updatedTxData.costPrice > 0 &&
    updatedTxData.costPrice !== existingTransaction.costPrice &&
    (!existingTransaction.sellingPrice || existingTransaction.sellingPrice <= 0)
  ) {
    updatePayload.sellingPrice = await calculateSellingPrice(
      updatedTxData.costPrice,
      existingTransaction.buyerSkuCode,
      existingTransaction.provider
    );
  }

  if (
    updatedTxData.productCategoryFromProvider !== undefined ||
    updatedTxData.productBrandFromProvider !== undefined
  ) {
    const { categoryKey, iconName } = determineTransactionCategoryDetails(
      updatedTxData.productCategoryFromProvider ||
        existingTransaction.productCategoryFromProvider,
      updatedTxData.productBrandFromProvider ||
        existingTransaction.productBrandFromProvider,
      existingTransaction.provider
    );
    updatePayload.categoryKey = categoryKey;
    updatePayload.iconName = iconName;
  }

  return updatePayload;
}

async function persistTransactionUpdate(
  query: Record<string, unknown>,
  updatePayload: Record<string, unknown>
) {
  const result = await writeDb(TRANSACTIONS_DB, updatePayload, {
    mode: 'updateOne',
    query,
  });

  if ((result?.matchedCount ?? 0) > 0) {
    revalidatePath('/transactions');
    revalidatePath('/profit-report');
  }

  return result;
}

async function updatePendingTransactionFromProviderResult(
  existingTransaction: Transaction,
  updatedTxData: Partial<TransactionCore> & { id: string }
): Promise<{ success: boolean; changed: boolean; message?: string }> {
  const updatePayload = await buildTransactionUpdatePayload(
    existingTransaction,
    updatedTxData
  );
  const result = await persistTransactionUpdate(
    { id: updatedTxData.id, status: "Pending" },
    updatePayload
  );

  if ((result?.matchedCount ?? 0) === 0) {
    return {
      success: false,
      changed: false,
      message: `Transaction ${updatedTxData.id} is no longer pending.`,
    };
  }

  return {
    success: true,
    changed: (result?.modifiedCount ?? 0) > 0,
  };
}

function getSanitizedNotePreview(note: string): string {
  return note.trim().replace(/\s+/g, ' ').slice(0, 160);
}

function normalizeInternalPriority(
  value: string | null | undefined
): TransactionInternalPriority {
  return value === 'handover' ? 'handover' : 'normal';
}

async function getTransactionAccessContext() {
  await assertTransactionHistoryAccess();
  const sessionUser = await getActingUserFromSession();

  if (!sessionUser) {
    throw new Error('Unauthorized');
  }

  return sessionUser;
}

export async function claimTransactionInDB(
  transactionId: string
): Promise<{ success: boolean; message: string }> {
  try {
    const sessionUser = await getTransactionAccessContext();
    const existingTransaction = await getTransactionByIdFromDB(transactionId);

    if (!existingTransaction) {
      return { success: false, message: 'Transaction not found.' };
    }

    if (existingTransaction.status !== 'Pending') {
      return { success: false, message: 'Only pending transactions can be claimed.' };
    }

    if (
      existingTransaction.claimedByUserId &&
      existingTransaction.claimedByUserId !== sessionUser._id
    ) {
      return {
        success: false,
        message: `Transaction is already claimed by ${existingTransaction.claimedByUsername || 'another staff member'}.`,
      };
    }

    await persistTransactionUpdate(
      { id: transactionId, status: 'Pending' },
      {
        claimedByUserId: sessionUser._id,
        claimedByUsername: sessionUser.username,
        claimedAt: new Date().toISOString(),
      }
    );

    return { success: true, message: 'Transaction claimed successfully.' };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Failed to claim transaction.',
    };
  }
}

export async function unclaimTransactionInDB(
  transactionId: string
): Promise<{ success: boolean; message: string }> {
  try {
    const sessionUser = await getTransactionAccessContext();
    const existingTransaction = await getTransactionByIdFromDB(transactionId);

    if (!existingTransaction) {
      return { success: false, message: 'Transaction not found.' };
    }

    if (!existingTransaction.claimedByUserId) {
      return { success: false, message: 'Transaction is not currently claimed.' };
    }

    const canRelease =
      existingTransaction.claimedByUserId === sessionUser._id ||
      sessionUser.role === 'super_admin' ||
      sessionUser.permissions?.includes('all_access');

    if (!canRelease) {
      return {
        success: false,
        message: 'Only the assigned staff or super admin can release this claim.',
      };
    }

    await persistTransactionUpdate(
      { id: transactionId },
      {
        claimedByUserId: '',
        claimedByUsername: '',
        claimedAt: '',
      }
    );

    return { success: true, message: 'Transaction claim released.' };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Failed to release claim.',
    };
  }
}

export async function addTransactionInternalNoteInDB(
  transactionId: string,
  note: string,
  priority: TransactionInternalPriority = 'normal'
): Promise<{ success: boolean; message: string }> {
  try {
    const sessionUser = await getTransactionAccessContext();
    const existingTransaction = await getTransactionByIdFromDB(transactionId);
    const sanitizedNote = getSanitizedNotePreview(note);

    if (!existingTransaction) {
      return { success: false, message: 'Transaction not found.' };
    }

    if (!sanitizedNote) {
      return { success: false, message: 'Internal note cannot be empty.' };
    }

    const createdAt = new Date().toISOString();
    const normalizedPriority = normalizeInternalPriority(priority);

    const newNote: TransactionInternalNote = {
      transactionId,
      note: sanitizedNote,
      createdAt,
      createdByUserId: sessionUser._id,
      createdByUsername: sessionUser.username,
    };

    await writeDb(TRANSACTION_INTERNAL_NOTES_DB, newNote, { mode: 'insertOne' });
    await persistTransactionUpdate(
      { id: transactionId },
      {
        lastInternalNoteAt: createdAt,
        lastInternalNotePreview: sanitizedNote,
        internalPriority: normalizedPriority,
      }
    );

    return { success: true, message: 'Internal note saved.' };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Failed to save internal note.',
    };
  }
}

export async function listTransactionInternalNotesFromDB(
  transactionId: string
): Promise<TransactionInternalNote[]> {
  await getTransactionAccessContext();

  const notes = await readDb<any[]>(TRANSACTION_INTERNAL_NOTES_DB, {
    query: { transactionId },
    options: { sort: { createdAt: -1, _id: -1 } },
  });

  return notes.map((note) => ({
    ...note,
    _id: note._id && typeof note._id !== 'string' ? note._id.toHexString() : note._id,
    createdAt: normalizeStoredTimestamp(note.createdAt),
  }));
}

export async function createShiftHandoverInDB(input: {
  summary: string;
  pendingTransactionIds: string[];
}): Promise<{ success: boolean; message: string }> {
  try {
    const sessionUser = await getTransactionAccessContext();
    const summary = input.summary.trim();
    const pendingTransactionIds = Array.from(
      new Set(input.pendingTransactionIds.map((id) => id.trim()).filter(Boolean))
    );

    if (!summary) {
      return { success: false, message: 'Handover summary cannot be empty.' };
    }

    const createdAt = new Date().toISOString();
    const record: ShiftHandoverRecord = {
      createdAt,
      createdByUserId: sessionUser._id,
      createdByUsername: sessionUser.username,
      summary,
      pendingTransactionIds,
      status: 'open',
    };

    await writeDb(SHIFT_HANDOVERS_DB, record, { mode: 'insertOne' });

    if (pendingTransactionIds.length > 0) {
      for (const transactionId of pendingTransactionIds) {
        await persistTransactionUpdate(
          { id: transactionId },
          {
            internalPriority: 'handover',
          }
        );
      }
    }

    revalidatePath('/shift-handover');
    return { success: true, message: 'Shift handover saved.' };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Failed to save shift handover.',
    };
  }
}

export async function listShiftHandoversFromDB(): Promise<ShiftHandoverRecord[]> {
  await getTransactionAccessContext();

  const handovers = await readDb<any[]>(SHIFT_HANDOVERS_DB, {
    options: { sort: { createdAt: -1, _id: -1 }, limit: 20 },
  });

  return handovers.map((item) => ({
    ...item,
    _id: item._id && typeof item._id !== 'string' ? item._id.toHexString() : item._id,
    createdAt: normalizeStoredTimestamp(item.createdAt),
    acknowledgedAt: normalizeStoredTimestamp(item.acknowledgedAt),
  }));
}

export async function acknowledgeShiftHandoverInDB(
  handoverId: string
): Promise<{ success: boolean; message: string }> {
  try {
    const sessionUser = await getTransactionAccessContext();
    const existingHandover = await readDb<any>(SHIFT_HANDOVERS_DB, { query: { _id: handoverId } });

    if (!existingHandover) {
      return { success: false, message: 'Shift handover not found.' };
    }

    if (existingHandover.status === 'acknowledged') {
      return { success: false, message: 'Shift handover is already acknowledged.' };
    }

    await writeDb(
      SHIFT_HANDOVERS_DB,
      {
        status: 'acknowledged',
        acknowledgedAt: new Date().toISOString(),
        acknowledgedByUserId: sessionUser._id,
        acknowledgedByUsername: sessionUser.username,
      },
      { mode: 'updateOne', query: { _id: handoverId } }
    );

    revalidatePath('/shift-handover');
    return { success: true, message: 'Shift handover acknowledged.' };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Failed to acknowledge shift handover.',
    };
  }
}

function buildTransactionNotificationDetails(
  freshTx: Transaction,
  nextStatus: TransactionStatus,
  providerCostPrice?: number | null,
  serialNumber?: string | null,
  failureReason?: string | null,
  providerTransactionId?: string | null,
  additionalInfo = "Server Refresh"
): TelegramNotificationDetails {
  const effectiveCostPrice = providerCostPrice ?? freshTx.costPrice;

  return {
    refId: freshTx.id,
    productName: freshTx.productName,
    customerNoDisplay: freshTx.details,
    status: nextStatus,
    provider: freshTx.provider === "tokovoucher" ? "TokoVoucher" : "Digiflazz",
    costPrice: effectiveCostPrice,
    sellingPrice: freshTx.sellingPrice,
    profit:
      nextStatus === "Sukses"
        ? freshTx.sellingPrice - effectiveCostPrice
        : undefined,
    sn: serialNumber || null,
    failureReason: nextStatus === "Gagal" ? failureReason || null : null,
    timestamp: new Date(),
    additionalInfo,
    trxId: providerTransactionId || freshTx.providerTransactionId,
    transactedBy: freshTx.transactedBy,
  };
}

export async function listTransactionsFromDB(
  input?: TransactionListInput
): Promise<TransactionListResponse> {
  const { user } = await assertTransactionHistoryAccess();

  const page = Math.max(1, input?.page || 1);
  const limit = Math.min(100, Math.max(1, input?.limit || 10));
  const query = buildTransactionListQuery(input, { userId: user.id });

  const [total, availableCategoryRows] = await Promise.all([
    readDb<number>(TRANSACTIONS_DB, { query, count: true }),
    aggregateDb<TransactionCategoryRow>(TRANSACTIONS_DB, [
      {
        $match: {
          categoryKey: { $type: 'string', $ne: '' },
        },
      },
      {
        $group: {
          _id: "$categoryKey",
        },
      },
      {
        $sort: { _id: 1 },
      },
      {
        $project: {
          _id: 0,
          value: "$_id",
        },
      },
    ]),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / limit));
  const safePage = Math.min(page, totalPages);
  const skip = (safePage - 1) * limit;

  const transactionsFromDb = await readDb<any[]>(TRANSACTIONS_DB, {
    query,
    options: {
      sort: { timestampDate: -1, _id: -1 },
      skip,
      limit,
      projection: transactionListProjection,
    },
  });

  return {
    transactions: transactionsFromDb.map(makeTransactionSerializable),
    total,
    totalPages,
    page: safePage,
    limit,
    availableCategories: availableCategoryRows.map((row) => row.value),
  };
}


export async function addTransactionToDB(newTransactionInput: NewTransactionInput, transactedByUsername: string): Promise<{ success: boolean, transactionId?: string, message?: string }> {
  try {
    const { categoryKey, iconName } = determineTransactionCategoryDetails(
      newTransactionInput.productCategoryFromProvider,
      newTransactionInput.productBrandFromProvider,
      newTransactionInput.provider
    );
    
    const sellingPrice = await calculateSellingPrice(
        newTransactionInput.costPrice, 
        newTransactionInput.buyerSkuCode,
        newTransactionInput.provider
    );
    
    const transactionDateFields = buildTransactionDateFields(newTransactionInput.timestamp);

    const docToInsert: Omit<Transaction, '_id'> & { _id?: ObjectId } = {
      ...newTransactionInput,
      ...transactionDateFields,
      sellingPrice: sellingPrice,
      source: newTransactionInput.source || 'web', 
      categoryKey: categoryKey,
      iconName: iconName,
      providerTransactionId: newTransactionInput.providerTransactionId,
      transactedBy: transactedByUsername,
    } as any;
    
    // Do not assign _id, let MongoDB handle it.
    await writeDb(TRANSACTIONS_DB, docToInsert, { mode: 'insertOne' });

    revalidatePath('/transactions'); 
    revalidatePath('/profit-report'); 
    return { success: true, transactionId: newTransactionInput.id };
  } catch (error) {
    console.error("Error adding transaction to DB:", error);
    return { success: false, message: error instanceof Error ? error.message : "Unknown DB error." };
  }
}

export async function getTransactionsFromDB(): Promise<Transaction[]> {
  try {
    const transactionsFromDb = await readDb<any[]>(TRANSACTIONS_DB);
    const transactions = transactionsFromDb.map(makeTransactionSerializable);
    return transactions.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  } catch (error) {
    console.error("Error fetching transactions from DB:", error);
    return [];
  }
}

export async function getTransactionByIdFromDB(transactionId: string): Promise<Transaction | null> {
  try {
    const transaction = await readDb<any>(TRANSACTIONS_DB, {
      query: { id: transactionId },
      options: { projection: transactionListProjection },
    });
    if (!transaction) return null;
    return makeTransactionSerializable(transaction);
  } catch (error) {
    console.error(`Error fetching transaction by ID ${transactionId} from DB:`, error);
    return null;
  }
}

export async function updateTransactionInDB(updatedTxData: Partial<TransactionCore> & { id: string }): Promise<{ success: boolean, message?: string }> {
  try {
    const existingTransaction = await getTransactionByIdFromDB(updatedTxData.id);

    if (!existingTransaction) {
      return { success: false, message: `Transaction with id ${updatedTxData.id} not found for update.` };
    }
    
    const updatePayload = await buildTransactionUpdatePayload(
      existingTransaction,
      updatedTxData
    );
    await persistTransactionUpdate({ id: updatedTxData.id }, updatePayload);

    return { success: true };
  } catch (error) {
    console.error(`Error updating transaction ${updatedTxData.id} in DB:`, error);
    return { success: false, message: error instanceof Error ? error.message : "Unknown DB error during update." };
  }
}

export async function refreshPendingTransactionsFromDB(
  transactionIds: string[]
): Promise<PendingTransactionRefreshResponse> {
  await assertTransactionHistoryAccess();

  const uniqueTransactionIds = Array.from(
    new Set(
      transactionIds
        .map((transactionId) => transactionId.trim())
        .filter(Boolean)
    )
  ).slice(0, 100);

  if (uniqueTransactionIds.length === 0) {
    return {
      success: true,
      checkedCount: 0,
      changedCount: 0,
      skippedCount: 0,
      items: [],
      message: "No pending transactions were selected for refresh.",
    };
  }

  try {
    const pendingTransactionsFromDb = await readDb<any[]>(TRANSACTIONS_DB, {
      query: {
        id: { $in: uniqueTransactionIds },
        status: "Pending",
      },
      options: {
        projection: transactionListProjection,
      },
    });
    const pendingTransactions = pendingTransactionsFromDb.map(
      makeTransactionSerializable
    );

    if (pendingTransactions.length === 0) {
      return {
        success: true,
        checkedCount: 0,
        changedCount: 0,
        skippedCount: uniqueTransactionIds.length,
        items: [],
        message: "No matching pending transactions were found on the server.",
      };
    }

    const items: PendingTransactionRefreshItem[] = [];

    for (const transaction of pendingTransactions) {
      if (transaction.provider !== "tokovoucher") {
        items.push({
          id: transaction.id,
          provider: transaction.provider,
          previousStatus: transaction.status,
          currentStatus: transaction.status,
          changed: false,
          skipped: true,
          message:
            "Digiflazz pending updates are webhook-driven and are not refreshed manually.",
        });
        continue;
      }

      const providerResult = await checkTokoVoucherTransactionStatus({
        ref_id: transaction.id,
      });

      if (!providerResult.isSuccess || !providerResult.status) {
        items.push({
          id: transaction.id,
          provider: transaction.provider,
          previousStatus: transaction.status,
          currentStatus: transaction.status,
          changed: false,
          skipped: false,
          message:
            providerResult.message ||
            providerResult.error_msg ||
            "Could not refresh status from TokoVoucher.",
        });
        continue;
      }

      if (providerResult.status === "Pending") {
        items.push({
          id: transaction.id,
          provider: transaction.provider,
          previousStatus: transaction.status,
          currentStatus: providerResult.status,
          changed: false,
          skipped: false,
          message:
            providerResult.message || "Transaction is still pending on provider.",
        });
        continue;
      }

      const failureReason =
        providerResult.status === "Gagal"
          ? providerResult.message || providerResult.sn || undefined
          : undefined;
      const updateResult = await updatePendingTransactionFromProviderResult(
        transaction,
        {
          id: transaction.id,
          status: providerResult.status,
          serialNumber: providerResult.sn || undefined,
          failureReason,
          providerTransactionId: providerResult.trx_id || undefined,
          costPrice: providerResult.price ?? undefined,
        }
      );

      if (!updateResult.success) {
        items.push({
          id: transaction.id,
          provider: transaction.provider,
          previousStatus: transaction.status,
          currentStatus: transaction.status,
          changed: false,
          skipped: true,
          message: updateResult.message,
        });
        continue;
      }

      const freshTransaction = await getTransactionByIdFromDB(transaction.id);
      if (freshTransaction) {
        await trySendTelegramNotification(
          buildTransactionNotificationDetails(
            freshTransaction,
            providerResult.status,
            providerResult.price,
            providerResult.sn,
            failureReason,
            providerResult.trx_id,
            "Server Refresh"
          )
        );
      }

      items.push({
        id: transaction.id,
        provider: transaction.provider,
        previousStatus: transaction.status,
        currentStatus: providerResult.status,
        changed: true,
        skipped: false,
        message: providerResult.message,
      });
    }

    return {
      success: true,
      checkedCount: items.filter((item) => !item.skipped).length,
      changedCount: items.filter((item) => item.changed).length,
      skippedCount: items.filter((item) => item.skipped).length,
      items,
      message: "Pending transactions refreshed from server.",
    };
  } catch (error) {
    console.error("Error refreshing pending transactions from DB:", error);
    return {
      success: false,
      checkedCount: 0,
      changedCount: 0,
      skippedCount: uniqueTransactionIds.length,
      items: [],
      message:
        error instanceof Error
          ? error.message
          : "Unknown error while refreshing pending transactions.",
    };
  }
}

export async function deleteTransactionFromDB(transactionId: string): Promise<{ success: boolean, message?: string }> {
  try {
    const result = await writeDb(TRANSACTIONS_DB, null, { mode: 'deleteOne', query: { id: transactionId } });
    if (result && result.deletedCount > 0) {
        revalidatePath('/transactions'); 
        revalidatePath('/profit-report');
        return { success: true };
    } else {
        return { success: false, message: `Transaction with id ${transactionId} not found for deletion.` };
    }
  } catch (error) {
    console.error(`Error deleting transaction ${transactionId} from DB:`, error);
    return { success: false, message: error instanceof Error ? error.message : "Unknown DB error during deletion." };
  }
}
