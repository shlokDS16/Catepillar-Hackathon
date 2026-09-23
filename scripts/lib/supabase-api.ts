/** Supabase Management API client (personal access token). Throws on any non-2xx reply. */
import { loadEnv, projectRef, requireEnv } from "./env.ts";

const API = "https://api.supabase.com";

export function managementApi(env = loadEnv()) {
  requireEnv(env, "SUPABASE_ACCESS_TOKEN");
  const ref = projectRef(env);
  const headers = { Authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}`, "Content-Type": "application/json" };

  async function call<T>(method: "GET" | "POST" | "PATCH", path: string, body?: unknown): Promise<T> {
    const r = await fetch(API + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    const text = await r.text();
    if (!r.ok) throw new Error(`${method} ${path.replace(ref, "<ref>")} → HTTP ${r.status}: ${text.slice(0, 200)}`);
    return (text ? JSON.parse(text) : null) as T;
  }
  return {
    ref,
    get: <T>(path: string) => call<T>("GET", path),
    post: <T>(path: string, body: unknown) => call<T>("POST", path, body),
    patch: <T>(path: string, body: unknown) => call<T>("PATCH", path, body),
  };
}
