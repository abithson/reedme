"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  AlertCircle, ArrowDownUp, ArrowRight, Bell, ChevronDown, CircleDollarSign, FileChartColumnIncreasing,
  LayoutDashboard, LogOut, Menu, Settings2, ShoppingBag, Store, Users, X,
} from "lucide-react";
import { useMoneyTrail } from "@/components/MoneyTrailProvider";
import { Button, Spinner } from "@/components/ui";
import { businessDate, formatBusinessDate } from "@/lib/utils";
import { COUNTRIES, currencyForCountry, currencyName, currencySign, normalizeCountryCode } from "@/lib/localization";

const NAV_ITEMS = [
  { href: "/app", label: "Overview", icon: LayoutDashboard, exact: true },
  { href: "/app/transactions", label: "Transactions", icon: ArrowDownUp },
  { href: "/app/orders", label: "Orders", icon: ShoppingBag },
  { href: "/app/customers", label: "Customers", icon: Users },
  { href: "/app/exceptions", label: "Needs attention", icon: Bell },
  { href: "/app/reports", label: "Reports", icon: FileChartColumnIncreasing },
];

function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <Link href="/" className={`brand ${compact ? "brand-compact" : ""}`} aria-label="MoneyTrail home">
      <span className="brand-mark"><CircleDollarSign size={20} strokeWidth={2.1} /></span>
      {!compact && <span className="brand-name">moneytrail<span>.</span></span>}
    </Link>
  );
}

function BusinessSetup() {
  const { createBusiness, user, signOut } = useMoneyTrail();
  const [name, setName] = useState("");
  const [businessType, setBusinessType] = useState("Wholesale & distribution");
  const [country, setCountry] = useState(() => normalizeCountryCode(user?.user_metadata?.country));
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    if (name.trim().length < 2) { setError("Enter your business name."); return; }
    setSaving(true);
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    const result = await createBusiness(name.trim(), businessType, country, timezone);
    setSaving(false);
    if (result.error) setError(result.error);
  }
  return (
    <main className="onboarding-screen">
      <div className="onboarding-card">
        <Brand />
        <div className="onboarding-icon"><Store size={25} /></div>
        <div className="eyebrow">One last step</div>
        <h1>Set up your workspace</h1>
        <p className="muted">MoneyTrail keeps each business in a separate workspace. Your account is <strong>{user?.email}</strong>.</p>
        <form className="form-stack" onSubmit={submit}>
          <label className="field"><span>Business name</span><input value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Abeni Provisions" autoFocus maxLength={120} required /></label>
          <label className="field"><span>Business type</span><select value={businessType} onChange={(event) => setBusinessType(event.target.value)}>
            <option>Wholesale & distribution</option><option>Retail shop</option><option>Food & hospitality</option><option>Services</option><option>Online / social commerce</option><option>Other</option>
          </select></label>
          <label className="field"><span>Country</span><select value={country} onChange={(event) => setCountry(event.target.value)} required>{COUNTRIES.map((item) => <option key={item.code} value={item.code}>{item.name} · {item.currency}</option>)}</select></label>
          <div className="inline-notice">Workspace money will be shown in {currencyName(currencyForCountry(country), country)} ({currencyForCountry(country)}, {currencySign(currencyForCountry(country), country)}). This is a display currency, not a currency conversion.</div>
          {error && <div className="form-error"><AlertCircle size={15} />{error}</div>}
          <Button type="submit" disabled={saving}>{saving ? "Creating workspace…" : "Create secure workspace"}<ArrowRight size={16} /></Button>
        </form>
        <p className="fine-print">Your workspace uses the configured Supabase project and business-level access policies. CSV files are parsed in your browser; the raw file is not uploaded.</p>
        <button className="text-button onboarding-signout" onClick={() => void signOut()}><LogOut size={14} /> Sign out</button>
      </div>
    </main>
  );
}

