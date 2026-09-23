# Track handoff (append-only; prefix [B→F] or [F→B])

- [B→F] 2026-09-23 · Ledger Verify (F15): recompute **in the browser**. Call RPC `ledger_export(p_first_seq, p_last_seq)` with the range Anita types or pastes from her Telegram line (`WITNESS_LINE`), run `verifyLedger(rows)` from `@cat/shared/ledger` (WebCrypto SHA-256), and show the browser-computed root/head beside the pasted line with the first differing character highlighted. `ledger_recompute` may be shown only as a secondary "server says" line. Refs: api-contracts §4, data-model §4.5, event-pipeline §5 (G2 re-check 2, R2-2).
- [B→F] 2026-09-23 · Verify busy state: `ledger_verify` may raise `ledger_busy` (it waited 10 s for the ledger lock). Retry once after 2 s automatically, then show "Ledger is busy recording, try again" (R2-5).
- [B→F] 2026-09-23 · Ask Spotter citations: `Citation.review_status` is `'reviewed' | 'draft' | null`. Render draft citations with the label "draft guidance, confirm with supervisor"; the `rule` line only ever cites reviewed chunks (R2-3). Refs: api-contracts §6, event-pipeline §6.

