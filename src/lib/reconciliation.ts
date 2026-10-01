import type {
  AuditLog,
  DashboardSummary,
  ExceptionState,
  ExceptionType,
  MatchCandidate,
  MoneyException,
  Order,
  Severity,
  Transaction,
  TransactionMatch,
  Workspace,
} from "@/lib/types";
import {
  createId,
  formatBusinessMoney,
  businessDate,
  daysBetween,
  normalizePhone,
  normalizeReference,
  normalizeText,
  roundMoney,
} from "@/lib/utils";

export const POSSIBLE_MATCH_THRESHOLD = 0.42;
export const HIGH_CONFIDENCE_THRESHOLD = 0.78;

function latestAllocationByTransaction(workspace: Workspace): Map<string, TransactionMatch> {
  const result = new Map<string, TransactionMatch>();
  for (const match of [...workspace.matches].sort((a, b) => a.confirmedAt.localeCompare(b.confirmedAt))) {
    result.set(match.transactionId, match);
  }
  return result;
}

export function orderPaid(workspace: Workspace, orderId: string): number {
  const allocationByTransaction = latestAllocationByTransaction(workspace);
  const allocated = workspace.transactions.reduce((sum, transaction) => {
    if (transaction.matchedOrderId !== orderId || transaction.matchStatus !== "matched") return sum;
    const allocation = allocationByTransaction.get(transaction.id);
    return sum + (allocation?.orderId === orderId ? allocation.amount : transaction.amount);
  }, 0);
  const order = workspace.orders.find((candidate) => candidate.id === orderId);
  return roundMoney((order?.recordedPaid ?? 0) + allocated);
}

export function orderRemaining(workspace: Workspace, orderId: string): number {
  const order = workspace.orders.find((candidate) => candidate.id === orderId);
  if (!order) return 0;
  return roundMoney(Math.max(0, order.amount - orderPaid(workspace, orderId)));
}

function phoneMatches(transaction: Transaction, order: Order): boolean {
  const expected = normalizePhone(order.customerPhone);
  if (!expected) return false;
  const actual = normalizePhone(transaction.senderPhone);
  if (actual && actual === expected) return true;
  const sourceDigits = `${transaction.description} ${transaction.reference} ${Object.values(transaction.rawRow).join(" ")}`.replace(/\D/g, "");
  const expectedTail = expected.slice(-10);
  return expectedTail.length === 10 && sourceDigits.includes(expectedTail);
}

function hasStrongNameMatch(transaction: Transaction, order: Order): boolean {
  const name = normalizeText(order.customerName);
  if (!name) return false;
  const source = normalizeText(`${transaction.senderName} ${transaction.description}`);
  if (source.includes(name)) return true;
  const tokens = name.split(" ").filter((token) => token.length > 2);
  if (tokens.length >= 2) return tokens.filter((token) => source.includes(token)).length >= 2;
  return tokens.length === 1 && source.split(" ").includes(tokens[0]);
}

function referenceMatches(transaction: Transaction, order: Order): boolean {
  const ref = normalizeReference(order.orderNumber);
  if (ref.length < 4) return false;
  const imported = normalizeReference(`${transaction.reference} ${transaction.description}`);
  return imported.includes(ref);
}

function candidateScore(transaction: Transaction, order: Order, remaining: number): MatchCandidate {
  let score = 0;
  const reasons: string[] = [];
  const hasReference = referenceMatches(transaction, order);
  const hasPhone = phoneMatches(transaction, order);
  const hasName = hasStrongNameMatch(transaction, order);
  const difference = Math.abs(transaction.amount - remaining);
  const exactAmount = difference <= 1;
  const plausiblePartial = transaction.amount > 1 && transaction.amount < remaining - 1;
  const explicitFullSettlement = hasFinalSettlementLanguage(transaction);
  const amountMismatch = transaction.amount > remaining + 1 || (explicitFullSettlement && difference > 1);

  if (hasReference) {
    score += 0.52;
    reasons.push(`Order reference ${order.orderNumber} appears in the transaction`);
  }
  if (hasPhone) {
    score += 0.24;
    reasons.push("Customer phone matches");
  }
  if (hasName) {
    score += 0.20;
    reasons.push(`Customer name matches ${order.customerName}`);
  }
  if (exactAmount) {
    score += 0.18;
    reasons.push("Amount equals the remaining order balance");
  } else if (plausiblePartial) {
    score += 0.07;
    reasons.push("Amount could be a partial payment");
  } else if (amountMismatch) {
    reasons.push(explicitFullSettlement && transaction.amount <= remaining + 1
      ? "Description calls this a final/full settlement, but the amount does not equal the remaining balance"
      : "Transaction is greater than the order's remaining balance");
  }

  const transactionDay = transaction.transactionDate.slice(0, 10);
  const days = Math.abs(daysBetween(order.orderDate, transactionDay));
  if (days <= 3) {
    score += 0.10;
    reasons.push("Transaction is within 3 days of the order");
  } else if (days <= 7) {
    score += 0.05;
    reasons.push("Transaction is within 7 days of the order");
  }

  return { orderId: order.id, score: Math.min(1, roundMoney(score)), reasons, amountMismatch };
}

