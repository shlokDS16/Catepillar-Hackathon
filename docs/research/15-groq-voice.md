# 15 — Groq (LLM provider) + Indian-language voice

Prepared 2026-09-23. Scope: replaces Anthropic/Claude as the LLM provider per team decision — Groq
for chat, vision, and STT; Groq lacks Indian-language TTS so a separate TTS vendor is still needed
for M2 (Safety Shield alerts), M4 (Guardian), and M7 (lesson dubbing). Read alongside
`docs/research/12-ai-comms-env.md` (the Claude-based version of §1, now superseded for the LLM
layer) and `docs/specs/idea.md` §5 M2/M7/M8. Sources verified directly against
`console.groq.com/docs` (fetched raw 2026-09-23) and the AI SDK docs via context7 MCP; every
Groq model/limit claim below was cross-checked against the raw markdown of the cited page, not a
third-party summary.

---

## 1. Groq model catalogue (verified 2026-09-23)

**Important finding: `console.groq.com/docs/quickstart` still shows `llama-3.3-70b-versatile` as
the example model, but the live models table marks both `llama-3.1-8b-instant` and
`llama-3.3-70b-versatile` "Enterprise" / "Contact Sales" — they are no longer on the free or
Developer-plan rate-limit table at all.** Per the deprecation log
(`console.groq.com/docs/deprecations`), both were deprecated for standard tiers 06/17/26, shut
down 08/16/26, replacement = `openai/gpt-oss-20b` / `openai/gpt-oss-120b`. **Do not use the
quickstart's example model ID** — it is stale documentation. Build against `openai/gpt-oss-120b`
and `openai/gpt-oss-20b`.

