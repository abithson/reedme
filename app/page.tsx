import Link from "next/link";
import { ArrowRight, ArrowUpRight, Check, CircleDollarSign, FileSpreadsheet, ShieldCheck, Sparkles, SearchCheck, MessageCircleMore } from "lucide-react";

const features = [
  { icon: FileSpreadsheet, title: "Bring the evidence together", body: "Import orders and transaction CSVs from the tools you already use. See the columns and validation before anything is saved." },
  { icon: SearchCheck, title: "Review, don’t guess", body: "Deterministic matching suggests links with visible reasons. Ambiguous payments stay in your review queue." },
  { icon: MessageCircleMore, title: "Know the next move", body: "See unpaid balances, unmatched money and possible duplicates, with a clear explanation and a ready-to-share reminder." },
];

export default function HomePage() {
  return (
    <main className="landing">
      <nav className="landing-nav">
        <Link href="/" className="brand"><span className="brand-mark"><CircleDollarSign size={21} /></span><span className="brand-name">moneytrail<span>.</span></span></Link>
        <div className="landing-nav-actions"><a href="#how-it-works">How it works</a><Link href="/login">Sign in</Link><Link href="/app" className="button button-primary button-md">Open sample workspace <ArrowRight size={15} /></Link></div>
      </nav>

      <section className="landing-hero">
        <div className="hero-copy">
          <div className="hero-overline"><span>For businesses in any country</span> Reconciliation, without the busywork</div>
          <h1>Know where your business <em>money went.</em></h1>
          <p>Match customer orders against the bank, POS and payment evidence you already have. Find what needs attention, without replacing the systems your business runs on.</p>
          <div className="hero-actions"><Link href="/app" className="button button-primary button-lg">Explore the sample workspace <ArrowRight size={16} /></Link><a href="#how-it-works" className="button button-secondary button-lg">See how it works <ArrowUpRight size={15} /></a></div>
          <div className="hero-trust"><span><Check size={13} /> CSV first</span><span><Check size={13} /> Country-based currency</span><span><Check size={13} /> No bank passwords</span><span><Check size={13} /> Human-reviewed matches</span></div>
        </div>

        <div className="hero-visual" aria-label="MoneyTrail reconciliation dashboard preview">
          <Sparkles className="hero-spark" size={22} />
          <div className="preview-card">
            <div className="preview-top"><div className="preview-brand"><span className="preview-brand-icon"><CircleDollarSign size={16} /></span> Abeni Provisions & Distribution</div><span className="preview-demo">NIGERIA SAMPLE</span></div>
            <div className="preview-welcome"><small>Money overview · October</small><strong>Your money, in one place.</strong></div>
            <div className="preview-kpis">
              <div className="preview-kpi"><span>Confirmed received</span><strong>₦8.42m</strong></div>
              <div className="preview-kpi"><span>Still outstanding</span><strong>₦2.16m</strong></div>
              <div className="preview-kpi alert"><span>Needs review</span><strong>₦486k</strong></div>
            </div>
            <div className="preview-lower">
              <div className="preview-chart"><div className="preview-section-title">Incoming money <span>Last 7 days</span></div><div className="preview-chart-bars"><i className="preview-bar" style={{ height: "37%" }} /><i className="preview-bar" style={{ height: "53%" }} /><i className="preview-bar" style={{ height: "45%" }} /><i className="preview-bar" style={{ height: "76%" }} /><i className="preview-bar" style={{ height: "59%" }} /><i className="preview-bar" style={{ height: "88%" }} /><i className="preview-bar" style={{ height: "66%" }} /></div></div>
              <div className="preview-exceptions"><div className="preview-section-title">Needs attention <span>3 open</span></div><div className="preview-ex-row"><i className="preview-ex-dot" /><strong>Unmatched payment</strong><span>₦128k</span></div><div className="preview-ex-row"><i className="preview-ex-dot" /><strong>Overdue order</strong><span>₦245k</span></div><div className="preview-ex-row"><i className="preview-ex-dot" /><strong>Possible duplicate</strong><span>Review</span></div></div>
            </div>
            <div className="preview-foot"><ShieldCheck size={12} /> A human confirms uncertain matches. No payment is changed.</div>
          </div>
          <div className="hero-caption">A product preview with fictional demo data — not a claim about a real business.</div>
        </div>
      </section>

      <div className="landing-proof"><div className="landing-proof-inner"><strong>Works with the way you already collect money</strong><span className="proof-divider" /><span>Bank transfers</span><span>POS settlements</span><span>Cash &amp; USSD records</span><span>Payment gateways</span><span>WhatsApp orders</span></div></div>

      <section className="landing-section" id="how-it-works">
        <div className="section-heading"><div className="eyebrow">From records to a clearer picture</div><h2>One useful layer above your existing tools.</h2><p>MoneyTrail brings your order list and payment evidence together. It helps you investigate; it never pretends to know more than your records show.</p></div>
        <div className="feature-grid">{features.map(({ icon: Icon, title, body }) => <article className="feature-card" key={title}><div className="feature-icon"><Icon size={18} /></div><h3>{title}</h3><p>{body}</p></article>)}</div>
      </section>

      <section className="boundary-section"><div className="boundary-inner"><div><div className="eyebrow">A focused reconciliation layer</div><h2>Keep the systems you already trust.</h2><p>MoneyTrail starts with files you choose to upload. It doesn’t take custody of money or ask for online banking credentials.</p></div><div className="boundary-list"><div className="boundary-item"><Check size={15} /> Import CSV statements</div><div className="boundary-item"><Check size={15} /> Keep using your bank and POS</div><div className="boundary-item"><Check size={15} /> Review every uncertain match</div><div className="boundary-item"><Check size={15} /> Share reminders yourself</div><div className="boundary-item"><Check size={15} /> Export your records</div><div className="boundary-item"><Check size={15} /> Country-based currency display</div></div></div></section>

      <section className="landing-section" style={{ paddingTop: 55, paddingBottom: 55 }}><div className="section-heading" style={{ marginBottom: 0 }}><div className="eyebrow">Start with what you have</div><h2>See the workflow before connecting anything.</h2><p>Open the sample workspace to explore 50 fictional customers, 100 orders, and 200 bank-style entries. Demo changes stay in your browser.</p></div></section>
      <section className="landing-cta"><div className="landing-cta-inner"><div><h2>Find the money that needs a closer look.</h2><p>No setup for the demo. Don’t upload real financial data in sample mode.</p></div><Link href="/app" className="button button-lg">Open sample workspace <ArrowRight size={16} /></Link></div></section>
      <footer className="landing-footer"><span>© 2026 MoneyTrail · Built for clearer reconciliation</span><span>Sample data is fictional. V1 does not connect to bank accounts.</span></footer>
    </main>
  );
}
