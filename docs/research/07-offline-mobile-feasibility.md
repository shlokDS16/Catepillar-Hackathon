# Offline-First Feasibility Research — Web PWA, Expo Mobile, On-Device AI, TestFlight-from-Windows, Code Sharing

**Prepared:** 2026-09-23, for a ~24-hour hackathon build (Next.js App Router on Vercel → replicated as an Expo/React Native app on iOS TestFlight + Android APK). Windows machine, no Mac. Apple and Google developer accounts already exist.

---

## TL;DR recommendation

| Layer | Pick | Why |
|---|---|---|
| Web offline | Serwist + `@serwist/next`, App Router, precache shell + runtime-cache lesson JSON, **do not rely on iOS Safari for the "offline" demo** | Serwist is the maintained next-pwa successor; iOS Safari lacks Background Sync entirely |
| Mobile sync | `expo-sqlite` + a hand-rolled queue-based sync against Supabase (fallback-first choice) | 24h total budget; PowerSync/Electric/Zero all have setup costs that eat the whole hackathon on their own |
| On-device AI | **Fake it**: keyword-matched pre-cached answers + cloud LLM online, "queued — will answer when back online" offline UI | No time to wire ExecuTorch/llama.rn/Foundation Models reliably in 24h across two platform demos |
| TestFlight | EAS Build (cloud) + EAS Submit, both run fine from Windows, no Mac needed | Verified current in 2026 docs |
| Code sharing | Separate Next.js app + separate Expo app, pnpm workspace with `packages/shared` (types, zod schemas, API client, tokens) — **not** react-native-web/Expo Router universal app | The prompt explicitly says "design website first, then replicate as mobile app"; RNW retrofits are riskier under 24h |

---

## 1. Offline-first web: Next.js App Router + PWA on Vercel

### 1.1 Serwist is the tool, not next-pwa

