/**
 * B0: Edge Function secrets from `.env` plus the derived ones (api-contracts §6, D9), set through the
 * Management API `POST /v1/projects/{ref}/secrets` (bulk create/overwrite). `SUPABASE_*` names are
 * reserved by the platform and injected automatically, so they are not sent. Prints names only.
 */
import { loadEnv } from "../lib/env.ts";
import { managementApi } from "../lib/supabase-api.ts";

const env = loadEnv();
const api = managementApi(env);
const FROM_ENV = [
  "GROQ_API_KEY", "GROQ_API_KEY_BACKUP", "GROQ_API_KEY_VISION", "GOOGLE_GENERATIVE_AI_API_KEY",
  "PINECONE_API_KEY", "PINECONE_INDEX", "VOYAGE_API_KEY",
  "TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_FROM_NUMBER", "DEMO_OPERATOR_PHONE", "DEMO_SUPERVISOR_PHONE",
  "TELEGRAM_BOT_TOKEN", "TELEGRAM_SUPERVISOR_CHAT_ID", "TELEGRAM_WEBHOOK_SECRET",
  "DEMO_DRIVER_SECRET",
];
const secrets = FROM_ENV.filter((k) => env[k]).map((name) => ({ name, value: env[name] }));
secrets.push({ name: "PUBLIC_FUNCTIONS_URL", value: `https://${api.ref}.supabase.co/functions/v1` });
secrets.push({ name: "LLM_CHAIN", value: env.LLM_CHAIN || "groq_a,gemini,groq_b" });
secrets.push({ name: "DRY_RUN", value: env.DRY_RUN || "true" }); // build protocol: external calls dry-run by default

await api.post(`/v1/projects/${api.ref}/secrets`, secrets);
console.log("set:", secrets.map((s) => s.name).join(", "));
const skipped = FROM_ENV.filter((k) => !env[k]);
if (skipped.length) console.log("skipped (empty in .env):", skipped.join(", "));
const list = await api.get<{ name: string }[]>(`/v1/projects/${api.ref}/secrets`);
console.log("now on the project:", list.map((s) => s.name).sort().join(", "));