export function getMatchCandidates(workspace: Workspace, transaction: Transaction): MatchCandidate[] {
  if (transaction.type !== "credit" || transaction.duplicateFlag || transaction.duplicateOf) return [];
  return workspace.orders
    .map((order) => ({ order, remaining: orderRemaining(workspace, order.id) }))
    .filter(({ order, remaining }) => remaining > 1 && !order.duplicateFlag)
    .map(({ order, remaining }) => candidateScore(transaction, order, remaining))
    .filter((candidate) => candidate.score >= POSSIBLE_MATCH_THRESHOLD)
    .sort((a, b) => b.score - a.score || a.orderId.localeCompare(b.orderId));
}

function audit(
  action: string,
  entityType: string,
  entityId: string | null,
  details: AuditLog["details"],
  now: string,
  actorUserId: string | null = null,
): AuditLog {
  return { id: createId("audit"), actorUserId, action, entityType, entityId, details, createdAt: now };
}

function isHighConfidence(candidates: MatchCandidate[]): boolean {
  const [best, second] = candidates;
  return Boolean(
    best &&
      best.score >= HIGH_CONFIDENCE_THRESHOLD &&
      !best.amountMismatch &&
      (!second || best.score - second.score >= 0.12),
  );
}

function withMatchFields(current: Transaction, fields: Pick<Transaction, "matchedOrderId" | "matchStatus" | "confidence" | "matchReason">, now: string): Transaction {
  const unchanged = current.matchedOrderId === fields.matchedOrderId && current.matchStatus === fields.matchStatus &&
    current.confidence === fields.confidence && current.matchReason === fields.matchReason;
  return { ...current, ...fields, updatedAt: unchanged ? current.updatedAt : now };
}

export type ReconcileOptions = {
  autoMatch?: boolean;
  now?: string;
  actorUserId?: string | null;
};

export function reconcileWorkspace(workspace: Workspace, options: ReconcileOptions = {}): Workspace {
  const now = options.now ?? new Date().toISOString();
  const autoMatch = options.autoMatch ?? true;
  const next: Workspace = { ...workspace, transactions: [...workspace.transactions], matches: [...workspace.matches], auditLogs: [...workspace.auditLogs] };
  const txById = new Map(next.transactions.map((transaction) => [transaction.id, transaction]));
  const eligible = [...next.transactions]
    .filter((transaction) => transaction.type === "credit" && transaction.matchStatus !== "matched" && transaction.matchStatus !== "ignored")
    .sort((a, b) => a.transactionDate.localeCompare(b.transactionDate));

  for (const transaction of eligible) {
    const current = txById.get(transaction.id);
    if (!current) continue;
    // Reflect earlier matches before scoring the next transaction so an order's open balance shrinks.
    next.transactions = next.transactions.map((candidate) => txById.get(candidate.id) ?? candidate);
    const candidates = getMatchCandidates(next, current);
    const best = candidates[0];
    if (!best) {
      const updated = withMatchFields(current, { matchedOrderId: null, matchStatus: "unmatched", confidence: null, matchReason: "No open order has enough matching evidence yet." }, now);
      txById.set(updated.id, updated);
      continue;
    }

    if (autoMatch && isHighConfidence(candidates)) {
      const order = next.orders.find((candidate) => candidate.id === best.orderId);
      const updated = withMatchFields(current, {
        matchedOrderId: best.orderId,
        matchStatus: "matched",
        confidence: best.score,
        matchReason: best.reasons.join(" · "),
      }, now);
      txById.set(updated.id, updated);
      const match: TransactionMatch = {
        id: createId("match"),
        transactionId: updated.id,
        orderId: best.orderId,
        amount: updated.amount,
        confidence: best.score,
        method: "automatic",
        confirmedBy: options.actorUserId ?? null,
        confirmedAt: now,
        createdAt: now,
      };
      next.matches.push(match);
      next.auditLogs.push(audit("transaction.auto_matched", "transaction", updated.id, {
        orderId: best.orderId,
        orderNumber: order?.orderNumber ?? "",
        confidence: best.score,
      }, now, options.actorUserId ?? null));
    } else {
      const updated = withMatchFields(current, {
        matchedOrderId: null,
        matchStatus: best.score >= POSSIBLE_MATCH_THRESHOLD ? "possible" : "unmatched",
        confidence: best.score,
        matchReason: best.reasons.join(" · "),
      }, now);
      txById.set(updated.id, updated);
    }
  }

  next.transactions = next.transactions.map((transaction) => txById.get(transaction.id) ?? transaction);
  next.exceptions = refreshExceptions(next, now);
  return next;
}

