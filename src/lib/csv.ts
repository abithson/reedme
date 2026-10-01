import Papa from "papaparse";
import type { Customer, ImportKind, Order, TransactionType } from "@/lib/types";
import { CURRENCY_BY_COUNTRY, currencyForCountry, currencySign, isCountryCode, localeForCountry, normalizeCountryCode } from "@/lib/localization";
import { normalizePhone, normalizeText, roundMoney } from "@/lib/utils";

export type ImportField = "name" | "phone" | "email" | "notes" | "orderNumber" | "customerName" | "customerPhone" | "orderDate" | "dueDate" | "amount" | "creditAmount" | "debitAmount" | "recordedPaid" | "paymentMethod" | "transactionDate" | "reference" | "description" | "transactionType" | "senderName" | "senderPhone" | "channel" | "balance";
export type ColumnMapping = Partial<Record<ImportField, string>>;

export type ParsedCsv = {
  headers: string[];
  rows: Array<{ line: number; values: Record<string, string> }>;
  errors: string[];
};

export type CustomerCsvRow = {
  kind: "customers";
  line: number;
  name: string;
  phone: string;
  phoneNormalized: string;
  email: string;
  notes: string;
  raw: Record<string, string>;
};

export type OrderCsvRow = {
  kind: "orders";
  line: number;
  orderNumber: string;
  customerName: string;
  customerPhone: string;
  orderDate: string;
  dueDate: string;
  amount: number;
  recordedPaid: number;
  paymentMethod: string;
  notes: string;
  raw: Record<string, string>;
};

export type TransactionCsvRow = {
  kind: "transactions";
  line: number;
  transactionDate: string;
  reference: string;
  description: string;
  amount: number;
  type: TransactionType;
  senderName: string;
  senderPhone: string;
  channel: string;
  balance: number | null;
  raw: Record<string, string>;
};

export type CsvRow = CustomerCsvRow | OrderCsvRow | TransactionCsvRow;
export type InvalidCsvRow = { line: number; raw: Record<string, string>; reasons: string[] };
export type ValidationResult = { valid: CsvRow[]; invalid: InvalidCsvRow[] };

export const IMPORT_FIELDS: Record<ImportKind, Array<{ key: ImportField; label: string; required?: boolean }>> = {
  customers: [
    { key: "name", label: "Customer name", required: true },
    { key: "phone", label: "Phone number" },
    { key: "email", label: "Email address" },
    { key: "notes", label: "Notes" },
  ],
  orders: [
    { key: "orderNumber", label: "Order number / reference", required: true },
    { key: "customerName", label: "Customer name", required: true },
    { key: "customerPhone", label: "Customer phone" },
    { key: "orderDate", label: "Order date", required: true },
    { key: "dueDate", label: "Due date" },
    { key: "amount", label: "Order amount", required: true },
    { key: "recordedPaid", label: "Already paid" },
    { key: "paymentMethod", label: "Payment method" },
    { key: "notes", label: "Notes / items" },
  ],
  transactions: [
    { key: "transactionDate", label: "Transaction date", required: true },
    { key: "amount", label: "Amount" },
    { key: "creditAmount", label: "Credit column" },
    { key: "debitAmount", label: "Debit column" },
    { key: "transactionType", label: "Credit / debit" },
    { key: "description", label: "Description" },
    { key: "reference", label: "Reference" },
    { key: "senderName", label: "Sender / payer" },
    { key: "senderPhone", label: "Sender phone" },
    { key: "channel", label: "Channel / source" },
    { key: "balance", label: "Running balance" },
  ],
};

