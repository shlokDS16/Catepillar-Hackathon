import type { Connectivity } from "@/data/reducer";

export type SyncState = { kind: "saved" } | { kind: "queued"; n: number } | { kind: "offline"; n: number };

/**
 * The Sync cell of the status band. `queued` is the number of writes waiting to go out; the client has
 * no outbox yet, so callers pass 0 until one exists (the cell then reads Saved, or Offline with no signal).
 */
export function syncState(connectivity: Connectivity, queued = 0): SyncState {
  const n = Math.max(0, Math.floor(queued));
  if (connectivity.kind === "nosignal") return { kind: "offline", n };
  if (connectivity.kind === "reconnecting" || n > 0) return { kind: "queued", n };
  return { kind: "saved" };
}
