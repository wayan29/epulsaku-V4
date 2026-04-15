'use server';

import { verifyAuth } from '@/app/api/auth/actions';
import { readDb, writeDb } from '@/lib/mongodb';

const SAVE_PLN_DB = 'savepln';

export interface SavedPlnCustomer {
  _id: string;
  customerNo: string;
  preferredCustomerNo: string;
  customerName: string;
  meterNo?: string;
  subscriberId?: string;
  segmentPower?: string;
  message?: string;
  rawResponse?: unknown;
  lookupAliases: string[];
  lastValidatedAt?: string;
  lastValidatedBy?: string;
  lastOrderedAt?: string;
  lastOrderedBy?: string;
  lastOrderProductName?: string;
  lastOrderRefId?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface SuccessfulPlnValidationData {
  isSuccess: true;
  customerName: string;
  meterNo?: string;
  subscriberId?: string;
  segmentPower?: string;
  message?: string;
  rawResponse?: unknown;
}

interface RawSavedPlnCustomer extends Record<string, unknown> {
  _id?: { toHexString?: () => string } | string;
  chatId?: string | number;
  customerNo?: string;
  customer_no?: string;
  identityKey?: string;
  preferredCustomerNo?: string;
  customerName?: string;
  name?: string;
  nickname?: string;
  meterNo?: string;
  meter_no?: string;
  subscriberId?: string;
  subscriber_id?: string;
  segmentPower?: string;
  segment_power?: string;
  message?: string;
  provider?: string;
  source?: string;
  username?: string;
  rawResponse?: Record<string, unknown>;
  data?: Record<string, unknown>;
  lookupAliases?: string[];
  lastValidatedAt?: Date | string;
  lastVerifiedAt?: Date | string;
  lastValidatedBy?: string;
  lastOrderedAt?: Date | string;
  lastOrderedBy?: string;
  lastOrderProductName?: string;
  lastOrderRefId?: string;
  lastProductName?: string;
  lastRefId?: string;
  createdAt?: Date | string;
  updatedAt?: Date | string;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function pickString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }

    if (typeof value === 'number' && Number.isFinite(value)) {
      return String(value);
    }
  }

  return undefined;
}

function normalizePlnLookupValue(value?: string | null): string {
  if (!value) {
    return '';
  }

  return value.replace(/\D/g, '').trim();
}

function normalizeOptionalPlnValue(...values: unknown[]): string | undefined {
  const firstValue = pickString(...values);

  if (!firstValue) {
    return undefined;
  }

  const normalized = normalizePlnLookupValue(firstValue);
  return normalized || firstValue.trim();
}

function toIsoString(value: Date | string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return undefined;
  }

  return date.toISOString();
}

function uniqueLookupAliases(values: Array<string | undefined>): string[] {
  return [...new Set(values.map((value) => normalizePlnLookupValue(value)).filter(Boolean))];
}

function getCanonicalSavedPlnData(record: RawSavedPlnCustomer) {
  const rawResponseData = isObject(record.rawResponse) && isObject(record.rawResponse.data)
    ? record.rawResponse.data
    : isObject(record.data)
      ? record.data
      : undefined;

  const meterNo = normalizeOptionalPlnValue(
    record.meterNo,
    record.meter_no,
    rawResponseData?.meter_no,
    rawResponseData?.meterNo
  );
  const subscriberId = normalizeOptionalPlnValue(
    record.subscriberId,
    record.subscriber_id,
    rawResponseData?.subscriber_id,
    rawResponseData?.subscriberId
  );
  const customerNo = normalizeOptionalPlnValue(
    record.customerNo,
    record.customer_no,
    record.identityKey,
    record.preferredCustomerNo,
    subscriberId,
    meterNo
  );
  const preferredCustomerNo = normalizeOptionalPlnValue(
    record.preferredCustomerNo,
    record.identityKey,
    subscriberId,
    meterNo,
    customerNo
  ) || customerNo;
  const customerName = pickString(
    record.customerName,
    record.name,
    record.nickname,
    rawResponseData?.name,
    rawResponseData?.customer_name
  ) || 'Pelanggan PLN';
  const segmentPower = pickString(
    record.segmentPower,
    record.segment_power,
    rawResponseData?.segment_power,
    rawResponseData?.segmentPower
  );
  const message = pickString(record.message, rawResponseData?.message);

  return {
    customerNo,
    preferredCustomerNo,
    customerName,
    meterNo,
    subscriberId,
    segmentPower,
    message,
    rawResponse: record.rawResponse,
    lookupAliases: uniqueLookupAliases([
      customerNo,
      preferredCustomerNo,
      meterNo,
      subscriberId,
      record.identityKey,
      ...(record.lookupAliases || []),
    ]),
  };
}

