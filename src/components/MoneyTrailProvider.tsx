"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Session, SupabaseClient, User } from "@supabase/supabase-js";
import type { Workspace } from "@/lib/types";
import { createDemoWorkspace } from "@/lib/seed";
import { createCloudBusiness, emptyCloudWorkspace, getUserBusinesses, loadCloudWorkspace, saveCloudWorkspace, type CloudBusiness } from "@/lib/cloud";
import { getSupabaseBrowserClient, supabaseConfigured } from "@/lib/supabase";
import { reconcileWorkspace } from "@/lib/reconciliation";
import { currencyForCountry, isCountryCode, normalizeCountryCode } from "@/lib/localization";

const DEMO_STORAGE_KEY = "moneytrail.demo.workspace.v1";

type StorageMode = "demo" | "connected";
type CloudSyncState = "idle" | "saving" | "saved" | "error";

type MoneyTrailContextValue = {
  workspace: Workspace;
  mode: StorageMode;
  ready: boolean;
  user: User | null;
  businesses: CloudBusiness[];
  businessRole: string | null;
  needsBusiness: boolean;
  supabaseAvailable: boolean;
  syncState: CloudSyncState;
  syncError: string;
  commit: (updater: (current: Workspace) => Workspace) => void;
  signIn: (email: string, password: string) => Promise<{ error?: string }>;
  signUp: (email: string, password: string, country: string) => Promise<{ error?: string; needsEmailConfirm?: boolean }>;
  signOut: () => Promise<void>;
  createBusiness: (name: string, businessType: string, country: string, timezone: string) => Promise<{ error?: string }>;
  switchBusiness: (businessId: string) => Promise<{ error?: string }>;
  resetDemo: () => void;
};

const MoneyTrailContext = createContext<MoneyTrailContextValue | null>(null);

function readDemoWorkspace(): Workspace {
  if (typeof window === "undefined") return createDemoWorkspace();
  try {
    const saved = window.localStorage.getItem(DEMO_STORAGE_KEY);
    if (!saved) return createDemoWorkspace();
    const parsed = JSON.parse(saved) as Workspace;
    if (!parsed?.business?.id || !Array.isArray(parsed.orders) || !Array.isArray(parsed.transactions)) return createDemoWorkspace();
    const country = normalizeCountryCode(parsed.business.country);
    return {
      ...parsed,
      business: {
        ...parsed.business,
        country,
        currency: parsed.business.currency || currencyForCountry(country),
        timezone: parsed.business.timezone || "Africa/Lagos",
      },
    };
  } catch {
    return createDemoWorkspace();
  }
}

function saveDemoWorkspace(workspace: Workspace): void {
  try {
    window.localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(workspace));
  } catch {
    // Private browsing/quota failures leave the current in-memory demo usable.
  }
}

