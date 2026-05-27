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
import { addMinutes, endOfDay, startOfDay, subMinutes } from 'date-fns';
import type { ObjectId } from 'mongodb';
import {
  CLAIMED_STALE_MINUTES,
  coerceToDate,
  FOLLOW_UP_DUE_SOON_MINUTES,
  normalizeDateInput,
  PENDING_SLA_BREACH_MINUTES,
  PENDING_SLA_WARNING_MINUTES,
} from '@/lib/date-utils';
import { verifyAuth } from '@/app/api/auth/actions';
import { getActingUserFromSession } from '@/lib/user-utils';
import { checkTokoVoucherTransactionStatus } from '@/ai/flows/tokovoucher/checkTokoVoucherTransactionStatus-flow';
import {
  trySendTelegramNotification,
  type TelegramNotificationDetails,
} from '@/lib/notification-utils';

const TRANSACTIONS_DB = "transactions_log";
const TRANSACTION_INTERNAL_NOTES_DB = "transaction_internal_notes";
const TRANSACTION_ACTIVITY_EVENTS_DB = "transaction_activity_events";
const SHIFT_HANDOVERS_DB = "shift_handovers";

const RELEVANT_PULSA_CATEGORIES_UPPER = ["PULSA", "PAKET DATA"];
const RELEVANT_PLN_CATEGORIES_UPPER = ["PLN", "TOKEN LISTRIK", "TOKEN"];
const RELEVANT_GAME_CATEGORIES_UPPER = ["GAME", "TOPUP", "VOUCHER GAME", "DIAMOND", "UC"];
const RELEVANT_EMONEY_CATEGORIES_UPPER = ["E-MONEY", "E-WALLET", "SALDO DIGITAL", "DANA", "OVO", "GOPAY", "SHOPEEPAY", "MAXIM"];


export interface TransactionFollowUp {
  followUpAt: string;
  note: string;
  createdAt: string;
  createdByUserId: string;
  createdByUsername: string;
}

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
  followUp?: TransactionFollowUp | null;
  latestActivityPreview?: TransactionTimelineItem[];
}

export type TransactionOperationalFilter = 'all' | 'unclaimed' | 'mine' | 'others' | 'handover' | 'followup_due' | 'followup_overdue' | 'claimed_stale' | 'my_claimed_stale' | 'my_followup_due' | 'my_followup_overdue';
export type TransactionPendingAgingFilter = 'all' | 'warning' | 'breached';

export interface TransactionListInput {
  page?: number;
  limit?: number;
  search?: string;
  transactionIds?: string[];
  category?: string;
  status?: TransactionStatus;
  provider?: 'digiflazz' | 'tokovoucher';
  from?: string;
  to?: string;
  operationalFilter?: TransactionOperationalFilter;
  pendingAging?: TransactionPendingAgingFilter;
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

export interface ShiftHandoverAcknowledgeSummary {
  adoptedCount: number;
  alreadyMineCount: number;
  resolvedCount: number;
  blockedCount: number;
}

export interface ShiftHandoverResolutionItem {
  transactionId: string;
  productName?: string;
  details?: string;
  status?: TransactionStatus;
  claimedByUsername?: string;
  timestamp?: string;
}

export interface ShiftHandoverAcknowledgeDetails {
  adopted: ShiftHandoverResolutionItem[];
  alreadyMine: ShiftHandoverResolutionItem[];
  resolved: ShiftHandoverResolutionItem[];
  blocked: ShiftHandoverResolutionItem[];
}

export type TransactionActivityEventType =
  | 'claimed'
  | 'unclaimed'
  | 'internal_note_added'
  | 'status_changed'
  | 'handover_marked'
  | 'handover_acknowledged'
  | 'follow_up_set'
  | 'follow_up_cleared'
  | 'deleted';

export type TransactionActivityActorType = 'user' | 'webhook' | 'system';

export interface TransactionActivityEvent {
  _id?: string;
  transactionId: string;
  type: TransactionActivityEventType;
  createdAt: string;
  actorType: TransactionActivityActorType;
  actorUserId?: string;
  actorUsername?: string;
  source?: string;
  summary: string;
  metadata?: Record<string, unknown>;
}

export interface TransactionTimelineItem {
  id: string;
  transactionId: string;
  type: TransactionActivityEventType | 'legacy_note';
  createdAt: string;
  actorType: TransactionActivityActorType | 'user';
  actorUserId?: string;
  actorUsername?: string;
  source?: string;
  summary: string;
  note?: string;
  metadata?: Record<string, unknown>;
}

interface AppendTransactionActivityEventInput {
  transactionId: string;
  type: TransactionActivityEventType;
  createdAt?: string;
  actorType: TransactionActivityActorType;
  actorUserId?: string;
  actorUsername?: string;
  source?: string;
  summary: string;
  metadata?: Record<string, unknown>;
}

interface TransactionStatusChangeActivityContext {
  actorType: TransactionActivityActorType;
  actorUserId?: string;
  actorUsername?: string;
  source?: string;
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
  followUp: 1,
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

