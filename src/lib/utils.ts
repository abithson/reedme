import type { Business } from "@/lib/types";
import { localeForCountry } from "@/lib/localization";

export function formatMoney(value: number, currency: string, country: string, decimals = false): string {
  const amount = Number.isFinite(value) ? value : 0;
  const normalizedCurrency = /^[A-Z]{3}$/i.test(currency) ? currency.toUpperCase() : "NGN";
  const locale = localeForCountry(country);
  const currencyDigits = new Intl.NumberFormat(locale, { style: "currency", currency: normalizedCurrency }).resolvedOptions().maximumFractionDigits ?? 2;
  const hasFraction = Math.abs(amount - Math.round(amount)) > 0.000_001;
  const showFraction = decimals || hasFraction;
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: normalizedCurrency,
    minimumFractionDigits: showFraction ? currencyDigits : 0,
    maximumFractionDigits: showFraction ? currencyDigits : 0,
  }).format(amount);
}

export function formatCompactMoney(value: number, currency: string, country: string): string {
  const amount = Number.isFinite(value) ? value : 0;
  const normalizedCurrency = /^[A-Z]{3}$/i.test(currency) ? currency.toUpperCase() : "NGN";
  const locale = localeForCountry(country);
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: normalizedCurrency,
    notation: "compact",
    compactDisplay: "short",
    maximumFractionDigits: Math.abs(amount) >= 10_000_000 ? 0 : 1,
  }).format(amount);
}

export function formatBusinessMoney(value: number, business: Pick<Business, "currency" | "country">, decimals = false): string {
  return formatMoney(value, business.currency, business.country, decimals);
}

export function formatCompactBusinessMoney(value: number, business: Pick<Business, "currency" | "country">): string {
  return formatCompactMoney(value, business.currency, business.country);
}

// Kept as compatibility helpers for Nigerian demo data and older callers.
export function formatNaira(value: number, decimals = false): string {
  return formatMoney(value, "NGN", "NG", decimals);
}

export function formatCompactNaira(value: number): string {
  return formatCompactMoney(value, "NGN", "NG");
}

export function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function createId(_prefix = ""): string {
  void _prefix;
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (character) => {
    const random = Math.floor(Math.random() * 16);
    return (character === "x" ? random : (random & 0x3) | 0x8).toString(16);
  });
}

export function todayIso(): string {
  const date = new Date();
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

export function lagosDate(value: string | Date = new Date()): string {
  return businessDate(value, { timezone: "Africa/Lagos" });
}

export function toIsoDate(date: Date): string {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

export function parseLocalDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatDate(value: string | null | undefined, options?: Intl.DateTimeFormatOptions, timezone = "Africa/Lagos", country = "NG"): string {
  if (!value) return "—";
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
  const date = dateOnly ? parseLocalDate(value) : new Date(value);
  if (!date || Number.isNaN(date.getTime())) return "—";
  const formatOptions = { ...(dateOnly ? {} : { timeZone: timezone || "UTC" }), ...(options ?? { day: "numeric", month: "short", year: "numeric" }) };
  return new Intl.DateTimeFormat(localeForCountry(country), formatOptions).format(date);
}

export function formatBusinessDate(value: string | null | undefined, business: Pick<Business, "country" | "timezone">, options?: Intl.DateTimeFormatOptions): string {
  return formatDate(value, options, business.timezone, business.country);
}

export function formatDateTime(value: string | null | undefined, timezone = "Africa/Lagos", country = "NG"): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(localeForCountry(country), { timeZone: timezone || "UTC", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(date);
}

export function businessDate(value: string | Date, business: Pick<Business, "timezone">): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return todayIso();
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: business.timezone || "UTC", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const fields = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${fields.year}-${fields.month}-${fields.day}`;
}

export function normalizeText(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function normalizeReference(value: string | null | undefined): string {
  return (value ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function normalizePhone(value: string | null | undefined): string {
  let digits = (value ?? "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("234") && digits.length >= 13) digits = `0${digits.slice(3)}`;
  else if (digits.length === 10) digits = `0${digits}`;
  return digits;
}

export function phoneForWhatsApp(value: string | null | undefined): string {
  let digits = (value ?? "").replace(/\D/g, "");
  if (digits.startsWith("0") && digits.length === 11) digits = `234${digits.slice(1)}`;
  if (digits.startsWith("234")) return digits;
  return digits;
}

export function addDaysIso(dateValue: string, days: number): string {
  const date = parseLocalDate(dateValue) ?? new Date();
  date.setDate(date.getDate() + days);
  return toIsoDate(date);
}

export function daysBetween(start: string, end: string): number {
  const a = parseLocalDate(start);
  const b = parseLocalDate(end);
  if (!a || !b) return Number.POSITIVE_INFINITY;
  return Math.floor((b.getTime() - a.getTime()) / 86_400_000);
}

export function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("") || "?";
}

export function downloadCsv(filename: string, rows: Array<Record<string, string | number | boolean | null | undefined>>): void {
  if (typeof window === "undefined") return;
  const columns = Array.from(new Set(rows.flatMap((row) => Object.keys(row))));
  const csvCell = (value: unknown) => {
    let text = value === null || value === undefined ? "" : String(value);
    // Prevent spreadsheet formula execution when user-supplied names/descriptions are exported.
    if (typeof value === "string" && /^[\s]*[=+@-]/.test(value)) text = `'${text}`;
    return `"${text.replace(/"/g, '""')}"`;
  };
  const content = [columns.map(csvCell).join(","), ...rows.map((row) => columns.map((column) => csvCell(row[column])).join(","))].join("\r\n");
  const blob = new Blob(["\ufeff", content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}