function detectDuplicatePairs(workspace: Workspace): Array<{ first: Transaction; second: Transaction }> {
  const transactions = [...workspace.transactions].sort((a, b) => a.transactionDate.localeCompare(b.transactionDate));
  const pairs: Array<{ first: Transaction; second: Transaction }> = [];
  const seen = new Set<string>();

  for (let index = 0; index < transactions.length; index += 1) {
    const first = transactions[index];
    for (let nextIndex = index + 1; nextIndex < transactions.length; nextIndex += 1) {
      const second = transactions[nextIndex];
      const linkedByFlag = first.duplicateOf === second.id || second.duplicateOf === first.id;
      const sameReference = normalizeReference(first.reference) !== "" && normalizeReference(first.reference) === normalizeReference(second.reference);
      const nearInTime = Math.abs(daysBetween(first.transactionDate.slice(0, 10), second.transactionDate.slice(0, 10))) <= 3;
      const sameAmount = Math.abs(first.amount - second.amount) <= 1 && first.type === second.type;
      const marked = first.duplicateFlag && (first.duplicateOf === second.id || second.duplicateOf === first.id);
      const explicitReferencePair = sameReference && sameAmount && nearInTime;
      if (!(marked || linkedByFlag || (explicitReferencePair && first.type === "credit"))) continue;
      const ids = [first.id, second.id].sort();
      const fingerprint = ids.join(":");
      if (seen.has(fingerprint)) continue;
      seen.add(fingerprint);
      pairs.push({ first, second });
    }
  }

  // A flag can be useful even when its original row has been removed or was not imported locally.
  for (const transaction of transactions) {
    if (!transaction.duplicateFlag || transaction.duplicateOf) continue;
    const fingerprint = `${transaction.id}:unpaired`;
    if (!seen.has(fingerprint)) pairs.push({ first: transaction, second: transaction });
  }
  return pairs;
}

function duplicateFollowerIds(workspace: Workspace): Set<string> {
  const result = new Set<string>();
  for (const { first, second } of detectDuplicatePairs(workspace)) {
    if (first.id === second.id) continue;
    if (second.duplicateOf === first.id) result.add(second.id);
    else if (first.duplicateOf === second.id) result.add(first.id);
    else result.add(second.id);
  }
  return result;
}

function hasFinalSettlementLanguage(transaction: Transaction): boolean {
  return /\b(final|full|settlement|settle|complete|balance paid)\b/i.test(`${transaction.reference} ${transaction.description}`);
}