  const normalizedTransactionIds = Array.from(
    new Set((input?.transactionIds || []).map((id) => id.trim()).filter(Boolean))
  );

  if (normalizedTransactionIds.length > 0) {
    query.id = { $in: normalizedTransactionIds };
  }

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

  if (input?.operationalFilter === 'followup_due') {
    query.status = 'Pending';
    query['followUp.followUpAt'] = {
      $gte: new Date().toISOString(),
      $lte: addMinutes(new Date(), FOLLOW_UP_DUE_SOON_MINUTES).toISOString(),
    };
  }

  if (input?.operationalFilter === 'my_followup_due' && userContext?.userId) {
    query.status = 'Pending';
    query.claimedByUserId = userContext.userId;
    query['followUp.followUpAt'] = {
      $gte: new Date().toISOString(),
      $lte: addMinutes(new Date(), FOLLOW_UP_DUE_SOON_MINUTES).toISOString(),
    };
  }

  if (input?.operationalFilter === 'followup_overdue') {
    query.status = 'Pending';
    query['followUp.followUpAt'] = {
      $lt: new Date().toISOString(),
      $gt: '',
    };
  }

  if (input?.operationalFilter === 'my_followup_overdue' && userContext?.userId) {
    query.status = 'Pending';
    query.claimedByUserId = userContext.userId;
    query['followUp.followUpAt'] = {
      $lt: new Date().toISOString(),
      $gt: '',
    };
  }

  if (input?.operationalFilter === 'claimed_stale') {
    const staleCutoff = subMinutes(new Date(), CLAIMED_STALE_MINUTES).toISOString();

    query.status = 'Pending';
    query.claimedByUserId = { $nin: [null, ''] };
    query.claimedAt = {
      $lte: staleCutoff,
      $gt: '',
    };
    query.$and = [
      {
        $or: [
          { lastInternalNoteAt: { $exists: false } },
          { lastInternalNoteAt: { $in: [null, ''] } },
          { lastInternalNoteAt: { $lte: staleCutoff, $gt: '' } },
        ],
      },
      {
        $or: [
          { 'followUp.createdAt': { $exists: false } },
          { 'followUp.createdAt': { $in: [null, ''] } },
          { 'followUp.createdAt': { $lte: staleCutoff, $gt: '' } },
        ],
      },
    ];
  }

  if (input?.operationalFilter === 'my_claimed_stale' && userContext?.userId) {
    const staleCutoff = subMinutes(new Date(), CLAIMED_STALE_MINUTES).toISOString();

    query.status = 'Pending';
    query.claimedByUserId = userContext.userId;
    query.claimedAt = {
      $lte: staleCutoff,
      $gt: '',
    };
    query.$and = [
      {
        $or: [
          { lastInternalNoteAt: { $exists: false } },
          { lastInternalNoteAt: { $in: [null, ''] } },
          { lastInternalNoteAt: { $lte: staleCutoff, $gt: '' } },
        ],
      },
      {
        $or: [
          { 'followUp.createdAt': { $exists: false } },
          { 'followUp.createdAt': { $in: [null, ''] } },
          { 'followUp.createdAt': { $lte: staleCutoff, $gt: '' } },
        ],
      },
    ];
  }

