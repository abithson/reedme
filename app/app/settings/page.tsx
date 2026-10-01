"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowRight, Check, CircleHelp, Download, FileLock2, KeyRound, LogOut, RefreshCw, ShieldCheck } from "lucide-react";
import { useMoneyTrail } from "@/components/MoneyTrailProvider";
import { Badge, Button, PageHeader } from "@/components/ui";
import { downloadCsv } from "@/lib/utils";
import { COUNTRIES, currencyForCountry, currencyName } from "@/lib/localization";

function BusinessProfileSection({ businessId, businessName, initialBusinessType, initialCountry, timezone, hasFinancialRecords, mode, businessRole }: { businessId: string; businessName: string; initialBusinessType: string; initialCountry: string; timezone: string; hasFinancialRecords: boolean; mode: "demo" | "connected"; businessRole: string | null }) {
  const { commit } = useMoneyTrail();
  const [name, setName] = useState(businessName);
  const [businessType, setBusinessType] = useState(initialBusinessType);
  const [country, setCountry] = useState(initialCountry);
  const [saved, setSaved] = useState(false);
  const canEdit = mode === "demo" || businessRole === "owner" || businessRole === "admin";
  const currency = currencyForCountry(country);

  function saveBusiness(event: FormEvent) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    const now = new Date().toISOString();
    commit((current) => current.business.id !== businessId ? current : {
      ...current,
      business: { ...current.business, name: trimmed, businessType, country, currency, updatedAt: now },
    });
    setSaved(true);
    window.setTimeout(() => setSaved(false), 2200);
  }

  return <section className="panel settings-panel"><div className="settings-panel-head"><div><h2>Business profile</h2><p>Used on dashboards, reports and reminder drafts.</p></div><Badge tone={mode === "demo" ? "amber" : "green"}>{mode === "demo" ? "Demo workspace" : businessRole ?? "Connected"}</Badge></div>
    <form className="form-stack" onSubmit={saveBusiness}>
      <label className="field"><span>Business name</span><input value={name} onChange={(event) => setName(event.target.value)} disabled={!canEdit} maxLength={120} /></label>
      <label className="field"><span>Business type</span><select value={businessType} onChange={(event) => setBusinessType(event.target.value)} disabled={!canEdit}><option>Wholesale &amp; distribution</option><option>Retail shop</option><option>Food &amp; hospitality</option><option>Services</option><option>Online / social commerce</option><option>Other</option></select></label>
      <label className="field"><span>Country</span><select value={country} onChange={(event) => setCountry(event.target.value)} disabled={!canEdit || hasFinancialRecords}>{COUNTRIES.map((item) => <option key={item.code} value={item.code}>{item.name} · {item.currency}</option>)}</select>{hasFinancialRecords && <small className="field-hint">Country and currency are locked after financial records are added to avoid relabelling existing amounts. Create a separate workspace for another currency.</small>}</label>
      <div className="settings-row"><div><strong>Workspace currency</strong><span>{currencyName(currency, country)} · {currency}</span></div><Badge tone="slate">{currency}</Badge></div>
      <div className="settings-row"><div><strong>Timezone</strong><span>Used when showing timestamped statement rows</span></div><span>{timezone || "UTC"}</span></div>
      {canEdit && <div className="form-actions"><Button type="submit" disabled={!name.trim()}>{saved ? <Check size={14} /> : null}{saved ? "Saved" : "Save business details"}</Button></div>}
    </form>
  </section>;
}

