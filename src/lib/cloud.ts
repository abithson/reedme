import type { SupabaseClient } from "@supabase/supabase-js";
import type { Business, Customer, ImportRecord, MoneyException, Order, Transaction, TransactionMatch, Workspace } from "@/lib/types";
import { currencyForCountry, normalizeCountryCode } from "@/lib/localization";
import { normalizePhone } from "@/lib/utils";

export type CloudBusiness = Business & { role: string };

function throwIfError(error: { message: string } | null): void {
  if (error) throw new Error(error.message);
}

function safeObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function str(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : value === null || value === undefined ? fallback : String(value);
}

function num(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function mapBusiness(row: Record<string, unknown>, role = "owner"): CloudBusiness {
  const country = normalizeCountryCode(row.country);
  return {
    id: str(row.id),
    name: str(row.name),
    businessType: str(row.business_type, "retail"),
    country,
    currency: str(row.currency, currencyForCountry(country)),
    timezone: str(row.timezone, "UTC"),
    createdAt: str(row.created_at, new Date().toISOString()),
    updatedAt: str(row.updated_at, new Date().toISOString()),
    role,
  };
}

export async function getUserBusinesses(client: SupabaseClient): Promise<CloudBusiness[]> {
  const { data: memberships, error } = await client.from("business_members").select("business_id, role, created_at").order("created_at", { ascending: true });
  throwIfError(error);
  if (!memberships?.length) return [];
  const ids = memberships.map((membership) => membership.business_id as string);
  const { data: businesses, error: businessError } = await client.from("businesses").select("*").in("id", ids);
  throwIfError(businessError);
  const roleById = new Map(memberships.map((membership) => [membership.business_id as string, str(membership.role, "member")]));
  return (businesses ?? []).map((business) => mapBusiness(business as Record<string, unknown>, roleById.get(business.id as string) ?? "member"));
}

export async function createCloudBusiness(client: SupabaseClient, name: string, businessType: string, country: string, timezone: string): Promise<CloudBusiness> {
  const normalizedCountry = normalizeCountryCode(country);
  const currency = currencyForCountry(normalizedCountry);
  const { data, error } = await client.rpc("create_business", {
    business_name: name,
    business_type: businessType,
    business_country: normalizedCountry,
    business_currency: currency,
    business_timezone: timezone || "UTC",
  });
  throwIfError(error);
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new Error("The workspace was created but no business record was returned.");
  return mapBusiness(row as Record<string, unknown>, "owner");
}

export async function loadCloudWorkspace(client: SupabaseClient, business: CloudBusiness): Promise<Workspace> {
  const businessId = business.id;
  const [customersResult, ordersResult, transactionsResult, importsResult, matchesResult, exceptionsResult, auditResult] = await Promise.all([
    client.from("customers").select("*").eq("business_id", businessId).order("created_at", { ascending: false }),
    client.from("orders").select("*").eq("business_id", businessId).order("order_date", { ascending: false }),
    client.from("transactions").select("*").eq("business_id", businessId).order("transaction_date", { ascending: false }),
    client.from("imports").select("*").eq("business_id", businessId).order("created_at", { ascending: false }),
    client.from("transaction_matches").select("*").eq("business_id", businessId).order("confirmed_at", { ascending: true }),
    client.from("exceptions").select("*").eq("business_id", businessId).order("created_at", { ascending: false }),
    client.from("audit_logs").select("*").eq("business_id", businessId).order("created_at", { ascending: false }).limit(1000),
  ]);
  for (const result of [customersResult, ordersResult, transactionsResult, importsResult, matchesResult, exceptionsResult, auditResult]) throwIfError(result.error);

  const customers: Customer[] = (customersResult.data ?? []).map((row) => ({
    id: str(row.id), name: str(row.name), phone: str(row.phone), phoneNormalized: str(row.phone_normalized) || normalizePhone(str(row.phone)),
    email: str(row.email), notes: str(row.notes), createdAt: str(row.created_at), updatedAt: str(row.updated_at),
  }));
  const orders: Order[] = (ordersResult.data ?? []).map((row) => ({
    id: str(row.id), orderNumber: str(row.order_number), customerId: row.customer_id ? str(row.customer_id) : null,
    customerName: str(row.customer_name), customerPhone: str(row.customer_phone), orderDate: str(row.order_date).slice(0, 10), dueDate: str(row.due_date).slice(0, 10),
    amount: num(row.amount), recordedPaid: num(row.recorded_paid), paymentMethod: str(row.payment_method), notes: str(row.notes),
    duplicateFlag: Boolean(row.duplicate_flag), createdAt: str(row.created_at), updatedAt: str(row.updated_at),
  }));
  const transactions: Transaction[] = (transactionsResult.data ?? []).map((row) => ({
    id: str(row.id), importId: row.import_id ? str(row.import_id) : null, transactionDate: str(row.transaction_date), reference: str(row.reference),
    description: str(row.description), amount: num(row.amount), type: str(row.transaction_type, "credit") as Transaction["type"],
    senderName: str(row.sender_name), senderPhone: str(row.sender_phone), channel: str(row.channel), balance: row.balance === null ? null : num(row.balance),
    matchedOrderId: row.matched_order_id ? str(row.matched_order_id) : null, matchStatus: str(row.match_status, "unmatched") as Transaction["matchStatus"],
    confidence: row.confidence === null ? null : num(row.confidence), matchReason: str(row.match_reason), duplicateFlag: Boolean(row.duplicate_flag),
    duplicateOf: row.duplicate_of ? str(row.duplicate_of) : null, rawRow: Object.fromEntries(Object.entries(safeObject(row.raw_row)).map(([key, value]) => [key, str(value)])),
    createdAt: str(row.created_at), updatedAt: str(row.updated_at),
  }));
  const imports: ImportRecord[] = (importsResult.data ?? []).map((row) => ({
    id: str(row.id), kind: str(row.kind, "transactions") as ImportRecord["kind"], fileName: str(row.file_name), source: str(row.source, "csv"),
    rowsSeen: num(row.rows_seen), importedCount: num(row.imported_count), duplicateCount: num(row.duplicate_count), invalidCount: num(row.invalid_count),
    matchedCount: num(row.matched_count), unmatchedCount: num(row.unmatched_count), needsReviewCount: num(row.needs_review_count), createdAt: str(row.created_at),
  }));
  const matches: TransactionMatch[] = (matchesResult.data ?? []).map((row) => ({
    id: str(row.id), transactionId: str(row.transaction_id), orderId: str(row.order_id), amount: num(row.amount), confidence: num(row.confidence),
    method: str(row.match_method) === "automatic" ? "automatic" : "manual_review", confirmedBy: row.confirmed_by ? str(row.confirmed_by) : null,
    confirmedAt: str(row.confirmed_at), createdAt: str(row.created_at),
  }));
  const exceptions: MoneyException[] = (exceptionsResult.data ?? []).map((row) => ({
    id: str(row.id), fingerprint: str(row.fingerprint), type: str(row.type) as MoneyException["type"], severity: str(row.severity, "medium") as MoneyException["severity"],
    state: str(row.state, "open") as MoneyException["state"], title: str(row.title), description: str(row.description), amount: num(row.amount),
    relatedOrderId: row.related_order_id ? str(row.related_order_id) : null, relatedTransactionId: row.related_transaction_id ? str(row.related_transaction_id) : null,
    evidence: safeObject(row.evidence) as MoneyException["evidence"], resolvedAt: row.resolved_at ? str(row.resolved_at) : null,
    createdAt: str(row.created_at), updatedAt: str(row.updated_at),
  }));
  const auditLogs = (auditResult.data ?? []).map((row) => ({
    id: str(row.id), actorUserId: row.actor_user_id ? str(row.actor_user_id) : null, action: str(row.action), entityType: str(row.entity_type),
    entityId: row.entity_id ? str(row.entity_id) : null, details: safeObject(row.details) as Workspace["auditLogs"][number]["details"], createdAt: str(row.created_at),
  }));

  return { business, customers, orders, transactions, imports, matches, exceptions, auditLogs };
}

function changedRows<T extends { id: string }>(next: T[], previous: T[]): T[] {
  const previousById = new Map(previous.map((row) => [row.id, JSON.stringify(row)]));
  return next.filter((row) => previousById.get(row.id) !== JSON.stringify(row));
}

async function upsertRows(client: SupabaseClient, table: string, rows: Record<string, unknown>[]): Promise<void> {
  if (!rows.length) return;
  const { error } = await client.from(table).upsert(rows, { onConflict: "id" });
  throwIfError(error);
}

export async function saveCloudWorkspace(client: SupabaseClient, workspace: Workspace, previous: Workspace, actorUserId: string | null): Promise<void> {
  const businessChanged = JSON.stringify(workspace.business) !== JSON.stringify(previous.business);
  if (businessChanged) {
    const { error } = await client.from("businesses").update({
      name: workspace.business.name,
      business_type: workspace.business.businessType,
      country: workspace.business.country,
      currency: workspace.business.currency,
      timezone: workspace.business.timezone,
      updated_at: workspace.business.updatedAt,
    }).eq("id", workspace.business.id);
    throwIfError(error);
  }

  const customers = changedRows(workspace.customers, previous.customers).map((row) => ({
    id: row.id, business_id: workspace.business.id, name: row.name, phone: row.phone || null, phone_normalized: row.phoneNormalized || null,
    email: row.email || null, notes: row.notes || null, created_at: row.createdAt, updated_at: row.updatedAt,
  }));
  const imports = changedRows(workspace.imports, previous.imports).map((row) => ({
    id: row.id, business_id: workspace.business.id, kind: row.kind, file_name: row.fileName, source: row.source,
    rows_seen: row.rowsSeen, imported_count: row.importedCount, duplicate_count: row.duplicateCount, invalid_count: row.invalidCount,
    matched_count: row.matchedCount, unmatched_count: row.unmatchedCount, needs_review_count: row.needsReviewCount, created_at: row.createdAt,
  }));
  const orders = changedRows(workspace.orders, previous.orders).map((row) => ({
    id: row.id, business_id: workspace.business.id, customer_id: row.customerId, order_number: row.orderNumber, customer_name: row.customerName,
    customer_phone: row.customerPhone || null, order_date: row.orderDate, due_date: row.dueDate || null, amount: row.amount,
    recorded_paid: row.recordedPaid, payment_method: row.paymentMethod || null, notes: row.notes || null, duplicate_flag: row.duplicateFlag,
    created_at: row.createdAt, updated_at: row.updatedAt,
  }));
  const transactions = changedRows(workspace.transactions, previous.transactions).map((row) => ({
    id: row.id, business_id: workspace.business.id, import_id: row.importId, transaction_date: row.transactionDate, reference: row.reference || null,
    description: row.description, amount: row.amount, transaction_type: row.type, sender_name: row.senderName || null, sender_phone: row.senderPhone || null,
    channel: row.channel || null, balance: row.balance, matched_order_id: row.matchedOrderId, match_status: row.matchStatus,
    confidence: row.confidence, match_reason: row.matchReason || null, duplicate_flag: row.duplicateFlag, duplicate_of: row.duplicateOf,
    raw_row: row.rawRow, created_at: row.createdAt, updated_at: row.updatedAt,
  }));
  const matches = changedRows(workspace.matches, previous.matches).map((row) => ({
    id: row.id, business_id: workspace.business.id, transaction_id: row.transactionId, order_id: row.orderId, amount: row.amount,
    confidence: row.confidence, match_method: row.method, confirmed_by: row.confirmedBy ?? actorUserId, confirmed_at: row.confirmedAt, created_at: row.createdAt,
  }));
  const exceptions = changedRows(workspace.exceptions, previous.exceptions).map((row) => ({
    id: row.id, business_id: workspace.business.id, fingerprint: row.fingerprint, type: row.type, severity: row.severity, state: row.state,
    title: row.title, description: row.description, amount: row.amount, related_order_id: row.relatedOrderId, related_transaction_id: row.relatedTransactionId,
    evidence: row.evidence, resolved_at: row.resolvedAt, created_at: row.createdAt, updated_at: row.updatedAt,
  }));
  const auditLogs = changedRows(workspace.auditLogs, previous.auditLogs).map((row) => ({
    id: row.id, business_id: workspace.business.id, actor_user_id: row.actorUserId ?? actorUserId, action: row.action,
    entity_type: row.entityType, entity_id: row.entityId, details: row.details, created_at: row.createdAt,
  }));

  await upsertRows(client, "customers", customers);
  await upsertRows(client, "imports", imports);
  await upsertRows(client, "orders", orders);
  await upsertRows(client, "transactions", transactions);
  // Append-only collections are inserted once and never upserted over prior history.
  if (matches.length) {
    const { error } = await client.from("transaction_matches").insert(matches);
    throwIfError(error);
  }
  await upsertRows(client, "exceptions", exceptions);
  if (auditLogs.length) {
    const { error } = await client.from("audit_logs").insert(auditLogs);
    throwIfError(error);
  }
}

export function emptyCloudWorkspace(business: CloudBusiness): Workspace {
  return {
    business,
    customers: [], orders: [], transactions: [], imports: [], matches: [], exceptions: [], auditLogs: [],
  };
}