  if (input?.pendingAging && input.pendingAging !== 'all') {
    query.status = 'Pending';

    const now = new Date();
    const breachCutoff = subMinutes(now, PENDING_SLA_BREACH_MINUTES);

    if (input.pendingAging === 'breached') {
      query.timestampDate = {
        $lte: breachCutoff,
      };
    }

    if (input.pendingAging === 'warning') {
      const warningCutoff = subMinutes(now, PENDING_SLA_WARNING_MINUTES);
      query.timestampDate = {
        $lte: warningCutoff,
        $gt: breachCutoff,
      };
    }
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

  if (serializableTx.followUp) {
    serializableTx.followUp = {
      ...serializableTx.followUp,
      followUpAt: normalizeStoredTimestamp(serializableTx.followUp.followUpAt),
      createdAt: normalizeStoredTimestamp(serializableTx.followUp.createdAt),
    };
  }

  return serializableTx as Transaction;
};

async function appendTransactionActivityEvent(
  input: AppendTransactionActivityEventInput
): Promise<void> {
  const createdAt = normalizeStoredTimestamp(input.createdAt || new Date().toISOString());
  const event: TransactionActivityEvent = {
    transactionId: input.transactionId,
    type: input.type,
    createdAt,
    actorType: input.actorType,
    actorUserId: input.actorUserId,
    actorUsername: input.actorUsername,
    source: input.source,
    summary: input.summary.trim(),
    metadata: input.metadata,
  };

  await writeDb(TRANSACTION_ACTIVITY_EVENTS_DB, event, { mode: 'insertOne' });
}

function buildStatusChangedSummary(
  previousStatus: TransactionStatus,
  nextStatus: TransactionStatus,
  context: TransactionStatusChangeActivityContext
): string {
  if (context.source === 'webhook_digiflazz') {
    return `Digiflazz webhook memperbarui status ${previousStatus} → ${nextStatus}.`;
  }

  if (context.source === 'webhook_tokovoucher') {
    return `TokoVoucher webhook memperbarui status ${previousStatus} → ${nextStatus}.`;
  }

  if (context.source === 'manual_refresh') {
    return `Refresh manual memperbarui status ${previousStatus} → ${nextStatus}.`;
  }

  if (context.actorUsername) {
    return `${context.actorUsername} mengubah status ${previousStatus} → ${nextStatus}.`;
  }

  return `Status diubah dari ${previousStatus} ke ${nextStatus}.`;
}

async function appendStatusChangedActivityEvent(
  transactionId: string,
  previousStatus: TransactionStatus,
  nextStatus: TransactionStatus,
  context: TransactionStatusChangeActivityContext
): Promise<void> {
  if (previousStatus === nextStatus) {
    return;
  }

  await appendTransactionActivityEvent({
    transactionId,
    type: 'status_changed',
    actorType: context.actorType,
    actorUserId: context.actorUserId,
    actorUsername: context.actorUsername,
    source: context.source,
    summary: buildStatusChangedSummary(previousStatus, nextStatus, context),
    metadata: {
      previousStatus,
      nextStatus,
    },
  });
}

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
    updatePayload.followUp = null;
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

function sanitizeFollowUpNote(note: string): string {
  return note.trim().replace(/\s+/g, ' ').slice(0, 160);
}

function buildShiftHandoverAcknowledgeMessage(
  summary: ShiftHandoverAcknowledgeSummary
): string {
  const parts: string[] = [];

  if (summary.adoptedCount > 0) {
    parts.push(`${summary.adoptedCount} transaksi masuk ke antrean saya`);
  }

  if (summary.alreadyMineCount > 0) {
    parts.push(`${summary.alreadyMineCount} transaksi sudah menjadi antrean saya`);
  }

  if (summary.resolvedCount > 0) {
    parts.push(`${summary.resolvedCount} transaksi sudah tidak pending`);
  }

  if (summary.blockedCount > 0) {
    parts.push(`${summary.blockedCount} transaksi masih dipegang staf lain`);
  }

  if (parts.length === 0) {
    return 'Handover diterima, tetapi tidak ada transaksi yang perlu dipindahkan.';
  }

  return `Handover diterima: ${parts.join(', ')}.`;
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

    const claimedAt = new Date().toISOString();
    await persistTransactionUpdate(
      { id: transactionId, status: 'Pending' },
      {
        claimedByUserId: sessionUser._id,
        claimedByUsername: sessionUser.username,
        claimedAt,
      }
    );
    await appendTransactionActivityEvent({
      transactionId,
      type: 'claimed',
      createdAt: claimedAt,
      actorType: 'user',
      actorUserId: sessionUser._id,
      actorUsername: sessionUser.username,
      source: 'ui',
      summary: `${sessionUser.username} mulai menangani transaksi pending.`,
      metadata: {
        claimedByUserId: sessionUser._id,
        claimedByUsername: sessionUser.username,
      },
    });

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

    const releasedAt = new Date().toISOString();
    const releasedFrom = existingTransaction.claimedByUsername || 'staff';
    await persistTransactionUpdate(
      { id: transactionId },
      {
        claimedByUserId: '',
        claimedByUsername: '',
        claimedAt: '',
      }
    );
    await appendTransactionActivityEvent({
      transactionId,
      type: 'unclaimed',
      createdAt: releasedAt,
      actorType: 'user',
      actorUserId: sessionUser._id,
      actorUsername: sessionUser.username,
      source: 'ui',
      summary: `${sessionUser.username} melepas penanganan transaksi.`,
      metadata: {
        previousClaimedByUserId: existingTransaction.claimedByUserId,
        previousClaimedByUsername: existingTransaction.claimedByUsername,
      },
    });

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
    await appendTransactionActivityEvent({
      transactionId,
      type: 'internal_note_added',
      createdAt,
      actorType: 'user',
      actorUserId: sessionUser._id,
      actorUsername: sessionUser.username,
      source: normalizedPriority === 'handover' ? 'shift_handover' : 'ui',
      summary:
        normalizedPriority === 'handover'
          ? `${sessionUser.username} menambahkan catatan untuk sif berikutnya.`
          : `${sessionUser.username} menambahkan catatan operasional.`,
      metadata: {
        note: sanitizedNote,
        priority: normalizedPriority,
      },
    });

    return { success: true, message: 'Internal note saved.' };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Failed to save internal note.',
    };
  }
}

