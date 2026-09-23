/**
 * B0: Vault secrets read by SQL (data-model §3.3, api-contracts UI-11):
 *   supabase_secret_key         → `dispatch` apikey header sent by pg_net
 *   telegram_supervisor_chat_id → chat binding for Telegram acks / checkpoint line
 *   site_emergency_tel          → `my_snapshot.site.emergency_tel` (the supervisor demo phone)
 *   public_functions_url        → base URL the `dispatches` kick trigger posts to (not secret, but read where the key is)
 * Idempotent: creates or updates by name. Prints names only.
 */
import { connect } from "../lib/db.ts";
import { loadEnv, projectRef, requireEnv } from "../lib/env.ts";

const env = requireEnv(loadEnv(), "SUPABASE_SECRET_KEY", "TELEGRAM_SUPERVISOR_CHAT_ID", "DEMO_SUPERVISOR_PHONE");
const wanted: Record<string, string> = {
  supabase_secret_key: env.SUPABASE_SECRET_KEY,
  telegram_supervisor_chat_id: env.TELEGRAM_SUPERVISOR_CHAT_ID,
  site_emergency_tel: env.DEMO_SUPERVISOR_PHONE,
  public_functions_url: `https://${projectRef(env)}.supabase.co/functions/v1`,
};
const sql = connect();
try {
  const existing = await sql`select id, name from vault.secrets where name = any(${Object.keys(wanted)})`;
  for (const [name, secret] of Object.entries(wanted)) {
    const row = existing.find((r) => r.name === name);
    if (row) await sql`select vault.update_secret(${row.id}::uuid, ${secret}, ${name})`;
    else await sql`select vault.create_secret(${secret}, ${name})`;
    console.log(`${row ? "updated" : "created"} vault secret ${name}`);
  }
  const check = await sql`select name, length(decrypted_secret)::int len from vault.decrypted_secrets where name = any(${Object.keys(wanted)}) order by 1`;
  console.log(check.map((r) => `${r.name}: ${r.len} chars`).join("\n"));
} finally {
  await sql.end();
}