function buildExceptionCandidates(workspace: Workspace, now: string): MoneyException[] {
  const candidates: MoneyException[] = [];
  const duplicateFollowers = duplicateFollowerIds(workspace);
  const allocations = latestAllocationByTransaction(workspace);
  const date = businessDate(now, workspace.business);
  const money = (value: number) => formatBusinessMoney(value, workspace.business);
  const medianOf = (values: number[]) => {
    const sorted = [...values].filter((value) => value > 0).sort((a, b) => a - b);
    return sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0;
  };
  const medianIncoming = medianOf(workspace.transactions
    .filter((transaction) => transaction.type === "credit" && !duplicateFollowers.has(transaction.id))
    .map((transaction) => transaction.amount));
  const medianOrder = medianOf(workspace.orders.map((order) => order.amount));
  const highIncomingAmount = (medianIncoming || medianOrder) * 5;
  const highOrderAmount = (medianOrder || medianIncoming) * 5;
  const add = (value: Omit<MoneyException, "id" | "createdAt" | "updatedAt" | "resolvedAt" | "state">) => {
    candidates.push({
      ...value,
      id: createId("exception"),
      state: "open",
      resolvedAt: null,
      createdAt: now,
      updatedAt: now,
    });
  };

  for (const order of workspace.orders) {
    const remaining = orderRemaining(workspace, order.id);
    if (remaining <= 1) continue;
    const paid = orderPaid(workspace, order.id);
    const overdue = Boolean(order.dueDate && order.dueDate < date);
    const type: ExceptionType = overdue ? "OVERDUE_PAYMENT" : paid > 1 ? "PARTIAL_PAYMENT" : "UNPAID_ORDER";
    const title = overdue ? "Overdue balance" : paid > 1 ? "Partially paid order" : "Unpaid order";
    const description = overdue
      ? `${order.customerName} still owes ${money(remaining)} on ${order.orderNumber}. The due date was ${order.dueDate}.`
      : paid > 1
        ? `${order.customerName} has paid ${money(paid)} of ${money(order.amount)} for ${order.orderNumber}.`
        : `${order.customerName} has no recorded payment for ${order.orderNumber}, worth ${money(remaining)}.`;
    add({
      fingerprint: `order-balance:${order.id}:${type}`,
      type,
      severity: overdue || (highOrderAmount > 0 && remaining >= highOrderAmount) ? "high" : "medium",
      title,
      description,
      amount: remaining,
      relatedOrderId: order.id,
      relatedTransactionId: null,
      evidence: { orderNumber: order.orderNumber, orderAmount: order.amount, paid, balance: remaining, dueDate: order.dueDate || null },
    });
  }

  for (const transaction of workspace.transactions) {
    if (transaction.type === "credit" && transaction.matchStatus !== "matched" && transaction.matchStatus !== "ignored" && !transaction.matchedOrderId && !duplicateFollowers.has(transaction.id)) {
      const suggestions = getMatchCandidates(workspace, transaction).slice(0, 3);
      const possible = transaction.matchStatus === "possible" && suggestions.length > 0;
      add({
        fingerprint: `unmatched-payment:${transaction.id}`,
        type: "UNMATCHED_PAYMENT",
        severity: highIncomingAmount > 0 && transaction.amount >= highIncomingAmount ? "high" : "medium",
        title: possible ? "Payment needs a match review" : "Incoming payment is unmatched",
        description: possible
          ? `This ${money(transaction.amount)} credit has a possible order match. Review the evidence before linking it.`
          : `An incoming ${money(transaction.amount)} transaction has not been linked to an order. Check the sender, reference, and date.`,
        amount: transaction.amount,
        relatedOrderId: null,
        relatedTransactionId: transaction.id,
        evidence: {
          reference: transaction.reference || null,
          date: transaction.transactionDate.slice(0, 10),
          sender: transaction.senderName || null,
          confidence: transaction.confidence,
          suggestedOrderIds: suggestions.map((candidate) => candidate.orderId),
          reasons: transaction.matchReason || null,
        },
      });
    }

    if (transaction.type === "credit" && hasFinalSettlementLanguage(transaction)) {
      const possibleOrder = workspace.orders.find((order) => referenceMatches(transaction, order));
      if (possibleOrder) {
        const matchedAllocation = transaction.matchStatus === "matched" && transaction.matchedOrderId === possibleOrder.id
          ? allocations.get(transaction.id)
          : undefined;
        const amountAlreadyApplied = transaction.matchStatus === "matched" && transaction.matchedOrderId === possibleOrder.id
          ? matchedAllocation?.orderId === possibleOrder.id ? matchedAllocation.amount : transaction.amount
          : 0;
        const expected = roundMoney(orderRemaining(workspace, possibleOrder.id) + amountAlreadyApplied);
        const difference = Math.abs(transaction.amount - expected);
        if (difference > 1) {
          add({
            fingerprint: `amount-mismatch:${transaction.id}:${possibleOrder.id}`,
            type: "AMOUNT_MISMATCH",
            severity: difference / Math.max(expected, 1) >= 0.25 ? "high" : "medium",
            title: "Settlement amount does not match",
            description: `The transaction says “final” or “full”, but ${possibleOrder.orderNumber} had an expected balance of ${money(expected)} before this row; the transaction is ${money(transaction.amount)}. Verify before linking.`,
            amount: difference,
            relatedOrderId: possibleOrder.id,
            relatedTransactionId: transaction.id,
            evidence: { expected, received: transaction.amount, difference, orderNumber: possibleOrder.orderNumber },
          });
        }
      }
    }
  }

  const pairs = detectDuplicatePairs(workspace);
  for (const { first, second } of pairs) {
    const duplicateId = first.id === second.id ? null : (first.duplicateOf === second.id ? first.id : second.id);
    add({
      fingerprint: `possible-duplicate:${[first.id, second.id].sort().join(":")}`,
      type: "POSSIBLE_DUPLICATE",
      severity: "medium",
      title: "Possible duplicate transaction",
      description: duplicateId
        ? `This row was imported with a duplicate flag. Both records are kept; compare the reference, date, and amount before deciding.`
        : `Two transaction rows share a reference and amount within three days. This may be a repeated export or two legitimate payments; both records are kept.`,
      amount: first.id === second.id ? first.amount : Math.min(first.amount, second.amount),
      relatedOrderId: null,
      relatedTransactionId: first.id,
      evidence: { transactionIds: first.id === second.id ? [first.id] : [first.id, second.id], firstReference: first.reference || null, secondReference: second.reference || null, duplicateOf: duplicateId },
    });
  }

  if (medianIncoming > 0 && workspace.transactions.filter((transaction) => transaction.type === "credit" && !duplicateFollowers.has(transaction.id)).length >= 10) {
    const threshold = medianIncoming * 5;
    for (const transaction of workspace.transactions) {
      if (transaction.type !== "credit" || duplicateFollowers.has(transaction.id) || transaction.amount <= threshold) continue;
      add({
        fingerprint: `unusual-transaction:${transaction.id}`,
        type: "UNUSUAL_TRANSACTION",
        severity: "high",
        title: "Unusually large incoming transaction",
        description: `This credit is more than five times the median imported incoming payment (${money(medianIncoming)}). This is a review flag, not a fraud finding.`,
        amount: transaction.amount,
        relatedOrderId: transaction.matchedOrderId,
        relatedTransactionId: transaction.id,
        evidence: { amount: transaction.amount, medianIncoming, threshold },
      });
    }
  }

  const duplicateOrders = new Map<string, Order[]>();
  for (const order of workspace.orders) {
    if (!order.duplicateFlag) continue;
    const sameNumber = workspace.orders.filter((item) => normalizeReference(item.orderNumber) === normalizeReference(order.orderNumber));
    if (sameNumber.length < 2) continue;
    duplicateOrders.set(normalizeReference(order.orderNumber), sameNumber);
  }
  for (const [normalizedNumber, orders] of duplicateOrders) {
    const ids = orders.map((order) => order.id).sort();
    const number = orders[0]?.orderNumber ?? normalizedNumber;
    add({
      fingerprint: `possible-duplicate-order:${normalizedNumber}:${ids.join(":")}`,
      type: "POSSIBLE_DUPLICATE",
      severity: "medium",
      title: "Repeated order reference",
      description: `More than one imported order uses ${number}. Check whether the rows are separate orders or repeated evidence before using the totals.`,
      amount: Math.min(...orders.map((order) => order.amount)),
      relatedOrderId: ids[0],
      relatedTransactionId: null,
      evidence: { orderNumber: number, orderIds: ids },
    });
  }

  return candidates;
}

