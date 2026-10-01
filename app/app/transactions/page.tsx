"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowDownLeft, ArrowDownToLine, ArrowUpRight, Link2, RefreshCw, Search, Unlink2, Upload } from "lucide-react";
import { useMoneyTrail } from "@/components/MoneyTrailProvider";
import ImportWizard from "@/components/ImportWizard";
import MatchReviewModal from "@/components/MatchReviewModal";
import { Badge, Button, PageHeader, StatCard } from "@/components/ui";
import { reconcileWorkspace, unlinkTransaction } from "@/lib/reconciliation";
import { downloadCsv, formatBusinessDate, formatBusinessMoney, normalizeText } from "@/lib/utils";
import { localeForCountry } from "@/lib/localization";

const FILTERS = ["All rows", "Needs review", "Incoming", "Outgoing", "Matched"];

export default function TransactionsPage() {
  const { workspace, commit } = useMoneyTrail();
  const money = (value: number) => formatBusinessMoney(value, workspace.business);
  const [filter, setFilter] = useState("All rows");
  const [search, setSearch] = useState("");
  const [showImport, setShowImport] = useState(false);
  const [reviewId, setReviewId] = useState<string | null>(null);
  const rows = useMemo(() => [...workspace.transactions].filter((transaction) => {
    const matchesFilter = filter === "All rows" || (filter === "Needs review" && (transaction.matchStatus === "possible" || transaction.matchStatus === "unmatched") && transaction.type === "credit") || (filter === "Incoming" && transaction.type === "credit") || (filter === "Outgoing" && transaction.type === "debit") || (filter === "Matched" && transaction.matchStatus === "matched");
    const query = normalizeText(search);
    const matchesSearch = !query || normalizeText(`${transaction.senderName} ${transaction.description} ${transaction.reference} ${transaction.channel}`).includes(query);
    return matchesFilter && matchesSearch;
  }).sort((a, b) => b.transactionDate.localeCompare(a.transactionDate)), [workspace.transactions, filter, search]);
  const incoming = workspace.transactions.filter((transaction) => transaction.type === "credit").reduce((sum, transaction) => sum + transaction.amount, 0);
  const unmatched = workspace.transactions.filter((transaction) => transaction.type === "credit" && transaction.matchStatus !== "matched" && transaction.matchStatus !== "ignored").length;
  const possible = workspace.transactions.filter((transaction) => transaction.matchStatus === "possible").length;
  const matched = workspace.transactions.filter((transaction) => transaction.matchStatus === "matched").length;

  function runMatching() {
    commit((current) => reconcileWorkspace(current, { autoMatch: true }));
  }

  return <>
    <PageHeader eyebrow="Imported money evidence" title="Transactions" description="Bank, POS and gateway rows you imported. Review the explanation before linking an uncertain payment." actions={<><Button variant="secondary" onClick={() => downloadCsv("moneytrail-transactions.csv", workspace.transactions.map((transaction) => ({ transaction_date: transaction.transactionDate, reference: transaction.reference, description: transaction.description, amount: transaction.amount, currency: workspace.business.currency, type: transaction.type, sender: transaction.senderName, phone: transaction.senderPhone, channel: transaction.channel, match_status: transaction.matchStatus, matched_order: workspace.orders.find((order) => order.id === transaction.matchedOrderId)?.orderNumber ?? "", confidence: transaction.confidence, possible_duplicate: transaction.duplicateFlag })))}><ArrowDownToLine size={15} /> Export</Button><Button variant="secondary" onClick={runMatching}><RefreshCw size={15} /> Run matching</Button><Button onClick={() => setShowImport(true)}><Upload size={15} /> Import CSV</Button></>} />

    <div className="stat-grid">
      <StatCard label="Statement rows" value={workspace.transactions.length.toLocaleString(localeForCountry(workspace.business.country))} note={`${workspace.imports.filter((item) => item.kind === "transactions").length} transaction imports`} icon={<ArrowDownLeft size={16} />} tone="blue" />
      <StatCard label="Incoming credits" value={money(incoming)} note="Gross imported credits; not a live bank balance" icon={<ArrowDownLeft size={16} />} tone="green" />
      <StatCard label="Needs a match" value={unmatched.toLocaleString(localeForCountry(workspace.business.country))} note={`${possible} possible matches wait for review`} icon={<Link2 size={15} />} tone="amber" />
      <StatCard label="Confirmed links" value={matched.toLocaleString(localeForCountry(workspace.business.country))} note="Rules or a workspace user confirmed" icon={<Link2 size={15} />} tone="dark" featured />
    </div>

    <section className="panel table-panel">
      <div className="table-tools"><label className="search-field"><Search size={15} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search sender, details, or reference…" /></label><div className="filter-tabs">{FILTERS.map((item) => <button key={item} onClick={() => setFilter(item)} className={`filter-tab ${filter === item ? "active" : ""}`}>{item}{item === "Needs review" && unmatched > 0 ? ` ${unmatched}` : ""}</button>)}</div></div>
      <div className="table-wrap"><table className="data-table"><thead><tr><th>Date / channel</th><th>Sender &amp; details</th><th>Reference</th><th>Direction</th><th>Amount</th><th>Order / match</th><th>Action</th></tr></thead><tbody>
        {rows.map((transaction) => {
          const linkedOrder = workspace.orders.find((order) => order.id === transaction.matchedOrderId);
          const statusTone = transaction.matchStatus === "matched" ? "green" : transaction.matchStatus === "possible" ? "amber" : transaction.matchStatus === "ignored" ? "slate" : "neutral";
          return <tr key={transaction.id}>
            <td><span className="primary-cell">{formatBusinessDate(transaction.transactionDate, workspace.business)}</span><span className="secondary-cell">{transaction.channel || "CSV statement"}</span></td>
            <td><span className="primary-cell">{transaction.senderName || (transaction.type === "credit" ? "Sender not identified" : transaction.description)}</span><span className="secondary-cell">{transaction.description}{transaction.matchReason ? ` · ${transaction.matchReason}` : ""}</span></td>
            <td><span className="mono-cell">{transaction.reference || "—"}</span>{transaction.duplicateFlag && <span className="secondary-cell" style={{ color: "#a96a18" }}>Possible duplicate</span>}</td>
            <td><Badge tone={transaction.type === "credit" ? "green" : "slate"}>{transaction.type === "credit" ? <ArrowDownLeft size={11} /> : <ArrowUpRight size={11} />}{transaction.type === "credit" ? "Credit" : "Debit"}</Badge></td>
            <td className={`amount-cell ${transaction.type === "credit" ? "amount-positive" : "amount-negative"}`}>{transaction.type === "credit" ? "+" : "−"}{money(transaction.amount)}</td>
            <td>{linkedOrder ? <><span className="primary-cell">{linkedOrder.orderNumber}</span><span className="secondary-cell">{transaction.confidence !== null ? `${Math.round(transaction.confidence * 100)}% confidence` : "Confirmed manually"}</span></> : <><Badge tone={statusTone}>{transaction.matchStatus === "possible" ? "Review suggested" : transaction.matchStatus === "ignored" ? "Ignored" : "Unmatched"}</Badge>{transaction.confidence !== null && <span className="secondary-cell">{Math.round(transaction.confidence * 100)}% signal</span>}</>}</td>
            <td>{linkedOrder ? <button className="row-action muted-action" onClick={() => commit((current) => unlinkTransaction(current, transaction.id))}><Unlink2 size={12} /> Unlink</button> : transaction.matchStatus !== "ignored" && transaction.type === "credit" ? transaction.duplicateFlag || transaction.duplicateOf ? <Link className="row-action" href="/app/exceptions">Review duplicate <Link2 size={12} /></Link> : <button className="row-action" onClick={() => setReviewId(transaction.id)}>Review &amp; link <Link2 size={12} /></button> : <span className="muted">—</span>}</td>
          </tr>;
        })}
        {!rows.length && <tr><td colSpan={7} className="table-empty">No transactions match those filters. Import a CSV statement to get started.</td></tr>}
      </tbody></table></div>
      <div className="table-footer"><span>Showing {rows.length} of {workspace.transactions.length} rows · {unmatched} incoming rows unallocated</span><span>Potential duplicates remain in the evidence list until reviewed.</span></div>
    </section>

    {workspace.imports.filter((item) => item.kind === "transactions").length > 0 && <section className="panel import-history" style={{ marginTop: 14 }}><div className="panel-header"><div><h2>Import history</h2><p>Files are not kept after browser-side parsing; this is a record of import counts only.</p></div></div><div className="table-wrap"><table className="data-table"><thead><tr><th>File</th><th>Imported</th><th>Duplicates</th><th>Invalid</th><th>Matched</th><th>Needs review</th><th>Imported on</th></tr></thead><tbody>{workspace.imports.filter((item) => item.kind === "transactions").map((item) => <tr key={item.id}><td><span className="primary-cell">{item.fileName}</span></td><td>{item.importedCount}</td><td>{item.duplicateCount}</td><td>{item.invalidCount}</td><td>{item.matchedCount}</td><td>{item.needsReviewCount}</td><td>{formatBusinessDate(item.createdAt, workspace.business)}</td></tr>)}</tbody></table></div></section>}
    {showImport && <ImportWizard kind="transactions" onClose={() => setShowImport(false)} />}
    {reviewId && <MatchReviewModal transactionId={reviewId} onClose={() => setReviewId(null)} />}
  </>;
}