export async function setTransactionFollowUpInDB(input: {
  transactionId: string;
  dueAt: string;
  note: string;
}): Promise<{ success: boolean; message: string }> {
  try {
    const sessionUser = await getTransactionAccessContext();
    const existingTransaction = await getTransactionByIdFromDB(input.transactionId);
    const sanitizedNote = sanitizeFollowUpNote(input.note);
    const normalizedDueAt = normalizeStoredTimestamp(input.dueAt);

    if (!existingTransaction) {
      return { success: false, message: 'Transaction not found.' };
    }

    if (existingTransaction.status !== 'Pending') {
      return { success: false, message: 'Only pending transactions can have follow-up reminders.' };
    }

    if (!normalizedDueAt) {
      return { success: false, message: 'Follow-up time is invalid.' };
    }

    if (new Date(normalizedDueAt).getTime() <= Date.now()) {
      return { success: false, message: 'Follow-up time must be in the future.' };
    }

    if (!sanitizedNote) {
      return { success: false, message: 'Follow-up note cannot be empty.' };
    }

    const createdAt = new Date().toISOString();
    const followUp: TransactionFollowUp = {
      followUpAt: normalizedDueAt,
      note: sanitizedNote,
      createdAt,
      createdByUserId: sessionUser._id,
      createdByUsername: sessionUser.username,
    };

    await persistTransactionUpdate(
      { id: input.transactionId, status: 'Pending' },
      {
        followUp,
      }
    );

    await appendTransactionActivityEvent({
      transactionId: input.transactionId,
      type: 'follow_up_set',
      createdAt,
      actorType: 'user',
      actorUserId: sessionUser._id,
      actorUsername: sessionUser.username,
      source: 'ui',
      summary: `${sessionUser.username} menetapkan follow-up transaksi.`,
      metadata: {
        note: sanitizedNote,
        followUpAt: normalizedDueAt,
      },
    });

    return { success: true, message: 'Follow-up reminder saved.' };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Failed to save follow-up reminder.',
    };
  }
}

