"use client";

import { useMemo, useState } from "react";
import { Check, Link2, Search, ShieldCheck } from "lucide-react";
import { useMoneyTrail } from "@/components/MoneyTrailProvider";
import { Button, Modal, Badge } from "@/components/ui";
import { getMatchCandidates, linkTransactionToOrder, orderRemaining, orderPaid } from "@/lib/reconciliation";
import { formatBusinessDate, formatBusinessMoney, normalizeText } from "@/lib/utils";

export default function MatchReviewModal({ transactionId, onClose }: { transactionId: string; onClose: () => void }) {
  const { workspace, commit } = useMoneyTrail();
  const money = (value: number) => formatBusinessMoney(value, workspace.business);
  const transaction = workspace.transactions.find((candidate) => candidate.id === transactionId);
  const [selectedOrderId, setSelectedOrderId] = useState("");
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const candidates = useMemo(() => transaction ? getMatchCandidates(workspace, transaction) : [], [workspace, transaction]);
  const openOrders = useMemo(() => workspace.orders
    .filter((order) => {
      const remaining = orderRemaining(workspace, order.id);
      return remaining > 1 && !order.duplicateFlag && transaction !== undefined && transaction.amount <= remaining + 1;
    })
    .filter((order) => !search || normalizeText(`${order.orderNumber} ${order.customerName} ${order.customerPhone}`).includes(normalizeText(search)))
    .sort((a, b) => Number(candidates.some((item) => item.orderId === b.id)) - Number(candidates.some((item) => item.orderId === a.id)) || (a.dueDate || "9999").localeCompare(b.dueDate || "9999")),
  [workspace, transaction, search, candidates]);

  if (!transaction) return <Modal title="Review payment" onClose={onClose}><div className="modal-body">This transaction could not be found.<div className="form-actions"><Button onClick={onClose}>Close</Button></div></div></Modal>;

  function confirmLink() {
    if (!selectedOrderId) { setError("Choose an order before confirming the link."); return; }
    const result = linkTransactionToOrder(workspace, transactionId, selectedOrderId);
    if (result.error) { setError(result.error); return; }
    commit(() => result.workspace);
    onClose();
  }

  const isDuplicate = transaction.duplicateFlag || Boolean(transaction.duplicateOf);
  return <Modal title="Review payment match" description="Compare the imported evidence with an open order. Confirming a link records your decision and can be undone." onClose={onClose} wide>
    <div className="modal-body">
      <div className="review-transaction-card"><div><span className="eyebrow">Incoming transaction</span><strong>{money(transaction.amount)}</strong><span>{formatBusinessDate(transaction.transactionDate, workspace.business)} · {transaction.channel || "CSV statement"}</span></div><div className="review-transaction-details"><b>{transaction.senderName || "Sender not identified"}</b><span>{transaction.description}</span><small>Reference: {transaction.reference || "Not recorded"}</small></div></div>
      {isDuplicate && <div className="form-error" style={{ marginTop: 12 }}><ShieldCheck size={14} />This row is flagged as a possible duplicate. Review that flag before linking.</div>}
      {transaction.matchReason && <div className="inline-notice" style={{ marginTop: 11 }}><strong>Matching evidence:</strong> {transaction.matchReason}</div>}
      <div className="review-order-heading"><div><h3>Suggested orders</h3><p>Ranked by reference, customer, amount and date signals.</p></div><Badge tone={candidates.length ? "amber" : "neutral"}>{candidates.length} suggestion{candidates.length === 1 ? "" : "s"}</Badge></div>
      {candidates.length > 0 ? <div className="candidate-list">{candidates.slice(0, 4).map((candidate) => {
        const order = workspace.orders.find((item) => item.id === candidate.orderId);
        if (!order) return null;
        const selected = selectedOrderId === order.id;
        return <button type="button" key={order.id} className={`candidate-card ${selected ? "candidate-selected" : ""}`} onClick={() => { setSelectedOrderId(order.id); setError(""); }} disabled={isDuplicate || transaction.amount > orderRemaining(workspace, order.id) + 1}>
          <span className="candidate-radio">{selected && <Check size={12} />}</span><span className="candidate-main"><strong>{order.orderNumber} · {order.customerName}</strong><small>{formatBusinessDate(order.orderDate, workspace.business)} · {order.notes || "Customer order"}</small><small>{candidate.reasons.join(" · ")}</small></span><span className="candidate-amount"><Badge tone={candidate.score >= 0.78 ? "green" : "amber"}>{Math.round(candidate.score * 100)}% match</Badge><strong>Balance {money(orderRemaining(workspace, order.id))}</strong></span>
        </button>;
      })}</div> : <div className="inline-notice" style={{ marginTop: 10 }}>No order has enough identifying evidence for an automatic suggestion. You can still search all open orders below and review the details.</div>}

      <label className="field" style={{ marginTop: 15 }}><span>Search open orders</span><div className="search-field"><Search size={14} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Order number or customer name…" /></div></label>
      <label className="field" style={{ marginTop: 10 }}><span>Order to link</span><select value={selectedOrderId} onChange={(event) => { setSelectedOrderId(event.target.value); setError(""); }} disabled={isDuplicate}><option value="">Choose an order…</option>{openOrders.map((order) => <option key={order.id} value={order.id}>{order.orderNumber} · {order.customerName} · remaining {money(orderRemaining(workspace, order.id))} · paid {money(orderPaid(workspace, order.id))}</option>)}</select><small className="field-hint">Orders with a lower remaining balance are excluded. MoneyTrail will not allocate more than the order balance.</small></label>
      {error && <div className="form-error">{error}</div>}
      {isDuplicate && <div className="field-hint" style={{ marginTop: 10 }}>To continue, mark this transaction as a separate payment from the duplicate exception first.</div>}
      <div className="form-actions"><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={confirmLink} disabled={isDuplicate || !selectedOrderId}>Confirm link <Link2 size={14} /></Button></div>
      <div className="review-audit-note"><ShieldCheck size={13} /> No payment record is changed at the bank. This links evidence to an order inside MoneyTrail.</div>
    </div>
  </Modal>;
}