const SYNONYMS: Record<ImportField, string[]> = {
  name: ["name", "customer", "customer name", "client", "client name", "buyer", "buyer name"],
  phone: ["phone", "phone number", "mobile", "mobile number", "telephone", "whatsapp", "contact"],
  email: ["email", "email address", "e mail"],
  notes: ["notes", "note", "items", "products", "description"],
  orderNumber: ["order number", "order no", "order id", "invoice", "invoice number", "reference", "ref"],
  customerName: ["customer name", "customer", "client name", "buyer", "buyer name", "name"],
  customerPhone: ["customer phone", "phone", "phone number", "mobile", "whatsapp", "contact"],
  orderDate: ["order date", "sale date", "date", "created at", "created date"],
  dueDate: ["due date", "payment due", "expected payment date"],
  amount: ["amount", "amount ngn", "amount naira", "value", "total", "order amount"],
  creditAmount: ["credit", "credit amount", "credits", "paid in", "money in", "deposit amount"],
  debitAmount: ["debit", "debit amount", "debits", "paid out", "money out", "withdrawal amount"],
  recordedPaid: ["paid", "amount paid", "recorded paid", "deposit", "already paid"],
  paymentMethod: ["payment method", "method", "payment type"],
  transactionDate: ["transaction date", "value date", "posting date", "date", "transaction time", "time"],
  reference: ["transaction reference", "reference", "ref", "narration ref", "session id", "rrn", "order number"],
  description: ["description", "narration", "details", "particulars", "remarks", "transaction details"],
  transactionType: ["type", "transaction type", "dr cr", "debit credit", "direction", "credit debit"],
  senderName: ["sender", "sender name", "payer", "payer name", "originator", "customer name", "beneficiary"],
  senderPhone: ["sender phone", "payer phone", "phone number", "mobile", "phone"],
  channel: ["channel", "source", "payment channel", "instrument", "method"],
  balance: ["balance", "running balance", "available balance"],
};

function normalizeHeader(value: string): string {
  return normalizeText(value.replace(/[_-]/g, " "));
}

export function parseCsvText(text: string): ParsedCsv {
  const parsed = Papa.parse<string[]>(text, { skipEmptyLines: "greedy", dynamicTyping: false });
  const rows = parsed.data;
  if (!rows.length) return { headers: [], rows: [], errors: parsed.errors.map((error) => error.message) };
  const headers = rows[0].map((header, index) => header.trim() || `Column ${index + 1}`);
  const data = rows.slice(1).map((row, rowIndex) => {
    const values: Record<string, string> = {};
    headers.forEach((header, index) => { values[header] = (row[index] ?? "").trim(); });
    return { line: rowIndex + 2, values };
  }).filter((row) => Object.values(row.values).some(Boolean));
  return { headers, rows: data, errors: parsed.errors.map((error) => `Row ${(error.row ?? 0) + 1}: ${error.message}`) };
}

export function inferColumnMapping(kind: ImportKind, headers: string[]): ColumnMapping {
  const mapping: ColumnMapping = {};
  const fields = IMPORT_FIELDS[kind];
  const normalizedHeaders = headers.map((header) => ({ original: header, normalized: normalizeHeader(header) }));
  for (const field of fields) {
    const synonyms = SYNONYMS[field.key].map(normalizeHeader);
    const match = normalizedHeaders.find((header) => synonyms.includes(header.normalized))
      ?? normalizedHeaders.find((header) => synonyms.some((synonym) => synonym.length > 4 && header.normalized.includes(synonym)));
    if (match) mapping[field.key] = match.original;
  }
  return mapping;
}

const KNOWN_CURRENCIES = new Set(Object.values(CURRENCY_BY_COUNTRY));

export function parseMoneyAmount(value: string | null | undefined, country = "NG"): { amount: number; negative: boolean } | null {
  if (!value || !value.trim()) return null;
  const text = value.trim();
  const countryCode = normalizeCountryCode(country);
  const selectedCurrency = currencyForCountry(countryCode);
  const letters = text.match(/[A-Za-z]+/g) ?? [];
  if (letters.some((word) => {
    const token = word.toUpperCase();
    if (token.length === 3 && KNOWN_CURRENCIES.has(token)) return token !== selectedCurrency;
    return !(token.length === 2 && token === countryCode && text.toUpperCase().includes(`${countryCode}$`) && isCountryCode(token));
  })) return null;
  const symbols = text.match(/\p{Sc}/gu) ?? [];
  const selectedSign = currencySign(selectedCurrency, countryCode);
  if (symbols.some((symbol) => !selectedSign.includes(symbol))) return null;

  const negative = /^\s*\(/.test(text) && /\)\s*$/.test(text) || /^\s*-/.test(text) || /-\s*$/.test(text);
  const numeric = text
    .replace(/[A-Za-z]+/g, "")
    .replace(/[()\s\p{Sc}]/gu, "")
    .replace(/[^\d.,+-]/g, "");
  const sign = numeric.startsWith("-") || numeric.startsWith("+") ? numeric[0] : "";
  const unsigned = numeric.replace(/^[+-]/, "").replace(/[+-]/g, "");
  if (!unsigned || !/^[\d.,]+$/.test(unsigned)) return null;

  const currencyDigits = new Intl.NumberFormat(localeForCountry(countryCode), {
    style: "currency",
    currency: selectedCurrency,
  }).resolvedOptions().maximumFractionDigits ?? 2;
  const lastDot = unsigned.lastIndexOf(".");
  const lastComma = unsigned.lastIndexOf(",");
  const lastSeparator = Math.max(lastDot, lastComma);
  const digitsAfterLast = lastSeparator >= 0 ? unsigned.length - lastSeparator - 1 : 0;
  const hasDecimal = digitsAfterLast > 0 && digitsAfterLast <= Math.max(currencyDigits, 2);
  const wholePart = (hasDecimal ? unsigned.slice(0, lastSeparator) : unsigned).replace(/[.,]/g, "");
  const fractionPart = hasDecimal ? unsigned.slice(lastSeparator + 1).replace(/[.,]/g, "") : "";
  if (!wholePart || (hasDecimal && !fractionPart)) return null;
  const normalized = `${sign === "-" ? "-" : ""}${wholePart}${hasDecimal ? `.${fractionPart}` : ""}`;
  if (!/^\d+(?:\.\d+)?$/.test(normalized.replace(/^-/, ""))) return null;
  const amount = Number(normalized);
  if (!Number.isFinite(amount)) return null;
  return { amount: roundMoney(Math.abs(amount)), negative: negative || sign === "-" };
}

