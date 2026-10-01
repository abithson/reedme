"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, CircleDollarSign, ShieldCheck } from "lucide-react";
import { useMoneyTrail } from "@/components/MoneyTrailProvider";
import { Button } from "@/components/ui";
import { COUNTRIES, currencyForCountry, currencySign, detectBrowserCountry } from "@/lib/localization";

export default function LoginPage() {
  const router = useRouter();
  const { user, ready, signIn, signUp, supabaseAvailable } = useMoneyTrail();
  const [isSignup, setIsSignup] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [country, setCountry] = useState("NG");
  const countryTouched = useRef(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (ready && user) router.replace("/app"); }, [ready, user, router]);
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      if (!countryTouched.current) setCountry(detectBrowserCountry());
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(""); setSuccess("");
    if (!supabaseAvailable) { setError("Connected mode is not configured yet. Add your Supabase project URL and public anon key to .env.local, or explore the demo."); return; }
    if (password.length < 8) { setError("Use a password with at least 8 characters."); return; }
    setBusy(true);
    const result = isSignup ? await signUp(email.trim(), password, country) : await signIn(email.trim(), password);
    setBusy(false);
    if (result.error) { setError(result.error); return; }
    if ("needsEmailConfirm" in result && result.needsEmailConfirm) setSuccess("Account created. Check your email to confirm the address, then come back here to sign in.");
    else router.push("/app");
  }

  return (
    <main className="auth-screen">
      <section className="auth-card">
        <Link href="/" className="brand"><span className="brand-mark"><CircleDollarSign size={20} /></span><span className="brand-name">moneytrail<span>.</span></span></Link>
        <div className="eyebrow">{isSignup ? "Secure workspace" : "Welcome back"}</div>
        <h1>{isSignup ? "Create your account" : "Sign in to MoneyTrail"}</h1>
        <p>{isSignup ? "Start a private business workspace. Your data is isolated by Supabase row-level security." : "Continue to your connected business workspace."}</p>
        <form className="form-stack" onSubmit={submit}>
          <label className="field"><span>Email address</span><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@business.com" autoComplete="email" required /></label>
          {isSignup && <label className="field"><span>Country</span><select value={country} onChange={(event) => { countryTouched.current = true; setCountry(event.target.value); }} required>{COUNTRIES.map((item) => <option key={item.code} value={item.code}>{item.name} · {item.currency}</option>)}</select><small className="field-hint">Your country sets the workspace’s default currency ({currencySign(currencyForCountry(country), country)}).</small></label>}
          <label className="field"><span>Password</span><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="At least 8 characters" autoComplete={isSignup ? "new-password" : "current-password"} minLength={8} required /></label>
          {error && <div className="form-error">{error}</div>}
          {success && <div className="form-success">{success}</div>}
          <Button type="submit" disabled={busy}>{busy ? "Please wait…" : isSignup ? "Create account" : "Sign in"}<ArrowRight size={15} /></Button>
        </form>
        <div className="auth-info"><ShieldCheck size={15} /><span>MoneyTrail never asks for bank passwords. CSV data is parsed in your browser; connected records are saved to your configured Supabase project.</span></div>
        <div className="auth-switch">{isSignup ? "Already have an account? " : "New to MoneyTrail? "}<button className="text-button" onClick={() => { setIsSignup(!isSignup); setError(""); setSuccess(""); }}>{isSignup ? "Sign in" : "Create an account"}</button></div>
        <div className="auth-switch"><Link href="/app"><ArrowLeft size={12} /> Explore demo instead</Link></div>
      </section>
    </main>
  );
}
