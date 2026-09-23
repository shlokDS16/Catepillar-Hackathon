# Lessons Learned

Anything that would save a future engineer time. Append only.

Format: **[date]** - what happened, what it cost, what to do instead.

**[2026-09-23]** Red-teaming the backend design before code caught 5 blockers (SOS timer coupled to scenario tick, detector eval polluting append-only ledger, SOS deduped by unique index, Merkle witness never compared externally, 60x clock suppressing alerts). Keep the design → red team → revise loop for every phase.
**[2026-09-23]** Research scouts that fan out to sub-agents sometimes return before writing their file; always check the output file exists before marking done.
**[2026-09-23]** Local git branch defaulted to `master` while remote is `main`; `git push -q` hid the failure. Verify with `git status -sb` after pushing.
