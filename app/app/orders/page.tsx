"use client";

import { useMemo, useState, type FormEvent } from "react";
import { ArrowDownToLine, Plus, Search, Upload } from "lucide-react";
import { useMoneyTrail } from "@/components/MoneyTrailProvider";
import ImportWizard from "@/components/ImportWizard";
import { Badge, Button, Modal, PageHeader } from "@/components/ui";
import { reconcileWorkspace, orderPaid, orderRemaining } from "@/lib/reconciliation";
import { businessDate, createId, downloadCsv, formatBusinessDate, formatBusinessMoney, normalizePhone, normalizeText } from "@/lib/utils";
import { currencySign } from "@/lib/localization";
import type { Customer, Order, Workspace } from "@/lib/types";

function orderStatus(order: Order, workspace: Workspace): { label: string; tone: "green" | "amber" | "red" | "neutral" } {
  const remaining = orderRemaining(workspace, order.id);
  if (remaining <= 1) return { label: "Paid", tone: "green" };
  if (order.dueDate && order.dueDate < businessDate(new Date(), workspace.business)) return { label: "Overdue", tone: "red" };
  if (orderPaid(workspace, order.id) > 1) return { label: "Partial", tone: "amber" };
  return { label: "Unpaid", tone: "neutral" };
}

function NewOrderModal({ onClose }: { onClose: () => void }) {
  const { workspace, commit } = useMoneyTrail();
  const [orderNumber, setOrderNumber] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [orderDate, setOrderDate] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [amount, setAmount] = useState("");
  const [paid, setPaid] = useState("0");
  const [paymentMethod, setPaymentMethod] = useState("Bank transfer");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const moneySign = currencySign(workspace.business.currency, workspace.business.country);

  function submit(event: FormEvent) {
    event.preventDefault();
    const reference = orderNumber.trim() || `AB-${Date.now().toString().slice(-8)}`;
    const total = Number(amount.replace(/,/g, ""));
    const recordedPaid = Number(paid.replace(/,/g, ""));
    if (!customerName.trim() || !orderDate || !Number.isFinite(total) || total <= 0 || !Number.isFinite(recordedPaid) || recordedPaid < 0 || recordedPaid > total) {
      setError("Enter a customer, valid date, and an amount above zero. Paid cannot exceed the order amount."); return;
    }
    if (workspace.orders.some((order) => normalizeText(order.orderNumber) === normalizeText(reference))) {
      setError("That order number already exists in this workspace. Use a unique reference."); return;
    }
    const now = new Date().toISOString();
    let nextCustomers = [...workspace.customers];
    let customer: Customer | undefined = customerPhone ? nextCustomers.find((item) => item.phoneNormalized === normalizePhone(customerPhone)) : undefined;
    customer ??= nextCustomers.find((item) => normalizeText(item.name) === normalizeText(customerName));
    if (!customer) {
      customer = { id: createId("customer"), name: customerName.trim(), phone: customerPhone.trim(), phoneNormalized: normalizePhone(customerPhone), email: "", notes: "", createdAt: now, updatedAt: now };
      nextCustomers = [...nextCustomers, customer];
    }
    const order: Order = {
      id: createId("order"), orderNumber: reference, customerId: customer.id, customerName: customerName.trim(), customerPhone: customerPhone.trim() || customer.phone,
      orderDate, dueDate, amount: Math.round(total * 100) / 100, recordedPaid: Math.round(recordedPaid * 100) / 100, paymentMethod, notes: notes.trim(),
      duplicateFlag: false, createdAt: now, updatedAt: now,
    };
    const base: Workspace = {
      ...workspace, customers: nextCustomers, orders: [...workspace.orders, order],
      auditLogs: [...workspace.auditLogs, { id: createId("audit"), actorUserId: null, action: "order.created", entityType: "order", entityId: order.id, details: { orderNumber: order.orderNumber, amount: order.amount }, createdAt: now }],
    };
    commit(() => reconcileWorkspace(base, { autoMatch: true, now }));
    onClose();
  }

  return <Modal title="Add an order" description="Record the amount expected and any payment you have already confirmed. Orders are never marked paid from a reminder." onClose={onClose}>
    <form className="modal-body form-stack" onSubmit={submit}>
      <div className="form-grid"><label className="field"><span>Order number (optional)</span><input value={orderNumber} onChange={(event) => setOrderNumber(event.target.value)} placeholder="Auto-generated if left blank" maxLength={80} /></label><label className="field"><span>Order amount ({moneySign})</span><input inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="125000" required /></label></div>
      <label className="field"><span>Customer name</span><input value={customerName} onChange={(event) => setCustomerName(event.target.value)} placeholder="Customer or shop name" required /></label>
      <div className="form-grid"><label className="field"><span>Phone (optional)</span><input value={customerPhone} onChange={(event) => setCustomerPhone(event.target.value)} placeholder="Include country code, e.g. +1…" /></label><label className="field"><span>Order date</span><input type="date" value={orderDate} onChange={(event) => setOrderDate(event.target.value)} required /></label></div>
      <div className="form-grid"><label className="field"><span>Payment due (optional)</span><input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} /></label><label className="field"><span>Already paid ({moneySign})</span><input inputMode="decimal" value={paid} onChange={(event) => setPaid(event.target.value)} /><small className="field-hint">Use this for cash or a payment recorded elsewhere. Bank evidence stays separate.</small></label></div>
      <div className="form-grid"><label className="field"><span>Payment method noted</span><select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)}><option>Bank transfer</option><option>Cash</option><option>POS</option><option>USSD</option><option>Gateway</option><option>Credit / pay later</option><option>Not recorded</option></select></label><label className="field"><span>Items / notes</span><input value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="e.g. 10 cartons cooking oil" /></label></div>
      {error && <div className="form-error">{error}</div>}
      <div className="form-actions"><Button type="button" variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit">Save order <Plus size={14} /></Button></div>
    </form>
  </Modal>;
}

