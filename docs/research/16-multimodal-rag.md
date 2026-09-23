# 16 — Multimodal RAG (Pinecone + Groq) for Ask Spotter (M8)

Prepared 2026-09-23. Scope: upgrading M8 (`docs/specs/idea.md`) from the Supabase pgvector plan in
`docs/research/12-ai-comms-env.md` §1 to a Pinecone-backed, multimodal, role-aware RAG. Research run
via four parallel research agents against current (Sept 2026) official docs (docs.pinecone.io,
console.groq.com/docs, docs.voyageai.com, docs.cohere.com, osha.gov, cdc.gov/niosh, iso.org,
dgms.gov.in, caterpillar.com) plus GitHub for parsing-tool status. Every claim below carries its
source URL; anything not confirmed against a primary source is flagged as such.

---

## Recommended architecture

1. **Vector DB:** Pinecone Starter (free), single index, AWS `us-east-1` (only free-tier region),
   dense + sparse vectors in one index for hybrid search.
2. **Embeddings:** Voyage `voyage-multimodal-3.5` as primary (images + text, one vector space,
   200M free text tokens + 150B free pixels); Pinecone `llama-text-embed-v2` (confirmed Hindi
   support) as a zero-integration fallback/prototyping path.
3. **Image pipeline:** build-time corpus images embedded directly via Voyage multimodal; query-time
   operator photos go through Groq vision (`qwen/qwen3.8-27b`) for a structured fault description,
   then retrieved via text embedding against the same index.
4. **Ingestion:** LlamaParse (agentic tier, REST from Next.js, 10K free credits/mo) for PDF/manual
   tables; heading-based chunking (~200–500 tokens), tables kept atomic, captions attached to the
   nearest procedure chunk.
5. **Access control:** single index, metadata filtering (`role[]`, `sensitivity`) — not
   namespaces-per-role — at this corpus scale (30–60 docs).
6. **Quality/safety:** Pinecone hybrid + rerank (`pinecone-rerank-v0`/`cohere-rerank-3.5`), an
   LLM query-rewrite/translation hop (Hindi→English) before embedding, Groq structured-output
   citations validated against retrieved chunk IDs, similarity-threshold hard refusal, and
   instruction-hierarchy prompt-injection defenses for uploaded docs.

---

## 1. Pinecone free tier, integrated inference, and Voyage comparison

