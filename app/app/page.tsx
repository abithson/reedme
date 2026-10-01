"use client";

import Link from "next/link";
import { useMemo } from "react";
import { ArrowDownLeft, ArrowRight, ArrowUpRight, CircleAlert, Clock3, Coins, Plus, ReceiptText, RefreshCw, Upload } from "lucide-react";
import { useMoneyTrail } from "@/components/MoneyTrailProvider";
import { Badge, PageHeader, StatCard } from "@/components/ui";
import { getDashboardSummary, orderPaid } from "@/lib/reconciliation";
import { businessDate, formatBusinessDate, formatBusinessMoney, formatCompactBusinessMoney, parseLocalDate } from "@/lib/utils";
import { localeForCountry } from "@/lib/localization";
import type { Business } from "@/lib/types";

function Chart({ creditByDay, debitByDay, labels, business }: { creditByDay: number[]; debitByDay: number[]; labels: string[]; business: Pick<Business, "currency" | "country"> }) {
  const maximum = Math.max(1, ...creditByDay, ...debitByDay);
  return <>
    <div className="chart-area" aria-label="Bank credits and debits over the last seven days">
      {labels.map((label, index) => <div className="chart-day" key={label} title={`${label}: ${formatBusinessMoney(creditByDay[index], business)} incoming`}>
        <div className="chart-bar chart-bar-credit" style={{ height: `${Math.max(4, creditByDay[index] / maximum * 100)}%` }} />
        <div className="chart-bar chart-bar-debit" style={{ height: `${Math.max(3, debitByDay[index] / maximum * 60)}%` }} />
      </div>)}
    </div>
    <div className="chart-labels">{labels.map((label) => <span key={label}>{label}</span>)}</div>
  </>;
}

