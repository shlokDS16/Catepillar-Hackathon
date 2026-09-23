# G1 decisions (Shlok, 2026-09-23) + teammate's improvements (verbatim, lightly normalised)

## Shlok's answers to the G1 questions
1. Spec approved, with the teammate's improvements below applied (→ spec v3).
2. UI direction: **A "Site Signage"**.
3. Chatbot must be **better than Cat's**: a proper advanced RAG that works with images, text and
   documents, has all the knowledge, and replies based on role. **Pinecone** as the vector database.
   → M8 promoted to P0.
4. The organisers provided only a small sample dataset, and they want it taken to the next level.
   Fabricate or use open-source data while catering to their requirement. (File not yet in the repo;
   Shlok to drop it in docs/brief/data/.)
5. Twilio: an existing trial account with about $5 of credit. Fine for the demo.
6. Both teammates build together on this one laptop.
7. **Groq API instead of Anthropic and Sarvam.** Multiple keys for different tasks, plus backups. The
   teammate has voice-specific and text-specific keys. Check whether Voyage's free tier is enough, or
   whether to use Pinecone's own embeddings.

## Teammate's improvements (Claude-assisted)
1. **Scenario engine** (most valuable): a simulated clock with speed control (1×, 10×, 60×) so a full
   shift plays in minutes; scenario scripts per shift with a fixed seed and scheduled events, so every
   run replays identically; a hidden director panel to fire an event, jump to a time, reset or switch
   persona; a single events table as the source of truth that every module subscribes to, so one
   seatbelt breach appears everywhere at once.
2. **Believable invented data**: the generator has hidden effects the model isn't told about
   (interactions, noise, a few outliers). Label every screen's data as invented or assumed. Present the
   repeat-event chart as "how we'd measure impact", not proven impact.
3. **Safety design fixes**: a lock mode while the machine moves (glance-only, big status words, no
   calls to the operator); fixed protocol cards per fault type; PPE warns, then allows a logged
   supervisor override; an alert budget with duplicates merged and lower-priority alerts suppressed;
   a strict pattern for the AI's safety answers (cite the source, give the rule, hand over to the
   supervisor).
4. **Ledger as a genuine security feature**: canonical serialization; the previous-record link set
   server-side under a lock; a daily Merkle root published outside the database (to the supervisor's
   Telegram), so the live-tamper demo proves something real; a STRIDE threat-model slide (SOS abuse,
   database access rules, device login, AI prompt injection, approval before the AI can log an incident).
5. **Privacy by design**: operator consent, operators can see their own data, retention limits, and a
   non-punitive near-miss mode (for show).
6. **Few, reliable real integrations**: the real Telegram message and Twilio call prove it isn't a
   mock-up. Twilio trial calls reach verified numbers only and play an English trial notice first.
   Everything else (weather, machine data) is scenario-driven.
8. **Fix the slips**: the weather line becomes "peak 44 °C forecast by 14:00"; the supervisor becomes a
   regional fleet manager; M8 is reframed as a shift-aware assistant that complements Cat's.
(The teammate's list has no item 7.)