export default function SettingsPage() {
  const { workspace, mode, supabaseAvailable, user, businessRole, syncState, syncError, resetDemo, signOut } = useMoneyTrail();

  function reset() {
    if (window.confirm("Reset this browser’s MoneyTrail demo to its original fictional sample data? This cannot be undone.")) resetDemo();
  }

  function exportAll() {
    downloadCsv("moneytrail-workspace-summary.csv", [
      ...workspace.customers.map((customer) => ({ record_type: "customer", id: customer.id, name: customer.name, phone: customer.phone, email: customer.email })),
      ...workspace.orders.map((order) => ({ record_type: "order", id: order.id, reference: order.orderNumber, customer: order.customerName, date: order.orderDate, amount: order.amount, currency: workspace.business.currency, due_date: order.dueDate })),
      ...workspace.transactions.map((transaction) => ({ record_type: "transaction", id: transaction.id, reference: transaction.reference, date: transaction.transactionDate, amount: transaction.amount, currency: workspace.business.currency, direction: transaction.type, match_status: transaction.matchStatus })),
    ]);
  }

  return <>
    <PageHeader eyebrow="Workspace preferences" title="Settings" description="Manage your business details, storage mode and data safety. MoneyTrail never stores banking credentials." />
    <div className="settings-grid">
      <div className="settings-column">
        <BusinessProfileSection key={`${workspace.business.id}:${workspace.business.name}:${workspace.business.businessType}:${workspace.business.country}`} businessId={workspace.business.id} businessName={workspace.business.name} initialBusinessType={workspace.business.businessType} initialCountry={workspace.business.country} timezone={workspace.business.timezone} hasFinancialRecords={workspace.orders.length > 0 || workspace.transactions.length > 0} mode={mode} businessRole={businessRole} />

        <section className="panel settings-panel" style={{ marginTop: 14 }}><div className="settings-panel-head"><div><h2>Data storage</h2><p>Understand where your workspace information lives.</p></div>{mode === "demo" ? <Badge tone="amber">Browser-local demo</Badge> : <Badge tone="green">Supabase connected</Badge>}</div>
          {mode === "demo" ? <><div className="data-warning"><AlertTriangle size={16} /><span><strong>Do not upload real statements or customer data.</strong><br />The demo is stored in this browser’s local storage. Anyone using this browser profile may be able to see it; it is not a secure production database.</span></div><div className="settings-row"><div><strong>Sample data</strong><span>{workspace.customers.length} customers · {workspace.orders.length} orders · {workspace.transactions.length} transactions</span></div><Button size="sm" variant="danger" onClick={reset}><RefreshCw size={13} /> Reset demo</Button></div><div className="settings-row"><div><strong>Browser storage</strong><span>Persisted locally on this device</span></div><Badge tone="slate">localStorage</Badge></div></> : <><div className="settings-row"><div><strong>Signed in as</strong><span>{user?.email}</span></div><Badge tone="green">Authenticated</Badge></div><div className="settings-row"><div><strong>Workspace isolation</strong><span>Every read/write is gated by database row-level security.</span></div><ShieldCheck size={17} color="#3f8758" /></div><div className="settings-row"><div><strong>Last sync</strong><span>{syncState === "saving" ? "Saving changes…" : syncState === "error" ? syncError : "Synced via your Supabase project"}</span></div><Badge tone={syncState === "error" ? "red" : syncState === "saving" ? "amber" : "green"}>{syncState}</Badge></div><div className="settings-row"><div><strong>Export workspace records</strong><span>Download a CSV copy of customers, orders and transaction metadata.</span></div><Button size="sm" variant="secondary" onClick={exportAll}><Download size={13} /> Export</Button></div></>}
        </section>
      </div>

      <div className="settings-column">
        <section className="panel settings-panel"><div className="settings-panel-head"><div><h2>{mode === "demo" ? "Connected mode" : "Account"}</h2><p>{mode === "demo" ? "Use your own Supabase project for an authenticated workspace." : "Manage the current authenticated session."}</p></div>{supabaseAvailable ? <Badge tone="green">Configured</Badge> : <Badge tone="slate">Not configured</Badge>}</div>
          {mode === "demo" ? <><div className="inline-notice">Connected mode uses Supabase Auth and PostgreSQL with RLS. This browser client only uses your public anon key; never add a service-role key here.</div><div className="settings-rule" /><div className="settings-row"><div><strong>Supabase environment</strong><span>{supabaseAvailable ? "Project URL and anon key are present." : "Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to .env.local."}</span></div><KeyRound size={16} color="#708478" /></div><Link href="/login" className="button button-secondary button-md" style={{ marginTop: 8 }}>{supabaseAvailable ? "Sign in or create account" : "Connected mode setup"}<ArrowRight size={14} /></Link></> : <><div className="settings-row"><div><strong>Account email</strong><span>{user?.email}</span></div><span className="settings-avatar">{user?.email?.slice(0, 1).toUpperCase()}</span></div><div className="settings-row"><div><strong>Current business role</strong><span>Permissions are enforced in the database, not just this interface.</span></div><Badge tone="blue">{businessRole ?? "member"}</Badge></div><Button variant="secondary" onClick={() => void signOut()} style={{ marginTop: 9 }}><LogOut size={14} /> Sign out</Button></>}
        </section>

        <section className="panel settings-panel" style={{ marginTop: 14 }}><div className="settings-panel-head"><div><h2>Data handling</h2><p>What MoneyTrail stores and what it leaves alone.</p></div><FileLock2 size={17} color="#4e8761" /></div>
          <div className="safety-list"><div className="safety-item"><Check size={15} /><span><strong>Raw CSV files are not retained.</strong> The browser parses the selected file and stores normalized rows only.</span></div><div className="safety-item"><Check size={15} /><span><strong>No bank login details.</strong> MoneyTrail V1 does not connect directly to bank accounts.</span></div><div className="safety-item"><Check size={15} /><span><strong>Business-scoped access.</strong> Connected workspaces rely on Supabase RLS policies and composite same-business foreign keys.</span></div><div className="safety-item"><Check size={15} /><span><strong>Audit trail.</strong> Manual match links and exception actions are recorded in the workspace history.</span></div><div className="safety-item"><CircleHelp size={15} /><span>Before launching in any market, review local privacy, consent, access, backup, retention and deletion requirements with qualified counsel.</span></div></div>
        </section>

        <section className="panel settings-panel" style={{ marginTop: 14 }}><h2>About this sample</h2><p>MoneyTrail demonstrates matching rules, not proof that a payment cleared. Demo customers and contact details are fictional; no real business performance or customer outcome is represented.</p><div className="settings-row"><div><strong>Build</strong><span>CSV-first reconciliation MVP</span></div><Badge tone="slate">0.1.0</Badge></div><div className="settings-row"><div><strong>Sample records</strong><span>50 customers · 100 orders · 200 transactions</span></div><Badge tone="green">Seeded</Badge></div></section>
      </div>
    </div>
  </>;
}
