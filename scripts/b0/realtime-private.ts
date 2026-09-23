/** B0: Realtime "Allow public access" off (= private_only true) via the Management API `config/realtime`. */
import { managementApi } from "../lib/supabase-api.ts";

type Realtime = { private_only: boolean | null };
const api = managementApi();
const path = `/v1/projects/${api.ref}/config/realtime`;
const before = await api.get<Realtime>(path);
console.log("before private_only:", before.private_only);
if (before.private_only !== true) await api.patch(path, { private_only: true });
const after = await api.get<Realtime>(path);
console.log("after private_only:", after.private_only);
