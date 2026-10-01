"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowRight, Bell, Check, CircleAlert, Copy, ExternalLink, Link2, MessageCircle, Search, ShieldAlert, X } from "lucide-react";
import { useMoneyTrail } from "@/components/MoneyTrailProvider";
import MatchReviewModal from "@/components/MatchReviewModal";
import { Badge, Button, Modal, PageHeader } from "@/components/ui";
import { exceptionLabel, setExceptionState } from "@/lib/reconciliation";
import { formatBusinessDate, formatBusinessMoney, normalizeText, phoneForWhatsApp } from "@/lib/utils";
import { localeForCountry } from "@/lib/localization";
import type { Business, MoneyException } from "@/lib/types";

const STATE_FILTERS = ["Open", "Resolved", "Dismissed"] as const;

function Evidence({ exception, business }: { exception: MoneyException; business: Pick<Business, "currency" | "country" | "timezone"> }) {
  const skipped = new Set(["transactionIds", "orderIds", "suggestedOrderIds", "duplicateOf"]);
  const entries = Object.entries(exception.evidence).filter(([key, value]) => !skipped.has(key) && value !== null && value !== "" && value !== undefined);
  if (!entries.length) return null;
  return <div className="exception-evidence">{entries.slice(0, 5).map(([key, value]) => {
    let display: string;
    if (typeof value === "number") display = ["expected", "received", "difference", "balance", "orderAmount"].includes(key) ? formatBusinessMoney(value, business) : key === "confidence" ? `${Math.round(value * 100)}%` : value.toLocaleString(localeForCountry(business.country));
    else if (typeof value === "boolean") display = value ? "Yes" : "No";
    else if (Array.isArray(value)) display = `${value.length} related records`;
    else if (typeof value === "string" && key.toLowerCase().includes("date")) display = formatBusinessDate(value, business);
    else display = String(value);
    const label = key.replace(/([A-Z])/g, " $1").replace(/^./, (letter) => letter.toUpperCase());
    return <span className="evidence-chip" key={key}>{label}: {display}</span>;
  })}</div>;
}

function ReminderModal({ exception, onClose }: { exception: MoneyException; onClose: () => void }) {
  const { workspace } = useMoneyTrail();
  const order = workspace.orders.find((candidate) => candidate.id === exception.relatedOrderId);
  const customer = order ? workspace.customers.find((candidate) => candidate.id === order.customerId) : undefined;
  const money = (value: number) => formatBusinessMoney(value, workspace.business);
  const [message, setMessage] = useState(() => order
    ? `Hi ${order.customerName}, just a friendly reminder from ${workspace.business.name} about the outstanding payment of ${money(exception.amount)} for order ${order.orderNumber}. Please let us know if you have already paid so we can update our records. Thank you.`
    : `Hi, this is a friendly payment reminder from ${workspace.business.name}. Please contact us if you have already paid so we can update our records. Thank you.`);
  const [copied, setCopied] = useState(false);
  const phone = phoneForWhatsApp(order?.customerPhone || customer?.phone || "");
  const whatsappUrl = phone ? `https://wa.me/${phone}?text=${encodeURIComponent(message)}` : "";
  async function copy() {
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }
  return <Modal title="Draft a payment reminder" description="Review and send it yourself. MoneyTrail does not send WhatsApp messages or contact customers automatically." onClose={onClose}>
    <div className="modal-body form-stack">
      {order && <div className="reminder-summary"><span className="eyebrow">Order balance</span><strong>{money(exception.amount)}</strong><span>{order.orderNumber} · due {formatBusinessDate(order.dueDate, workspace.business)}</span></div>}
      <label className="field"><span>Message</span><textarea value={message} onChange={(event) => setMessage(event.target.value)} rows={6} /></label>
      {!phone && <div className="inline-notice">No phone number is recorded for this customer. Copy the message and share it using your normal channel.</div>}
      {phone && <div className="field-hint">Prepared for {order?.customerPhone || customer?.phone}. Check the number before opening WhatsApp.</div>}
      <div className="form-actions"><Button variant="secondary" onClick={() => void copy()}>{copied ? <Check size={14} /> : <Copy size={14} />}{copied ? "Copied" : "Copy message"}</Button>{whatsappUrl && <a className="button button-primary button-md" href={whatsappUrl} target="_blank" rel="noreferrer">Open WhatsApp <ExternalLink size={14} /></a>}</div>
      <p className="fine-print">Sending a reminder does not change the order balance. Update the records only after you confirm payment.</p>
    </div>
  </Modal>;
}