function serializeSavedPlnRecord(record: RawSavedPlnCustomer): SavedPlnCustomer {
  const canonical = getCanonicalSavedPlnData(record);
  const id =
    typeof record._id === 'string'
      ? record._id
      : record._id?.toHexString?.() || canonical.preferredCustomerNo || canonical.customerNo || 'unknown-pln-customer';

  return {
    _id: id,
    customerNo: canonical.customerNo || id,
    preferredCustomerNo: canonical.preferredCustomerNo || canonical.customerNo || id,
    customerName: canonical.customerName || 'Pelanggan PLN',
    meterNo: canonical.meterNo,
    subscriberId: canonical.subscriberId,
    segmentPower: canonical.segmentPower,
    message: canonical.message,
    rawResponse: canonical.rawResponse,
    lookupAliases: canonical.lookupAliases,
    lastValidatedAt: toIsoString(record.lastValidatedAt || record.lastVerifiedAt),
    lastValidatedBy: pickString(record.lastValidatedBy, record.username),
    lastOrderedAt: toIsoString(record.lastOrderedAt || record.updatedAt),
    lastOrderedBy: pickString(record.lastOrderedBy, record.username),
    lastOrderProductName: pickString(record.lastOrderProductName, record.lastProductName),
    lastOrderRefId: pickString(record.lastOrderRefId, record.lastRefId),
    createdAt: toIsoString(record.createdAt),
    updatedAt: toIsoString(record.updatedAt),
  };
}

async function assertAuthenticatedUser() {
  const { isAuthenticated, user } = await verifyAuth();

  if (!isAuthenticated || !user) {
    throw new Error('Unauthorized');
  }

  return user;
}

async function findSavedPlnRecordByLookupValue(
  customerNo: string
): Promise<RawSavedPlnCustomer | null> {
  const normalizedCustomerNo = normalizePlnLookupValue(customerNo);

  if (!normalizedCustomerNo) {
    return null;
  }

  const records = await readDb<RawSavedPlnCustomer[]>(SAVE_PLN_DB, {
    query: {
      $or: [
        { customerNo: normalizedCustomerNo },
        { customer_no: normalizedCustomerNo },
        { identityKey: normalizedCustomerNo },
        { preferredCustomerNo: normalizedCustomerNo },
        { meterNo: normalizedCustomerNo },
        { meter_no: normalizedCustomerNo },
        { subscriberId: normalizedCustomerNo },
        { subscriber_id: normalizedCustomerNo },
        { lookupAliases: normalizedCustomerNo },
        { 'rawResponse.data.meter_no': normalizedCustomerNo },
        { 'rawResponse.data.subscriber_id': normalizedCustomerNo },
        { 'data.meter_no': normalizedCustomerNo },
        { 'data.subscriber_id': normalizedCustomerNo },
      ],
    },
    options: {
      limit: 1,
      sort: {
        lastOrderedAt: -1,
        lastVerifiedAt: -1,
        lastValidatedAt: -1,
        updatedAt: -1,
        createdAt: -1,
      },
    },
  });

  return records[0] ?? null;
}

export async function getSavedPlnCustomerByLookupValue(
  customerNo: string
): Promise<SavedPlnCustomer | null> {
  await assertAuthenticatedUser();

  const record = await findSavedPlnRecordByLookupValue(customerNo);
  return record ? serializeSavedPlnRecord(record) : null;
}

export async function getSavedPlnCustomers(limit = 80): Promise<SavedPlnCustomer[]> {
  await assertAuthenticatedUser();

  const records = await readDb<RawSavedPlnCustomer[]>(SAVE_PLN_DB, {
    options: {
      limit,
      projection: {
        customerNo: 1,
        customer_no: 1,
        identityKey: 1,
        preferredCustomerNo: 1,
        customerName: 1,
        name: 1,
        nickname: 1,
        meterNo: 1,
        meter_no: 1,
        subscriberId: 1,
        subscriber_id: 1,
        segmentPower: 1,
        segment_power: 1,
        message: 1,
        provider: 1,
        source: 1,
        username: 1,
        chatId: 1,
        lookupAliases: 1,
        lastValidatedAt: 1,
        lastVerifiedAt: 1,
        lastValidatedBy: 1,
        lastOrderedAt: 1,
        lastOrderedBy: 1,
        lastOrderProductName: 1,
        lastOrderRefId: 1,
        lastProductName: 1,
        lastRefId: 1,
        createdAt: 1,
        updatedAt: 1,
      },
      sort: {
        lastOrderedAt: -1,
        lastVerifiedAt: -1,
        lastValidatedAt: -1,
        updatedAt: -1,
        createdAt: -1,
      },
    },
  });

  return records
    .map(serializeSavedPlnRecord)
    .filter((record) => Boolean(record.customerNo && record.customerName));
}