export function parseNairaAmount(value: string | null | undefined): { amount: number; negative: boolean } | null {
  return parseMoneyAmount(value, "NG");
}

function parseClock(value: string): { hour: number; minute: number; second: number } | null {
  const match = value.match(/^(\d{1,2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?\s*(am|pm)?$/i);
  if (!match) return null;
  let hour = Number(match[1]);
  const meridiem = match[4]?.toLowerCase();
  if (meridiem === "pm" && hour < 12) hour += 12;
  if (meridiem === "am" && hour === 12) hour = 0;
  const minute = Number(match[2]);
  const second = Number(match[3] ?? "0");
  return hour > 23 || minute > 59 || second > 59 ? null : { hour, minute, second };
}

function localDateTimeToIso(year: number, month: number, day: number, time: { hour: number; minute: number; second: number }, timezone: string): string {
  const target = Date.UTC(year, month - 1, day, time.hour, time.minute, time.second);
  let candidate = target;
  try {
    const formatter = new Intl.DateTimeFormat("en-CA-u-ca-gregory", {
      timeZone: timezone || "UTC", year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
    });
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const values = Object.fromEntries(formatter.formatToParts(new Date(candidate)).map((part) => [part.type, part.value]));
      const represented = Date.UTC(Number(values.year), Number(values.month) - 1, Number(values.day), Number(values.hour), Number(values.minute), Number(values.second));
      const adjustment = target - represented;
      if (!adjustment) break;
      candidate += adjustment;
    }
  } catch {
    // Invalid or unavailable timezone data falls back to UTC rather than rejecting an otherwise valid CSV row.
    candidate = target;
  }
  return new Date(candidate).toISOString();
}

export function parseBankDate(value: string | null | undefined, country = "NG", keepTime = false, timezone = "UTC"): string | null {
  if (!value?.trim()) return null;
  const text = value.trim();
  const iso = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ](.+))?$/);
  if (iso) {
    const year = Number(iso[1]);
    const month = Number(iso[2]);
    const day = Number(iso[3]);
    const check = new Date(Date.UTC(year, month - 1, day));
    if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) return null;
    const date = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    if (!keepTime || !iso[4]) return date;
    if (/(?:Z|[+-]\d{2}:?\d{2})$/i.test(iso[4])) {
      const parsed = new Date(text);
      return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
    }
    const time = parseClock(iso[4]);
    return time ? localDateTimeToIso(year, month, day, time, timezone) : null;
  }
  const local = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(am|pm)?)?$/i);
  if (local) {
    // ISO dates are unambiguous. For slash dates, use US month/day order only for the US; other supported countries use day/month.
    const monthFirst = normalizeCountryCode(country) === "US";
    const day = Number(monthFirst ? local[2] : local[1]);
    const month = Number(monthFirst ? local[1] : local[2]);
    const yearText = local[3];
    const year = Number(yearText.length === 2 ? `20${yearText}` : yearText);
    const check = new Date(Date.UTC(year, month - 1, day));
    if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) return null;
    const date = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    if (!keepTime || !local[4]) return date;
    const time = parseClock(`${local[4]}:${local[5]}:${local[6] ?? "00"}${local[7] ? ` ${local[7]}` : ""}`);
    return time ? localDateTimeToIso(year, month, day, time, timezone) : null;
  }
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return null;
  return keepTime ? parsed.toISOString() : parsed.toISOString().slice(0, 10);
}