export default function DashboardPage() {
  const { workspace } = useMoneyTrail();
  const money = (value: number) => formatBusinessMoney(value, workspace.business);
  const compactMoney = (value: number) => formatCompactBusinessMoney(value, workspace.business);
  const now = new Date().toISOString();
  const summary = useMemo(() => getDashboardSummary(workspace, now), [workspace, now]);
  const chartData = useMemo(() => {
    const labels: string[] = [];
    const keys: string[] = [];
    const today = parseLocalDate(businessDate(new Date(), workspace.business)) ?? new Date();
    for (let offset = 6; offset >= 0; offset -= 1) {
      const date = new Date(today);
      date.setDate(today.getDate() - offset);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
      keys.push(key);
      labels.push(new Intl.DateTimeFormat(localeForCountry(workspace.business.country), { weekday: "short" }).format(date));
    }
    const creditByDay = keys.map((key) => workspace.transactions.filter((transaction) => transaction.type === "credit" && transaction.transactionDate.slice(0, 10) === key).reduce((sum, transaction) => sum + transaction.amount, 0));
    const debitByDay = keys.map((key) => workspace.transactions.filter((transaction) => transaction.type === "debit" && transaction.transactionDate.slice(0, 10) === key).reduce((sum, transaction) => sum + transaction.amount, 0));
    return { labels, creditByDay, debitByDay, creditTotal: creditByDay.reduce((a, b) => a + b, 0) };
  }, [workspace.transactions, workspace.business]);
  const openExceptions = useMemo(() => workspace.exceptions.filter((exception) => exception.state === "open").sort((a, b) => (a.severity === b.severity ? b.amount - a.amount : a.severity === "high" ? -1 : 1)), [workspace.exceptions]);
  const recentTransactions = useMemo(() => [...workspace.transactions].sort((a, b) => b.transactionDate.localeCompare(a.transactionDate)).slice(0, 5), [workspace.transactions]);
  const possibleMatches = workspace.transactions.filter((transaction) => transaction.matchStatus === "possible").length;
  const receivedPct = summary.expected > 0 ? Math.min(100, summary.received / summary.expected * 100) : 0;

  return (
    <>
      <PageHeader eyebrow="Money snapshot" title="Good morning" description={`${workspace.business.name} · Orders and transaction evidence in one view.`} actions={<><Link href="/app/orders" className="button button-secondary button-md"><Plus size={15} /> Add order</Link><Link href="/app/transactions" className="button button-primary button-md"><Upload size={15} /> Import statement</Link></>} />

      {openExceptions.length > 0 && <div className="dashboard-alert"><div className="dashboard-alert-icon"><CircleAlert size={16} /></div><p><strong>{openExceptions.length} items need attention.</strong> {possibleMatches ? `${possibleMatches} payment${possibleMatches === 1 ? " has" : "s have"} a possible order match waiting for review.` : "Open the queue to see the evidence and choose what happens next."}</p><Link href="/app/exceptions">Review queue <ArrowRight size={13} /></Link></div>}

      <div className="stat-grid">
        <StatCard label="Expected from orders" value={compactMoney(summary.expected)} note={`${workspace.orders.length} recorded orders`} icon={<ReceiptText size={15} />} tone="blue" />
        <StatCard label="Confirmed received" value={compactMoney(summary.received)} note={`${receivedPct.toFixed(0)}% of order value accounted for`} icon={<ArrowDownLeft size={16} />} tone="green" />
        <StatCard label="Still outstanding" value={compactMoney(summary.outstanding)} note={`${summary.overdueOrders} overdue order${summary.overdueOrders === 1 ? "" : "s"}`} icon={<Clock3 size={15} />} tone="amber" />
        <StatCard label="Money needing attention" value={compactMoney(summary.attentionAmount)} note={`${summary.unmatchedCount} incoming rows not allocated`} icon={<Coins size={15} />} tone="dark" featured />
      </div>

      <div className="dashboard-main-grid">
        <section className="panel collection-chart">
          <div className="panel-header"><div><h2>Bank activity</h2><p>Imported credits and debits · last 7 days</p></div><Badge tone="green"><span className="severity-indicator low" /> CSV evidence</Badge></div>
          <div className="chart-summary"><div className="chart-total"><strong>{compactMoney(chartData.creditTotal)}</strong><span>incoming credits in this period</span></div><div className="chart-legend"><span><i className="legend-dot legend-credit" /> Credits</span><span><i className="legend-dot legend-debit" /> Debits</span></div></div>
          <Chart creditByDay={chartData.creditByDay} debitByDay={chartData.debitByDay} labels={chartData.labels} business={workspace.business} />
          <div className="chart-footnote">This reflects imported statement rows only; it is not a live bank balance.</div>
        </section>

        <section className="panel priority-panel">
          <div className="panel-header"><div><h2>Priority review</h2><p>Exceptions that may need a decision</p></div><Link href="/app/exceptions" className="panel-link">See all <ArrowRight size={13} /></Link></div>
          <div className="priority-list">
            {openExceptions.slice(0, 5).map((exception) => <Link key={exception.id} href="/app/exceptions" className="priority-item">
              <i className={`priority-indicator priority-${exception.severity}`} />
              <div className="priority-copy"><strong>{exception.title}</strong><span>{exception.description}</span></div>
              {exception.amount > 0 && <span className="priority-amount">{compactMoney(exception.amount)}</span>}
            </Link>)}
            {!openExceptions.length && <div className="priority-empty">Nothing is waiting for review. Import your latest statement to refresh the picture.</div>}
          </div>
        </section>
      </div>

      <div className="dashboard-bottom-grid">
        <section className="panel table-panel">
          <div className="panel-header"><div><h2>Orders with a balance</h2><p>What is still expected from customers</p></div><Link href="/app/orders" className="panel-link">View orders <ArrowRight size={13} /></Link></div>
          <div className="table-wrap"><table className="data-table"><thead><tr><th>Order / customer</th><th>Due</th><th>Received</th><th>Balance</th><th>Status</th></tr></thead><tbody>
            {workspace.orders.filter((order) => order.amount - orderPaid(workspace, order.id) > 1).sort((a, b) => (a.dueDate || "9999").localeCompare(b.dueDate || "9999")).slice(0, 5).map((order) => {
              const paid = orderPaid(workspace, order.id);
              const remaining = Math.max(0, order.amount - paid);
              const overdue = Boolean(order.dueDate && order.dueDate < businessDate(new Date(), workspace.business));
              return <tr key={order.id}><td><span className="primary-cell">{order.orderNumber}</span><span className="secondary-cell">{order.customerName}</span></td><td>{formatBusinessDate(order.dueDate, workspace.business)}</td><td>{money(paid)}</td><td className="amount-cell">{money(remaining)}</td><td><Badge tone={overdue ? "red" : paid ? "amber" : "neutral"}>{overdue ? "Overdue" : paid ? "Partial" : "Unpaid"}</Badge></td></tr>;
            })}
            {!workspace.orders.some((order) => order.amount - orderPaid(workspace, order.id) > 1) && <tr><td colSpan={5} className="table-empty">No open order balances.</td></tr>}
          </tbody></table></div>
        </section>

        <section className="panel">
          <div className="panel-header"><div><h2>Recent activity</h2><p>Latest imported statement rows</p></div><Link href="/app/transactions" className="panel-link">All transactions <ArrowRight size={13} /></Link></div>
          <div className="activity-list">{recentTransactions.map((transaction) => <div className="activity-item" key={transaction.id}><span className={`activity-symbol ${transaction.type}`} >{transaction.type === "credit" ? <ArrowDownLeft size={15} /> : <ArrowUpRight size={15} />}</span><div className="activity-copy"><strong>{transaction.senderName || transaction.description}</strong><span>{formatBusinessDate(transaction.transactionDate, workspace.business)} · {transaction.channel || "Statement"}</span></div><span className={`activity-amount ${transaction.type}`}>{transaction.type === "credit" ? "+" : "−"}{money(transaction.amount)}</span></div>)}{!recentTransactions.length && <div className="table-empty">Import a CSV to see activity here.</div>}</div>
        </section>
      </div>

      <div className="dashboard-footer-actions"><span><RefreshCw size={13} /> Matching uses rules and your imported evidence, not an AI verdict.</span><Link href="/app/reports">Open reports <ArrowRight size={13} /></Link></div>
    </>
  );
}
