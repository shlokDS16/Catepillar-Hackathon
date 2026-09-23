/** B0: confirms the pooler connection and the key shapes without printing any secret. */
import { connect, poolerUrl } from "../lib/db.ts";
import { loadEnv, requireEnv } from "../lib/env.ts";

const e = requireEnv(loadEnv(), "SUPABASE_SECRET_KEY", "CONNECTION_STRING");
console.log({
  envConnectionString: e.CONNECTION_STRING.includes(".pooler.supabase.com") ? "pooler" : "direct host (rewritten to the pooler)",
  poolerHost: poolerUrl(e).replace(/^.*@/, "").replace(/\/.*$/, ""),
  secretKey: e.SUPABASE_SECRET_KEY.startsWith("sb_secret_") ? "new-model" : e.SUPABASE_SECRET_KEY.startsWith("eyJ") ? "legacy-jwt" : "unknown",
});
const sql = connect();
try {
  const r = await sql`select current_user, current_setting('server_version') as server_version, current_setting('is_superuser') as is_superuser`;
  console.log(r[0]);
} catch (err) {
  console.log("connect error:", (err as Error).message);
} finally {
  await sql.end();
}