### Chat LLMs — free/Developer-tier models
[Models](https://console.groq.com/docs/models) · [Structured outputs](https://console.groq.com/docs/structured-outputs) · [Tool use](https://console.groq.com/docs/tool-use) · [Vision](https://console.groq.com/docs/vision)

| Model ID | Status | Context window | Max output | Tool calling | Parallel tool calls | `strict:true` JSON schema | Vision |
|---|---|---|---|---|---|---|---|
| `openai/gpt-oss-120b` | Production | 131,072 | 65,536 | Yes | **No** | Yes | No |
| `openai/gpt-oss-20b` | Production | 131,072 | 65,536 | Yes | **No** | Yes | No |
| `openai/gpt-oss-safeguard-20b` | Preview | 131,072 | 65,536 | Yes | No | Not listed | No |
| `qwen/qwen3.8-27b` | Preview | 131,042 | 16,384 | Yes | **Yes** | Yes | **Yes** |
| `minimaxai/minimax-m2.7` | Preview, Enterprise-only (Contact Sales) | 196,608 | 131,072 | Not confirmed | — | Not confirmed | No |

Both `gpt-oss` models are OpenAI's open-weight releases hosted by Groq; per Groq's own tool-use
docs they support tool calling but **not** parallel tool calls in one turn (call tools
sequentially, one per turn, if you need more than one). `qwen/qwen3.8-27b` is the only model that
does parallel tool calls **and** vision, but it is Preview status — "intended for evaluation...
may be discontinued at short notice" — so treat it as a demo-only choice, not something to lock a
production path to.

**Recommendation**: `openai/gpt-oss-120b` for anything quality-sensitive (Ask Spotter RAG
answers, incident-summary narration, M6 estimate explanations); `openai/gpt-oss-20b` as the
fast/cheap fallback (it has identical context/limits, roughly half the price, higher token
throughput per Groq's speed column: ~1000 t/s vs ~500 t/s).

### Vision (image input, for the walk-around/multimodal-RAG idea in M8/research-12 §5)
Only **`qwen/qwen3.8-27b`** currently accepts image input on Groq: max 20 MB per image-URL
request, up to 3 images/request, each image costs 2,048 input tokens flat.
[Vision docs](https://console.groq.com/docs/vision). This is a real gap versus the
Claude-based plan in research 12 (which assumed Claude vision on all current models) — if the
photo walk-around feature (research 12 §5 idea #5) is built on Groq, it is pinned to one Preview
model with no production fallback on this provider. Flag this as a risk before committing demo
time to it.

### Speech-to-text — Whisper
[Speech-to-text docs](https://console.groq.com/docs/speech-to-text)

| Model ID | Price | Languages | Notes |
|---|---|---|---|
| `whisper-large-v3` | $0.111/audio-hour | Multilingual (Whisper's ~99-language set, incl. Hindi, Tamil, Telugu, Marathi) | Higher accuracy; recommended when "error-sensitive and requires multilingual support" per Groq's own model-selection guidance |
| `whisper-large-v3-turbo` | $0.04/audio-hour | Same language set | Faster/cheaper; Groq's recommendation when you need "the best price for performance" |

Groq's docs do not publish per-language WER, but the underlying OpenAI Whisper large-v3
benchmark (which both Groq models are hosted, unmodified, from) shows a large accuracy gap
between high-resource languages (English ≈ single-digit % WER) and Hindi (independently reported
around 25–35% WER on non-trivial audio, worse on noisy/accented speech) — Hindi/Tamil/Telugu/
Marathi are all lower-resource in Whisper's training mix, so expect materially worse accuracy
than English, consistent with research 12's Sarvam-STT comparison. **`whisper-large-v3` (not
turbo) is the safer pick for the 4 target Indian languages** given the accuracy trade-off is more
consequential on already-weaker languages. Max file size 25 MB (free tier) / 100 MB (Developer
plan); min billable duration 10s.

### Text-to-speech
[Text-to-speech docs](https://console.groq.com/docs/text-to-speech) ·
[Deprecations](https://console.groq.com/docs/deprecations)

| Model ID | Status | Languages | Price |
|---|---|---|---|
| `canopylabs/orpheus-v1-english` | Preview | **English only** | $22/1M characters |
| `canopylabs/orpheus-arabic-saudi` | Preview | **Arabic (Saudi) only** | $40/1M characters |

`playai-tts` / `playai-tts-arabic` (the older PlayAI models sometimes referenced in 2025-era
blog posts) were **shut down 2025-12-31** and replaced by the two Orpheus models above.
**Groq has no Hindi, Tamil, Telugu, or Marathi TTS voice, in any model, as of this check** — this
is a hard capability gap, not a configuration issue. See §4 for the replacement vendor.

---

## 2. Free-tier rate limits and the multi-key question

### Rate limits (Developer/free plan — verified table, `console.groq.com/docs/rate-limits`)

| Model ID | RPM | RPD | TPM | TPD | ASH | ASD |
|---|---|---|---|---|---|---|
| `openai/gpt-oss-120b` | 30 | 1,000 | 8,000 | 200,000 | – | – |
| `openai/gpt-oss-20b` | 30 | 1,000 | 8,000 | 200,000 | – | – |
| `openai/gpt-oss-safeguard-20b` | 30 | 1,000 | 8,000 | 200,000 | – | – |
| `qwen/qwen3.8-27b` | 30 | 1,000 | 8,000 | 200,000 | – | – |
| `whisper-large-v3` | 20 | 2,000 | – | – | 7,200 | 28,800 |
| `whisper-large-v3-turbo` | 20 | 2,000 | – | – | 7,200 | 28,800 |
| `canopylabs/orpheus-v1-english` | 10 | 100 | 1,200 | 3,600 | – | – |
| `canopylabs/orpheus-arabic-saudi` | 10 | 100 | 1,200 | 3,600 | – | – |

RPM=requests/min, RPD=requests/day, TPM/TPD=tokens per minute/day, ASH/ASD=audio-seconds per
hour/day. `llama-3.1-8b-instant`/`llama-3.3-70b-versatile` are absent from this table entirely —
confirming they are not usable on the free/Developer tier at all (Enterprise/Contact Sales only).
Cached tokens (prompt caching) don't count against TPM/TPD.
[Rate limits](https://console.groq.com/docs/rate-limits)

**8,000 TPM on the chat models is the binding constraint for a RAG assistant.** A single
Ask Spotter turn with a system prompt + several retrieved SOP chunks + conversation history can
plausibly run 2,000–4,000 input tokens; two such turns in the same minute can exhaust the TPM
budget well before the 30 RPM or 1,000 RPD ceiling is reached. Size retrieval chunk count/length
with this in mind, and design the fallback chain in §3 assuming 429s under demo-day burst load
(judges hammering the assistant) are a real possibility, not a tail case.

### Is it per key, per org, or per account? Multi-key legality

**Verified directly from Groq's own docs**: *"Rate limits apply at the organization level, not
individual users."* [Rate limits](https://console.groq.com/docs/rate-limits). An API key belongs
to an organization; **all keys under one organization share one rate-limit pool** — creating five
keys under the same account does not give 5×30 RPM, it's still 30 RPM shared across every key.

**Is using several keys from one account against the Terms of Service?** Checked Groq's
Acceptable Use & Responsible AI Policy directly (effective 2025-10-15):

> "Customer agrees not to... use the Cloud Services and AI Model Services beyond published
> parameters, rate limits, or use limitations, **including by registering multiple accounts or
> orchestrating usage between multiple organizations**"
> [Acceptable Use & Responsible AI Policy](https://console.groq.com/docs/legal/ai-policy)

This clause bans **multiple accounts/organizations** used to multiply quota. It does **not** ban
multiple API keys inside one organization — and per the rate-limit doc above, multiple keys in
one org can't multiply quota anyway (they share the pool), so there is nothing to "circumvent."
**Verdict: the team's plan (multiple Groq keys — one per task, plus backups, under a single
account/org) is compliant.** It buys observability (per-key usage in the Groq dashboard, easy
individual key rotation if one leaks, clear ownership per teammate) but **zero extra throughput**.
Do **not** register separate Groq accounts/orgs to get separate 30 RPM pools — that is the exact
behavior the AUP names.

**Recommended compliant approach**:
1. One Groq organization for the team.
2. Separate named keys per task for observability: `GROQ_API_KEY_CHAT`, `GROQ_API_KEY_VOICE`
   (STT), plus one or two `GROQ_API_KEY_BACKUP_*` spares for quick rotation if a key is
   accidentally committed/leaked during the hackathon. All draw from the same 30 RPM / 8,000 TPM
   pool per model — budget accordingly, don't assume they add up.
3. A non-Groq fallback provider (§3) for when the shared pool is exhausted — this is the actual
   lever for more throughput, not more keys.

---

## 3. Wiring: `@ai-sdk/groq`, fallback chain, retries, grounded citations

### Provider setup (verified via context7 / `ai-sdk.dev/providers/ai-sdk-providers/groq`)
```ts
import { groq, createGroq } from '@ai-sdk/groq';
import { generateText } from 'ai';

// default export reads process.env.GROQ_API_KEY automatically
const { text } = await generateText({
  model: groq('openai/gpt-oss-120b'),
  prompt: '...',
});

// or, to point a specific call at a specific named key (e.g. the voice key):
const groqVoice = createGroq({ apiKey: process.env.GROQ_API_KEY_VOICE });
const sttModel = groqVoice.transcription('whisper-large-v3');
```
`createGroq({ apiKey, baseURL, headers, fetch })` lets each of the team's separate keys be wired
to a distinct `groq*` instance per task (chat vs. voice), matching the multi-key plan in §2.
Package: `ai` + `@ai-sdk/groq` (`pnpm add ai @ai-sdk/groq`). Env var: **`GROQ_API_KEY`** is the
default the provider reads if no `apiKey` is passed — this is the exact name, confirmed from both
the AI SDK provider docs and Groq's own quickstart (`export GROQ_API_KEY=<key>`).
[Quickstart](https://console.groq.com/docs/quickstart) · [AI SDK Groq provider](https://ai-sdk.dev/providers/ai-sdk-providers/groq)

**Gap to plan around**: `@ai-sdk/groq` exposes `groq.transcription()` (STT) but **no
`groq.speech()`** — Groq TTS (Orpheus) is not one of the AI SDK's supported `generateSpeech()`
providers (that list is OpenAI, Mistral, ElevenLabs, LMNT, Hume, Google/Vertex, xAI, Cartesia,
Fish Audio only, per the AI SDK docs) — moot anyway since Groq TTS has no Indian-language voice
(§1), but if English/Arabic Orpheus audio is ever wanted, call Groq's TTS REST endpoint directly
rather than expecting an AI SDK wrapper.

### Fallback chain: Groq A → Groq B → another provider
The AI SDK has no built-in cross-provider failover outside the paid AI Gateway/community
providers (confirmed via context7 — the only first-party fallback mechanisms found are
`customProvider({ fallbackProvider })`, which substitutes for an *unknown model ID*, not a
*failed request*, and the AI Gateway's `providerOptions.gateway.models` array, which requires
routing through Vercel's gateway). For a direct multi-provider chain, wrap calls manually and
classify errors:

```ts
import { generateText, TooManyRequestsError, APICallError } from 'ai';
import { groq } from '@ai-sdk/groq';
import { anthropic } from '@ai-sdk/anthropic'; // already in the stack per research 12

const CHAIN = [
  { model: groq('openai/gpt-oss-120b'), maxRetries: 1 },   // Groq A — best quality
  { model: groq('openai/gpt-oss-20b'), maxRetries: 1 },    // Groq B — same org, only helps if
                                                            // A's failure was model-specific
                                                            // (e.g. a 5xx), not a 429 shared-pool hit
  { model: anthropic('claude-haiku-4-5'), maxRetries: 2 }, // external provider — the real
                                                            // escape hatch from a Groq-wide 429
];

async function generateWithFallback(prompt: string) {
  let lastErr: unknown;
  for (const step of CHAIN) {
    try {
      return await generateText({ model: step.model, prompt, maxRetries: step.maxRetries });
    } catch (err) {
      lastErr = err;
      if (err instanceof TooManyRequestsError) continue;                 // 429 → try next link
      if (err instanceof APICallError && err.isRetryable) continue;      // 5xx → try next link
      throw err; // non-retryable (bad request, auth, etc.) — don't burn the whole chain on it
    }
  }
  throw lastErr;
}
```
Note the Groq-A→Groq-B step is weaker than it looks: since limits are **organization-level**
(§2), a 429 on `gpt-oss-120b` from TPM exhaustion doesn't necessarily mean `gpt-oss-20b` is
also blocked (they have separate per-model TPM pools per the table in §2), so A→B is a real
fallback for model-specific exhaustion, just not for an org-wide outage. The Anthropic step is
the one that actually survives a Groq-wide incident. AI SDK's own per-call `maxRetries` (default
2, i.e. 3 attempts) already retries transient/5xx errors with backoff before the error surfaces
to this loop — respect the `retry-after` header Groq returns on 429
([rate limit headers](https://console.groq.com/docs/rate-limits)) rather than a fixed backoff if
building custom retry logic.

### Grounded citations without Claude's Citations API
Research 12 §1 designed this pattern around Claude's Citations API; Groq has no equivalent
citation-block feature, so fall back to the AI SDK's `Output.object` structured-output path
(same building block already needed for §1's tool-approval flow), validated client-side against
the retrieved chunk set — this is *more* portable than an API-native citations feature since it
works identically on every provider in the fallback chain above:

```ts
import { generateText, Output } from 'ai';
import { groq } from '@ai-sdk/groq';
import { z } from 'zod';

const AnswerSchema = z.object({
  answer: z.string(),
  citedChunkIds: z.array(z.string()),
  isGrounded: z.boolean(), // model self-reports whether it found sufficient grounding
});

const { output } = await generateText({
  model: groq('openai/gpt-oss-120b'), // strict:true json_schema supported — confirmed §1
  system: `Answer only from the provided <chunk id="...">...</chunk> blocks. Cite every chunk id
you used in citedChunkIds. If the retrieved chunks don't answer the question, set isGrounded=false
and answer "ask your supervisor" — do not answer from general knowledge on safety-critical topics.`,
  prompt: buildPromptWithChunks(retrievedChunks, question),
  output: Output.object({ schema: AnswerSchema }),
  providerOptions: { groq: { structuredOutputs: true, strictJsonSchema: true } },
});

// server-side validation gate — the actual enforcement, not the model's self-report:
const retrievedIds = new Set(retrievedChunks.map(c => c.id));
const isActuallyGrounded =
  output.isGrounded &&
  output.citedChunkIds.length > 0 &&
  output.citedChunkIds.every(id => retrievedIds.has(id));
if (!isActuallyGrounded) return REFUSAL_RESPONSE;
```
`strict: true` structured outputs are confirmed supported on `openai/gpt-oss-120b`,
`openai/gpt-oss-20b`, and `qwen/qwen3.8-27b` [Structured outputs](https://console.groq.com/docs/structured-outputs)
— pick one of those three for anything using this pattern. The `providerOptions.groq` fields
(`structuredOutputs`, `strictJsonSchema`, both default `true`) are documented in the AI SDK's
`GroqLanguageModelChatOptions` type. Streaming and tool use are **not** supported together with
structured outputs on Groq — this pattern is non-streamed, one-shot generation only, which is
fine for a citation-gated safety answer (research 12's own guardrail design already assumed a
non-streamed cite-then-verify step).

---

## 4. Indian-language TTS — Groq has none, so pick a replacement

Groq covers 0 of the 4 target languages (Hindi/Tamil/Telugu/Marathi) for TTS (§1). Comparing the
five options the brief asked for, current as of this check:

| Provider | Free tier | hi-IN / ta-IN / te-IN / mr-IN coverage | Notes |
|---|---|---|---|
| **Sarvam AI (Bulbul)** | ₹100–₹1,000 signup credit (source discrepancy, per research 12 — verify live) | All 4 confirmed — purpose-built Indic TTS | Bulbul v3 now **₹30/10,000 chars** (price rose from v2's ₹15/10K per a 2026-08 update) — no longer the cheapest-per-unit if ElevenLabs' 10K free credits/mo cover the demo's volume; still the only vendor built specifically for these languages, sub-250ms latency. [Sarvam pricing](https://docs.sarvam.ai/api-reference-docs/pricing) |
| **Google Cloud TTS** | 1M chars/mo free for Neural2/Studio/Chirp3-HD voices, 4M/mo for Standard, non-expiring while account active; $300 new-account credit separately | hi-IN and ta-IN both have Standard/WaveNet/Neural2/Chirp3-HD tiers (`hi-IN-Chirp3-HD-Kore`, `hi-IN-Neural2-*`, etc. — already confirmed in research 12's Twilio section); te-IN/mr-IN voice-tier breadth not independently re-verified this pass | Highest free-tier volume by far if Neural2/Chirp3-HD (1M chars/mo) is enough. [Pricing](https://cloud.google.com/text-to-speech/pricing) |
| **Azure AI Speech (F0 tier)** | 500,000 TTS characters/mo + 5 STT hours/mo, non-expiring, no card required on a free Azure subscription | All 4 confirmed via neural voices (e.g. `hi-IN-SwaraNeural`), per research 12 | Second-largest free volume; enterprise SLA if this goes past hackathon. [Quotas](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/speech-services-quotas-and-limits) |
| **ElevenLabs (Multilingual v2)** | 10,000 credits/mo, 1 credit ≈ 1 character ≈ 10 minutes of audio total | Hindi, Tamil confirmed; **Bengali, Kannada, Marathi now also confirmed** in Multilingual v2 (an update from research 12's "not confirmed" flag) | Smallest free allowance of the four by a wide margin — 10K chars/mo won't cover more than a handful of demo alert lines; no commercial rights on the free plan. [Languages](https://elevenlabs.io/docs/help-center/other/what-languages-do-you-support) |
| **Browser `speechSynthesis` (Web Speech API)** | Free, no signup, on-device | Depends entirely on the OS/browser voice pack installed on the demo device — Hindi (`hi-IN`) is a supported locale in the API surface, but Chrome on Android surfaces an unfiltered language list rather than guaranteed pre-installed voices, and Indic voice packs are **not guaranteed present** on a stock Windows or Android device (must be downloaded via OS settings) | Genuinely offline/zero-cost when it works, but untested-per-device risk on demo day — this matches research 12 §6's existing caution. Test on the actual demo phone/laptop before relying on it live. |

**Recommendation** (updates research 12 §2 given the ElevenLabs coverage clarification and
Sarvam's price increase, but doesn't change the bottom line): **Sarvam AI as primary** — it's
still the only vendor built specifically for all 4 target languages in one API, with the fastest
signup and lowest integration effort, and the price increase (₹30/10K chars) is still cheap in
absolute terms for a hackathon's alert-line volume. **Azure AI Speech as fallback** — largest
non-Sarvam free allowance (500K chars/mo) with all 4 languages confirmed via named neural voices,
useful if Sarvam's credit balance or reliability is in doubt on demo day. Do not lead with
ElevenLabs (10K chars/mo free is too small once you're TTS-ing every alert + two lesson dubs) or
the Web Speech API alone (device-dependent voice availability) — but Web Speech API is a
reasonable *silent* fallback-of-last-resort text display if all network TTS is unavailable, since
it costs nothing to attempt.

**For the demo alerts specifically: pre-generate audio files, don't call TTS live.** The Safety
Shield's four-tier alerts (idea.md M2) and Guardian's anomaly protocols (M4) both use a small,
enumerable set of Hindi phrases (seatbelt, proximity zones, PPE, SOS, per-anomaly protocol
lines). Generate each with Sarvam Bulbul once at build time, store the `.mp3`/`.wav` files in the
repo/CDN, and play them back client-side — this removes Sarvam's live rate limits and network
latency entirely from the demo's critical path, and matches the existing "pre-generated Hindi TTS
audio" language already in idea.md M2. Reserve live TTS calls for genuinely dynamic text (e.g. a
Replay scenario's narration or an Ask Spotter spoken answer), where pre-generation isn't possible.

---

## 5. Env var list and signup steps (this part only)

| Var | Required for | Format |
|---|---|---|
| `GROQ_API_KEY` | Default/chat Groq key (AI SDK reads this automatically if no explicit key is passed) | Groq console → Settings → API Keys |
| `GROQ_API_KEY_CHAT` | Named key for the Ask Spotter / narration chat path (if separating from default, per §2's per-task plan) | same format |
| `GROQ_API_KEY_VOICE` | Named key for Whisper STT calls | same format |
| `GROQ_API_KEY_BACKUP` | Spare key(s), one org, for fast rotation if a key leaks | same format |
| `SARVAM_API_KEY` | Primary Indian-language TTS (already in `.env.example` per research 12) | `dashboard.sarvam.ai` → API Keys |
| `AZURE_SPEECH_KEY` / `AZURE_SPEECH_REGION` | Fallback Indian-language TTS (Azure F0 tier) — not yet in `.env.example`, add if Azure fallback is built | Azure Portal → create a free "Speech" resource (F0 pricing tier) → Keys and Endpoint |

**Groq signup** (verified, `console.groq.com/docs/quickstart`): go to `console.groq.com`, sign
up (email or Google/GitHub SSO), no card required for the free/Developer tier → **Keys page:
`console.groq.com/keys`** → Create API Key → copy immediately. Repeat per named key
(`GROQ_API_KEY_CHAT`, `_VOICE`, `_BACKUP`) — all created under the same organization, so they
share the rate-limit pool described in §2; do not create a second Groq account/organization to
get a second pool (§2's ToS finding).

**Azure Speech signup** (verified, `learn.microsoft.com` quotas page): Azure Portal → Create a
resource → search "Speech" → create with pricing tier **F0** (free) → no payment method required
on a free/student Azure subscription → Keys and Endpoint blade gives `AZURE_SPEECH_KEY` +
`AZURE_SPEECH_REGION`.

**Sarvam signup**: already documented in research 12 §7 — `dashboard.sarvam.ai`, email/Google,
no card, free credit amount disputed between Sarvam's own pages (verify live at signup).

---

## Summary of changes from research 12

- LLM provider: Anthropic Claude → **Groq**, primary chat model `openai/gpt-oss-120b`, fast/cheap
  fallback `openai/gpt-oss-20b`. `ANTHROPIC_API_KEY` is retained only as the external fallback
  link in the provider chain (§3), not as the primary path.
- Embeddings (Voyage) and RAG architecture (Supabase pgvector, HNSW) from research 12 §1 are
  unaffected by this switch — only the generation/citation step changes.
- Claude Citations → replaced with a `generateObject`/`Output.object` + server-side chunk-id
  validation pattern (§3), which is provider-agnostic and now the mechanism for every model in
  the fallback chain, not just Groq.
- Vision: research 12 assumed Claude vision on all models; Groq vision is one Preview model
  (`qwen/qwen3.8-27b`) only — a real narrowing, flagged in §1.
- TTS: Groq adds nothing for Hindi/Tamil/Telugu/Marathi (English/Arabic only); Sarvam-primary /
  Azure-fallback recommendation from research 12 §2 stands, refined with ElevenLabs' now-confirmed
  4-language coverage and Sarvam's Bulbul v3 price increase.
