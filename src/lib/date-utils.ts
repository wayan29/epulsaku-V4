export type DateInput = string | number | Date | null | undefined;

export const PENDING_SLA_WARNING_MINUTES = 10;
export const PENDING_SLA_BREACH_MINUTES = 30;
export const FOLLOW_UP_DUE_SOON_MINUTES = 15;
export const CLAIMED_STALE_MINUTES = 20;

export type PendingSlaState = "normal" | "warning" | "breached";
export type FollowUpState = "upcoming" | "due" | "overdue";

export type ClaimedStaleInput = {
  claimedAt?: DateInput;
  lastInternalNoteAt?: DateInput;
  followUpCreatedAt?: DateInput;
};

export function coerceToDate(value: DateInput): Date {
  if (value instanceof Date) {
    return new Date(value.getTime());
  }

  if (typeof value === "string" || typeof value === "number") {
    return new Date(value);
  }

  return new Date(Number.NaN);
}

export function normalizeDateInput(value: DateInput): string | null {
  const date = coerceToDate(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function getElapsedMinutes(
  value: DateInput,
  nowValue: DateInput = new Date()
): number | null {
  const date = coerceToDate(value);
  const now = coerceToDate(nowValue);

  if (Number.isNaN(date.getTime()) || Number.isNaN(now.getTime())) {
    return null;
  }

  return Math.max(0, Math.floor((now.getTime() - date.getTime()) / 60000));
}

export function getMinutesUntil(
  value: DateInput,
  nowValue: DateInput = new Date()
): number | null {
  const date = coerceToDate(value);
  const now = coerceToDate(nowValue);

  if (Number.isNaN(date.getTime()) || Number.isNaN(now.getTime())) {
    return null;
  }

  return Math.floor((date.getTime() - now.getTime()) / 60000);
}

export function formatElapsedMinutesCompact(minutes: number | null): string {
  if (minutes === null || !Number.isFinite(minutes) || minutes < 0) {
    return "-";
  }

  if (minutes < 60) {
    return `${minutes}m`;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  if (remainingMinutes === 0) {
    return `${hours}j`;
  }

  return `${hours}j ${remainingMinutes}m`;
}

export function getPendingSlaState(
  value: DateInput,
  nowValue: DateInput = new Date()
): PendingSlaState | null {
  const elapsedMinutes = getElapsedMinutes(value, nowValue);

  if (elapsedMinutes === null) {
    return null;
  }

  if (elapsedMinutes >= PENDING_SLA_BREACH_MINUTES) {
    return "breached";
  }

  if (elapsedMinutes >= PENDING_SLA_WARNING_MINUTES) {
    return "warning";
  }

  return "normal";
}

export function getFollowUpState(
  value: DateInput,
  nowValue: DateInput = new Date()
): FollowUpState | null {
  const minutesUntil = getMinutesUntil(value, nowValue);

  if (minutesUntil === null) {
    return null;
  }

  if (minutesUntil < 0) {
    return "overdue";
  }

  if (minutesUntil <= FOLLOW_UP_DUE_SOON_MINUTES) {
    return "due";
  }

  return "upcoming";
}

export function getLastOperationalActivityAt(
  input: ClaimedStaleInput
): string | null {
  const candidates = [input.claimedAt, input.lastInternalNoteAt, input.followUpCreatedAt]
    .map((value) => normalizeDateInput(value))
    .filter((value): value is string => value !== null)
    .sort((left, right) => new Date(right).getTime() - new Date(left).getTime());

  return candidates[0] ?? null;
}

export function getClaimedStaleMinutes(
  input: ClaimedStaleInput,
  nowValue: DateInput = new Date()
): number | null {
  return getElapsedMinutes(getLastOperationalActivityAt(input), nowValue);
}

export function isClaimedStale(
  input: ClaimedStaleInput,
  nowValue: DateInput = new Date(),
  staleAfterMinutes = CLAIMED_STALE_MINUTES
): boolean {
  const claimedMinutes = getElapsedMinutes(input.claimedAt, nowValue);
  const staleMinutes = getClaimedStaleMinutes(input, nowValue);

  if (claimedMinutes === null || staleMinutes === null) {
    return false;
  }

  return claimedMinutes >= staleAfterMinutes && staleMinutes >= staleAfterMinutes;
}
