/** B0: which Gemini models this key can use (the docs' gemini-2.5-flash returned 404 "no longer available to new users"). */
import { loadEnv, requireEnv } from "../lib/env.ts";
const env = requireEnv(loadEnv(), "GOOGLE_GENERATIVE_AI_API_KEY");
const r = await fetch("https://generativelanguage.googleapis.com/v1beta/models?pageSize=200", { headers: { "x-goog-api-key": env.GOOGLE_GENERATIVE_AI_API_KEY } });
const j = (await r.json()) as { models?: { name: string; supportedGenerationMethods?: string[] }[] };
console.log(r.status, (j.models ?? []).filter((m) => m.supportedGenerationMethods?.includes("generateContent")).map((m) => m.name.replace("models/", "")).join("\n"));