export async function clearTransactionFollowUpInDB(
  transactionId: string
): Promise<{ success: boolean; message: string }> {
  try {
    const sessionUser = await getTransactionAccessContext();
    const existingTransaction = await getTransactionByIdFromDB(transactionId);

    if (!existingTransaction) {
      return { success: false, message: 'Transaction not found.' };
    }

    if (!existingTransaction.followUp?.followUpAt) {
      return { success: false, message: 'Transaction does not have an active follow-up reminder.' };
    }

    const clearedAt = new Date().toISOString();

    await persistTransactionUpdate(
      { id: transactionId },
      {
        followUp: null,
      }
    );

    await appendTransactionActivityEvent({
      transactionId,
      type: 'follow_up_cleared',
      createdAt: clearedAt,
      actorType: 'user',
      actorUserId: sessionUser._id,
      actorUsername: sessionUser.username,
      source: 'ui',
      summary: `${sessionUser.username} menyelesaikan follow-up transaksi.`,
      metadata: {
        note: existingTransaction.followUp.note,
        followUpAt: existingTransaction.followUp.followUpAt,
        followUpCreatedByUsername: existingTransaction.followUp.createdByUsername,
      },
    });

    return { success: true, message: 'Follow-up reminder cleared.' };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Failed to clear follow-up reminder.',
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

export async function listTransactionActivityTimelineFromDB(
  transactionId: string
): Promise<TransactionTimelineItem[]> {
  await getTransactionAccessContext();

  const [events, notes] = await Promise.all([
    readDb<any[]>(TRANSACTION_ACTIVITY_EVENTS_DB, {
      query: { transactionId },
      options: { sort: { createdAt: -1, _id: -1 } },
    }),
    readDb<any[]>(TRANSACTION_INTERNAL_NOTES_DB, {
      query: { transactionId },
      options: { sort: { createdAt: -1, _id: -1 } },
    }),
  ]);

  const eventItems: TransactionTimelineItem[] = events.map((event) => ({
    id:
      event._id && typeof event._id !== 'string'
        ? event._id.toHexString()
        : String(event._id || `${event.transactionId}-${event.createdAt}-${event.type}`),
    transactionId: event.transactionId,
    type: event.type,
    createdAt: normalizeStoredTimestamp(event.createdAt),
    actorType: event.actorType,
    actorUserId: event.actorUserId,
    actorUsername: event.actorUsername,
    source: event.source,
    summary: event.summary,
    note:
      event.metadata && typeof event.metadata.note === 'string'
        ? event.metadata.note
        : event.metadata && typeof event.metadata.handoverSummary === 'string'
          ? event.metadata.handoverSummary
          : undefined,
    metadata: event.metadata,
  }));

  const activityNoteKeys = new Set(
    events
      .filter((event) => event.type === 'internal_note_added')
      .map((event) => {
        const normalizedCreatedAt = normalizeStoredTimestamp(event.createdAt);
        const activityNote =
          event.metadata && typeof event.metadata.note === 'string'
            ? event.metadata.note
            : '';

        return `${normalizedCreatedAt}::${event.actorUserId || ''}::${activityNote}`;
      })
  );

  const legacyNoteItems: TransactionTimelineItem[] = notes
    .filter((note) => {
      const noteKey = `${normalizeStoredTimestamp(note.createdAt)}::${note.createdByUserId || ''}::${note.note || ''}`;
      return !activityNoteKeys.has(noteKey);
    })
    .map((note) => ({
      id:
        note._id && typeof note._id !== 'string'
          ? note._id.toHexString()
          : `legacy-note-${note.transactionId}-${note.createdAt}`,
      transactionId: note.transactionId,
      type: 'legacy_note',
      createdAt: normalizeStoredTimestamp(note.createdAt),
      actorType: 'user',
      actorUserId: note.createdByUserId,
      actorUsername: note.createdByUsername,
      source: 'legacy_note',
      summary: `${note.createdByUsername || 'Staff'} menambahkan catatan internal.`,
      note: note.note,
      metadata: {
        migratedFromLegacyNotes: true,
      },
    }));

  return [...eventItems, ...legacyNoteItems].sort((left, right) => {
    const leftTime = new Date(left.createdAt).getTime();
    const rightTime = new Date(right.createdAt).getTime();

    if (leftTime === rightTime) {
      return left.id < right.id ? 1 : -1;
    }

    return rightTime - leftTime;
  });
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
        await appendTransactionActivityEvent({
          transactionId,
          type: 'handover_marked',
          createdAt,
          actorType: 'user',
          actorUserId: sessionUser._id,
          actorUsername: sessionUser.username,
          source: 'shift_handover',
          summary: `${sessionUser.username} menandai transaksi untuk handover sif berikutnya.`,
          metadata: {
            handoverSummary: summary,
            handoverCreatedByUsername: sessionUser.username,
          },
        });
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
): Promise<{
  success: boolean;
  message: string;
  summary?: ShiftHandoverAcknowledgeSummary;
  details?: ShiftHandoverAcknowledgeDetails;
}> {
  try {
    const sessionUser = await getTransactionAccessContext();
    const existingHandover = await readDb<any>(SHIFT_HANDOVERS_DB, { query: { _id: handoverId } });

    if (!existingHandover) {
      return { success: false, message: 'Shift handover not found.' };
    }

    if (existingHandover.status === 'acknowledged') {
      return { success: false, message: 'Shift handover is already acknowledged.' };
    }

    const acknowledgedAt = new Date().toISOString();
    await writeDb(
      SHIFT_HANDOVERS_DB,
      {
        status: 'acknowledged',
        acknowledgedAt,
        acknowledgedByUserId: sessionUser._id,
        acknowledgedByUsername: sessionUser.username,
      },
      { mode: 'updateOne', query: { _id: handoverId } }
    );

    const pendingTransactionIds = Array.isArray(existingHandover.pendingTransactionIds)
      ? existingHandover.pendingTransactionIds.filter(
          (transactionId: unknown): transactionId is string =>
            typeof transactionId === 'string' && transactionId.trim().length > 0
        )
      : [];

    const summary: ShiftHandoverAcknowledgeSummary = {
      adoptedCount: 0,
      alreadyMineCount: 0,
      resolvedCount: 0,
      blockedCount: 0,
    };
    const details: ShiftHandoverAcknowledgeDetails = {
      adopted: [],
      alreadyMine: [],
      resolved: [],
      blocked: [],
    };

    for (const transactionId of pendingTransactionIds) {
      const transaction = await getTransactionByIdFromDB(transactionId);

      if (!transaction) {
        summary.resolvedCount += 1;
        details.resolved.push({ transactionId });
        continue;
      }

      if (transaction.status !== 'Pending') {
        summary.resolvedCount += 1;
        details.resolved.push({
          transactionId,
          productName: transaction.productName,
          details: transaction.details,
          status: transaction.status,
          timestamp: transaction.timestamp,
        });
        continue;
      }

      if (transaction.claimedByUserId && transaction.claimedByUserId !== sessionUser._id) {
        summary.blockedCount += 1;
        details.blocked.push({
          transactionId,
          productName: transaction.productName,
          details: transaction.details,
          claimedByUsername: transaction.claimedByUsername,
          status: transaction.status,
          timestamp: transaction.timestamp,
        });
        continue;
      }

      const adoptedFromUnclaimed = !transaction.claimedByUserId;

      if (adoptedFromUnclaimed) {
        await persistTransactionUpdate(
          { id: transactionId, status: 'Pending' },
          {
            claimedByUserId: sessionUser._id,
            claimedByUsername: sessionUser.username,
            claimedAt: acknowledgedAt,
            internalPriority: 'normal',
          }
        );
        summary.adoptedCount += 1;
        details.adopted.push({
          transactionId,
          productName: transaction.productName,
          details: transaction.details,
          claimedByUsername: sessionUser.username,
          status: transaction.status,
          timestamp: transaction.timestamp,
        });

        await appendTransactionActivityEvent({
          transactionId,
          type: 'claimed',
          createdAt: acknowledgedAt,
          actorType: 'user',
          actorUserId: sessionUser._id,
          actorUsername: sessionUser.username,
          source: 'shift_handover',
          summary: `${sessionUser.username} mengambil transaksi dari handover sif ke antrean pribadi.`,
          metadata: {
            claimedByUserId: sessionUser._id,
            claimedByUsername: sessionUser.username,
            handoverSummary:
              typeof existingHandover.summary === 'string' ? existingHandover.summary : undefined,
            handoverCreatedByUsername:
              typeof existingHandover.createdByUsername === 'string'
                ? existingHandover.createdByUsername
                : undefined,
          },
        });
      } else {
        await persistTransactionUpdate(
          { id: transactionId, status: 'Pending' },
          {
            internalPriority: 'normal',
          }
        );
        summary.alreadyMineCount += 1;
        details.alreadyMine.push({
          transactionId,
          productName: transaction.productName,
          details: transaction.details,
          claimedByUsername: transaction.claimedByUsername || sessionUser.username,
          status: transaction.status,
          timestamp: transaction.timestamp,
        });
      }

      await appendTransactionActivityEvent({
        transactionId,
        type: 'handover_acknowledged',
        createdAt: acknowledgedAt,
        actorType: 'user',
        actorUserId: sessionUser._id,
        actorUsername: sessionUser.username,
        source: 'shift_handover',
        summary: `${sessionUser.username} mengambil handover transaksi ini untuk ditindaklanjuti.`,
        metadata: {
          handoverSummary:
            typeof existingHandover.summary === 'string' ? existingHandover.summary : undefined,
          handoverCreatedByUsername:
            typeof existingHandover.createdByUsername === 'string'
              ? existingHandover.createdByUsername
              : undefined,
          acknowledgedByUsername: sessionUser.username,
        },
      });
    }

    revalidatePath('/shift-handover');
    revalidatePath('/transactions');
    revalidatePath('/dashboard');
    return {
      success: true,
      message: buildShiftHandoverAcknowledgeMessage(summary),
      summary,
      details,
    };
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

  const transactions = transactionsFromDb.map(makeTransactionSerializable);
  const transactionIds = transactions.map((transaction) => transaction.id);

  let previewMap = new Map<string, TransactionTimelineItem[]>();

  if (transactionIds.length > 0) {
    const previewEvents = await readDb<any[]>(TRANSACTION_ACTIVITY_EVENTS_DB, {
      query: {
        transactionId: { $in: transactionIds },
      },
      options: {
        sort: { createdAt: -1, _id: -1 },
      },
    });

    const groupedPreviewEvents = new Map<string, TransactionTimelineItem[]>();

    for (const event of previewEvents) {
      const transactionId = typeof event.transactionId === 'string' ? event.transactionId : '';
      if (!transactionId) {
        continue;
      }

      const existingItems = groupedPreviewEvents.get(transactionId) || [];
      if (existingItems.length >= 2) {
        continue;
      }

      existingItems.push({
        id:
          event._id && typeof event._id !== 'string'
            ? event._id.toHexString()
            : String(event._id || `${transactionId}-${event.createdAt}-${event.type}`),
        transactionId,
        type: event.type,
        createdAt: normalizeStoredTimestamp(event.createdAt),
        actorType: event.actorType,
        actorUserId: event.actorUserId,
        actorUsername: event.actorUsername,
        source: event.source,
        summary: event.summary,
        note:
          event.metadata && typeof event.metadata.note === 'string'
            ? event.metadata.note
            : event.metadata && typeof event.metadata.handoverSummary === 'string'
              ? event.metadata.handoverSummary
              : undefined,
        metadata: event.metadata,
      });

      groupedPreviewEvents.set(transactionId, existingItems);
    }

    previewMap = groupedPreviewEvents;
  }

  return {
    transactions: transactions.map((transaction) => ({
      ...transaction,
      latestActivityPreview: previewMap.get(transaction.id) || [],
    })),
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

export async function updateTransactionInDB(
  updatedTxData: Partial<TransactionCore> & { id: string },
  activityContext?: TransactionStatusChangeActivityContext
): Promise<{ success: boolean, message?: string }> {
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

    if (updatedTxData.status) {
      await appendStatusChangedActivityEvent(
        updatedTxData.id,
        existingTransaction.status,
        updatedTxData.status,
        activityContext || {
          actorType: 'system',
          source: 'transaction_update',
        }
      );
    }

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

      if (updateResult.success && updateResult.changed) {
        await appendStatusChangedActivityEvent(
          transaction.id,
          transaction.status,
          providerResult.status,
          {
            actorType: 'system',
            source: 'manual_refresh',
          }
        );
      }

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
    const sessionUser = await getTransactionAccessContext();
    const existingTransaction = await getTransactionByIdFromDB(transactionId);

    if (!existingTransaction) {
      return { success: false, message: `Transaction with id ${transactionId} not found for deletion.` };
    }

    const deletedAt = new Date().toISOString();
    const result = await writeDb(TRANSACTIONS_DB, null, { mode: 'deleteOne', query: { id: transactionId } });
    if (result && result.deletedCount > 0) {
        await appendTransactionActivityEvent({
          transactionId,
          type: 'deleted',
          createdAt: deletedAt,
          actorType: 'user',
          actorUserId: sessionUser._id,
          actorUsername: sessionUser.username,
          source: 'ui',
          summary: `${sessionUser.username} menghapus transaksi.`,
          metadata: {
            previousStatus: existingTransaction.status,
          },
        });
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
