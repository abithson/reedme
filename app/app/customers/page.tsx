"use client";

import { useMemo, useState, type FormEvent } from "react";
import { ArrowDownToLine, Search, Upload, UserPlus, Users } from "lucide-react";
import { useMoneyTrail } from "@/components/MoneyTrailProvider";
import ImportWizard from "@/components/ImportWizard";
import { Badge, Button, EmptyState, Modal, PageHeader } from "@/components/ui";
import { orderRemaining } from "@/lib/reconciliation";
import { createId, downloadCsv, formatBusinessMoney, initials, normalizePhone, normalizeText } from "@/lib/utils";
import type { Customer } from "@/lib/types";

function AddCustomerModal({ onClose }: { onClose: () => void }) {
  const { workspace, commit } = useMoneyTrail();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  function submit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) { setError("Add a customer or shop name."); return; }
    const normalized = normalizePhone(phone);
    const duplicate = workspace.customers.find((customer) => normalized ? customer.phoneNormalized === normalized : normalizeText(customer.name) === normalizeText(name));
    if (duplicate) { setError(`${duplicate.name} is already in the customer list. Search for that contact instead of creating a second record.`); return; }
    const now = new Date().toISOString();
    const customer: Customer = { id: createId("customer"), name: name.trim(), phone: phone.trim(), phoneNormalized: normalized, email: email.trim(), notes: notes.trim(), createdAt: now, updatedAt: now };
    commit((current) => ({ ...current, customers: [...current.customers, customer], auditLogs: [...current.auditLogs, { id: createId("audit"), actorUserId: null, action: "customer.created", entityType: "customer", entityId: customer.id, details: { name: customer.name }, createdAt: now }] }));
    onClose();
  }
  return <Modal title="Add a customer" description="Keep only the contact details needed to identify an order and send a reminder." onClose={onClose}>
    <form className="modal-body form-stack" onSubmit={submit}>
      <label className="field"><span>Customer or shop name</span><input value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Amina Bello" autoFocus required /></label>
      <div className="form-grid"><label className="field"><span>Phone number</span><input value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="Include country code, e.g. +1…" /></label><label className="field"><span>Email (optional)</span><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@example.com" /></label></div>
      <label className="field"><span>Notes</span><textarea value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Optional context for your team" /></label>
      <div className="inline-notice">A phone number is optional. MoneyTrail does not automatically message customers.</div>
      {error && <div className="form-error">{error}</div>}
      <div className="form-actions"><Button type="button" variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit">Save customer <UserPlus size={14} /></Button></div>
    </form>
  </Modal>;
}

export default function CustomersPage() {
  const { workspace, mode } = useMoneyTrail();
  const money = (value: number) => formatBusinessMoney(value, workspace.business);
  const [search, setSearch] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const orderCount = useMemo(() => {
    const counts = new Map<string, number>();
    for (const order of workspace.orders) if (order.customerId) counts.set(order.customerId, (counts.get(order.customerId) ?? 0) + 1);
    return counts;
  }, [workspace.orders]);
  const rows = useMemo(() => workspace.customers.filter((customer) => normalizeText(`${customer.name} ${customer.phone} ${customer.email} ${customer.notes}`).includes(normalizeText(search))).sort((a, b) => a.name.localeCompare(b.name)), [workspace.customers, search]);
  const withBalance = workspace.customers.filter((customer) => workspace.orders.some((order) => order.customerId === customer.id && orderRemaining(workspace, order.id) > 1)).length;
  const repeatCustomers = [...orderCount.values()].filter((count) => count > 1).length;

  return <>
    <PageHeader eyebrow="Customer records" title="Customers" description="A simple list to connect orders, payment evidence and follow-up. No full CRM or messaging automation." actions={<><Button variant="secondary" onClick={() => downloadCsv("moneytrail-customers.csv", workspace.customers.map((customer) => ({ name: customer.name, phone: customer.phone, email: customer.email, notes: customer.notes, orders: orderCount.get(customer.id) ?? 0 })))}><ArrowDownToLine size={15} /> Export</Button><Button variant="secondary" onClick={() => setShowImport(true)}><Upload size={15} /> Import CSV</Button><Button onClick={() => setShowNew(true)}><UserPlus size={15} /> Add customer</Button></>} />

    <div className="stat-grid stat-grid-three"><article className="stat-card"><div className="stat-top">Customers</div><strong>{workspace.customers.length}</strong><small>{mode === "demo" ? "Fictional sample records" : "Across this workspace"}</small></article><article className="stat-card stat-blue"><div className="stat-top">Repeat buyers</div><strong>{repeatCustomers}</strong><small>Customers with more than one order</small></article><article className="stat-card stat-amber"><div className="stat-top">With an open balance</div><strong>{withBalance}</strong><small>At least one order is still unpaid</small></article></div>

    <section className="panel table-panel">
      <div className="table-tools"><label className="search-field"><Search size={15} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search customer, phone, or notes…" /></label><Badge tone="slate">{rows.length} shown</Badge></div>
      <div className="table-wrap"><table className="data-table"><thead><tr><th>Customer</th><th>Phone</th><th>Orders</th><th>Open amount</th><th>Email</th><th>Notes</th></tr></thead><tbody>
        {rows.map((customer) => {
          const orders = workspace.orders.filter((order) => order.customerId === customer.id);
          const balance = orders.reduce((sum, order) => sum + orderRemaining(workspace, order.id), 0);
          return <tr key={customer.id}><td><span className="name-with-avatar"><span className="row-avatar">{initials(customer.name)}</span><span><span className="primary-cell">{customer.name}</span><span className="secondary-cell">{orders.length ? `Last order ${orders.sort((a, b) => b.orderDate.localeCompare(a.orderDate))[0].orderNumber}` : "No orders recorded"}</span></span></span></td><td>{customer.phone || <span className="muted">Not recorded</span>}</td><td>{orders.length}</td><td className={balance > 0 ? "amount-cell" : ""}>{money(balance)}</td><td>{customer.email || "—"}</td><td><span className="secondary-cell">{customer.notes || "—"}</span></td></tr>;
        })}
        {!rows.length && <tr><td colSpan={6} className="table-empty">No customer records match that search.</td></tr>}
      </tbody></table></div><div className="table-footer"><span>{rows.length} customer records</span><span>CSV customer duplicates are merged by normalized phone, then by name.</span></div>
    </section>
    {!workspace.customers.length && <div style={{ marginTop: 14 }}><EmptyState icon={<Users size={18} />} title="Add your first customer" description="Create a customer or import a customer list before recording orders." /></div>}
    {showNew && <AddCustomerModal onClose={() => setShowNew(false)} />}
    {showImport && <ImportWizard kind="customers" onClose={() => setShowImport(false)} />}
  </>;
}
