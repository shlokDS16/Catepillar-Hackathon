/**
 * Wakes the project's Realtime service by opening one authenticated websocket connection: the service creates
 * the daily `realtime.messages_YYYY_MM_DD` partitions once a tenant connects, and `realtime.send` silently
 * drops broadcasts until they exist ("no partition of relation messages found for row"). The project allows
 * private channels only, so the join needs a signed-in user: a throwaway auth user is created with the secret
 * key and deleted at the end. Run before the first Realtime test on a fresh or long-idle project; demo-check
 * (B21) asserts a partition for today exists.
 */
import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";
import { connect } from "../lib/db.ts";
import { loadEnv, requireEnv } from "../lib/env.ts";

const env = requireEnv(loadEnv(), "NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "SUPABASE_SECRET_KEY");
const sql = connect({ quiet: true });
const partitions = async () =>
  (await sql`select inhrelid::regclass::text part from pg_inherits where inhparent = 'realtime.messages'::regclass order by 1`).map((r) => r.part);
console.log("partitions before:", await partitions());

const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const email = `realtime-wake-${Date.now()}@spotter.invalid`;
const password = randomBytes(24).toString("base64url");
const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
if (created.error) throw created.error;
const userId = created.data.user.id;
try {
  const client = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } });
  const signed = await client.auth.signInWithPassword({ email, password });
  if (signed.error) throw signed.error;
  await client.realtime.setAuth(signed.data.session.access_token);
  const channel = client.channel("op:wake", { config: { private: true } });
  const status = await new Promise<string>((resolve) => {
    const timer = setTimeout(() => resolve("timeout"), 10000);
    channel.subscribe((s, err) => {
      if (s === "SUBSCRIBED" || s === "CHANNEL_ERROR" || s === "TIMED_OUT") { clearTimeout(timer); resolve(err ? `${s}: ${err.message}` : s); }
    });
  });
  console.log("channel:", status, "(a policy refusal still boots the tenant)");
  await client.removeAllChannels();
  await new Promise((r) => setTimeout(r, 3000));
} finally {
  const del = await admin.auth.admin.deleteUser(userId);
  console.log("temp user deleted:", !del.error);
}
console.log("partitions after:", await partitions());
await sql.end();