function sourceUpdatedAt(exception: MoneyException, workspace: Workspace): string | null {
  if (exception.relatedTransactionId) return workspace.transactions.find((transaction) => transaction.id === exception.relatedTransactionId)?.updatedAt ?? null;
  if (exception.relatedOrderId) return workspace.orders.find((order) => order.id === exception.relatedOrderId)?.updatedAt ?? null;
  return null;
}

function refreshExceptions(workspace: Workspace, now: string): MoneyException[] {
  const existing = new Map(workspace.exceptions.map((exception) => [exception.fingerprint, exception]));
  const live = buildExceptionCandidates(workspace, now);
  const liveFingerprints = new Set(live.map((exception) => exception.fingerprint));
  const result: MoneyException[] = [];

  for (const exception of live) {
    const previous = existing.get(exception.fingerprint);
    if (!previous) {
      result.push(exception);
      continue;
    }
    let state = previous.state;
    let resolvedAt = previous.resolvedAt;
    const modifiedAt = sourceUpdatedAt(previous, workspace);
    if (state !== "open" && modifiedAt && previous.updatedAt && modifiedAt > previous.updatedAt) {
      state = "open";
      resolvedAt = null;
    }
    result.push({ ...exception, id: previous.id, state, resolvedAt, createdAt: previous.createdAt, updatedAt: previous.updatedAt });
  }

  for (const previous of workspace.exceptions) {
    if (liveFingerprints.has(previous.fingerprint) || previous.state !== "open") continue;
    result.push({ ...previous, state: "resolved", resolvedAt: now, updatedAt: now });
  }
  return result.sort((a, b) => {
    const states = { open: 0, resolved: 1, dismissed: 2 };
    return states[a.state] - states[b.state] || b.createdAt.localeCompare(a.createdAt);
  });
}

