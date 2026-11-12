/** Which schemas PostgREST exposes on the live project (Management API). Prints schema names only, no secret. */
import { managementApi } from "../lib/supabase-api.ts";

const api = managementApi();
const c = await api.get<{ db_schema?: string; db_extra_search_path?: string }>(`/v1/projects/${api.ref}/postgrest`);
console.log({ db_schema: c.db_schema, db_extra_search_path: c.db_extra_search_path });
