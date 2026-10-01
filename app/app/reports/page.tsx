"use client";

import { useMemo, useState } from "react";
import { ArrowDownToLine, FileChartColumnIncreasing, FileSpreadsheet, ListChecks, Wallet } from "lucide-react";
import { useMoneyTrail } from "@/components/MoneyTrailProvider";
import { Badge, Button, PageHeader } from "@/components/ui";
import { orderPaid, orderRemaining } from "@/lib/reconciliation";
import { businessDate, downloadCsv, formatBusinessDate, formatBusinessMoney } from "@/lib/utils";

export default function ReportsPage() {
  const { workspace } = useMoneyTrail();
  const money = (value: number) => formatBusinessMoney(value, workspace.business);
  const currentDate = businessDate(new Date(), workspace.business);
  const [from, setFrom] = useState(() => `${currentDate.slice(0, 7)}-01`);
  const [to, setTo] = useState(currentDate);
  const transactions = useMemo(() => workspace.transactions.filter((transaction) => {
    const date = transaction.transactionDate.slice(0, 10);
    return (!from || date >= from) && (!to || date <= to);
  }), [workspace.transactions, from, to]);
  const orders = useMemo(() => workspace.orders.filter((order) => (!from || order.orderDate >= from) && (!to || order.orderDate <= to)), [workspace.orders, from, to]);
  const credits = transactions.filter((transaction) => transaction.type === "credit").reduce((sum, transaction) => sum + transaction.amount, 0);
  const debits = transactions.filter((transaction) => transaction.type === "debit").reduce((sum, transaction) => sum + transaction.amount, 0);
  const confirmed = transactions.filter((transaction) => transaction.type === "credit" && transaction.matchStatus === "matched").reduce((sum, transaction) => sum + transaction.amount, 0);
  const outstanding = orders.reduce((sum, order) => sum + orderRemaining(workspace, order.id), 0);
  const periodExceptions = workspace.exceptions.filter((exception) => {
    const relatedTransaction = workspace.transactions.find((transaction) => transaction.id === exception.relatedTransactionId);
    const relatedOrder = workspace.orders.find((order) => order.id === exception.relatedOrderId);
    const date = relatedTransaction?.transactionDate.slice(0, 10) ?? relatedOrder?.orderDate ?? exception.createdAt.slice(0, 10);
    return (!from || date >= from) && (!to || date <= to);
  });

  function exportTransactions() {
    downloadCsv("moneytrail-transaction-report.csv", transactions.map((transaction) => ({
      transaction_date: transaction.transactionDate, reference: transaction.reference, description: transaction.description, amount: transaction.amount, currency: workspace.business.currency,
      direction: transaction.type, sender: transaction.senderName, sender_phone: transaction.senderPhone, channel: transaction.channel,
      match_status: transaction.matchStatus, matched_order: workspace.orders.find((order) => order.id === transaction.matchedOrderId)?.orderNumber ?? "",
      confidence: transaction.confidence, duplicate_candidate: transaction.duplicateFlag,
    })));
  }
  function exportOrders() {
    downloadCsv("moneytrail-order-report.csv", orders.map((order) => ({
      order_number: order.orderNumber, customer: order.customerName, customer_phone: order.customerPhone, order_date: order.orderDate,
      due_date: order.dueDate, amount: order.amount, paid: orderPaid(workspace, order.id), balance: orderRemaining(workspace, order.id), currency: workspace.business.currency,
      status: orderRemaining(workspace, order.id) <= 1 ? "paid" : order.dueDate && order.dueDate < businessDate(new Date(), workspace.business) ? "overdue" : "open", notes: order.notes,
    })));
  }
  function exportExceptions() {
    downloadCsv("moneytrail-exception-report.csv", periodExceptions.map((exception) => ({
      type: exception.type, title: exception.title, state: exception.state, severity: exception.severity, amount: exception.amount, currency: workspace.business.currency,
      order_number: workspace.orders.find((order) => order.id === exception.relatedOrderId)?.orderNumber ?? "",
      transaction_reference: workspace.transactions.find((transaction) => transaction.id === exception.relatedTransactionId)?.reference ?? "",
      explanation: exception.description, created_at: exception.createdAt,
    })));
  }
  function exportSummary() {
    downloadCsv("moneytrail-reconciliation-summary.csv", [{
      business: workspace.business.name, currency: workspace.business.currency, period_from: from, period_to: to, order_count: orders.length, expected: orders.reduce((sum, order) => sum + order.amount, 0),
      remaining_balance: outstanding, imported_credit: credits, imported_debit: debits, confirmed_credit: confirmed,
      incoming_unmatched_count: transactions.filter((transaction) => transaction.type === "credit" && transaction.matchStatus !== "matched").length,
      exceptions_open: periodExceptions.filter((exception) => exception.state === "open").length,
    }]);
  }

  return <>
    <PageHeader eyebrow="Exports & summaries" title="Reports" description="Download normalized records and a reconciliation summary for the period you choose. CSV files are generated in your browser." actions={<Button variant="secondary" onClick={exportSummary}><ArrowDownToLine size={15} /> Export summary</Button>} />
    <section className="panel" style={{ padding: 16, marginBottom: 14 }}><div className="report-controls"><label className="field"><span>From</span><input type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></label><label className="field"><span>To</span><input type="date" value={to} onChange={(event) => setTo(event.target.value)} /></label><div className="field-hint" style={{ paddingBottom: 10 }}>Period dates use the transaction date and order date as recorded.</div><Badge tone="green">{formatBusinessDate(from, workspace.business)} — {formatBusinessDate(to, workspace.business)}</Badge></div>
      <div className="stat-grid stat-grid-four" style={{ marginBottom: 0 }}><article className="stat-card"><div className="stat-top">Orders in period</div><strong>{orders.length}</strong><small>Based on order date</small></article><article className="stat-card stat-green"><div className="stat-top">Imported incoming</div><strong>{money(credits)}</strong><small>Credit rows in selected period</small></article><article className="stat-card stat-blue"><div className="stat-top">Confirmed against orders</div><strong>{money(confirmed)}</strong><small>Linked incoming rows only</small></article><article className="stat-card stat-amber"><div className="stat-top">Open exceptions</div><strong>{periodExceptions.filter((exception) => exception.state === "open").length}</strong><small>{periodExceptions.length} total in this period</small></article></div>
    </section>

    <div className="report-grid">
      <article className="panel report-card"><div className="report-icon"><FileSpreadsheet size={17} /></div><h3>Transaction evidence</h3><p>Export imported credits and debits with references, channels, match status and duplicate flags.</p><Button size="sm" variant="secondary" onClick={exportTransactions}>Download {transactions.length} rows <ArrowDownToLine size={13} /></Button></article>
      <article className="panel report-card"><div className="report-icon"><Wallet size={17} /></div><h3>Order balances</h3><p>Export order value, paid-to-date and remaining balance for orders created in the selected period.</p><Button size="sm" variant="secondary" onClick={exportOrders}>Download {orders.length} rows <ArrowDownToLine size={13} /></Button></article>
      <article className="panel report-card"><div className="report-icon"><ListChecks size={17} /></div><h3>Exceptions &amp; review</h3><p>Share an audit-friendly list of exception explanations, state, severity and related references.</p><Button size="sm" variant="secondary" onClick={exportExceptions}>Download {periodExceptions.length} rows <ArrowDownToLine size={13} /></Button></article>
    </div>

    <section className="panel table-panel" style={{ marginTop: 15 }}><div className="panel-header"><div><h2>Period overview</h2><p>Bank activity is not the same as order revenue; compare each line with its source evidence.</p></div><Badge tone="slate"><FileChartColumnIncreasing size={12} /> {transactions.length} transaction rows</Badge></div><div className="table-wrap"><table className="data-table"><thead><tr><th>Measure</th><th>Amount / count</th><th>What it includes</th></tr></thead><tbody><tr><td><span className="primary-cell">Incoming transaction evidence</span></td><td className="amount-cell">{money(credits)}</td><td>All imported credit rows in the selected period, including unresolved duplicate candidates.</td></tr><tr><td><span className="primary-cell">Outgoing transaction evidence</span></td><td className="amount-cell">{money(debits)}</td><td>All imported debit rows in the selected period. Not a statement closing balance.</td></tr><tr><td><span className="primary-cell">Confirmed order-linked incoming</span></td><td className="amount-cell">{money(confirmed)}</td><td>Credit rows linked to an order by rules or a workspace user.</td></tr><tr><td><span className="primary-cell">Open order balance</span></td><td className="amount-cell">{money(outstanding)}</td><td>Current balances for orders whose order dates fall in this period.</td></tr></tbody></table></div></section>
  </>;
}