export function linkTransactionToOrder(
  workspace: Workspace,
  transactionId: string,
  orderId: string,
  options: { now?: string; actorUserId?: string | null } = {},
): { workspace: Workspace; error?: string } {
  const transaction = workspace.transactions.find((candidate) => candidate.id === transactionId);
  const order = workspace.orders.find((candidate) => candidate.id === orderId);
  if (!transaction || !order) return { workspace, error: "Transaction or order could not be found." };
  if (transaction.type !== "credit") return { workspace, error: "Only incoming credits can be linked to an order." };
  if (transaction.duplicateFlag || transaction.duplicateOf) return { workspace, error: "Review the duplicate flag before linking this transaction." };
  if (transaction.matchStatus === "matched" && transaction.matchedOrderId) return { workspace, error: "This transaction is already linked. Unlink it first." };
  const remaining = orderRemaining(workspace, orderId);
  if (remaining <= 1) return { workspace, error: "This order has no remaining balance." };
  if (transaction.amount > remaining + 1) return { workspace, error: "The transaction is larger than the remaining order balance. Keep it for review instead of allocating more than the evidence supports." };

  const now = options.now ?? new Date().toISOString();
  const match: TransactionMatch = {
    id: createId("match"),
    transactionId,
    orderId,
    amount: transaction.amount,
    confidence: transaction.confidence ?? 1,
    method: "manual_review",
    confirmedBy: options.actorUserId ?? null,
    confirmedAt: now,
    createdAt: now,
  };
  const updatedTransaction: Transaction = {
    ...transaction,
    matchedOrderId: orderId,
    matchStatus: "matched",
    confidence: transaction.confidence ?? 1,
    matchReason: `Manually confirmed by a workspace user for ${order.orderNumber}.`,
    updatedAt: now,
  };
  const next: Workspace = {
    ...workspace,
    transactions: workspace.transactions.map((candidate) => candidate.id === transactionId ? updatedTransaction : candidate),
    matches: [...workspace.matches, match],
    auditLogs: [...workspace.auditLogs, audit("transaction.manually_linked", "transaction", transactionId, { orderId, orderNumber: order.orderNumber, amount: transaction.amount }, now, options.actorUserId ?? null)],
  };
  return { workspace: reconcileWorkspace(next, { autoMatch: false, now, actorUserId: options.actorUserId }) };
}

