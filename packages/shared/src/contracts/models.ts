/**
 * Model ids (api-contracts §6, ADR-001 decision 6, D9, D13). A model change is one line here.
 * Gemini: `gemini-2.5-flash` returns 404 "no longer available to new users" on the project key
 * (B0, 2026-09-23), so D13 froze `gemini-3.6-flash`; `GEMINI_MODEL` in the function secrets overrides it.
 */
export const MODELS = {
  answer: "openai/gpt-oss-120b",                 // Groq, account A then B
  rewrite: "openai/gpt-oss-20b",                 // Groq: English query rewrite
  vision: "qwen/qwen3.8-27b",                    // Groq (Preview): photo → enum category only
  prompt_guard: "meta-llama/llama-prompt-guard-2-86m",
  safeguard: "openai/gpt-oss-safeguard-20b",
  gemini_text: "gemini-3.6-flash",               // D13; text only, never photos
  gemini_tts_fallback: "gemini-2.5-flash-preview-tts", // only if Sarvam fails; Hindi quality unverified
  embed: "voyage-multimodal-3.5",                // 1024 dims (Pinecone index spotter-kb, dotproduct)
  rerank: "rerank-2.5-lite",
  sparse: "pinecone-sparse-english-v0",
  tts: "bulbul:v3",                              // Sarvam (D7)
} as const;

export const LLM_CHAIN_DEFAULT = ["groq_a", "gemini", "groq_b"] as const;
export type LlmProvider = (typeof LLM_CHAIN_DEFAULT)[number];