export function parseNigerianDate(value: string | null | undefined, keepTime = false): string | null {
  return parseBankDate(value, "NG", keepTime, "Africa/Lagos");
}

function valueFor(row: Record<string, string>, mapping: ColumnMapping, field: ImportField): string {
  const column = mapping[field];
  return column ? (row[column] ?? "").trim() : "";
}

function transactionType(value: string, negative: boolean): TransactionType {
  const normalized = normalizeText(value);
  if (/debit|withdraw|outflow|paid out|dr/.test(normalized)) return "debit";
  if (/credit|deposit|inflow|paid in|cr/.test(normalized)) return "credit";
  return negative ? "debit" : "credit";
}

export function validateCsvRows(kind: ImportKind, rows: ParsedCsv["rows"], mapping: ColumnMapping, country = "NG", timezone = "Africa/Lagos"): ValidationResult {
  const valid: CsvRow[] = [];
  const invalid: InvalidCsvRow[] = [];
  const localDateHint = normalizeCountryCode(country) === "US" ? "MM/DD/YYYY" : "DD/MM/YYYY";
  for (const { line, values: raw } of rows) {
    const reasons: string[] = [];
    if (kind === "customers") {
      const name = valueFor(raw, mapping, "name");
      if (!name) reasons.push("Customer name is required.");
      if (name.length > 160) reasons.push("Customer name must be 160 characters or fewer.");
      if (reasons.length) invalid.push({ line, raw, reasons });
      else {
        const phone = valueFor(raw, mapping, "phone");
        valid.push({ kind, line, name, phone, phoneNormalized: normalizePhone(phone), email: valueFor(raw, mapping, "email"), notes: valueFor(raw, mapping, "notes"), raw });
      }
    } else if (kind === "orders") {
      const orderNumber = valueFor(raw, mapping, "orderNumber");
      const customerName = valueFor(raw, mapping, "customerName");
      const orderDate = parseBankDate(valueFor(raw, mapping, "orderDate"), country);
      const dueText = valueFor(raw, mapping, "dueDate");
      const dueDate = dueText ? parseBankDate(dueText, country) : "";
      const amount = parseMoneyAmount(valueFor(raw, mapping, "amount"), country);
      const paidText = valueFor(raw, mapping, "recordedPaid");
      const recordedPaid = paidText ? parseMoneyAmount(paidText, country) : { amount: 0, negative: false };
      if (!orderNumber) reasons.push("Order number is required.");
      if (!customerName) reasons.push("Customer name is required.");
      if (!orderDate) reasons.push(`Order date is missing or is not a valid ${localDateHint} or YYYY-MM-DD date.`);
      if (dueText && !dueDate) reasons.push("Due date is not valid.");
      if (!amount) reasons.push("Order amount is missing or not a valid amount.");
      else if (amount.negative || amount.amount <= 0) reasons.push("Order amount must be greater than zero.");
      if (!recordedPaid) reasons.push("Already-paid amount is not a valid amount.");
      else if (recordedPaid.negative) reasons.push("Already-paid amount cannot be negative.");
      if (amount && recordedPaid && recordedPaid.amount > amount.amount + 1) reasons.push("Already-paid amount cannot exceed the order amount.");
      if (reasons.length) invalid.push({ line, raw, reasons });
      else {
        valid.push({
          kind, line, orderNumber, customerName, customerPhone: valueFor(raw, mapping, "customerPhone"), orderDate: orderDate!, dueDate: dueDate || "",
          amount: amount!.amount, recordedPaid: recordedPaid!.amount, paymentMethod: valueFor(raw, mapping, "paymentMethod"), notes: valueFor(raw, mapping, "notes"), raw,
        });
      }
    } else {
      const transactionDate = parseBankDate(valueFor(raw, mapping, "transactionDate"), country, true, timezone);
      const amountText = valueFor(raw, mapping, "amount");
      const creditText = valueFor(raw, mapping, "creditAmount");
      const debitText = valueFor(raw, mapping, "debitAmount");
      const amount = amountText ? parseMoneyAmount(amountText, country) : null;
      const credit = creditText ? parseMoneyAmount(creditText, country) : null;
      const debit = debitText ? parseMoneyAmount(debitText, country) : null;
      if (!transactionDate) reasons.push(`Transaction date is missing or is not a valid ${localDateHint} or YYYY-MM-DD date.`);
      if ((creditText && !credit) || (debitText && !debit)) reasons.push("Credit or debit column contains an invalid amount.");
      if (!mapping.amount && !mapping.creditAmount && !mapping.debitAmount) reasons.push("Map an amount column, or map separate credit and debit columns.");
      if (amountText && !amount) reasons.push("Amount is not a valid amount.");
      const bothSidesFilled = Boolean(credit && credit.amount > 0 && debit && debit.amount > 0);
      if (bothSidesFilled) reasons.push("This row has both a credit and a debit amount; review the source row.");
      const selectedAmount = amount ?? (credit && credit.amount > 0 ? credit : debit && debit.amount > 0 ? debit : credit ?? debit);
      if (!selectedAmount) reasons.push("Amount is missing on this row.");
      else if (selectedAmount.amount <= 0) reasons.push("Amount must be greater than zero.");
      const balanceText = valueFor(raw, mapping, "balance");
      const balance = balanceText ? parseMoneyAmount(balanceText, country) : null;
      if (balanceText && !balance) reasons.push("Running balance is not a valid amount.");
      if (reasons.length) invalid.push({ line, raw, reasons });
      else {
        const fallbackType = debitText && debit && debit.amount > 0 ? "debit" : creditText && credit && credit.amount > 0 ? "credit" : "";
        const type = fallbackType || transactionType(valueFor(raw, mapping, "transactionType"), selectedAmount!.negative);
        valid.push({
          kind, line, transactionDate: transactionDate!, reference: valueFor(raw, mapping, "reference"),
          description: valueFor(raw, mapping, "description") || "Transaction imported from CSV",
          amount: selectedAmount!.amount, type, senderName: valueFor(raw, mapping, "senderName"), senderPhone: valueFor(raw, mapping, "senderPhone"),
          channel: valueFor(raw, mapping, "channel") || "CSV import", balance: balance?.amount ?? null, raw,
        });
      }
    }
  }
  return { valid, invalid };
}