export function unlinkTransaction(workspace: Workspace, transactionId: string, options: { now?: string; actorUserId?: string | null } = {}): Workspace {
  const transaction = workspace.transactions.find((candidate) => candidate.id === transactionId);
  if (!transaction?.matchedOrderId) return workspace;
  const now = options.now ?? new Date().toISOString();
  const oldOrder = workspace.orders.find((order) => order.id === transaction.matchedOrderId);
  const updated = workspace.transactions.map((candidate) => candidate.id === transactionId ? {
    ...candidate,
    matchedOrderId: null,
    matchStatus: "unmatched" as const,
    confidence: null,
    matchReason: "A workspace user unlinked this transaction. Review it again before allocating.",
    updatedAt: now,
  } : candidate);
  const next = {
    ...workspace,
    transactions: updated,
    // Match history is append-only; current allocation is determined by the transaction row.
    auditLogs: [...workspace.auditLogs, audit("transaction.unlinked", "transaction", transactionId, { previousOrderId: oldOrder?.id ?? null, previousOrderNumber: oldOrder?.orderNumber ?? "" }, now, options.actorUserId ?? null)],
  };
  return reconcileWorkspace(next, { autoMatch: false, now, actorUserId: options.actorUserId });
}

export function setExceptionState(workspace: Workspace, exceptionId: string, state: ExceptionState, options: { now?: string; actorUserId?: string | null } = {}): Workspace {
  const now = options.now ?? new Date().toISOString();
  const target = workspace.exceptions.find((exception) => exception.id === exceptionId);
  if (!target) return workspace;
  const updated = workspace.exceptions.map((exception) => exception.id === exceptionId ? {
    ...exception,
    state,
    resolvedAt: state === "open" ? null : now,
    updatedAt: now,
  } : exception);
  return {
    ...workspace,
    exceptions: updated,
    auditLogs: [...workspace.auditLogs, audit(`exception.${state}`, "exception", exceptionId, { type: target.type, fingerprint: target.fingerprint }, now, options.actorUserId ?? null)],
  };
}

export function getDashboardSummary(workspace: Workspace, now = new Date().toISOString()): DashboardSummary {
  const expected = roundMoney(workspace.orders.reduce((sum, order) => sum + order.amount, 0));
  const outstanding = roundMoney(workspace.orders.reduce((sum, order) => sum + orderRemaining(workspace, order.id), 0));
  const received = roundMoney(Math.max(0, expected - outstanding));
  const duplicateFollowers = duplicateFollowerIds(workspace);
  const unmatched = workspace.transactions.filter((transaction) => transaction.type === "credit" && transaction.matchStatus !== "matched" && transaction.matchStatus !== "ignored" && !transaction.matchedOrderId);
  const unmatchedIncoming = roundMoney(unmatched.reduce((sum, transaction) => {
    if (duplicateFollowers.has(transaction.id)) return sum;
    return sum + transaction.amount;
  }, 0));
  const today = businessDate(now, workspace.business);
  const overdueOrders = workspace.orders.filter((order) => orderRemaining(workspace, order.id) > 1 && order.dueDate && order.dueDate < today).length;
  return {
    expected,
    received,
    outstanding,
    unmatchedIncoming,
    attentionAmount: roundMoney(outstanding + unmatchedIncoming),
    openExceptions: workspace.exceptions.filter((exception) => exception.state === "open").length,
    overdueOrders,
    unmatchedCount: unmatched.length,
    updatedAt: now,
  };
}

export function getOpenExceptions(workspace: Workspace): MoneyException[] {
  return workspace.exceptions.filter((exception) => exception.state === "open");
}

export function exceptionLabel(type: ExceptionType): string {
  const labels: Record<ExceptionType, string> = {
    UNMATCHED_PAYMENT: "Unmatched money",
    UNPAID_ORDER: "Unpaid order",
    PARTIAL_PAYMENT: "Partial payment",
    OVERDUE_PAYMENT: "Overdue",
    POSSIBLE_DUPLICATE: "Possible duplicate",
    AMOUNT_MISMATCH: "Amount mismatch",
    UNUSUAL_TRANSACTION: "Unusual transaction",
  };
  return labels[type];
}

export function exceptionSeverity(type: ExceptionType, amount: number, typicalAmount = 0): Severity {
  if (type === "OVERDUE_PAYMENT" || type === "AMOUNT_MISMATCH" || type === "UNUSUAL_TRANSACTION") return "high";
  if (typicalAmount > 0 && amount >= typicalAmount * 5) return "high";
  return "medium";
}
