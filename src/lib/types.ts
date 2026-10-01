export type Business = {
  id: string;
  name: string;
  businessType: string;
  country: string;
  currency: string;
  timezone: string;
  createdAt: string;
  updatedAt: string;
};

export type Customer = {
  id: string;
  name: string;
  phone: string;
  phoneNormalized: string;
  email: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
};

export type Order = {
  id: string;
  orderNumber: string;
  customerId: string | null;
  customerName: string;
  customerPhone: string;
  orderDate: string;
  dueDate: string;
  amount: number;
  recordedPaid: number;
  paymentMethod: string;
  notes: string;
  duplicateFlag: boolean;
  createdAt: string;
  updatedAt: string;
};

export type TransactionType = "credit" | "debit";
export type MatchStatus = "unmatched" | "possible" | "matched" | "ignored";

export type Transaction = {
  id: string;
  importId: string | null;
  transactionDate: string;
  reference: string;
  description: string;
  amount: number;
  type: TransactionType;
  senderName: string;
  senderPhone: string;
  channel: string;
  balance: number | null;
  matchedOrderId: string | null;
  matchStatus: MatchStatus;
  confidence: number | null;
  matchReason: string;
  duplicateFlag: boolean;
  duplicateOf: string | null;
  rawRow: Record<string, string>;
  createdAt: string;
  updatedAt: string;
};

export type ImportKind = "customers" | "orders" | "transactions";

export type ImportRecord = {
  id: string;
  kind: ImportKind;
  fileName: string;
  source: string;
  rowsSeen: number;
  importedCount: number;
  duplicateCount: number;
  invalidCount: number;
  matchedCount: number;
  unmatchedCount: number;
  needsReviewCount: number;
  createdAt: string;
};

export type TransactionMatch = {
  id: string;
  transactionId: string;
  orderId: string;
  amount: number;
  confidence: number;
  method: "automatic" | "manual_review";
  confirmedBy: string | null;
  confirmedAt: string;
  createdAt: string;
};

export type ExceptionType =
  | "UNMATCHED_PAYMENT"
  | "UNPAID_ORDER"
  | "PARTIAL_PAYMENT"
  | "OVERDUE_PAYMENT"
  | "POSSIBLE_DUPLICATE"
  | "AMOUNT_MISMATCH"
  | "UNUSUAL_TRANSACTION";

export type ExceptionState = "open" | "resolved" | "dismissed";
export type Severity = "low" | "medium" | "high";

export type MoneyException = {
  id: string;
  fingerprint: string;
  type: ExceptionType;
  severity: Severity;
  state: ExceptionState;
  title: string;
  description: string;
  amount: number;
  relatedOrderId: string | null;
  relatedTransactionId: string | null;
  evidence: Record<string, string | number | boolean | null | string[]>;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AuditLog = {
  id: string;
  actorUserId: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  details: Record<string, string | number | boolean | null>;
  createdAt: string;
};

export type Workspace = {
  business: Business;
  customers: Customer[];
  orders: Order[];
  transactions: Transaction[];
  imports: ImportRecord[];
  matches: TransactionMatch[];
  exceptions: MoneyException[];
  auditLogs: AuditLog[];
};

export type MatchCandidate = {
  orderId: string;
  score: number;
  reasons: string[];
  amountMismatch: boolean;
};

export type DashboardSummary = {
  expected: number;
  received: number;
  outstanding: number;
  unmatchedIncoming: number;
  attentionAmount: number;
  openExceptions: number;
  overdueOrders: number;
  unmatchedCount: number;
  updatedAt: string;
};