function exceptionIcon(type: MoneyException["type"]) {
  if (type === "UNMATCHED_PAYMENT" || type === "AMOUNT_MISMATCH") return <CircleAlert size={17} />;
  if (type === "OVERDUE_PAYMENT" || type === "UNPAID_ORDER") return <Bell size={16} />;
  if (type === "POSSIBLE_DUPLICATE") return <Copy size={16} />;
  return <AlertTriangle size={16} />;
}

export default function ExceptionsPage() {
  const { workspace, commit } = useMoneyTrail();
  const money = (value: number) => formatBusinessMoney(value, workspace.business);
  const [state, setState] = useState<(typeof STATE_FILTERS)[number]>("Open");
  const [search, setSearch] = useState("");
  const [reviewId, setReviewId] = useState<string | null>(null);
  const [reminder, setReminder] = useState<MoneyException | null>(null);
  const [filterType, setFilterType] = useState("All types");
  const exceptions = useMemo(() => workspace.exceptions.filter((exception) => {
    const matchesState = exception.state === state.toLowerCase();
    const matchesType = filterType === "All types" || exception.type === filterType;
    const query = normalizeText(`${exception.title} ${exception.description} ${exception.type} ${exception.evidence.reference ?? ""} ${exception.evidence.orderNumber ?? ""}`);
    return matchesState && matchesType && (!search || query.includes(normalizeText(search)));
  }).sort((a, b) => (a.severity === b.severity ? b.amount - a.amount : a.severity === "high" ? -1 : 1)), [workspace.exceptions, state, filterType, search]);
  const openCount = workspace.exceptions.filter((exception) => exception.state === "open").length;
  const openAmount = workspace.exceptions.filter((exception) => exception.state === "open" && exception.type !== "POSSIBLE_DUPLICATE").reduce((sum, exception) => sum + exception.amount, 0);

  function updateState(exception: MoneyException, nextState: "resolved" | "dismissed") {
    commit((current) => setExceptionState(current, exception.id, nextState));
  }

  function markDuplicateAsSeparate(exception: MoneyException) {
    const ids = Array.isArray(exception.evidence.transactionIds) ? exception.evidence.transactionIds : [];
    const flagged = workspace.transactions.find((transaction) => transaction.duplicateOf && ids.includes(transaction.id))
      ?? workspace.transactions.find((transaction) => transaction.duplicateFlag && ids.includes(transaction.id));
    const now = new Date().toISOString();
    commit((current) => {
      let next = setExceptionState(current, exception.id, "dismissed", { now });
      if (flagged) next = { ...next, transactions: next.transactions.map((transaction) => transaction.id === flagged.id ? { ...transaction, duplicateFlag: false, duplicateOf: null, updatedAt: now, matchReason: "A workspace user reviewed this as a separate payment." } : transaction) };
      return next;
    });
  }

  function markDuplicateOrdersSeparate(exception: MoneyException) {
    const ids = Array.isArray(exception.evidence.orderIds) ? exception.evidence.orderIds : [];
    const now = new Date().toISOString();
    commit((current) => {
      const resolved = setExceptionState(current, exception.id, "dismissed", { now });
      return {
        ...resolved,
        orders: resolved.orders.map((order) => ids.includes(order.id) ? { ...order, duplicateFlag: false, updatedAt: now } : order),
      };
    });
  }

  return <>
    <PageHeader eyebrow="Review queue" title="Needs attention" description="Every flag explains what the imported records show. A flag is not a fraud verdict, and nothing is deleted automatically." actions={<Link href="/app/transactions" className="button button-secondary button-md"><ArrowRight size={15} /> View transactions</Link>} />
    <div className="stat-grid stat-grid-three"><article className="stat-card stat-amber"><div className="stat-top">Open items</div><strong>{openCount}</strong><small>Exceptions waiting for review</small></article><article className="stat-card"><div className="stat-top">Flagged amounts (overlap)</div><strong>{money(openAmount)}</strong><small>Different flags can describe the same money</small></article><article className="stat-card stat-blue"><div className="stat-top">Possible order matches</div><strong>{workspace.transactions.filter((transaction) => transaction.matchStatus === "possible").length}</strong><small>Suggestions need human confirmation</small></article></div>

    <div className="panel table-panel" style={{ padding: 14, marginBottom: 13 }}><div className="table-tools" style={{ border: 0, padding: 0 }}><label className="search-field"><Search size={15} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search an order, sender or issue…" /></label><div className="filter-tabs">{STATE_FILTERS.map((item) => <button className={`filter-tab ${state === item ? "active" : ""}`} key={item} onClick={() => setState(item)}>{item}<span style={{ marginLeft: 5, opacity: .65 }}>{workspace.exceptions.filter((exception) => exception.state === item.toLowerCase()).length}</span></button>)}</div></div><label className="field" style={{ maxWidth: 260, marginTop: 10 }}><span>Exception type</span><select value={filterType} onChange={(event) => setFilterType(event.target.value)}><option>All types</option>{Array.from(new Set(workspace.exceptions.map((exception) => exception.type))).map((type) => <option key={type} value={type}>{exceptionLabel(type)}</option>)}</select></label></div>

    <div className="exception-list">{exceptions.map((exception) => {
      const transaction = workspace.transactions.find((item) => item.id === exception.relatedTransactionId);
      const order = workspace.orders.find((item) => item.id === exception.relatedOrderId);
      const isDuplicate = exception.type === "POSSIBLE_DUPLICATE";
      const reminderEligible = Boolean(order && ["UNPAID_ORDER", "PARTIAL_PAYMENT", "OVERDUE_PAYMENT"].includes(exception.type));
      const canReviewMatch = Boolean(transaction && transaction.type === "credit" && !transaction.matchedOrderId && exception.type !== "POSSIBLE_DUPLICATE");
      return <article className="exception-card" key={exception.id}>
        <div className="exception-top"><div className={`exception-icon ${exception.severity === "high" ? "red" : exception.type === "UNMATCHED_PAYMENT" ? "blue" : ""}`}>{exceptionIcon(exception.type)}</div><div className="exception-copy"><div className="exception-title-row"><h3>{exception.title}</h3><Badge tone={exception.severity === "high" ? "red" : exception.severity === "medium" ? "amber" : "blue"}><i className={`severity-indicator ${exception.severity}`} />{exception.severity} priority</Badge><Badge tone={exception.state === "open" ? "neutral" : exception.state === "resolved" ? "green" : "slate"}>{exception.state}</Badge></div><p>{exception.description}</p><Evidence exception={exception} business={workspace.business} /></div><div className="exception-amount">{exception.amount > 0 ? money(exception.amount) : ""}</div></div>
        <div className="exception-actions">
          {canReviewMatch && <Button size="sm" onClick={() => setReviewId(transaction!.id)} disabled={Boolean(transaction!.duplicateFlag || transaction!.duplicateOf)}><Link2 size={13} /> Review &amp; link</Button>}
          {isDuplicate && transaction && exception.state === "open" && <Button size="sm" variant="secondary" onClick={() => markDuplicateAsSeparate(exception)}><Check size={13} /> Mark as separate payment</Button>}
          {isDuplicate && order && exception.state === "open" && <Button size="sm" variant="secondary" onClick={() => markDuplicateOrdersSeparate(exception)}><Check size={13} /> Mark as separate orders</Button>}
          {reminderEligible && <Button size="sm" variant="secondary" onClick={() => setReminder(exception)}><MessageCircle size={13} /> Draft reminder</Button>}
          {transaction && <Link className="row-action" href="/app/transactions"><Search size={12} /> Transaction list</Link>}
          {order && <Link className="row-action" href="/app/orders">{order.orderNumber}</Link>}
          <span className="spacer" />
          {exception.state === "open" ? <><Button size="sm" variant="ghost" onClick={() => updateState(exception, "dismissed")}><X size={13} /> Dismiss</Button><Button size="sm" variant="light" onClick={() => updateState(exception, "resolved")}><Check size={13} /> Mark resolved</Button></> : <Button size="sm" variant="ghost" onClick={() => commit((current) => setExceptionState(current, exception.id, "open"))}>Reopen</Button>}
        </div>
      </article>;
    })}
    {!exceptions.length && <div className="panel"><div className="empty-state"><div className="empty-icon"><ShieldAlert size={19} /></div><h3>{state === "Open" ? "Nothing in this view" : `No ${state.toLowerCase()} items`}</h3><p>{state === "Open" ? "Import a statement or create an order to refresh the review queue." : "Items you resolve or dismiss will be kept here for a clear history."}</p><Link href="/app/transactions" className="button button-secondary button-md">Go to transactions <ArrowRight size={14} /></Link></div></div>}</div>

    {reviewId && <MatchReviewModal transactionId={reviewId} onClose={() => setReviewId(null)} />}
    {reminder && <ReminderModal exception={reminder} onClose={() => setReminder(null)} />}
  </>;
}
