"use client";

import { useSyncExternalStore } from "react";
import { MySnapshotOut } from "@cat/shared";
import type { ShellRole } from "@/components/chrome/nav-items";
import type { RpcCaller } from "@/data/live-adapter";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "@/data/live-config";

/**
 * The Live switch's state. Off ("demo") by default; signing in with a real account turns it on for
 * that account's role, signing out turns it off. "fallback" = signed in, but the last live call
 * failed and was answered from fixtures (the status band says so). supabase-js is loaded on demand,
 * so the demo path never downloads it.
 */
export type DataSource = "demo" | "live" | "fallback";
export type LiveState = { source: DataSource; role: ShellRole | null };

const DEMO: LiveState = { source: "demo", role: null };
let state: LiveState = DEMO;
const listeners = new Set<() => void>();
const set = (next: LiveState) => {
  if (next.source === state.source && next.role === state.role) return;
  state = next;
  listeners.forEach((l) => l());
};

export const getLiveState = () => state;
export const subscribeLive = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};
export const useLiveState = (): LiveState => useSyncExternalStore(subscribeLive, getLiveState, () => DEMO);

export const reportFallback = () => {
  if (state.role) set({ ...state, source: "fallback" });
};
export const reportLive = () => {
  if (state.role) set({ ...state, source: "live" });
};

type Client = import("@supabase/supabase-js").SupabaseClient;
let clientPromise: Promise<Client> | null = null;
function client(): Promise<Client> {
  clientPromise ??= import("@supabase/supabase-js").then(({ createClient }) =>
    createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false } }),
  );
  return clientPromise;
}

/** The caller the LiveAdapter uses: the signed-in user's own session, nothing else. */
export const liveRpc: RpcCaller = async (fn, args) => {
  const { data, error } = await (await client()).rpc(fn, args);
  return { data, error: error ? { message: error.message, code: error.code } : null };
};

/** The profile's role, read through my_snapshot (the one place the server says who you are). */
async function roleOfSession(): Promise<ShellRole | null> {
  const { data, error } = await liveRpc("my_snapshot");
  if (error) return null;
  const parsed = MySnapshotOut.safeParse(data);
  if (!parsed.success) return null;
  const role = parsed.data.profile.role;
  return role === "operator" || role === "fleet_manager" ? role : null;
}

export type SignInResult = { ok: true; role: ShellRole } | { ok: false; reason: "credentials" | "role" | "network" };

export async function signInLive(email: string, password: string): Promise<SignInResult> {
  try {
    const c = await client();
    const { error } = await c.auth.signInWithPassword({ email, password });
    if (error) return { ok: false, reason: error.status && error.status < 500 ? "credentials" : "network" };
    const role = await roleOfSession();
    if (!role) {
      await c.auth.signOut();
      return { ok: false, reason: "role" };
    }
    set({ source: "live", role });
    return { ok: true, role };
  } catch {
    return { ok: false, reason: "network" };
  }
}

export async function signOutLive(): Promise<void> {
  set(DEMO);
  try {
    await (await client()).auth.signOut();
  } catch {
    // Already back on fixtures; a failed network sign-out leaves only a stored token that expires.
  }
}

let restored = false;
/** After a reload: if this browser holds a session from an earlier sign-in, switch Live back on. */
export async function restoreLive(): Promise<void> {
  if (restored) return;
  restored = true;
  try {
    const has = Object.keys(window.localStorage).some((k) => k.startsWith("sb-") && k.endsWith("-auth-token"));
    if (!has) return;
    const { data } = await (await client()).auth.getSession();
    if (!data.session) return;
    const role = await roleOfSession();
    if (role) set({ source: "live", role });
  } catch {
    // storage blocked or offline: stay on fixtures
  }
}