export async function saveSuccessfulPlnValidation(
  inputCustomerNo: string,
  result: SuccessfulPlnValidationData
): Promise<SavedPlnCustomer> {
  const user = await assertAuthenticatedUser();

  if (!result.isSuccess || !result.customerName?.trim()) {
    throw new Error('Cannot save unsuccessful PLN validation.');
  }

  const normalizedInput = normalizePlnLookupValue(inputCustomerNo);
  if (!normalizedInput) {
    throw new Error('Customer number is required.');
  }

  const existingRecord = await findSavedPlnRecordByLookupValue(normalizedInput);
  const existingCanonical = existingRecord
    ? getCanonicalSavedPlnData(existingRecord)
    : null;
  const now = new Date();

  const payload = {
    customerNo: normalizedInput,
    preferredCustomerNo:
      normalizeOptionalPlnValue(
        result.subscriberId,
        result.meterNo,
        existingCanonical?.preferredCustomerNo,
        normalizedInput
      ) || normalizedInput,
    customerName: result.customerName.trim(),
    identityKey:
      normalizeOptionalPlnValue(
        result.subscriberId,
        result.meterNo,
        existingRecord?.identityKey,
        normalizedInput
      ) || normalizedInput,
    name: result.customerName.trim(),
    nickname: result.customerName.trim(),
    meterNo:
      normalizeOptionalPlnValue(result.meterNo, existingCanonical?.meterNo),
    subscriberId:
      normalizeOptionalPlnValue(result.subscriberId, existingCanonical?.subscriberId),
    segmentPower:
      pickString(result.segmentPower, existingCanonical?.segmentPower),
    message: pickString(result.message, existingCanonical?.message),
    provider: pickString(existingRecord?.provider, 'digiflazz'),
    source: pickString(existingRecord?.source, 'digiflazz_validation'),
    username: pickString(existingRecord?.username, user.username),
    chatId: existingRecord?.chatId,
    rawResponse: result.rawResponse ?? existingRecord?.rawResponse ?? null,
    lookupAliases: uniqueLookupAliases([
      normalizedInput,
      result.meterNo,
      result.subscriberId,
      existingCanonical?.customerNo,
      existingCanonical?.preferredCustomerNo,
      ...(existingCanonical?.lookupAliases || []),
    ]),
    lastValidatedAt: now,
    lastVerifiedAt: now,
    lastValidatedBy: user.username,
    updatedAt: now,
    ...(existingRecord ? {} : { createdAt: now }),
  };

  if (existingRecord?._id) {
    await writeDb(SAVE_PLN_DB, payload, {
      mode: 'updateOne',
      query: { _id: typeof existingRecord._id === 'string' ? existingRecord._id : existingRecord._id?.toHexString?.() },
      upsert: true,
    });
  } else {
    await writeDb(SAVE_PLN_DB, payload, {
      mode: 'insertOne',
    });
  }

  const savedRecord = await findSavedPlnRecordByLookupValue(payload.preferredCustomerNo);
  if (!savedRecord) {
    throw new Error('Failed to persist PLN validation.');
  }

  return serializeSavedPlnRecord(savedRecord);
}

export async function markSavedPlnCustomerOrdered(
  customerNo: string,
  metadata?: {
    refId?: string;
    productName?: string;
  }
): Promise<SavedPlnCustomer | null> {
  const user = await assertAuthenticatedUser();
  const existingRecord = await findSavedPlnRecordByLookupValue(customerNo);

  if (!existingRecord?._id) {
    return null;
  }

  const now = new Date();

  await writeDb(
    SAVE_PLN_DB,
    {
      lastOrderedAt: now,
      lastOrderedBy: user.username,
      lastOrderProductName: metadata?.productName,
      lastOrderRefId: metadata?.refId,
      lastProductName: metadata?.productName,
      lastRefId: metadata?.refId,
      username: pickString(existingRecord.username, user.username),
      updatedAt: now,
    },
    {
      mode: 'updateOne',
      query: {
        _id:
          typeof existingRecord._id === 'string'
            ? existingRecord._id
            : existingRecord._id?.toHexString?.(),
      },
    }
  );

  const updatedRecord = await findSavedPlnRecordByLookupValue(customerNo);
  return updatedRecord ? serializeSavedPlnRecord(updatedRecord) : null;
}
