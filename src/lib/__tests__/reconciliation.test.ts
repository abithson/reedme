import { describe, expect, it } from "vitest";
import type { Order, Transaction, Workspace } from "@/lib/types";
import { createDemoWorkspace } from "@/lib/seed";
import { exceptionSeverity, getDashboardSummary, linkTransactionToOrder, orderPaid, orderRemaining, reconcileWorkspace } from "@/lib/reconciliation";

const NOW = "2026-10-01T12:00:00.000Z";

function order(overrides: Partial<Order> = {}): Order {
  return {
    id: "order-1", orderNumber: "ORD-1001", customerId: "customer-1", customerName: "Ada Okafor", customerPhone: "08030000001",
    orderDate: "2026-09-29", dueDate: "2026-10-10", amount: 100_000, recordedPaid: 0, paymentMethod: "Bank transfer", notes: "Rice and provisions",
    duplicateFlag: false, createdAt: NOW, updatedAt: NOW, ...overrides,
  };
}

function transaction(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: "transaction-1", importId: null, transactionDate: "2026-09-30T12:00:00.000Z", reference: "NIP-12345",
    description: "Transfer from Ada Okafor for order ORD-1001", amount: 100_000, type: "credit", senderName: "Ada Okafor", senderPhone: "08030000001",
    channel: "Bank transfer", balance: null, matchedOrderId: null, matchStatus: "unmatched", confidence: null, matchReason: "",
    duplicateFlag: false, duplicateOf: null, rawRow: {}, createdAt: NOW, updatedAt: NOW, ...overrides,
  };
}

function workspace(orders: Order[], transactions: Transaction[] = []): Workspace {
  return {
    business: { id: "business-1", name: "Test business", businessType: "retail", country: "NG", currency: "NGN", timezone: "Africa/Lagos", createdAt: NOW, updatedAt: NOW },
    customers: [], orders, transactions, imports: [], matches: [], exceptions: [], auditLogs: [],
  };
}