export default function AppFrame({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { workspace, mode, ready, user, businesses, businessRole, needsBusiness, switchBusiness, syncState, syncError } = useMoneyTrail();
  const [mobileOpen, setMobileOpen] = useState(false);

  if (!ready) return <Spinner />;
  if (needsBusiness) return <BusinessSetup />;

  const isCurrent = (href: string, exact?: boolean) => exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <div className="app-layout">
      <aside className={`sidebar ${mobileOpen ? "sidebar-open" : ""}`}>
        <div className="sidebar-top"><Brand />
          <button className="mobile-close icon-button" aria-label="Close menu" onClick={() => setMobileOpen(false)}><X size={20} /></button>
        </div>
        <div className="workspace-chip">
          <span className="workspace-avatar"><Store size={17} /></span>
          <span className="workspace-info"><strong>{workspace.business.name}</strong><small>{mode === "demo" ? "Sample workspace" : workspace.business.businessType}</small></span>
          <ChevronDown size={15} />
        </div>
        <div className="nav-section-label">WORKSPACE</div>
        <nav className="primary-nav" aria-label="Main navigation">
          {NAV_ITEMS.map(({ href, label, icon: Icon, exact }) => (
            <Link key={href} href={href} className={`nav-link ${isCurrent(href, exact) ? "nav-link-active" : ""}`} onClick={() => setMobileOpen(false)}>
              <Icon size={18} strokeWidth={1.8} /><span>{label}</span>
              {label === "Needs attention" && workspace.exceptions.filter((exception) => exception.state === "open").length > 0 && <b className="nav-count">{Math.min(workspace.exceptions.filter((exception) => exception.state === "open").length, 99)}</b>}
            </Link>
          ))}
        </nav>
        <div className="sidebar-spacer" />
        <div className="sidebar-footnote">
          <div className="sidebar-footnote-icon"><CircleDollarSign size={18} /></div>
          <strong>Reconcile what you have.</strong>
          <span>Start with a CSV. Connect no bank passwords.</span>
          <Link href="/app/transactions">Import a statement <ArrowRight size={13} /></Link>
        </div>
        <Link href="/app/settings" className={`nav-link settings-link ${isCurrent("/app/settings") ? "nav-link-active" : ""}`} onClick={() => setMobileOpen(false)}><Settings2 size={18} /><span>Settings</span></Link>
        <div className="sidebar-footer"><span className="online-dot" /> MoneyTrail MVP <span className="version-label">v0.1</span></div>
      </aside>

      {mobileOpen && <button className="sidebar-scrim" aria-label="Close navigation" onClick={() => setMobileOpen(false)} />}
      <main className="app-main">
        <header className="topbar">
          <button className="mobile-menu icon-button" aria-label="Open navigation" onClick={() => setMobileOpen(true)}><Menu size={20} /></button>
          <div className="topbar-location"><span>Workspace</span><span className="crumb-slash">/</span><strong>{NAV_ITEMS.find((item) => isCurrent(item.href, item.exact))?.label ?? "Settings"}</strong></div>
          <div className="topbar-right">
            {mode === "connected" && businesses.length > 1 && <label className="business-switcher" aria-label="Switch business"><Store size={15} /><select value={workspace.business.id} onChange={(event) => void switchBusiness(event.target.value)}>{businesses.map((business) => <option key={business.id} value={business.id}>{business.name}</option>)}</select><ChevronDown size={13} /></label>}
            <span className={`sync-indicator ${syncState === "error" ? "sync-error" : ""}`} title={syncState === "error" ? syncError : undefined}>
              <span className="sync-dot" />{mode === "demo" ? "Demo mode" : syncState === "saving" ? "Saving…" : syncState === "error" ? "Sync issue" : "Connected"}
            </span>
            <span className="topbar-date">{formatBusinessDate(businessDate(new Date(), workspace.business), workspace.business, { weekday: "short", day: "numeric", month: "short" })}</span>
            {mode === "connected" && <button className="topbar-account" title={businessRole ? `Role: ${businessRole}` : "Account"} onClick={() => router.push("/app/settings")}>{user?.email?.slice(0, 1).toUpperCase() ?? "U"}</button>}
          </div>
        </header>

        {mode === "demo" ? (
          <div className="demo-notice"><span className="demo-pill">DEMO</span><span><strong>Sample data lives only in this browser.</strong> Don’t upload real bank statements or customer data here.</span><Link href="/app/settings">About data safety <ArrowRight size={13} /></Link></div>
        ) : syncState === "error" ? (
          <div className="sync-notice"><AlertCircle size={15} /><span><strong>Changes may not have reached the server.</strong> {syncError}</span></div>
        ) : null}
        <div className="workspace-content">{children}</div>
      </main>
    </div>
  );
}
