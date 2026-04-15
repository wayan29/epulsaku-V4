export type DateInput = string | number | Date | null | undefined;

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