describe("deterministic reconciliation", () => {
  it("auto-links a unique high-confidence transaction with a visible explanation", () => {
    const result = reconcileWorkspace(workspace([order()], [transaction()]), { now: NOW, autoMatch: true });
    expect(result.transactions[0].matchStatus).toBe("matched");
    expect(result.transactions[0].matchedOrderId).toBe("order-1");
    expect(result.transactions[0].matchReason).toContain("Order reference ORD-1001");
    expect(result.matches).toHaveLength(1);
    expect(orderRemaining(result, "order-1")).toBe(0);
  });

  it("leaves a plausible but uncertain name/amount match for a human", () => {
    const unreferenced = transaction({ reference: "NIP-OTHER", description: "Transfer received", senderName: "Ada Okafor", senderPhone: "", amount: 100_000 });
    const result = reconcileWorkspace(workspace([order()], [unreferenced]), { now: NOW, autoMatch: true });
    expect(result.transactions[0].matchStatus).toBe("possible");
    expect(result.transactions[0].matchedOrderId).toBeNull();
    expect(result.matches).toHaveLength(0);
    expect(result.exceptions.some((exception) => exception.type === "UNMATCHED_PAYMENT")).toBe(true);
  });

  it("does not auto-link when two orders score equally", () => {
    const second = order({ id: "order-2", orderNumber: "ORD-1002" });
    const tx = transaction({ description: "Transfer from Ada Okafor", senderPhone: "", reference: "NIP-9988" });
    const result = reconcileWorkspace(workspace([order(), second], [tx]), { now: NOW, autoMatch: true });
    expect(result.transactions[0].matchStatus).toBe("possible");
    expect(result.transactions[0].matchedOrderId).toBeNull();
  });

  it("does not allocate two partial transfers past the order balance", () => {
    const first = transaction({ id: "tx-part-1", amount: 60_000, reference: "NIP-PART-1" });
    const second = transaction({ id: "tx-part-2", amount: 60_000, reference: "NIP-PART-2", transactionDate: "2026-10-01T10:00:00.000Z" });
    const result = reconcileWorkspace(workspace([order()], [first, second]), { now: NOW, autoMatch: true });
    expect(result.transactions.find((item) => item.id === "tx-part-1")?.matchStatus).toBe("matched");
    expect(result.transactions.find((item) => item.id === "tx-part-2")?.matchStatus).toBe("possible");
    expect(orderRemaining(result, "order-1")).toBe(40_000);
  });

  it("keeps a declared full/final settlement with the wrong amount for review", () => {
    const finalPayment = transaction({ amount: 80_000, description: "Final settlement for order ORD-1001", reference: "NIP-FINAL" });
    const result = reconcileWorkspace(workspace([order()], [finalPayment]), { now: NOW, autoMatch: true });
    expect(result.transactions[0].matchStatus).toBe("possible");
    expect(result.transactions[0].matchedOrderId).toBeNull();
    expect(result.exceptions).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "AMOUNT_MISMATCH", amount: 20_000, relatedOrderId: "order-1" }),
    ]));
  });

  it("never matches a debit to a customer order", () => {
    const debit = transaction({ type: "debit", description: "Supplier payment ORD-1001" });
    const result = reconcileWorkspace(workspace([order()], [debit]), { now: NOW, autoMatch: true });
    expect(result.transactions[0].matchStatus).toBe("unmatched");
    expect(result.matches).toHaveLength(0);
  });

  it("keeps duplicate evidence visible and blocks it from automatic matching", () => {
    const original = transaction({ id: "tx-a", reference: "NIP-DUP-1" });
    const duplicate = transaction({ id: "tx-b", reference: "NIP-DUP-1", duplicateFlag: true, duplicateOf: "tx-a" });
    const result = reconcileWorkspace(workspace([order()], [original, duplicate]), { now: NOW, autoMatch: true });
    expect(result.transactions).toHaveLength(2);
    expect(result.transactions.find((item) => item.id === "tx-b")?.matchStatus).toBe("unmatched");
    expect(result.exceptions.some((exception) => exception.type === "POSSIBLE_DUPLICATE")).toBe(true);
    // The original is linked; the duplicate follower remains visible for review but isn't counted twice.
    expect(getDashboardSummary(result, NOW).unmatchedIncoming).toBe(0);
  });

  it("supports manual partial allocation but refuses to over-allocate", () => {
    const tx = transaction({ amount: 40_000, description: "Transfer received", reference: "NIP-OTHER", senderName: "Unknown" });
    const base = workspace([order()], [tx]);
    const linked = linkTransactionToOrder(base, tx.id, "order-1", { now: NOW });
    expect(linked.error).toBeUndefined();
    expect(orderPaid(linked.workspace, "order-1")).toBe(40_000);
    expect(orderRemaining(linked.workspace, "order-1")).toBe(60_000);
    const tooLarge = transaction({ id: "tx-large", amount: 110_000, description: "Incoming credit", reference: "NIP-X" });
    const rejected = linkTransactionToOrder(workspace([order()], [tooLarge]), tooLarge.id, "order-1", { now: NOW });
    expect(rejected.error).toContain("larger than the remaining order balance");
  });

  it("flags unpaid and overdue balances with concrete amounts", () => {
    const overdue = order({ dueDate: "2026-09-01" });
    const result = reconcileWorkspace(workspace([overdue]), { now: NOW, autoMatch: true });
    expect(result.exceptions).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "OVERDUE_PAYMENT", relatedOrderId: "order-1", amount: 100_000 }),
    ]));
  });

  it("uses workspace currency and observed amounts for exception thresholds", () => {
    const usWorkspace = workspace([order({ amount: 1_200 })]);
    usWorkspace.business = { ...usWorkspace.business, country: "US", currency: "USD", timezone: "America/New_York" };
    const result = reconcileWorkspace(usWorkspace, { now: NOW, autoMatch: false });
    const unpaid = result.exceptions.find((exception) => exception.type === "UNPAID_ORDER");
    expect(unpaid?.description).toContain("$1,200");
    expect(unpaid?.severity).toBe("medium");
    expect(exceptionSeverity("UNPAID_ORDER", 6_000, 1_000)).toBe("high");
    expect(exceptionSeverity("UNPAID_ORDER", 5_000, 1_000)).toBe("high");
  });

  it("flags an outlier relative to local incoming payments without a Naira floor", () => {
    const typical = Array.from({ length: 10 }, (_, index) => transaction({
      id: `small-${index}`, reference: `STATEMENT-${index}`, description: "Statement credit", amount: 1_000, senderName: "", senderPhone: "",
    }));
    const outlier = transaction({ id: "small-outlier", reference: "STATEMENT-OUTLIER", description: "Statement credit", amount: 10_000, senderName: "", senderPhone: "" });
    const result = reconcileWorkspace(workspace([], [...typical, outlier]), { now: NOW, autoMatch: false });
    expect(result.exceptions).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "UNUSUAL_TRANSACTION", relatedTransactionId: "small-outlier", amount: 10_000 }),
    ]));
  });

  it("seeds the requested realistic demo scale", () => {
    const demo = createDemoWorkspace();
    expect(demo.customers).toHaveLength(50);
    expect(demo.orders).toHaveLength(100);
    expect(demo.transactions).toHaveLength(200);
    expect(demo.transactions.filter((item) => item.duplicateFlag)).toHaveLength(8);
    expect(demo.orders.some((item) => orderRemaining(demo, item.id) > 1)).toBe(true);
    expect(demo.exceptions.length).toBeGreaterThan(0);
    expect(demo.exceptions.some((exception) => exception.type === "AMOUNT_MISMATCH")).toBe(true);
    expect(demo.exceptions.some((exception) => exception.type === "UNUSUAL_TRANSACTION")).toBe(true);
  });
});
