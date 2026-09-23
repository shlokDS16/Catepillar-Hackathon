/**
 * B0: ensure the Pinecone index exists (research 16 §1: Starter plan, aws us-east-1; one dense index with
 * metric dotproduct so records can carry sparse values too; Voyage multimodal-3.5 = 1024 dims).
 * Verified against docs.pinecone.io/guides/index-data/create-an-index (API version 2025-10) on 2026-09-23.
 */
import { loadEnv, requireEnv } from "../lib/env.ts";

const env = requireEnv(loadEnv(), "PINECONE_API_KEY", "PINECONE_INDEX");
const H = { "Api-Key": env.PINECONE_API_KEY, "X-Pinecone-Api-Version": "2025-10", "Content-Type": "application/json", Accept: "application/json" };
const name = env.PINECONE_INDEX;
const describe = async () => fetch(`https://api.pinecone.io/indexes/${name}`, { headers: H });
let r = await describe();
if (r.status === 404) {
  const c = await fetch("https://api.pinecone.io/indexes", { method: "POST", headers: H, body: JSON.stringify({
    name, vector_type: "dense", dimension: 1024, metric: "dotproduct",
    spec: { serverless: { cloud: "aws", region: "us-east-1" } },
    tags: { app: "spotter", embedding: "voyage-multimodal-3.5" }, deletion_protection: "disabled",
  }) });
  console.log("create:", c.status, (await c.text()).slice(0, 300));
  r = await describe();
}
const d = (await r.json()) as Record<string, any>;
console.log("index:", r.status, { name: d.name, dimension: d.dimension, metric: d.metric, vector_type: d.vector_type, host: d.host, status: d.status, spec: d.spec });
