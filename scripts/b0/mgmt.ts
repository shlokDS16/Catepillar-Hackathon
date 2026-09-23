/**
 * B0: Supabase Management API facts (image version, org, pooler, Realtime, secret names). Prints no secret.
 * `/v1/organizations` returns [] for a Vercel-managed org, so the org id comes from the project record.
 */
import { managementApi } from "../lib/supabase-api.ts";

type Project = { name: string; region: string; status: string; organization_id: string;
  database?: { version: string; postgres_engine: string; release_channel: string } };
type Pooler = { db_host: string; db_port: number; pool_mode: string; identifier: string };
type Realtime = { private_only: boolean | null };
type Secret = { name: string };

const api = managementApi();
const p = await api.get<Project>(`/v1/projects/${api.ref}`);
console.log("project:", { name: p.name, region: p.region, status: p.status, org: p.organization_id,
  db_version: p.database?.version, engine: p.database?.postgres_engine, release: p.database?.release_channel });

const all = await api.get<Project[]>("/v1/projects");
console.log("projects visible to this token:", all.map((x) => ({ name: x.name, org: x.organization_id, status: x.status })));

const pooler = await api.get<Pooler[]>(`/v1/projects/${api.ref}/config/database/pooler`);
console.log("pooler:", pooler.map((x) => ({ host: x.db_host, port: x.db_port, mode: x.pool_mode })));

const realtime = await api.get<Realtime>(`/v1/projects/${api.ref}/config/realtime`);
console.log("realtime private_only:", realtime.private_only);

const secrets = await api.get<Secret[]>(`/v1/projects/${api.ref}/secrets`);
console.log("function secret names:", secrets.map((s) => s.name).sort().join(", ") || "(none)");
