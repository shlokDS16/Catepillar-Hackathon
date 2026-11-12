import { parseDispatch, type InboxGroups, type InboxItem } from "@/inbox/inbox";

/**
 * Phase 4: split view (desktop) and triage (mobile) rules for the Inbox. Pure, so selection, the
 * keyboard and the triage order are unit-tested; the screen only renders what these return.
 */

export const flat = (g: InboxGroups): InboxItem[] => [...g.needsAction, ...g.handled, ...g.resolved, ...g.suppressed];

/** Every selectable id in reading order: needs action, handled, resolved, suppressed. */
export function selectableIds(groups: InboxGroups): string[] {
  return flat(groups).map((i) => i.id);
}

/** Keep a selection valid: an id that is no longer listed falls back to the first row (null when empty). */
export function resolveSelection(ids: readonly string[], current: string | null): string | null {
  if (current !== null && ids.includes(current)) return current;
  return ids[0] ?? null;
}

export type SelectionKey = "ArrowDown" | "ArrowUp" | "Home" | "End";

/** Up/Down move one row and stop at the ends (no wrap: the end of the list is a real place). */
export function moveSelection(ids: readonly string[], current: string | null, key: SelectionKey): string | null {
  if (ids.length === 0) return null;
  const last = ids.length - 1;
  if (key === "Home") return ids[0]!;
  if (key === "End") return ids[last]!;
  const at = current === null ? -1 : ids.indexOf(current);
  if (at === -1) return ids[key === "ArrowDown" ? 0 : last]!;
  return ids[Math.min(last, Math.max(0, at + (key === "ArrowDown" ? 1 : -1)))]!;
}

/**
 * Mobile triage: the most urgent open alert is expanded, the rest wait below as compact rows. A tap
 * promotes any row (a handled one too) to the lead; the queue is the open alerts minus the lead.
 */
export function triage(groups: InboxGroups, promotedId: string | null): { lead: InboxItem | null; queued: InboxItem[] } {
  const promoted = promotedId !== null ? flat(groups).find((i) => i.id === promotedId) : undefined;
  const lead = promoted ?? groups.needsAction[0] ?? null;
  return { lead, queued: groups.needsAction.filter((i) => i.id !== lead?.id) };
}

export type TimelineStep =
  | { kind: "raised"; ageMin: number | null }
  | { kind: "dispatch"; channel: string; status: string; dryRun: boolean };

/** "Raised", then every dispatch line in order. A dry run is flagged so the screen never calls it sent. */
export function timelineSteps(item: InboxItem, lines: readonly string[], ageMin: number | null): TimelineStep[] {
  if (item.nonPunitive) return [{ kind: "raised", ageMin: null }];
  const steps: TimelineStep[] = [{ kind: "raised", ageMin }];
  const all = lines.length > 0 ? lines : item.dispatch ? [item.dispatch] : [];
  for (const line of all) {
    const p = parseDispatch(line);
    if (p) steps.push({ kind: "dispatch", channel: p.channel, status: p.status, dryRun: p.status === "dry_run" });
  }
  return steps;
}

/** Open alerts the manager has not been shown yet (highest tier first, as ordered). They never replace what is on screen; the screen announces them. */
export function unseenOpen(groups: InboxGroups, seen: ReadonlySet<string>): InboxItem[] {
  return groups.needsAction.filter((i) => !seen.has(i.id));
}