export function missingRequiredMappings(kind: ImportKind, mapping: ColumnMapping): string[] {
  const missing = IMPORT_FIELDS[kind].filter((field) => field.required && !mapping[field.key]).map((field) => field.label);
  if (kind === "transactions" && !mapping.amount && !mapping.creditAmount && !mapping.debitAmount) {
    missing.push("Amount or separate credit/debit columns");
  }
  return missing;
}

export function rowDuplicateKey(row: CsvRow): string {
  if (row.kind === "transactions") {
    return row.reference
      ? `transaction:${normalizeText(row.reference)}:${row.amount.toFixed(2)}:${row.transactionDate.slice(0, 10)}`
      : `transaction:${normalizeText(row.senderName)}:${normalizeText(row.description)}:${row.amount.toFixed(2)}:${row.transactionDate.slice(0, 10)}`;
  }
  if (row.kind === "orders") return `order:${normalizeText(row.orderNumber)}`;
  return row.phoneNormalized ? `customer:${row.phoneNormalized}` : `customer-name:${normalizeText(row.name)}`;
}

export function sameCustomerIdentity(candidate: CustomerCsvRow, customer: Customer): boolean {
  if (candidate.phoneNormalized && customer.phoneNormalized) return candidate.phoneNormalized === customer.phoneNormalized;
  return normalizeText(candidate.name) === normalizeText(customer.name);
}

export function csvOrderToOrder(row: OrderCsvRow, id: string, customer: Customer | null, now: string, duplicateFlag = false): Order {
  return {
    id,
    orderNumber: row.orderNumber,
    customerId: customer?.id ?? null,
    customerName: row.customerName,
    customerPhone: row.customerPhone || customer?.phone || "",
    orderDate: row.orderDate,
    dueDate: row.dueDate,
    amount: row.amount,
    recordedPaid: row.recordedPaid,
    paymentMethod: row.paymentMethod,
    notes: row.notes,
    duplicateFlag,
    createdAt: now,
    updatedAt: now,
  };
}