**Starter (free) plan limits:** up to 2GB storage, 5 indexes, 100 namespaces/index, 2M write
units/mo, 1M read units/mo, 1GB egress/mo — [pinecone.io/pricing](https://www.pinecone.io/pricing/).
Starter indexes can only be created in **AWS `us-east-1`** — there is **no India/Mumbai region**,
and the only APAC region at all (AWS `ap-southeast-1`, Singapore) requires the Builder plan or
above, not available free — [docs.pinecone.io/guides/index-data/create-an-index](https://docs.pinecone.io/guides/index-data/create-an-index).
Inactivity pausing: could not confirm a current 2026 auto-pause/delete rule from a live docs page
(the object-limits page 404'd); the only concrete policy found is a 2023 Pinecone blog post saying
the old 7-day free-plan auto-archive was **removed** — [pinecone.io/blog/gcp-starter](https://www.pinecone.io/blog/gcp-starter/).
Treat as likely-fine but unverified-current; confirm in-console. No credit card required to sign up
at app.pinecone.io (corroborated by current third-party reviews, not a fetched first-party page).

**Hosted embedding models:**
- `llama-text-embed-v2` — configurable dims (384/512/768/1024/2048), max 2,048 tokens/input,
  **explicitly "Supports 26 languages, including English, Spanish, Chinese, Hindi, Japanese,
  Korean, French, and German"** — [docs.pinecone.io/models/llama-text-embed-v2](https://docs.pinecone.io/models/llama-text-embed-v2).
- `multilingual-e5-large` — 1024 dims fixed, max 507 tokens; no explicit language list found on its
  model card despite the name — [docs.pinecone.io/models/multilingual-e5-large](https://docs.pinecone.io/models/multilingual-e5-large).
- `pinecone-sparse-english-v0` — sparse, English-only — [docs.pinecone.io/models/pinecone-sparse-english-v0](https://docs.pinecone.io/models/pinecone-sparse-english-v0).

**Hosted rerankers** ([docs.pinecone.io/guides/search/rerank-results](https://docs.pinecone.io/guides/search/rerank-results)):

| Model | Max docs/call | Max tokens |
|---|---|---|
| cohere-rerank-4-fast | 250 | 8,192/doc |
| cohere-rerank-3.5 | 200 | 40,000/query+doc pair |
| bge-reranker-v2-m3 | 100 | 1,024/query+doc pair |
| pinecone-rerank-v0 | 100 | 512/query+doc pair |

**Sparse/hybrid:** native, single index stores both dense and sparse vectors per record via
`create_index_for_model()`; alpha weighting applied client-side at query time —
[docs.pinecone.io/guides/search/hybrid-search](https://docs.pinecone.io/guides/search/hybrid-search),
[pinecone.io/blog/sparse-dense](https://www.pinecone.io/blog/sparse-dense/).

**Free inference allowance:** 5M tokens/mo each for `llama-text-embed-v2`, `multilingual-e5-large`,
`pinecone-sparse-english-v0`; 500 rerank requests/mo stated for bge-reranker-v2-m3 — [pinecone.io/pricing](https://www.pinecone.io/pricing/).

**Pinecone vs. Voyage:** Pinecone's own docs claim `llama-text-embed-v2` beats OpenAI
`text-embedding-3-large` by "more than 20%" in some cases with 12x faster p99 latency —
[docs.pinecone.io/models/llama-text-embed-v2](https://docs.pinecone.io/models/llama-text-embed-v2)
— but that is a first-party comparison against OpenAI, not Voyage; no independent benchmark against
Voyage was found for a technical-manual/safety-SOP domain. **Voyage free tier:** confirmed current
at **200M free tokens** (one-time) for `voyage-4`/`voyage-4-large`/`voyage-4-lite`/`voyage-context-4`
(50M for `voyage-multilingual-2` and other specialty models) —
[docs.voyageai.com/docs/pricing](https://docs.voyageai.com/docs/pricing) — comfortably enough for a
30–60 doc corpus (5–20M tokens) plus demo-period queries. Env var: `PINECONE_API_KEY` (exact name
used in all quickstart examples) — [docs.pinecone.io/guides/get-started/quickstart](https://docs.pinecone.io/guides/get-started/quickstart).

**Verdict:** integrated inference is real and architecturally removes the *need* for a separate
embedding call, but only `llama-text-embed-v2` has a docs-confirmed Hindi claim among Pinecone's
models, and no benchmark confirms it beats Voyage on this domain. Since Voyage's 200M-token free
grant is far more than this project needs, **use Voyage as the primary embedder** (quality-critical
retrieval and Hindi content) and keep Pinecone integrated inference as a fast, zero-integration
fallback — don't rely on it alone for the demo.

---

## 2. Multimodal ingestion

**Groq vision:** one vision-capable model, `qwen/qwen3.8-27b` (131K context, captioning + OCR-style
extraction, tool use, JSON mode) — [console.groq.com/docs/vision](https://console.groq.com/docs/vision).
Limits: 20MB max image, 3 images/request, 2,048 tokens/image; free tier ~30 RPM, 1,000 req/day,
8,000 TPM, 200,000 TPD — [console.groq.com/docs/rate-limits](https://console.groq.com/docs/rate-limits).
Workable for a demo but leaves little headroom for parallel team testing.

**True multimodal embeddings:** Voyage `voyage-multimodal-3.5` embeds interleaved text+image
(screenshots, slides, tables, figures) into one space, 256–2048 dims, $0.12/1M text tokens +
$0.60/1B pixels, 200M free text tokens + 150B free pixels —
[docs.voyageai.com/docs/multimodal-embeddings](https://docs.voyageai.com/docs/multimodal-embeddings),
[docs.voyageai.com/docs/pricing](https://docs.voyageai.com/docs/pricing). Cohere `embed-v4`:
Matryoshka dims 256–1536, 128K context, multilingual, $0.12/1M text + $0.47/1M image tokens —
[docs.cohere.com/changelog/embed-multimodal-v4](https://docs.cohere.com/changelog/embed-multimodal-v4).

**Recommendation — split by use case.** Build-time corpus images (safety posters, diagrams): embed
directly with `voyage-multimodal-3.5` (no lossy caption step, free pixel quota covers a small
corpus). Query-time operator photos (a leaking hose): prefer Groq vision → structured text fault
description → text-embedding retrieval against the same Voyage index, rather than raw image-image
similarity — a leaking-hose photo is visually generic, so the VLM's reasoning about damage
type/location matters more than pixel similarity, and it's also more explainable to judges.

**PDF/manual parsing with tables:**
- `markitdown` — table support is new/experimental (PR #1422, `--pdf-tables` flag); default mode
  has no table structure — [github.com/microsoft/markitdown](https://github.com/microsoft/markitdown).
- `docling` — dedicated DocLayNet layout model + **TableFormer** vision-transformer for table
  structure — [github.com/docling-project/docling-ibm-models](https://github.com/docling-project/docling-ibm-models),
  [research.ibm.com/blog/docling-generative-AI](https://research.ibm.com/blog/docling-generative-AI).
- `unstructured` — `hi_res` strategy (detectron2 + OCR) with `infer_table_structure=True` gives
  structured HTML tables; `fast` strategy extracts none —
  [unstructured.readthedocs.io](https://unstructured.readthedocs.io/en/main/best_practices/strategies.html).
- `LlamaParse` — cloud REST API, $1.25/1,000 credits, 10,000 free/month; agentic mode (10
  credits/page) handles multi-level-header tables —
  [developers.llamaindex.ai/llamaparse/general/pricing](https://developers.llamaindex.ai/llamaparse/general/pricing/).

**Recommendation:** **LlamaParse** (agentic tier) via a simple REST call from Next.js — no Python
microservice needed, free tier covers the hackathon corpus, markdown output is ready to chunk.
**docling** is the strongest self-hosted fallback (TableFormer) if avoiding an external API
dependency matters, but is Python-only and needs a small FastAPI sidecar.

**Chunking:** Pinecone's own guidance — chunk tables as their own atomic unit, never split across
chunks — [pinecone.io/learn/chunking-strategies](https://www.pinecone.io/learn/chunking-strategies/).
Docling's `HybridChunker` operationalizes this with heading-based hierarchical chunks,
tokenizer-aware sizing, and repeated header rows for oversized tables —
[docling-project.github.io/docling/concepts/chunking](https://docling-project.github.io/docling/concepts/chunking/).
**For Spotter:** heading/section chunks (~200–500 tokens), tables atomic with header repeated,
figure captions attached to the nearest procedure chunk, metadata tags (manual, section, page,
`type: procedure|table|caption`) so photo-diagnosis queries can filter to `type=procedure`.

---

## 3. Role-based answers and agentic RAG

**Namespaces vs. metadata filtering vs. separate indexes:** namespaces give physical isolation and
are billed per-namespace-scanned (cheaper at scale); metadata filtering only isolates logically
within a namespace and Pinecone calls large `$in` filter lists an anti-pattern (10,000-value cap) —
[docs.pinecone.io/troubleshooting/namespaces-vs-metadata-filtering](https://docs.pinecone.io/troubleshooting/namespaces-vs-metadata-filtering),
[docs.pinecone.io/guides/index-data/implement-multitenancy](https://docs.pinecone.io/guides/index-data/implement-multitenancy).
Starter plan: up to 100 namespaces/index. **For Spotter's 30–60 doc corpus, namespaces are
overkill** (they solve a multi-tenant-at-scale problem); use a **single index with metadata
filtering** — `role: ["operator","manager","trainer"]` (array) + `sensitivity: "public"|"restricted"`
— filtered by the authenticated user's role at query time. Reserve namespaces for true multi-tenant
(multi-fleet/customer) separation later.

**Role-specific system prompts:** layered — (1) shared base block (grounding rules, "only answer
from retrieved context, cite sources, never invent," refusal rules); (2) role-specific instruction
block — operator: ≤3 short voice-friendly steps, always cite, say "call your supervisor" for
safety-critical/ambiguous cases; fleet manager: data/table-rich; trainer: curriculum/lesson-plan
structure; (3) output-format constraint enforced via **Groq structured outputs** (JSON schema:
`answer`, `steps[]`, `citations[]`, `escalate: bool`) so format is guaranteed, not just requested.

**Agentic RAG / tool calling:** Groq's tool-use API is the standard OpenAI-compatible loop — model
returns `tool_calls`, app executes and returns `tool`-role results keyed by `tool_call_id`, model
synthesizes; parallel tool calls default on —
[console.groq.com/docs/tool-use](https://console.groq.com/docs/tool-use). Practical pattern: two
tools, `retrieve_docs(query, role)` (Pinecone) and `query_supabase(table, filters)` (task/alert/
machine-status/ETA); the model decides per-turn whether a question needs static knowledge,
live state, or both (called in parallel), then synthesizes one answer.

---

## 4. Answer quality and safety

**Hybrid search + rerank:** native dense+sparse in one Pinecone index, blended via alpha weight;
integrated inference exposes `pinecone-rerank-v0` and hosted `cohere-rerank-3.5` in the same API —
[docs.pinecone.io/guides/search/hybrid-search](https://docs.pinecone.io/guides/search/hybrid-search),
[pinecone.io/blog/integrated-inference](https://www.pinecone.io/blog/integrated-inference/).

**Query rewriting / Hindi→English:** a fast LLM preprocessing hop translates and rewrites the query
before embedding (expand abbreviations, resolve pronouns); Groq's fast hosted models make this
low-latency — check `console.groq.com/docs/models` for current IDs, since `llama-3.1-8b-instant`/
`llama-3.3-70b-versatile` were deprecated mid-2026.

**Citation enforcement without Claude Citations:** Groq structured outputs
(`response_format: {type:"json_schema"}`, strict mode) force a `{answer, citations:[chunk_id]}`
shape — [console.groq.com/docs/structured-outputs](https://console.groq.com/docs/structured-outputs)
— then the app validates every `chunk_id` against the IDs actually returned by the Pinecone query;
unmatched citations are stripped or the answer is flagged, never trusted blindly.

**Hard refusal:** if the top chunk's similarity falls below a tuned threshold, skip generation and
return a fixed "no information — check the manual or ask your supervisor" response.

**Prompt-injection defense:** treat all retrieved/uploaded content as data, never instructions —
delimited context blocks, a system-prompt rule to ignore imperative text found inside documents,
sanitize suspicious control sequences before embedding, and an instruction hierarchy where the
system prompt always outranks document content.

**Eval set:** 20 Q&A pairs spanning all 3 roles/sensitivity levels with ground-truth chunk IDs and
gold answers; measure **hit@k** (retrieval) and **faithfulness** (generation, claims traceable to
retrieved chunks) — RAGAS is the standard open-source framework for both metrics.

---

## 5. Legally usable corpus (~30–60 documents)

- **OSHA:** public domain — "OSHA's rules are in the public domain and may be reproduced, fully or
  partially, without permission" — [osha.gov Standard Interpretation 1992-09-15](https://www.osha.gov/laws-regs/standardinterpretations/1992-09-15).
  Caveat: third-party standards incorporated by reference (ANSI/SAE) stay copyrighted —
  [osha.gov Standard Interpretation 2005-03-11](https://www.osha.gov/laws-regs/standardinterpretations/2005-03-11).
  Catalog: [osha.gov/publications](https://www.osha.gov/publications). Safe to ingest verbatim.
- **NIOSH:** public domain under CDC/HHS reuse policy (attribute, don't alter substance) —
  [cdc.gov/other/agencymaterials.html](https://www.cdc.gov/other/agencymaterials.html). Relevant
  titles: haul-truck collision warning systems (NIOSH Pub 2000-120/128), blind-spot monitoring,
  proximity warning systems (NIOSH Pub 2007-146) — [cdc.gov/niosh/publications](https://www.cdc.gov/niosh/publications/numbered/2000-120.html).
  Safe to ingest verbatim.
- **ISO:** standards themselves are copyrighted and not free — [iso.org/copyright.html](https://www.iso.org/copyright.html).
  Safe approach: cite standard numbers/titles/scope from the free Online Browsing Platform; write
  original SOP paraphrase of the safety intent; never embed clause text.
- **DGMS circulars:** openly published — [dgms.gov.in circulars index](https://www.dgms.gov.in/UserView/index?mid=1648) —
  but India's Copyright Act, 1957 does not auto-grant public domain to government works (unlike US
  17 U.S.C. §105). Treat as low-risk-but-not-certain: prefer summarizing as team SOP language over
  bulk verbatim reproduction, cite the source circular. Relevant: haul-road/HEMM audio-visual
  reversing-alarm requirements (CMR 2017 Reg. 130(2)).
- **Cat.com content:** restrictive terms of use — "No part of any Site or Content may be copied,
  reproduced, republished... for publication or distribution... without Caterpillar's express prior
  written consent" — [caterpillar.com/en/legal-notices.html](https://www.caterpillar.com/en/legal-notices.html).
  O&M manuals specifically are copyrighted, often serial/model-specific, and distributed only
  through dealer channels — do not ingest verbatim. At most cite topic titles; team-paraphrase
  equivalents.
- **Recommended mix (target 30–60):** 12–15 OSHA docs, 6–8 NIOSH docs, ~8 DGMS circulars
  (summarized, not bulk-copied), 0–3 Cat public safety pieces as team-paraphrased equivalents only,
  20–25 team-authored original SOPs. No ISO clause text, no Cat O&M manual excerpts.

---

## 6. Env vars and Pinecone signup

- `PINECONE_API_KEY` — exact name used across all official quickstart examples —
  [docs.pinecone.io/guides/get-started/quickstart](https://docs.pinecone.io/guides/get-started/quickstart).
- Sign up at app.pinecone.io; no credit card required for the Starter plan (corroborated by current
  third-party pricing reviews, not directly confirmed on a fetched first-party page in this pass —
  verify in-console before relying on it for the build).