export default function OrdersPage() {
  const { workspace } = useMoneyTrail();
  const money = (value: number) => formatBusinessMoney(value, workspace.business);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("All orders");
  const [showNew, setShowNew] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const rows = useMemo(() => workspace.orders.filter((order) => {
    const status = orderStatus(order, workspace);
    const matchesFilter = filter === "All orders" || (filter === "Outstanding" && status.label !== "Paid") || (filter === "Overdue" && status.label === "Overdue") || (filter === "Paid" && status.label === "Paid") || (filter === "Possible duplicates" && order.duplicateFlag);
    const query = normalizeText(search);
    const matchesSearch = !query || normalizeText(`${order.orderNumber} ${order.customerName} ${order.customerPhone} ${order.notes}`).includes(query);
    return matchesFilter && matchesSearch;
  }).sort((a, b) => (a.dueDate || "9999").localeCompare(b.dueDate || "9999")), [workspace, filter, search]);

  const totalOutstanding = workspace.orders.reduce((sum, order) => sum + orderRemaining(workspace, order.id), 0);
  const overdueCount = workspace.orders.filter((order) => orderStatus(order, workspace).label === "Overdue").length;

  return <>
    <PageHeader eyebrow="Order book" title="Orders" description={`${workspace.orders.length} customer orders · ${money(totalOutstanding)} remains unpaid or unallocated.`} actions={<><Button variant="secondary" onClick={() => downloadCsv("moneytrail-orders.csv", workspace.orders.map((order) => ({ order_number: order.orderNumber, customer: order.customerName, customer_phone: order.customerPhone, order_date: order.orderDate, due_date: order.dueDate, amount: order.amount, recorded_paid: orderPaid(workspace, order.id), outstanding: orderRemaining(workspace, order.id), currency: workspace.business.currency, status: orderStatus(order, workspace).label, notes: order.notes })))}><ArrowDownToLine size={15} /> Export</Button><Button variant="secondary" onClick={() => setShowImport(true)}><Upload size={15} /> Import CSV</Button><Button onClick={() => setShowNew(true)}><Plus size={15} /> Add order</Button></>} />

    <div className="stat-grid stat-grid-three"><article className="stat-card"><div className="stat-top">Total orders</div><strong>{workspace.orders.length}</strong><small>Across all customer records</small></article><article className="stat-card stat-amber"><div className="stat-top">Open balances</div><strong>{workspace.orders.filter((order) => orderRemaining(workspace, order.id) > 1).length}</strong><small>{money(totalOutstanding)} outstanding</small></article><article className="stat-card"><div className="stat-top">Overdue</div><strong>{overdueCount}</strong><small>Due date passed with a balance remaining</small></article></div>

    <section className="panel table-panel">
      <div className="table-tools"><label className="search-field"><Search size={15} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search order, customer, or items…" /></label><div className="filter-tabs">{["All orders", "Outstanding", "Overdue", "Paid", "Possible duplicates"].map((item) => <button className={`filter-tab ${filter === item ? "active" : ""}`} onClick={() => setFilter(item)} key={item}>{item}</button>)}</div></div>
      <div className="table-wrap"><table className="data-table"><thead><tr><th>Order</th><th>Customer</th><th>Order date</th><th>Due</th><th>Order amount</th><th>Paid</th><th>Balance</th><th>Status</th></tr></thead><tbody>
        {rows.map((order) => {
          const paid = orderPaid(workspace, order.id);
          const remaining = orderRemaining(workspace, order.id);
          const status = orderStatus(order, workspace);
          const progress = order.amount > 0 ? Math.min(100, paid / order.amount * 100) : 0;
          return <tr key={order.id}>
            <td><span className="primary-cell">{order.orderNumber}{order.duplicateFlag && <span style={{ color: "#b07a2e", marginLeft: 5 }}>· repeated</span>}</span><span className="secondary-cell">{order.notes || "Customer order"}</span></td>
            <td><span className="primary-cell">{order.customerName}</span><span className="secondary-cell">{order.customerPhone || "No phone recorded"}</span></td>
            <td>{formatBusinessDate(order.orderDate, workspace.business)}</td><td>{formatBusinessDate(order.dueDate, workspace.business)}</td><td>{money(order.amount)}</td>
            <td><span className="primary-cell">{money(paid)}</span><div className="progress-track"><div className="progress-value" style={{ width: `${progress}%` }} /></div></td>
            <td className="amount-cell">{money(remaining)}</td><td><Badge tone={status.tone}>{status.label}</Badge></td>
          </tr>;
        })}
        {!rows.length && <tr><td colSpan={8} className="table-empty">No orders match those filters.</td></tr>}
      </tbody></table></div><div className="table-footer"><span>Showing {rows.length} of {workspace.orders.length} orders</span><span>Order balances include confirmed transactions and recorded cash payments.</span></div>
    </section>

    {showNew && <NewOrderModal onClose={() => setShowNew(false)} />}
    {showImport && <ImportWizard kind="orders" onClose={() => setShowImport(false)} />}
  </>;
}
