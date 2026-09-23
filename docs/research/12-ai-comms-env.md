# 12 — AI Features + Communications + Accounts/Env

Prepared 2026-09-23. Scope: RAG/chatbot stack, multilingual voice, Twilio, Telegram/SOS, other AI
feature ideation, offline/edge, and the full `.env` inventory. Research run via four parallel
research agents plus direct verification (Anthropic `claude-api` skill, Supabase/Vercel/Open-Meteo/
MapTiler docs via web search). Every claim below carries its source; items that could not be
confirmed against a primary source are explicitly flagged rather than asserted. Read alongside
`docs/research/08-founder-review.md` (product thesis, positioning vs. Cat AI Assistant) — this doc
is the technical/vendor layer under that thesis.

---

## 1. RAG + global-access chatbot (Supabase pgvector + Claude/AI SDK)

### Architecture
- Enable pgvector: `create extension vector with schema extensions;`. Column: `embedding
  extensions.vector(N)`, N matched to the embedding model's output dims. [Supabase pgvector
  guide](https://supabase.com/docs/guides/database/extensions/pgvector) ·
  [vector columns](https://supabase.com/docs/guides/ai/vector-columns)
- **Index: HNSW, not IVFFlat.** Supabase's own guidance: HNSW gives ~3x better query performance
  and accuracy, and can be built on an empty table (IVFFlat needs representative data first or its
  centroids are garbage) — the right call for a fixed, pre-loaded manual/SOP corpus. Tradeoff:
  slower to build, more memory. [HNSW](https://supabase.com/docs/guides/ai/vector-indexes/hnsw-indexes)
  · [IVFFlat](https://supabase.com/docs/guides/ai/vector-indexes/ivf-indexes) ·
  [perf blog](https://supabase.com/blog/increase-performance-pgvector-hnsw)
- Pipeline: chunk manuals/SOPs by heading (~200–500 tokens) → embed → insert rows → wrap
  cosine/inner-product search in a Postgres function (`match_documents(query_embedding,
  match_threshold, match_count)`) called via `supabase.rpc()`, with JSONB metadata filtering.
  [Semantic search guide](https://supabase.com/docs/guides/ai/semantic-search) ·
  [OpenAI+pgvector blog](https://supabase.com/blog/openai-embeddings-postgres-vector)
- Supabase's first-party **Automatic Embeddings** pattern (trigger + `pgmq` queue + `pg_cron` +
  `pg_net` + an Edge Function) exists for live-editable corpora, but for a 24h build the simpler
  path is a one-time embed script at build time; add Automatic Embeddings only if SOPs need live
  editing during the demo. [Automatic Embeddings](https://supabase.com/docs/guides/ai/automatic-embeddings)
- Re-ranking is not first-party Supabase; use the Vercel AI Gateway's rerank modality or Voyage's
  rerank API if needed.

### Embedding model
| Model | Dims | $/1M tokens | Notes |
|---|---|---|---|
| OpenAI `text-embedding-3-small` | 1536 (truncatable) | $0.02 | Cheapest mainstream; 8192-token max input |
| Voyage `voyage-4-lite` | MRL-truncatable | $0.02 | **Anthropic's own recommended embeddings partner** (Anthropic has no first-party embedding model) — [Claude embeddings docs](https://platform.claude.com/docs/en/build-with-claude/embeddings). First 200M tokens free on several Voyage models. [Voyage pricing](https://docs.voyageai.com/docs/pricing) |
| Voyage `voyage-3-large` | up to 2048 | $0.18 | Leads MTEB (~65.4%), 32K max input |
| Google `gemini-embedding-001` | 3072 default (or 1536/768 via MRL) | $0.15 | GA Sept 16 2026; 100+ languages; top of multilingual MTEB. [Google blog](https://developers.googleblog.com/gemini-embedding-available-gemini-api/) |

**Decision (per stack lock-in): Voyage `voyage-4-lite`** — matches Anthropic's own guidance, $0.02/M,
cents to embed the full manual corpus once. OpenAI `text-embedding-3-small` is the documented
fallback if Voyage access is unavailable on demo day.

### LLM (verified Sept 2026 model IDs + pricing — Anthropic `claude-api` skill, cache 2026-06-24)
| Model ID | Input | Output |
|---|---|---|
| `claude-haiku-4-5` | $1/MTok | $5/MTok |
| `claude-sonnet-5` | $2/MTok | $10/MTok |
| `claude-opus-5` | $5/MTok | $25/MTok |

Official pricing: https://platform.claude.com/docs/en/about-claude/pricing. Use the exact ID
strings above — never append date suffixes. Requests with `tools` attached add a system-prompt
token tax (~354–474 tokens on Sonnet 5). Prompt caching cuts cached-input cost to ~0.1x — relevant
since the system prompt + retrieved chunks repeat across turns.

Gemini alternative (official pricing: https://ai.google.dev/gemini-api/docs/pricing):
`gemini-3.5-flash-lite` $0.30/$2.50 per 1M, `gemini-3.5-flash` $1.50/$9.00 per 1M. (Not adopted —
stack is Claude-only per the locked decision — kept here for the cost comparison in §7.)

**Vercel AI Gateway + AI SDK**: one key routes to any provider (`model: "anthropic/claude-sonnet-5"`),
automatic failover, per-request cost/latency logging, spend budgets, **zero markup on token
price** — monetized via purchased credits, not a per-call fee.
[AI Gateway](https://vercel.com/docs/ai-gateway) · [pricing](https://vercel.com/docs/ai-gateway/pricing).
Current `ai` npm package major version is v5 (actively patched, e.g. Opus 5.5 support shipped
2026-09-22). Streaming pattern (documented, stable): a route handler calls `streamText({ model,
messages: convertToModelMessages(uiMessages) })`, returns `result.toUIMessageStreamResponse()`;
client uses `useChat()` from `@ai-sdk/react`, POSTing to `/api/chat`, exposing a `parts` array
(text / tool-invocation / tool-result) for rendering.
[Chatbot guide](https://ai-sdk.dev/docs/ai-sdk-ui/chatbot). *Flag: "AI SDK v6 / RSC replaces API
routes" claims from some 2026 blogs are not corroborated by the official docs — don't build
against that.*

### Tool calling
Scope tools to site-data reads plus one guarded write (this is an off-machine skills layer, not
in-cab control — see founder review):
- Read tools (auto-execute): `getNextTask`, `getMachineStatus`, `getActiveAlerts` — each a
  `tool()` with a zod `inputSchema` calling Supabase REST/RPC.
- Write tool `logIncident`: use the AI SDK's `toolApproval: { logIncident: 'user-approval' }` —
  the model's call is paused as a `tool-approval-request` part, rendered as a confirm card the
  operator must approve before `execute()` runs. [Tool calling docs](https://ai-sdk.dev/docs/ai-sdk-core/tools-and-tool-calling)
- Tag written rows `created_via: 'assistant'` + operator/session id for audit trail.

### Guardrails against hallucinated safety advice
- Anthropic's own hallucination-reduction guidance applies directly:
  allow explicit uncertainty in the system prompt, ground answers in direct quotes from retrieved
  text, cite-then-verify, and surface chain-of-thought for safety-critical answers.
  https://docs.anthropic.com/en/docs/test-and-evaluate/strengthen-guardrails/reduce-hallucinations
- **Claude Citations** (GA, all active models): pass retrieved chunks as `document` blocks with
  `"citations": {"enabled": true}`; Claude's `cited_text` is structurally guaranteed to point at
  real provided text, not hallucinated, and doesn't count against output tokens. This turns "cite
  your sources" into an API-enforced guarantee rather than a prompt hope.
  https://platform.claude.com/docs/en/build-with-claude/citations
- Practical pattern: (1) below-threshold or zero-row retrieval → skip the LLM call, hard-coded
  refusal ("ask your supervisor"); (2) require ≥1 citation on any safety-relevant claim, else
  treat as a refusal signal client-side; (3) validate final output via `generateObject` against a
  zod schema (`answer`, `citations: string[]`, `isGrounded: boolean`); (4) system prompt forbids
  answering load-rating/pressure/LOTO questions from parametric knowledge — retrieved+cited text
  only, "ask your supervisor" explicitly framed as a good answer.

### Cost per query (worked example, 3K input / 400 output tokens mid-point)
- **Claude Haiku 4.5**: $0.005/query mid-point (range $0.0035–$0.0065 + ~$0.0005 tool overhead) —
  cheapest suitable Claude model.
- Gemini 3.5 Flash-Lite: $0.0019/query mid-point — cheaper, but `gemini-3.5-flash` ($0.008–
  0.011/query) is the more defensible "production" pick if adopted later.
- At hackathon/demo scale (thousands of queries), total LLM spend is a few dollars either way.
  Embedding cost per query (~20–50 tokens) is negligible (<$0.00001).

---

## 2. Multilingual voice (Hindi, Tamil, Telugu, Marathi, Kannada, Bengali)

| Provider | 6-language coverage | Free tier | Price | Latency (published) | Effort |
|---|---|---|---|---|---|
| **Sarvam AI** | STT (Saarika) + TTS (Bulbul) confirmed for all 6; translate covers 22 langs | ₹100–₹1,000 credits — **discrepancy**: docs page says ₹100, marketing page says ₹1,000; verify live at signup | ₹30/hour STT, ₹30/10k chars TTS, ₹20/10k chars translate — cheapest of the five | Bulbul: sub-250ms first byte over WebSocket | Low — one Indic-focused REST/WS API |
| AI4Bharat / Bhashini | Bhashini claims all 22 scheduled languages; AI4Bharat is open-source models, not a hosted API | Bhashini "free/low-volume" claimed, no documented cap found | Bhashini: unclear pricing | Not published | AI4Bharat: **not hackathon-feasible** (self-host/fine-tune). Bhashini: registration friction, reliability **unverified** — smoke-test before demo day if used |
| Google Cloud STT/TTS | Locale codes confirm hi/ta/te/mr/kn/bn-IN exist; full per-language voice-tier list not fully retrieved | 60 min/mo STT free; 1M (WaveNet) – 4M (Standard) chars/mo TTS free; $300 new-account credit | STT $0.016/min (V2 Standard); TTS $4–30/1M chars by tier | Not published | Medium — GCP project/auth setup |
| ElevenLabs | Hindi/Tamil/Telugu confirmed in Multilingual v2; Marathi/Kannada/Bengali **not confirmed** | Exists, allowance unconfirmed | TTS $0.10/1k chars (or $0.05 flash); STT $0.22/audio-hr | Scribe STT <150ms | Low — simple REST |
| Azure AI Speech | All 6 confirmed (neural voices incl. `hi-IN-SwaraNeural`) | 5 hrs/mo STT, 0.5M chars/mo TTS, non-expiring while account active | TTS $16/1M (Neural), $22/1M (Neural HD, cut from $30 Mar 2026); STT per-hour rate **not confirmed** this pass | Not published | Medium — Azure resource setup |

**Hackathon-demo recommendation: Sarvam AI** — purpose-built for exactly these 6 languages in one
API family, cheapest per-unit, published sub-250ms TTS latency, fastest signup (dashboard.sarvam.ai,
email/Google, no card). **Production pick**: Azure or Google for enterprise SLA/voice catalog
breadth; pair with Sarvam if Indic accuracy-per-rupee matters more than SLA. Do not commit to
Bhashini for anything demo-critical without an independent live test — no reliability data was
found.

Flags carried from research: Sarvam's exact current STT model version (Saarika vX) and whether
Bulbul V3 or V4 is "current" were inconsistent across sources — verify on
`docs.sarvam.ai/api-reference-docs` before the pitch deck names a version number.

---

## 3. Twilio (outbound AI voice + SOS escalation)

### `<Say>` voices for Indian languages
Format `{Provider}.{Voice}`. **Hindi (hi-IN)** confirmed across three tiers: Google Standard
(`hi-IN-Standard-A..F`), Google Neural (`hi-IN-Neural2-A..D`, `hi-IN-Wavenet-A..F`), Google
Generative/Chirp3-HD (`hi-IN-Chirp3-HD-Kore` etc.), Amazon Polly Standard (`Aditi`) and Neural
(`Kajal-Neural`). English-India (`en-IN`) also has Standard/Neural/Chirp3-HD voices, useful for
mixed Hindi/English flows. **Tamil/Telugu/Bengali/Marathi/Kannada coverage in `<Say>` was not
confirmed** — the catalog page truncated on fetch; check
https://www.twilio.com/docs/voice/twiml/say/text-speech directly before committing to a specific
regional voice beyond Hindi/English-India.

### ConversationRelay vs. Studio vs. raw TwiML
- **ConversationRelay** (`<Connect><ConversationRelay>`, two-way AI voice over WebSocket, BYO LLM)
  supports Indian languages in principle, but **requires account onboarding that is "not available
  immediately on a new account"** — a real risk against a same-day trial account and a 24h clock —
  plus hosting a `wss://` server and wiring an LLM. **Not recommended for this hackathon.**
  https://www.twilio.com/docs/voice/twiml/connect/conversationrelay
- **Studio** (visual flow builder, triggerable via REST `POST /v2/Flows/{FlowSid}/Executions`) is
  arguably faster to build a simple linear IVR in, but since a backend is needed anyway to detect
  the anomaly/SOS and fire the call, raw TwiML embedded in that same server is less
  context-switching and easier to template/version.
- **Recommended: `client.calls.create()` (Programmable Voice REST API) + inline/webhook `<Say>` +
  `<Gather>` TwiML.** Lowest setup, no onboarding gate, natural Hindi/English-India voices already
  unlocked.

### Trial account
- **Verified-caller-ID requirement**: trial accounts can only call/message verified numbers (error
  32100). https://www.twilio.com/docs/api/errors/32100
- **Free allocation (current model, not a flat balance)**: 100 SMS, 100 WhatsApp messages, 75
  voice minutes, 3,000 emails; trial expires 30 days after signup.
  https://www.twilio.com/docs/usage/tutorials/how-to-use-your-free-trial-account ·
  https://www.twilio.com/docs/usage/trials. *(A conflicting secondary source cites an older "$15.50
  balance" model — trust the free-units model as current, per docs dated 2026-08-13.)*
- **Verify Shlok's number**: Console → Numbers & Senders → Verified Caller IDs → Add → Twilio calls
  with a 6-digit code (call/verification itself is English-only) → confirm.
  https://www.twilio.com/docs/numbers-and-senders/phone-number-senders
- India is an explicitly supported trial country.

### Calling India
- **Geo permissions**: Voice Dialing Geographic Permissions must be enabled per-country (Console →
  Voice → Settings → Geo permissions) — may need explicit enabling on a fresh account.
- **Cost**: official Twilio page states **$0.0496/min** for India-mobile outbound; India numbers
  from $1.15/mo. https://www.twilio.com/en-us/voice/pricing/in *(A third-party source claimed
  ~$0.0075/min for the same route — do not use that figure; it doesn't match Twilio's own page.)*
- **DLT/TRAI**: DLT registration is required only for the **domestic** India SMS route; the
  **international** route (a non-Indian Twilio number messaging India, the natural trial setup)
  bypasses DLT/DND. https://www.twilio.com/docs/api/errors/30004 ·
  https://www.twilio.com/en-us/guidelines/in/sms. For **voice**, Twilio's own India Voice
  Guidelines require outbound calls to India originate from a non-Indian number (which a trial
  naturally does) and flag that voice OTP calls to India are prohibited; **whether DLT/TRAI
  formally covers voice (vs. only SMS/WhatsApp) could not be confirmed from Twilio's own docs** —
  only from non-Twilio compliance sites. Low risk for a one-off, non-commercial demo call to your
  own verified number; do not extrapolate to a production calling campaign without confirming with
  Twilio directly. https://www.twilio.com/en-us/guidelines/in/voice

### WhatsApp alternative
Twilio WhatsApp **Sandbox**: minutes to set up (accept terms, get sandbox number + join code/QR).
Each recipient must first text "join `<code>`"; once joined, a 24h free-form window opens, then
only 3 pre-approved templates work until a real registered sender is set up. 100 free trial
messages. https://www.twilio.com/docs/whatsapp/sandbox — good backup channel, but it doesn't make
"the phone ring."

### In-app Voice SDK vs. real call
Voice SDK (WebRTC, `@twilio/voice-sdk`) opens a VoIP session **inside the app** — no real ring, and
the app must be open. The REST `calls.create()` API **actually rings the operator's real phone** and
is also simpler to build (a few server-side lines vs. client SDK + token-minting endpoint + TwiML
App). For "server detects anomaly → operator's phone rings," the REST Calls API is correct.

### Recommendation
`client.calls.create({ from: <trial number>, to: '+91<verified number>', url/twiml })` returning
`<Say voice="Google.hi-IN-Chirp3-HD-Kore" language="hi-IN">...</Say><Gather numDigits="1"
action="/twiml/ack"><Say>पुष्टि के लिए 1 दबाएं।</Say></Gather>`. Verify Shlok's number, confirm
India geo-permission is on, confirm the 75 free trial minutes are enough (they are). Skip
ConversationRelay, Studio, WhatsApp-as-primary, and the Voice SDK for this build.

---

## 4. Telegram Bot API + SOS flow

- **BotFather**: `/newbot` → name → username ending in `bot` → token
  (`110201543:AAHdq...`), prefixed `bot` in API URLs.
  https://core.telegram.org/bots/features#creating-a-new-bot
- **Manager `chat_id`**: no BotFather command for this — the manager must open the bot and send
  any message (`/start`), then `getUpdates` returns `result[0].message.chat.id`.
  https://core.telegram.org/bots/api#getupdates
- **Bots cannot message a user first** — confirmed behavior (403 "Forbidden: bot can't initiate
  conversation with a user"), though **not stated in narrative prose anywhere in the official
  docs** checked (`bots/api`, `bots/features`, `bots/faq`, `bots/tutorial`) — the closest
  corroboration is BotFather's documented ownership-transfer restriction. Verify empirically with
  a fresh manager account before the demo.
- **`sendMessage`**: `chat_id`, `text` (1–4096 chars), `parse_mode`, `reply_markup`, etc.
  https://core.telegram.org/bots/api#sendmessage
- **`sendLocation`** / live location — important clarification: setting `live_period` (60–86400s,
  or `0x7FFFFFFF` for indefinite) only opens an *editing window*; it does **not** auto-refresh the
  pin. Your server must call `editMessageLiveLocation` with each new (simulated) GPS fix for the
  map to actually move; a static `sendLocation` with an unused `live_period` just sits there until
  it expires. `stopMessageLiveLocation` ends it early.
  https://core.telegram.org/bots/api#sendlocation ·
  https://core.telegram.org/bots/api#editmessagelivelocation
- **Inline "Acknowledge" button**: `reply_markup.inline_keyboard` with `callback_data:
  "ack:<alert_id>"` (1–64 bytes — encode the ID only). The press arrives as a `callback_query`
  Update; you **must** call `answerCallbackQuery` (Telegram shows a spinner until you do, even if
  no toast is needed). https://core.telegram.org/bots/api#inlinekeyboardbutton ·
  https://core.telegram.org/bots/api#callbackquery ·
  https://core.telegram.org/bots/api#answercallbackquery
- **Webhooks on Vercel**: `setWebhook` with `url` (HTTPS) and `secret_token` (1–256 chars,
  `[A-Za-z0-9_-]`), verified server-side via the `X-Telegram-Bot-Api-Secret-Token` header.
  `getUpdates` and a webhook are **mutually exclusive** — pick one. Telegram retries non-2xx
  responses, so respond fast. https://core.telegram.org/bots/api#setwebhook. Vercel gotchas:
  filesystem is read-only except ephemeral `/tmp`; functions are archived after 2 weeks (prod) /
  48h (preview) idle, adding a cold-start; Hobby-plan Cron is daily-only, Pro is per-minute.
  https://vercel.com/docs/functions/runtimes · https://vercel.com/docs/cron-jobs/usage-and-pricing
- **Rate limits** (official FAQ): ≤1 msg/sec per chat, ≤20/min in a group, ≤~30/sec bulk broadcast
  (unless paid broadcast, 0.1 Telegram Stars/msg for up to 1000/sec). 429 responses carry a
  `retry_after` seconds field. https://core.telegram.org/bots/faq — trivially safe at
  one-manager-chat hackathon scale.
- **SOS flow design**: operator taps SOS → app captures/simulates GPS → server creates a DB alert
  row (`status: pending`) → `sendLocation` (with `live_period`) + Acknowledge button to the
  manager's `chat_id`, storing `message_id` → **do not use `setTimeout`** (a serverless invocation
  ends with the response, killing any pending timer) — instead use a **delayed job (e.g. QStash)
  scheduled ~75s out**, or Vercel Cron **only if on Pro** (Hobby is daily-only and unusable for a
  60–90s SLA) → `callback_query` handler marks `acknowledged`, calls `answerCallbackQuery`, edits
  the message, cancels escalation → unacknowledged timeout triggers the Twilio call (§3) and marks
  `escalated`. Guard both paths with a DB compare-and-set (`UPDATE ... WHERE status='pending'`) to
  avoid a double-fire race.

---

## 5. Other AI features — ranked by judge wow × 24h feasibility (1–5 each)

| # | Feature | Wow | Feas. | Score | Why |
|---|---|---|---|---|---|
| 1 | **AI shift briefing** | 4 | 5 | **20** | One LLM call over today's task + weather (Open-Meteo, no key) + operator's weak skills, read aloud via Sarvam TTS. Cheapest to build — no new integration beyond what §1/§2 already provide. Overlaps with founder review's "sector-aware pre-shift briefing." |
| 2 | **Predictive ETA explanations** | 4 | 4 | 16 | Problem statement's own task-time-prediction dataset (task type, weather, operator skill, machine age) + an LLM call that explains *why* the estimate moved ("wind + a Level-1 operator adds ~40 min vs. a sunny-day Level-3 baseline"). Model itself can be a simple LightGBM/ridge baseline; the LLM only narrates it. |
| 3 | **Voice incident logging** (speak → structured incident) | 4 | 4 | 16 | Sarvam STT → transcript → Claude `generateObject` extracts `{machineId, description, severity, location}` into the same guarded `logIncident` tool from §1 (still requires operator approval before writing). Straightforward pipeline, reuses existing tool-approval pattern. |
| 4 | **Anomaly explanation in plain language** | 3 | 5 | 15 | Trivial: feed a rule-flagged telemetry anomaly (already-required "unusual behaviour detection" feature) into one LLM call, translated to the operator's language. No new data source. |
| 5 | **Photo-based walk-around inspection with a vision model** | 5 | 3 | 15 | Highest wow, but real build cost: camera-capture UI, Claude vision input (`image` content blocks — supported on all current Claude models), and a carefully-scoped prompt/checklist so it doesn't hallucinate a pass/fail. 2026 research shows VLMs are usable but still have "uneven precision/recall and weak visual grounding" for safety-critical calls ([Cambridge Data-Centric Engineering](https://www.cambridge.org/core/journals/data-centric-engineering/article/are-large-pretrained-vision-language-models-effective-construction-safety-inspectors/4F9F8B39B34FD6F2B201C9947CDF42E8)) — treat output as a checklist draft for the operator to confirm, never an autonomous pass/fail. |
| 6 | **Personalized training recommender** | 3 | 4 | 12 | Maps skill gaps (coaching-tip recurrence, per founder review) to a lesson/module suggestion. Useful, but it's a thin recommendation layer over data the Event→Lesson engine (founder review's #1) already needs — build that first; this is close to redundant with it. |

**Recommendation**: build #1 and #4 first (near-zero marginal cost given §1's chatbot/tool stack),
add #3 if Sarvam STT integration time allows, treat #5 as the single high-wow stretch goal with an
explicit "operator confirms, model drafts" framing, and fold #6 into the founder review's
Event→Lesson engine rather than building it as a separate feature.

---

## 6. Offline/edge

- **On-device ML (onnxruntime-web)**: supports WASM (default) and WebGPU execution providers.
  Even a "minimal build" WASM artifact runs several MB, plus real integration work (execution
  provider selection, COOP/COEP headers for threaded WASM, model quantization, WebGPU-to-WASM
  fallback testing). **Not worth it for a 24h build.**
  https://onnxruntime.ai/docs/tutorials/web/deploy.html
- **Recommended instead: plain TypeScript rule evaluation** against cached telemetry (e.g.
  `if (engineTempC > 105 && durationSec > 30) flag('overheat')`) — zero bundle cost, instantly
  explainable to judges, covers the "offline anomaly detection" story equally well. Mention
  onnxruntime-web only as a roadmap bullet.
- **Last-synced snapshot pattern**: Serwist (`@serwist/next`, the maintained `next-pwa` successor)
  for service-worker precaching + IndexedDB (via the `idb` helper) for the last-known
  machine/task/telemetry snapshot + a sync/replay queue on reconnect. Standard, documented 2026
  pattern for Next.js PWAs, not a novel design. *Flag: one source claims Serwist currently needs a
  Webpack build path (not Turbopack) — verify against Serwist's current docs / prove on day 0
  before locking build tooling, per the existing caution in research 07.*
- **Offline TTS/STT** (folds in from §2): `speechSynthesis` genuinely runs on-device using OS
  voices (each voice exposes `localService: true/false`), but Indic voices are **not guaranteed
  pre-installed** on Windows or every Android OEM skin — test on the actual demo device and keep a
  cloud-TTS (Sarvam) fallback ready. Chrome's `webkitSpeechRecognition` STT sends audio to Google's
  servers by default (not offline); Chrome 139+ (Aug 2025) added an optional on-device STT mode,
  but **language-pack coverage for the 6 target Indic languages is unconfirmed** — test directly,
  don't assume. On Expo/React Native, true offline STT exists
  (`@jamsch/expo-speech-recognition`, native on-device recognition) but **requires a custom dev
  client / EAS build — not usable inside Expo Go or a pure web/PWA build**, so it's a phase-2 item,
  not a hackathon one. Keep STT cloud-based (Sarvam Saarika) for the demo.

---

## 7. Full `.env` inventory

**The canonical `.env.example` for this project already exists at the repo root** (written
separately; see §8 for a verification review against it rather than a duplicate listing here). In
summary, the required groups are: Supabase (Mumbai region, new publishable/secret keys + a
personal access token for CLI/MCP + DB password), Anthropic, one embeddings provider (Voyage
primary, OpenAI fallback), Vercel AI Gateway (optional), Sarvam AI, Twilio (trial: SID, auth
token, from-number, two verified demo numbers), Telegram (bot token, manager chat id, webhook
secret), Open-Meteo (no key), and map tiles (MapLibre/OpenStreetMap, no key; MapTiler key
optional for a nicer basemap). Signup steps verified for each in this research pass:

- **Supabase**: dashboard → project → Connect/API Keys for `sb_publishable_…` / `sb_secret_…`
  (the 2026 replacement for `anon`/`service_role`, which Supabase is deprecating by end of 2026 —
  legacy keys keep working until disabled).
  https://supabase.com/docs/guides/getting-started/migrating-to-new-api-keys · Personal access
  token: `supabase.com/dashboard/account/tokens` → Generate New Token, `sbp_…` prefix, used by the
  CLI and MCP server. https://supabase.com/docs/guides/platform/personal-access-tokens
- **Anthropic**: `console.anthropic.com` → sign up (email or Google) → Settings → Billing (add a
  card / prepaid credit — the #1 cause of a "valid key, rejected request" is skipping this) →
  Settings → API Keys → Create Key.
- **Voyage**: recommended by Anthropic's own docs as the embeddings partner (Anthropic has no
  first-party embedding model). Dashboard/signup URL for the key itself was not independently
  re-verified in this pass beyond `docs.voyageai.com` — confirm the exact signup page before
  publishing.
- **Vercel AI Gateway**: Vercel dashboard → team → AI Gateway → API Keys → copy immediately (shown
  once) → `AI_GATEWAY_API_KEY`. Never expires unless revoked.
  https://vercel.com/docs/ai-gateway/authentication-and-byok/api-keys
- **Sarvam AI**: `dashboard.sarvam.ai` → sign up (email/Google) → API Keys. Free credits on
  signup — amount is disputed between Sarvam's own pages (₹100 vs ₹1,000); verify live.
- **Twilio**: `twilio.com/try-twilio` → sign up → Console home shows Account SID + Auth Token
  directly → Phone Numbers → Buy a Number (voice-capable) → Numbers & Senders → Verified Caller
  IDs → add each demo number (6-digit code via call).
- **Telegram**: `@BotFather` in Telegram → `/newbot` → token. Webhook secret is self-generated
  (any 1–256 char string matching `[A-Za-z0-9_-]`), not issued by Telegram.
- **Open-Meteo**: no signup, no key — free for non-commercial use up to 10,000 calls/day.
  https://open-meteo.com/en/about
- **Map tiles**: MapLibre + OpenStreetMap tiles need no key for a demo (attribution required under
  ODbL). MapTiler is the optional upgrade — free tier ≈100k map loads/mo or 5k map
  sessions/5GB storage, no card required at signup, `maptilersdk.config.apiKey`.

---

## 8. Review of `.env.example`

Checked the existing root `.env.example` against this research. Matches verified: Supabase
`sb_publishable_…`/`sb_secret_…`/`sbp_…` naming and PAT flow; `ANTHROPIC_API_KEY` (`sk-ant-…`);
`AI_GATEWAY_API_KEY`; Telegram bot-token/webhook-secret rules (`[A-Za-z0-9_-]`, "bots can't message
first" constraint); Open-Meteo and MapLibre/OSM needing no key.

**Discrepancies / unverified in this pass:**
1. `SARVAM_API_KEY` comment states the request header is `api-subscription-key` — **not confirmed**
   by our research (docs.sarvam.ai pricing/model pages were checked, not the auth header). Verify
   before relying on it.
2. Twilio comment "Trial calls play a short Twilio preamble" — **not verified**; the trial-limits
   docs fetched (verified-caller-ID requirement, free-unit limits) don't mention an audio preamble.
3. `VOYAGE_API_KEY` comment `dash.voyageai.com` — Voyage's dashboard/signup URL was **not
   independently confirmed**; only `docs.voyageai.com/docs/pricing` and Anthropic's recommendation
   of Voyage were verified.
4. `SUPABASE_PROJECT_REF` marked REQ — it's derivable from `NEXT_PUBLIC_SUPABASE_URL`
   (`https://<project-ref>.supabase.co`) and isn't a distinct dashboard field; convenient for the
   CLI, but not independently "required" beyond what the URL already encodes.
