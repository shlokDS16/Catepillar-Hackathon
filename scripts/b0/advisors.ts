/** Security Advisor summary via the Management API (lane rule: paste it into the log line). Prints no secret. */
import { managementApi } from "../lib/supabase-api.ts";

type Lint = { name: string; level: string; metadata?: { name?: string; schema?: string } };
const api = managementApi();
const r = await api.get<{ lints: Lint[] }>(`/v1/projects/${api.ref}/advisors/security`);
const counts: Record<string, number> = {};
for (const l of r.lints ?? []) counts[`${l.level} ${l.name}`] = (counts[`${l.level} ${l.name}`] ?? 0) + 1;
console.log(counts);