`next-pwa` (the Workbox-based wrapper most tutorials still reference) was archived in August 2023 and is unmaintained. **Serwist** (`@serwist/next`) is its actively-maintained, Workbox-spirit successor and is what current 2026 guides point to — including a migration PR merged in September 2026 explicitly moving a project off next-pwa onto Serwist ([GitHub PR #15](https://github.com/Snag-hub/dos4doers/pull/15)). Next.js's own docs guide for PWAs now documents the App Router pattern directly ([Next.js PWA guide](https://nextjs.org/docs/app/guides/progressive-web-apps)), and Serwist ships first-class examples for both Turbopack and Webpack ([Serwist Next.js getting started](https://serwist.pages.dev/docs/next/getting-started)).

Install:
```bash
npm install @serwist/next @serwist/precaching @serwist/sw idb
```
Config: `withSerwistInit` in `next.config.js`, pointing `swSrc` at `app/sw.ts` and `swDest` at `public/sw.js`. This builds a precache manifest at build time and generates `public/sw.js` — works cleanly with the App Router's file-based routing ([Serwist docs](https://serwist.pages.dev/docs/next/getting-started); [LogRocket Next.js 16 PWA guide](https://blog.logrocket.com/nextjs-16-pwa-offline-support/)).

**RSC/App Router caching gotchas** (confirmed pattern in 2026 write-ups, not vendor spin):
- Route Handlers under `app/api/*` are plain fetch endpoints from the service worker's point of view — cache them with a `NetworkFirst` or `StaleWhileRevalidate` Serwist runtime strategy keyed by URL, same as any REST endpoint. There is no special RSC-payload caching integration in Serwist; you are caching the *serialized output* of a route handler or of a page's HTML/RSC payload, not hooking into React Server Component internals.
- Next.js's own Full Route Cache / Data Cache (server-side) is orthogonal to the service worker's Cache Storage (client-side). Don't conflate them — a page can be server-cached by Next and still be uncached in the browser's Cache Storage if no SW route matches it, and vice versa after a deploy the SW precache manifest changes (new hashed asset URLs) so stale service workers must be force-updated (`skipWaiting()` + `clients.claim()`), which Serwist wires up via its default runtime.
- App Router streaming responses (partial pre-rendering, `loading.tsx` suspense boundaries) can complicate simple `CacheFirst` matching for HTML documents — most teams instead do the "app shell" pattern: precache a static shell, cache page data as JSON via Route Handlers, and hydrate client-side, rather than trying to cache the fully-streamed HTML document.

### 1.2 IndexedDB patterns
Standard pattern for this app: `idb` (already a Serwist peer dep) wrapping IndexedDB for structured lesson/progress data (per-lesson completion, quiz answers, queued AI questions). Service worker handles binary asset caching (video, images) via Cache Storage; IndexedDB handles structured/queryable data (lesson metadata, user progress, sync queue) — this split is the standard practice referenced across 2026 Serwist tutorials ([Medium: Serwist PWA setup](https://javascript.plainenglish.io/building-a-progressive-web-app-pwa-in-next-js-with-serwist-next-pwa-successor-94e05cb418d7)).

### 1.3 Background Sync API
The Background Sync API (`sync` event on the service worker, used to retry a failed POST once connectivity returns) is supported in Chromium-based browsers (Chrome, Edge, Samsung Internet, Android WebView) but has **no Safari/WebKit implementation, no timeline for one, on any platform** ([BSWEN Safari PWA limitations](https://docs.bswen.com/blog/2026-03-12-safari-pwa-limitations-ios/); [MagicBell PWA iOS guide](https://www.magicbell.com/blog/pwa-ios-limitations-safari-support-complete-guide)). Same for Periodic Background Sync and Background Fetch. Practical implication: on Android Chrome/desktop Chrome you can register a sync tag and have the browser retry a queued mutation opportunistically in the background; on iOS Safari (including the installed home-screen PWA) you must poll or resync **only while the app is foregrounded**, using an `online` event listener plus a manual flush of the IndexedDB queue on load/focus.

### 1.4 Caching video lesson content
- Cache Storage has no documented hard per-item size cap in the spec; Chrome allows Cache Storage to grow up to roughly the browser's overall per-origin quota, which is commonly cited as up to ~60% of free disk space, queryable via `navigator.storage.estimate()` ([Workbox storage-quota guide](https://developer.chrome.com/docs/workbox/understanding-storage-quota)). In practice for a hackathon: cache short (1–3 min) compressed MP4/WebM lesson clips (a few MB each) rather than full HD video; don't try to precache an entire video library — cache on-demand ("download for offline") per lesson the operator selects, store as opaque Cache Storage entries keyed by video URL.
- A real Chromium bug exists around 2GB+ single cached files in CacheStorage — stay well under that; segment or transcode to smaller chunks if a lesson video is long ([Chromium issue 379788095](https://issues.chromium.org/issues/379788095)).
- `navigator.storage.persist()` should be requested so Chrome/Android doesn't silently evict the cache under storage pressure — but note this API is unreliable/ignored on iOS Safari (see below).

### 1.5 iOS Safari PWA reality check in 2026 — this is the critical finding

Flagging explicitly because it **contradicts what most hackathon teams assume** ("a PWA is basically a free native app"):

- **Storage eviction**: iOS Safari has historically evicted all PWA local storage (including IndexedDB and Cache Storage) after ~7 days of Safari inactivity for standalone web apps that aren't opened, and storage quotas are tighter than Chromium's; multiple 2026 sources confirm this remains a live issue and is *not* something `persist()` reliably fixes on iOS ([BSWEN, 2026-03-12](https://docs.bswen.com/blog/2026-03-12-safari-pwa-limitations-ios/); [Vinova iOS PWA tips](https://vinova.sg/navigating-safari-ios-pwa-limitations/)).
- **Background Sync API**: not implemented on iOS at all (Push API works when the app is installed to Home Screen, but the *Sync* API — the thing that would let you queue an operator's offline question and have it silently fire when connectivity returns — does not exist on iOS Safari). No timeline announced ([MagicBell](https://www.magicbell.com/blog/pwa-ios-limitations-safari-support-complete-guide)).
- **Push notifications**: work on iOS 16.4+ *only* for a PWA actually added to the Home Screen (a plain Safari tab cannot receive push even with permission granted) — but **EU carve-out**: under the Digital Markets Act, Apple removed standalone/installed-PWA behavior in the EU; PWAs there open as regular Safari tabs with no push support at all ([MagicBell](https://www.magicbell.com/blog/using-push-notifications-in-pwas); [Noman Dev / iOS 26 PWA news](https://noman-web-developer.vercel.app/news/apple-expands-pwa-support-ios-2026)). Not relevant if the hackathon audience/judges are non-EU, but worth knowing if this ships beyond the demo.
- **iOS 26 change** (new this cycle): every site added to the Home Screen now defaults to opening as a standalone web app (previously required a `display: standalone` manifest to get this treatment reliably) — a genuine 2026 improvement, but it doesn't fix Background Sync or storage eviction ([Noman Dev](https://noman-web-developer.vercel.app/news/apple-expands-pwa-support-ios-2026)).

**Verdict — is a PWA viable for "offline e-learning" on iOS Safari?**
Partially, for read-only cached content (precached lesson text/video the operator downloaded while online, viewed later offline — this works fine, Service Worker + Cache Storage do function offline on iOS) but **not** for the "sync my offline actions back automatically" story, and **not reliably long-term** due to storage eviction. This is exactly why the hackathon prompt's own framing (web first, then a *native* Expo app) is the right call — iOS Safari's gaps are a real, current-2026, not-fixed-by-any-flag limitation, and they are the direct technical justification for shipping a real Expo/TestFlight app rather than treating the PWA as sufficient on iOS. **Flag: this contradicts the common assumption that "PWA = offline app, done" — on iOS specifically it is not, and the gap (no Background Sync, storage eviction) is structural, not a bug that will be patched before your demo.**

---

## 2. Offline-first mobile: Expo/React Native

### 2.1 expo-sqlite in 2026
`expo-sqlite` now exposes a synchronous API (`getAllSync`/`getFirstSync`/`runSync` etc., via JSI) alongside the async/Promise API, and a newer Bun-inspired tagged-template `db.sql` query interface with automatic parameter escaping and type inference ([Expo SQLite docs](https://docs.expo.dev/versions/latest/sdk/sqlite/); [npm expo-sqlite](https://www.npmjs.com/package/expo-sqlite)). This is fast, ships in Expo SDK out of the box (no native linking config needed on managed/dev-client builds), and is the natural local store for a hackathon.

Note: direct **libSQL/Turso** support is not built into `expo-sqlite` itself — that integration path goes through `op-sqlite` configured to use libSQL as the backing engine ([expo-opsqlite-libsql-turso example](https://github.com/expo-starter/expo-opsqlite-libsql-turso)). Not worth adding for a 24h hackathon unless Turso's hosted sync is specifically wanted; plain `expo-sqlite` is simpler and sufficient.

### 2.2 Sync engine landscape, current 2026 status

| Engine | Maturity/2026 status | Postgres/Supabase fit | Expo/RN SDK quality | Setup cost in a 24h context |
|---|---|---|---|---|
| **PowerSync** | Actively developed, commercial + self-host option, positions itself as "loosely coupled to Postgres" — doesn't restrict your schema the way Electric does, supports Postgres/MongoDB/MySQL backends, uses native SQLite bindings on RN (no WASM overhead) ([PowerSync vs Electric blog](https://powersync.com/blog/electricsql-vs-powersync); [PowerSync.com](https://powersync.com/)) | Explicit, documented Supabase integration path | Good — official Expo/RN SDK | Medium-high: needs sync rules config, a PowerSync service (hosted or self-host), connecting Supabase Postgres via logical replication |
| **ElectricSQL** | Rewritten/repositioned ("Electric SQL (Legacy) vs PowerSync" post exists from PowerSync itself, i.e. Electric's earlier ActiveActive-sync product line is now referred to as "legacy" by competitors); current Electric is more of a Postgres-to-client sync/shape-streaming layer, fastest for web (uses IndexedDB/OPFS), competitive but WASM-overhead on native mobile ([Kanopy Labs comparison](https://kanopylabs.com/blog/electric-sql-vs-powersync-vs-livestore-local-first)) | Works with any Postgres, including Supabase, via "shapes" | RN support exists via expo-sqlite as one storage backend, but is less mobile-first than PowerSync | Medium-high, and schema constraints (no CHECK/UNIQUE constraints supported historically) are a real gotcha |
| **Replicache** | **Archived June 10, 2026, read-only repo — dead** ([GitHub releases](https://github.com/rocicorp/replicache/releases)) | N/A | N/A | Do not use |
| **Zero (Rocicorp)** | Replicache's successor; ships its own query language (ZQL), own server (`zero-cache`), own protocol; strongest end-to-end story *if* you adopt their stack wholesale (Postgres + zero-cache + your API) ([zero.rocicorp.dev self-host docs](https://zero.rocicorp.dev/docs/self-host); [PkgPulse comparison](https://www.pkgpulse.com/guides/tanstack-db-vs-zero-vs-livestore-sync-engines-2026)) | Postgres-native, so Supabase-as-Postgres works, but you're adding a whole new sync server + protocol layer | Newer, less battle-tested on RN specifically | High for 24h — new protocol, new server component to stand up |
| **Triplit** | Has "folded as a company," now more of a community/OSS project; self-hosted via Docker images ([Triplit self-hosting docs](https://www.triplit.dev/docs/self-hosting)) | Not Postgres-native (Triplit has its own DB model) — would mean *not* using Supabase as source of truth, or running it alongside | RN support exists | Not a good fit — wrong data model for "Supabase Postgres backend" requirement |
| **InstantDB** | No 2026-specific status found in this research pass; historically a hosted realtime/offline DB (own data model, not Postgres-native) | Not a Postgres-fronting tool | Has RN support | Same objection as Triplit — you'd be replacing Supabase, not syncing with it |
| **Supabase's own offline story** | Supabase has **no first-party offline-sync SDK** as of 2026 — the long-running community discussion thread on this is still the canonical reference and remains open/unresolved as an official offering ([Supabase GitHub Discussion #357](https://github.com/orgs/supabase/discussions/357)) | N/A | N/A | You must bring your own sync (PowerSync/Electric/roll-your-own) |

### 2.3 Ranked recommendation for THIS hackathon (speed > robustness)

1. **Primary recommendation: roll-your-own queue-based sync with `expo-sqlite`.** Given the *total* 24-hour budget covers the entire build (web app, mobile replication, AI features, TestFlight submission, APK), spending several hours standing up PowerSync's sync-rules config or Zero's `zero-cache` server is a bad trade. A simple pattern is fast and demo-reliable:
   - Local `expo-sqlite` tables mirror the Supabase Postgres schema (lessons, progress, queued_actions).
   - All writes go local-first: write to SQLite immediately (instant UI), and insert a row into a local `sync_queue` table.
   - A sync function (`useNetInfo` from `@react-native-community/netinfo` to detect connectivity, or Expo's `Network` API) runs on reconnect and on an interval: POSTs queued rows to Supabase via the Supabase JS client, marks them synced, and pulls down any new server rows (`updated_at > lastSyncedAt` cursor) to upsert locally.
   - This is maybe 2–4 hours of work for a small schema (lessons, quiz results, AI question queue) and is the standard "simple expo-sqlite + manual queue-based sync against Supabase" fallback pattern the hackathon brief itself names — treat it as primary, not fallback, given the time budget.

2. **If the team has spare time budget (unlikely in 24h) and someone already knows PowerSync**: PowerSync is the best-fit *engine* for "Expo + Supabase Postgres" specifically, because it explicitly supports Postgres without imposing schema restrictions and has a mature RN SDK. Only reach for it if a team member has used it before — first-time setup (sync rules, connecting Postgrqes logical replication, PowerSync service) realistically eats 4–8 hours, too much of the 24h total.

3. **Do not use** Triplit or InstantDB for this project — both replace Postgres as the source of truth rather than syncing with it, which conflicts with "Supabase Postgres backend."

4. **Zero and Electric** are both technically interesting but neither is a same-day integration for a team that hasn't used them before; skip for hackathon purposes.

**Flag — contradicts conventional hackathon wisdom**: teams often assume "just grab PowerSync/Electric, it's built for this." In practice, for a *first-time* integration inside a 24-hour total budget, the sync-engine setup and debugging time (replication slots, schema constraints, sync-rules YAML) is a bigger risk than writing ~150 lines of manual queue/cursor sync code you fully understand and can debug live during judging.

---

## 3. On-device / offline AI — realistic assessment

### 3.1 What's technically possible in 2026

- **iOS: Apple Foundation Models framework** (new in iOS 26) gives direct Swift access to Apple's on-device ~3B-parameter LLM (the same model behind Apple Intelligence), running entirely on-device via CPU/GPU/Neural Engine, no API keys or network needed ([Apple Newsroom](https://www.apple.com/newsroom/2025/09/apples-foundation-models-framework-unlocks-new-intelligent-app-experiences/); [WWDC25 session](https://developer.apple.com/videos/play/wwdc2025/286/)). **Device gate**: only Apple Intelligence–enabled hardware — iPhone 15 Pro/Pro Max and all iPhone 16/17 models, requiring iOS 26 and Xcode 26 to build against. This is a **Swift-only API** — there is no first-party Expo/React Native module for it; using it from Expo would require writing a native Swift module (Expo Modules API) and bridging it, plus the EAS build would need a custom dev client (can't use Expo Go). Realistically **1–2 days of native bridging work minimum**, not a 24h hackathon task, and it only helps the subset of judges/demo devices that are iPhone 15 Pro+/16/17.
- **Android: Gemini Nano via ML Kit GenAI APIs**, built on the on-device AICore system service; supports summarization, proofreading, rewriting, and (alpha) a general Prompt API for natural-language/multimodal requests ([Android Developers blog, May 2025](https://android-developers.googleblog.com/2025/05/on-device-gen-ai-apis-ml-kit-gemini-nano.html); [ML Kit GenAI overview](https://developers.google.com/ml-kit/genai)). **Device gate is narrow**: best/only reliably performant on the Pixel 10 series (latest Gemini Nano v3); broader "wide support" claims (Pixel 8+, Galaxy S24+) require flagship-tier chips, 12GB+ RAM, and Nano v3 — most hackathon-available Android test phones will **not** qualify. Also no first-party Expo module — would need a native Kotlin bridge.
- **Cross-platform on-device LLM via JS**: `react-native-executorch` (Software Mansion, built on Meta's ExecuTorch) supports Llama/Phi-class models with an actual declarative RN API and explicit Expo SDK 54+ support including an `ExpoResourceFetcher` for model downloads ([executorch.swmansion.com](https://executorch.swmansion.com/); [npm](https://www.npmjs.com/package/react-native-executorch)). `llama.rn` wraps llama.cpp directly (GGUF models) with a JS API for load/complete/stream ([aimobilelauncher.com guide](https://aimobilelauncher.com/blog/on-device-llm-react-native-llama-rn)). These are the most realistic "actually works from Expo/RN" on-device LLM paths — no native Swift/Kotlin bridging needed, cross-platform — but: model files are 1–5GB+ even quantized, first load/download during a demo is slow and fragile over conference-wifi, and integrating + testing (JSI overhead, memory pressure on demo phones, cold-start latency) is realistically a half-day-plus task with real risk of not working live on the specific demo phones.

### 3.2 Offline RAG over a lesson library
`sqlite-vec` is a real, working SQLite extension for KNN vector search with SIMD acceleration, usable as a plain SQLite extension file — no separate vector DB, shares the same SQLite file the app already has ([sqlite-vec Medium explainer](https://medium.com/@stephenc211/how-sqlite-vec-works-for-storing-and-querying-vector-embeddings-165adeeeceea); [MVP Factory Android on-device RAG writeup](https://mvpfactory.io/blog/on-device-rag-for-android-running-embedding-models-vector-search-in-sqlite-and)) with real-world mobile figures like ~140ms p95 and ~200ms up to ~80K documents. **But**: wiring `sqlite-vec` as a loadable extension into `expo-sqlite` specifically (not just native Android/iOS SQLite) is not a documented, well-trodden path as of this research pass — `expo-sqlite`'s extension-loading story is less mature than raw native SQLite, and you'd still need an on-device embedding model (ONNX Runtime Mobile or similar) to generate query embeddings offline. For a lesson library that's realistically a few dozen to a few hundred short articles, this is over-engineering for 24 hours.

### 3.3 Offline STT/TTS
- **iOS**: Apple's Speech framework has an on-device recognition mode (`requiresOnDeviceRecognition = true`), and 2026 write-ups note WhisperKit (Whisper via Core ML) as a common addition for higher accuracy, with 2–8% WER on clean English via the Neural Engine ([Forasoft iOS speech recognition 2026](https://www.forasoft.com/blog/article/speech-recognition-with-neural-networks-on-ios-1621)). This is native Swift API surface again — Expo bridging required.
- **Android**: `SpeechRecognizer`'s offline mode exists but per search results "options are still thin" compared to iOS; TFLite-based Whisper Android ports exist as OSS but are DIY integrations ([vilassn/whisper_android](https://github.com/vilassn/whisper_android)).
- **TTS**: built-in OS TTS (`expo-speech` wraps both iOS `AVSpeechSynthesizer` and Android `TextToSpeech`) works fully offline out of the box, zero native bridging, and is the only STT/TTS option that's genuinely a same-day Expo integration.

### 3.4 Realistic 24-hour verdict — what to actually build vs. fake

**Actually demoable in 24h:**
- `expo-speech` for TTS (reading lesson content / AI answers aloud) — trivial, works offline, no native code.
- A **cloud LLM (e.g., via Vercel AI SDK / OpenAI/Anthropic API) for the "AI operator assistant" while online**, with a clearly offline-aware UI: when `NetInfo`/`Network` reports offline, show "You're offline — your question has been queued and will be answered as soon as you're back online," write the question to the local `sync_queue`, and answer it (calling the cloud LLM) automatically on reconnect. This is honest, robust, and demoable on any phone.
- **Pre-cached keyword-matched canned answers** for a small set of "known" operator questions (e.g., "how do I check hydraulic fluid," "what does this warning light mean") stored locally and matched offline by simple keyword/fuzzy match — this is the standard hackathon trick for "offline AI" and is legitimate to present as "cached expert answers available fully offline, with live LLM answering anything else once connected." Genuinely useful and genuinely offline, and takes maybe 1–2 hours to build (a JSON lookup table + simple string matching, no ML needed).
- Offline lesson content (precached via the sync above) with the TTS reading it aloud offline.

**Should be explicitly simulated/faked for the demo, not real-time on-device inference:**
- Any on-device LLM narrative beyond the keyword-cache trick. If a team member is confident with `react-native-executorch` from prior experience, a small (1–3B) quantized model *could* be integrated in the remaining time as a stretch goal, but budget it as optional/last, and test early on the actual demo phones because model load time and memory pressure are the most common live-demo failure mode.
- Apple Foundation Models / Gemini Nano native integration — skip entirely for a 24h hackathon; the native-bridging cost and narrow device support (iPhone 15 Pro+/17, Pixel 10) make it a bad time investment versus audience reach.
- On-device RAG with `sqlite-vec` — skip; do simple keyword/full-text search (SQLite FTS5, which ships in `expo-sqlite`'s underlying SQLite build) over the lesson library instead — FTS5 is "boring" but real, fast, fully offline, and a same-day integration, unlike vector search + embeddings.

**Flag — contradicts conventional hackathon wisdom**: "on-device LLM demo" sounds impressive and is a popular hackathon pitch in 2026, but the actual native-bridging cost from Expo (no first-party Expo module for either Apple's Foundation Models or Gemini Nano) and narrow device gating (both require recent flagship hardware) make it a poor use of a 24-hour budget compared to a well-executed offline-queue + cached-answers + cloud-LLM-when-online story, which is arguably *more* honest to the actual "remote site, intermittent connectivity" problem being solved.

---

## 4. TestFlight from Windows (no Mac) — EAS Build + EAS Submit, current 2026 flow

### 4.1 The flow works fully from Windows
EAS Submit is explicitly cross-platform: it "works on macOS, Linux, and Windows, so no Mac is needed to ship iOS builds" ([Playcode EAS guide](https://playcode.io/blog/eas-build-guide)). The build itself also runs on Expo's cloud macOS workers, so no local Xcode is ever needed. Official docs: [Submit to app stores overview](https://docs.expo.dev/submit/introduction/), [Submit to Apple App Store with EAS Submit](https://docs.expo.dev/submit/ios/), and Expo's own step-by-step [testflight CLI tool](https://github.com/expo/testflight) which deploys straight to TestFlight from the command line via EAS Build + Submit together.

### 4.2 Code signing / credentials without local Xcode
EAS manages Apple code signing remotely — you authenticate with your Apple Developer account (Apple ID + either an app-specific password for classic auth, or the recommended **App Store Connect API key**, generated in App Store Connect → Users and Access → Integrations → App Store Connect API, uploaded once to EAS). EAS then auto-generates/manages the distribution certificate and provisioning profile on Apple's servers on your behalf — you never touch Xcode or Keychain Access. This is the standard, documented EAS credentials-management flow (`eas credentials`), consistent across the 2026 sources reviewed.

### 4.3 Build/queue times
- **Free tier**: shared low-priority queue; peak-time queue waits commonly run **minutes to tens of minutes**, but "will frequently grow to an hour or more" under heavy platform load ([expo/fyi eas-build-queues.md](https://github.com/expo/fyi/blob/main/eas-build-queues.md)). Free tier is capped at **15 iOS + 15 Android builds/month**, and a **45-minute build timeout** (vs 2 hours on paid) — a large native-module-heavy Expo project could hit this.
- **Paid tiers**: Starter ($19/mo + usage, $45 build credits) and Production ($199/mo + usage, $225 build credits, 2 included concurrent builds) get a **high-priority queue** and the 2-hour timeout; extra concurrency is purchasable at $50/concurrency/month up to 5 ([metacto Expo pricing 2026](https://www.metacto.com/blogs/the-true-cost-of-expo-app-development-a-comprehensive-guide)). For a hackathon, plan builds early and expect free-tier queue variance — **don't kick off your first iOS build at hour 20**.
- **After upload**: once `eas submit -p ios` completes, the build typically appears in TestFlight **10–15 minutes later** after Apple's processing ([Playcode](https://playcode.io/blog/eas-build-guide)).

### 4.4 TestFlight distribution for a hackathon demo
- **Internal testing** (up to 100 testers via App Store Connect, must be added as users on the Apple Developer team) has **no App Review wait** — builds are available within minutes of processing. This is what you want for a hackathon: add judges/teammates as internal testers ahead of time.
- **External testing** requires an actual Beta App Review (can take a day or more) — avoid this path entirely for a same-day hackathon demo; use internal testing only.

### 4.5 Common pitfalls (from the docs/guides reviewed)
- Provisioning profile mismatches typically happen when the bundle identifier in `app.json`/`app.config.js` doesn't match what's registered in App Store Connect, or when a previously-used profile lacks the right entitlements after adding a new capability (push, etc.) — `eas credentials` regenerating the profile after any entitlement change avoids this.
- App Store Connect API key setup is a one-time step per Apple team; store the key ID/issuer ID/`.p8` in EAS's encrypted credentials store (`eas credentials`) rather than passing them ad hoc.
- "Build submitted successfully but not showing in TestFlight" is a known/reported issue in Apple's own developer forums ([Apple Developer Forums thread](https://developer.apple.com/forums/thread/812751)) — usually resolves itself after the 10–15 min processing window; don't panic-resubmit.

### 4.6 Android — simpler, no store submission needed for a demo
`eas.json` build profile for an internal preview APK:
```json
{
  "build": {
    "preview": {
      "distribution": "internal",
      "android": { "buildType": "apk" }
    }
  }
}
```
`eas build --platform android --profile preview` produces a directly-installable `.apk` (not `.aab`), distributed via a QR code / download link EAS gives you — install directly on demo Android phones with no Google Play submission, no review wait. This is by far the fastest of the two mobile distribution paths and should be done first to de-risk the Android side of the demo.

---

## 5. Code sharing between Next.js web and Expo mobile

### 5.1 Standard 2025/2026 pattern: pnpm workspace + shared package
The dominant, well-documented 2026 pattern is a **pnpm monorepo** with Turborepo, two separate apps (`apps/web` = Next.js, `apps/mobile` = Expo), and one or more shared packages (`packages/shared` or split into `packages/types`, `packages/api-client`, `packages/ui-tokens`) holding TypeScript types, Zod schemas, the Supabase API client, and design tokens. Expo has shipped first-class monorepo support since SDK 53 (2025), refined through SDK 55, and Metro now has built-in monorepo resolution ([Expo monorepos guide](https://docs.expo.dev/guides/monorepos/); [React Native Relay 2026 monorepo guide](https://reactnativerelay.com/article/react-native-monorepo-turborepo-expo-2026)). Reference scaffolds exist specifically for this Next.js+Expo pairing ([rphlmr/expo-nextjs-monorepo](https://github.com/rphlmr/expo-nextjs-monorepo), [byCedric/expo-monorepo-example](https://github.com/byCedric/expo-monorepo-example)).

Practical shared-package contents for this project:
- `packages/schemas`: Zod schemas for lesson/user/progress/AI-query data, used for both Supabase row typing and API validation, imported by both apps.
- `packages/api-client`: thin Supabase client wrapper + typed query functions, shared verbatim.
- `packages/tokens`: color/spacing/typography design tokens (as plain JS/TS objects, not CSS — consumed by Tailwind config on web and by a StyleSheet/theme object on native).
- UI components are **not** shared in this architecture — web uses React DOM/Tailwind components, native uses React Native components; only logic/types/tokens cross the boundary.

### 5.2 The react-native-web / Expo Router "universal app" alternative
This is a real, valid 2026 pattern (`create-expo-app` with a web template, or a single Expo Router app that also targets web via `react-native-web`, letting `View`/`Text`/`Image` map to DOM elements). A 2026 piece frames unifying a React web product and RN app into one core as "one of the highest-leverage architecture decisions available" for a company running both long-term ([Loic Bachellerie, 2026](https://loicb.tech/blog/2026/shared-web-mobile-codebase)). Platform-specific file extensions (`.web.tsx`/`.native.tsx`) let a shared package expose one API with per-platform implementations.

### 5.3 Decisive recommendation for this 24-hour hackathon

**Go with separate Next.js + Expo apps in a pnpm workspace with a shared `packages/` layer — not react-native-web/Expo Router universal app.** Reasoning, directly against the hackathon's own framing:

1. **The prompt says "design the website first, then replicate as a mobile app."** That is explicitly a two-artifact plan, not a "build once, target two runtimes" plan. Retrofitting a Next.js-first build into a react-native-web universal app after the fact is *more* work, not less — you'd be fighting Next.js App Router's server-rendering/RSC model (which has no native-mobile equivalent) to make components portable, when the actual ask was two separately-optimized front ends sharing only logic/types.
2. **Visual/UX quality on each platform benefits from platform-native styling.** A hackathon demo is judged partly on polish; Tailwind-on-web and a native design system (NativeWind or plain StyleSheet) both look better *and* are faster to build well than forcing one RNW component tree to look native on both.
3. **Risk profile**: react-native-web has real, documented rough edges (CSS-in-JS interop, certain native modules with no web shim, Next.js App Router + RNW compatibility is not a mainstream, heavily-trodden combination the way plain Expo-web or plain Next.js is) — not something you want to be debugging for the first time at hour 10 of 24.
4. Shared Zod schemas + a shared Supabase client already capture the highest-value code-sharing win (data contracts, validation, API calls) without taking on RNW's integration risk.

**When RNW *would* be the better call** (for completeness, not this hackathon): a longer-timeline project, or one where the team has prior RNW/Expo Router-web production experience and genuinely wants one codebase for maintenance reasons post-hackathon. Given this is a 24-hour build measured in a demo, not a maintained product, that tradeoff doesn't apply here.

**Flag — mild contradiction of "modern wisdom"**: 2026 blog content (see Loic Bachellerie above) is bullish on "one codebase, write once" as the leading-edge pattern, and it's not wrong for teams with the runway to absorb the integration cost once. But applied naively to a 24-hour hackathon with an explicit web-first prompt, that "modern best practice" is actually the riskier, slower path — the higher-leverage move here is the boring one (separate apps, shared types/schemas package).

---

## Sources

- [Migrate PWA/service worker from next-pwa to Serwist — GitHub PR](https://github.com/Snag-hub/dos4doers/pull/15) — accessed 2026-09-23, confirms next-pwa archived / Serwist as maintained successor
- [Next.js docs — Guides: PWAs](https://nextjs.org/docs/app/guides/progressive-web-apps)
- [Serwist — Getting started (@serwist/next)](https://serwist.pages.dev/docs/next/getting-started)
- [LogRocket — Build a Next.js 16 PWA with true offline support](https://blog.logrocket.com/nextjs-16-pwa-offline-support/)
- [JavaScript in Plain English — Building a PWA in Next.js with Serwist](https://javascript.plainenglish.io/building-a-progressive-web-app-pwa-in-next-js-with-serwist-next-pwa-successor-94e05cb418d7)
- [MagicBell — PWA iOS Limitations and Safari Support (2026)](https://www.magicbell.com/blog/pwa-ios-limitations-safari-support-complete-guide)
- [MagicBell — Using Push Notifications in PWAs](https://www.magicbell.com/blog/using-push-notifications-in-pwas)
- [BSWEN — Safari PWA Limitations on iOS, 2026-03-12](https://docs.bswen.com/blog/2026-03-12-safari-pwa-limitations-ios/)
- [Vinova — Navigating Safari/iOS PWA Limitations and Bugs](https://vinova.sg/navigating-safari-ios-pwa-limitations/)
- [Noman Dev — Apple Expands PWA Support on iOS (2026 news)](https://noman-web-developer.vercel.app/news/apple-expands-pwa-support-ios-2026)
- [Chrome Developers — Workbox: Understanding storage quota](https://developer.chrome.com/docs/workbox/understanding-storage-quota)
- [Chromium Issue 379788095 — CacheStorage large-file bug](https://issues.chromium.org/issues/379788095)
- [PowerSync — ElectricSQL (Legacy) vs PowerSync](https://powersync.com/blog/electricsql-vs-powersync)
- [PowerSync.com](https://powersync.com/)
- [Kanopy Labs — Electric SQL vs PowerSync vs LiveStore, 2026](https://kanopylabs.com/blog/electric-sql-vs-powersync-vs-livestore-local-first)
- [Supabase GitHub Discussion #357 — Using Supabase offline](https://github.com/orgs/supabase/discussions/357)
- [Expo blog — What synced in-app SQLite brings to Expo apps](https://expo.dev/blog/what-synced-in-app-sqlite-brings-to-expo-apps)
- [Expo docs — SQLite](https://docs.expo.dev/versions/latest/sdk/sqlite/)
- [expo-sqlite — npm](https://www.npmjs.com/package/expo-sqlite)
- [expo-opsqlite-libsql-turso example](https://github.com/expo-starter/expo-opsqlite-libsql-turso)
- [Rocicorp Replicache — GitHub releases (archived June 2026)](https://github.com/rocicorp/replicache/releases)
- [Zero — Self-Hosting docs](https://zero.rocicorp.dev/docs/self-host)
- [PkgPulse — TanStack DB vs Zero vs LiveStore, 2026](https://www.pkgpulse.com/guides/tanstack-db-vs-zero-vs-livestore-sync-engines-2026)
- [Triplit — Self-hosting docs](https://www.triplit.dev/docs/self-hosting)
- [react-native-executorch — npm](https://www.npmjs.com/package/react-native-executorch)
- [React Native ExecuTorch official site](https://executorch.swmansion.com/)
- [aimobilelauncher.com — On-Device LLM in React Native with llama.rn, 2026 guide](https://aimobilelauncher.com/blog/on-device-llm-react-native-llama-rn)
- [Apple Newsroom — Apple's Foundation Models framework, Sept 2025](https://www.apple.com/newsroom/2025/09/apples-foundation-models-framework-unlocks-new-intelligent-app-experiences/)
- [Apple Developer — WWDC25: Meet the Foundation Models framework](https://developer.apple.com/videos/play/wwdc2025/286/)
- [dev.to — WWDC 2026: Apple Foundation Models opened to any LLM provider](https://dev.to/arshtechpro/wwdc-2026-apple-just-opened-the-foundation-models-framework-to-any-llm-provider-5ejn)
- [Android Developers Blog — On-device GenAI APIs in ML Kit, May 2025](https://android-developers.googleblog.com/2025/05/on-device-gen-ai-apis-ml-kit-gemini-nano.html)
- [Android Developers Blog — Latest Gemini Nano with ML Kit GenAI APIs, Aug 2025](https://android-developers.googleblog.com/2025/08/the-latest-gemini-nano-with-on-device-ml-kit-genai-apis.html)
- [Google for Developers — Overview of ML Kit GenAI APIs](https://developers.google.com/ml-kit/genai)
- [localaimaster.com — Gemini Nano Android On-Device AI Guide (2026)](https://localaimaster.com/blog/gemini-nano-android-guide)
- [sqlite-vec explainer — Medium](https://medium.com/@stephenc211/how-sqlite-vec-works-for-storing-and-querying-vector-embeddings-165adeeeceea)
- [MVP Factory — On-Device RAG for Android with sqlite-vec](https://mvpfactory.io/blog/on-device-rag-for-android-running-embedding-models-vector-search-in-sqlite-and)
- [Forasoft — iOS Speech Recognition in 2026: WhisperKit & SpeechAnalyzer](https://www.forasoft.com/blog/article/speech-recognition-with-neural-networks-on-ios-1621)
- [vilassn/whisper_android — offline Whisper + TFLite for Android](https://github.com/vilassn/whisper_android)
- [Playcode — EAS Build and EAS Submit Without a Mac](https://playcode.io/blog/eas-build-guide)
- [Expo docs — Submit to app stores](https://docs.expo.dev/submit/introduction/)
- [Expo docs — Submit to the Apple App Store with EAS Submit](https://docs.expo.dev/submit/ios/)
- [expo/testflight — GitHub](https://github.com/expo/testflight)
- [expo/fyi — eas-build-queues.md](https://github.com/expo/fyi/blob/main/eas-build-queues.md)
- [metacto — Expo App Development Costs in 2026: EAS Pricing](https://www.metacto.com/blogs/the-true-cost-of-expo-app-development-a-comprehensive-guide)
- [Apple Developer Forums — Build Submitted Successfully but Not Showing in TestFlight](https://developer.apple.com/forums/thread/812751)
- [Expo docs — Work with monorepos](https://docs.expo.dev/guides/monorepos/)
- [React Native Relay — React Native Monorepo Guide (2026)](https://reactnativerelay.com/article/react-native-monorepo-turborepo-expo-2026)
- [rphlmr/expo-nextjs-monorepo — GitHub example](https://github.com/rphlmr/expo-nextjs-monorepo)
- [byCedric/expo-monorepo-example — GitHub](https://github.com/byCedric/expo-monorepo-example)
- [Loic Bachellerie — Sharing Code Between Web and Mobile, 2026](https://loicb.tech/blog/2026/shared-web-mobile-codebase)
