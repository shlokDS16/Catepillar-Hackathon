/**
 * One `postgres` client to the Supabase project through the **session pooler**.
 * `.env`'s CONNECTION_STRING is the direct host (`db.<ref>.supabase.co`, IPv6 only), which this network
 * cannot resolve, so the URL is built from `SUPABASE_DB_PASSWORD` + the project ref instead of being
 * parsed (a raw `#` or `@` in a password would make `new URL` throw and echo the whole string).
 * Pooler host from the Management API `config/database/pooler` (2026-09-23); the session port 5432 is
 * what `supabase link` wrote to `supabase/.temp/pooler-url`.
 */
import postgres from "postgres";
import { loadEnv, projectRef, requireEnv } from "./env.ts";

export const POOLER_HOST_DEFAULT = "aws-0-ap-south-1.pooler.supabase.com";

export function poolerUrl(env = loadEnv()): string {
  if (env.CONNECTION_STRING?.includes(".pooler.supabase.com")) return env.CONNECTION_STRING;
  requireEnv(env, "SUPABASE_DB_PASSWORD");
  const host = env.SUPABASE_POOLER_HOST || POOLER_HOST_DEFAULT;
  return `postgres://postgres.${projectRef(env)}:${encodeURIComponent(env.SUPABASE_DB_PASSWORD)}@${host}:5432/postgres`;
}

export function connect(opts: { max?: number; quiet?: boolean } = {}) {
  return postgres(poolerUrl(), {
    max: opts.max ?? 1,
    prepare: false,
    idle_timeout: 20,
    connect_timeout: 15,
    onnotice: opts.quiet ? () => {} : (n) => console.log(`  notice: ${n.message}`),
  });
}
