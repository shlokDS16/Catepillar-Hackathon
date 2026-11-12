import type { InboxItem } from "@/inbox/inbox";

export type FleetTaskKey = "excavation" | "trenching" | "material_loading" | "grading";
export type FleetTier = "critical" | "warning" | "caution";
export type FleetKind = Exclude<InboxItem["kind"], "near_miss">;
export function isTier(s: FleetState): s is FleetTier {
  return s === "critical" || s === "warning" || s === "caution";
}
export type FleetState = FleetTier | "working" | "parked";

type RosterRow = { code: string; operator: string; task: FleetTaskKey; moving: boolean };

/**
 * The demo fleet: the machine codes the fixtures already name (EXC-007, EXC-014, DMP-003, EXC-011), plus two
 * invented rows (LDR-001, DMP-005) so the strip shows six. Operator, task and moving flag are scenario data, not
 * telemetry; the strip says so. Operators come from this roster only: an alert row's operator can be the person
 * in danger (guardian hazard), never the driver.
 */
export const DEMO_ROSTER: readonly RosterRow[] = [
  { code: "EXC-007", operator: "Ravi", task: "excavation", moving: true },
  { code: "EXC-014", operator: "Sunita", task: "trenching", moving: false },
  { code: "DMP-003", operator: "Meena", task: "material_loading", moving: true },
  { code: "EXC-011", operator: "Arjun", task: "grading", moving: false },
  { code: "LDR-001", operator: "Imran", task: "material_loading", moving: true },
  { code: "DMP-005", operator: "Kavita", task: "material_loading", moving: false },
];

export type FleetCell = {
  code: string;
  operator: string;
  task: FleetTaskKey;
  state: FleetState;
  /** The kind of the alert that sets a tier state, for its pictogram. */
  kind: FleetKind | null;
  /** True for the machine of the alert being read. */
  selected: boolean;
  /** Shown on phones before "+N more" is opened. */
  phone: boolean;
};

const TIER_RANK: Record<FleetTier, number> = { critical: 0, warning: 1, caution: 2 };
/** Phones show this many cells before "+N more". */
export const PHONE_CELLS = 3;

/** Highest open tier per machine code; a row only counts while it is open. */
function worstOpen(items: readonly InboxItem[]): Map<string, { tier: FleetTier; kind: FleetKind }> {
  const out = new Map<string, { tier: FleetTier; kind: FleetKind }>();
  for (const i of items) {
    if (i.status !== "open" || !i.machineCode || i.kind === "near_miss") continue;
    if (i.tier !== "critical" && i.tier !== "warning" && i.tier !== "caution") continue;
    const cur = out.get(i.machineCode);
    if (!cur || TIER_RANK[i.tier] < TIER_RANK[cur.tier]) out.set(i.machineCode, { tier: i.tier, kind: i.kind });
  }
  return out;
}

/**
 * Six cells, most urgent first (ties keep roster order). A machine's state is its worst open alert
 * tier, else Working when moving, else Parked.
 * Phones show the first three, swapping the selected machine in if it would otherwise be hidden.
 */
export function buildFleetCells(items: readonly InboxItem[], selectedId: string | null): FleetCell[] {
  const worst = worstOpen(items);
  const selectedCode = items.find((i) => i.id === selectedId)?.machineCode ?? null;

  const cells = DEMO_ROSTER.map((r, idx) => {
    const w = worst.get(r.code);
    const state: FleetState = w ? w.tier : r.moving ? "working" : "parked";
    return { idx, cell: { code: r.code, operator: r.operator, task: r.task, state, kind: w?.kind ?? null, selected: r.code === selectedCode, phone: false } satisfies FleetCell };
  });
  const rank = (s: FleetState) => (isTier(s) ? TIER_RANK[s] : 3);
  cells.sort((a, b) => rank(a.cell.state) - rank(b.cell.state) || a.idx - b.idx);
  const out = cells.map((c) => c.cell);
  const visible = new Set(out.slice(0, PHONE_CELLS).map((c) => c.code));
  const sel = out.find((c) => c.selected);
  if (sel && !visible.has(sel.code)) {
    visible.delete(out[PHONE_CELLS - 1]!.code);
    visible.add(sel.code);
  }
  return out.map((c) => ({ ...c, phone: visible.has(c.code) }));
}