export function MoneyTrailProvider({ children }: { children: ReactNode }) {
  const [workspace, setWorkspace] = useState<Workspace>(() => createDemoWorkspace());
  const [mode, setMode] = useState<StorageMode>("demo");
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [businesses, setBusinesses] = useState<CloudBusiness[]>([]);
  const [businessRole, setBusinessRole] = useState<string | null>(null);
  const [needsBusiness, setNeedsBusiness] = useState(false);
  const [syncState, setSyncState] = useState<CloudSyncState>("idle");
  const [syncError, setSyncError] = useState("");
  const workspaceRef = useRef(workspace);
  const modeRef = useRef<StorageMode>("demo");
  const userRef = useRef<User | null>(null);
  const businessRef = useRef<CloudBusiness | null>(null);
  const syncQueueRef = useRef<Promise<void>>(Promise.resolve());
  const persistedByBusinessRef = useRef<Map<string, Workspace>>(new Map());
  const clientRef = useRef<SupabaseClient | null>(null);

  const supabaseAvailable = supabaseConfigured();

  const setActiveWorkspace = useCallback((next: Workspace, nextMode: StorageMode, nextUser: User | null, nextBusiness: CloudBusiness | null) => {
    workspaceRef.current = next;
    modeRef.current = nextMode;
    userRef.current = nextUser;
    businessRef.current = nextBusiness;
    if (nextMode === "connected" && nextBusiness) persistedByBusinessRef.current.set(nextBusiness.id, next);
    setWorkspace(next);
    setMode(nextMode);
    setUser(nextUser);
    setBusinessRole(nextBusiness?.role ?? null);
    setNeedsBusiness(nextMode === "connected" && Boolean(nextUser) && !nextBusiness);
    setSyncState("idle");
    setSyncError("");
  }, []);

  const activateSession = useCallback(async (client: SupabaseClient, session: Session) => {
    const businessesForUser = await getUserBusinesses(client);
    setBusinesses(businessesForUser);
    if (!businessesForUser.length) {
      const demo = readDemoWorkspace();
      workspaceRef.current = demo;
      modeRef.current = "connected";
      userRef.current = session.user;
      businessRef.current = null;
      setWorkspace(demo);
      setMode("connected");
      setUser(session.user);
      setBusinessRole(null);
      setNeedsBusiness(true);
      setSyncState("idle");
      setSyncError("");
      return;
    }
    const business = businessesForUser[0];
    const persisted = await loadCloudWorkspace(client, business);
    const connectedWorkspace = reconcileWorkspace(persisted, { autoMatch: false });
    setActiveWorkspace(connectedWorkspace, "connected", session.user, business);
    persistedByBusinessRef.current.set(business.id, persisted);
  }, [setActiveWorkspace]);

  useEffect(() => {
    let alive = true;
    const client = getSupabaseBrowserClient();
    clientRef.current = client;

    const initialize = async () => {
      const demo = readDemoWorkspace();
      if (!alive) return;
      workspaceRef.current = demo;
      setWorkspace(demo);
      saveDemoWorkspace(demo);
      if (client) {
        try {
          const { data, error } = await client.auth.getSession();
          if (error) throw error;
          if (data.session) await activateSession(client, data.session);
        } catch (error) {
          setSyncError(error instanceof Error ? error.message : "Could not load the connected workspace.");
        }
      }
      if (alive) setReady(true);
    };
    void initialize();

    const subscription = client?.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT") {
        const demo = readDemoWorkspace();
        setBusinesses([]);
        setActiveWorkspace(demo, "demo", null, null);
        saveDemoWorkspace(demo);
      } else if (event === "TOKEN_REFRESHED" && session) {
        setUser(session.user);
        userRef.current = session.user;
      }
    }).data.subscription;

    return () => {
      alive = false;
      subscription?.unsubscribe();
    };
  }, [activateSession, setActiveWorkspace]);

  const commit = useCallback((updater: (current: Workspace) => Workspace) => {
    const previous = workspaceRef.current;
    const next = updater(previous);
    if (next === previous) return;
    workspaceRef.current = next;
    setWorkspace(next);
    if (modeRef.current === "demo") {
      saveDemoWorkspace(next);
      return;
    }
    const client = clientRef.current;
    const activeBusiness = businessRef.current;
    if (!client || !activeBusiness) return;
    setSyncState("saving");
    setSyncError("");
    const actorId = userRef.current?.id ?? null;
    const businessId = next.business.id;
    syncQueueRef.current = syncQueueRef.current
      .then(async () => {
        // Diff against the last successful write, not merely the prior UI state; after a failed request
        // the next user action retries every unsynced row for this business.
        const lastPersisted = persistedByBusinessRef.current.get(businessId) ?? previous;
        await saveCloudWorkspace(client, next, lastPersisted, actorId);
        persistedByBusinessRef.current.set(businessId, next);
      })
      .then(() => setSyncState("saved"))
      .catch((error: unknown) => {
        setSyncState("error");
        setSyncError(error instanceof Error ? error.message : "The connected workspace could not be saved.");
      });
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const client = clientRef.current;
    if (!client) return { error: "Supabase is not configured. Set the public project URL and anon key first." };
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    if (error) return { error: error.message };
    if (!data.session) return { error: "No session was returned. Try signing in again." };
    try {
      await activateSession(client, data.session);
      return {};
    } catch (loadError) {
      return { error: loadError instanceof Error ? loadError.message : "Could not load this workspace." };
    }
  }, [activateSession]);

  const signUp = useCallback(async (email: string, password: string, country: string) => {
    const client = clientRef.current;
    if (!client) return { error: "Supabase is not configured. Set the public project URL and anon key first." };
    if (!isCountryCode(country)) return { error: "Choose a valid country before creating your account." };
    const { data, error } = await client.auth.signUp({
      email,
      password,
      options: { data: { country: normalizeCountryCode(country) } },
    });
    if (error) return { error: error.message };
    if (data.session) {
      try {
        await activateSession(client, data.session);
      } catch (loadError) {
        return { error: loadError instanceof Error ? loadError.message : "Account created, but the workspace could not be loaded." };
      }
      return {};
    }
    return { needsEmailConfirm: true };
  }, [activateSession]);

  const signOut = useCallback(async () => {
    const client = clientRef.current;
    if (client) {
      const { error } = await client.auth.signOut();
      if (error) setSyncError(error.message);
    }
    const demo = readDemoWorkspace();
    setBusinesses([]);
    setActiveWorkspace(demo, "demo", null, null);
  }, [setActiveWorkspace]);

  const createBusinessAction = useCallback(async (name: string, businessType: string, country: string, timezone: string) => {
    const client = clientRef.current;
    const currentUser = userRef.current;
    if (!client || !currentUser) return { error: "Sign in before creating a connected workspace." };
    if (!isCountryCode(country)) return { error: "Choose a valid country for this workspace." };
    try {
      const business = await createCloudBusiness(client, name, businessType, normalizeCountryCode(country), timezone);
      const next = emptyCloudWorkspace(business);
      setBusinesses((current) => [...current, business]);
      setActiveWorkspace(next, "connected", currentUser, business);
      return {};
    } catch (error) {
      return { error: error instanceof Error ? error.message : "Could not create the workspace." };
    }
  }, [setActiveWorkspace]);

  const switchBusiness = useCallback(async (businessId: string) => {
    const client = clientRef.current;
    const business = businesses.find((candidate) => candidate.id === businessId);
    const currentUser = userRef.current;
    if (!client || !business || !currentUser) return { error: "That workspace is not available for this account." };
    try {
      const persisted = await loadCloudWorkspace(client, business);
      const connectedWorkspace = reconcileWorkspace(persisted, { autoMatch: false });
      setActiveWorkspace(connectedWorkspace, "connected", currentUser, business);
      persistedByBusinessRef.current.set(business.id, persisted);
      return {};
    } catch (error) {
      return { error: error instanceof Error ? error.message : "Could not load that workspace." };
    }
  }, [businesses, setActiveWorkspace]);

  const resetDemo = useCallback(() => {
    const fresh = createDemoWorkspace();
    if (modeRef.current === "demo") {
      workspaceRef.current = fresh;
      setWorkspace(fresh);
      saveDemoWorkspace(fresh);
    }
  }, []);

  const value = useMemo<MoneyTrailContextValue>(() => ({
    workspace, mode, ready, user, businesses, businessRole, needsBusiness, supabaseAvailable, syncState, syncError,
    commit, signIn, signUp, signOut, createBusiness: createBusinessAction, switchBusiness, resetDemo,
  }), [workspace, mode, ready, user, businesses, businessRole, needsBusiness, supabaseAvailable, syncState, syncError, commit, signIn, signUp, signOut, createBusinessAction, switchBusiness, resetDemo]);

  return <MoneyTrailContext.Provider value={value}>{children}</MoneyTrailContext.Provider>;
}

export function useMoneyTrail(): MoneyTrailContextValue {
  const context = useContext(MoneyTrailContext);
  if (!context) throw new Error("useMoneyTrail must be used inside MoneyTrailProvider");
  return context;
}
