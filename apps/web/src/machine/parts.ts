import type { Snapshot } from "@/data/types";

/**
 * Machine Bay part model (D17). The six part ids match the landing excavator's parts so a later 3D
 * stage can reuse them. Every reading is simulated (SIM): the contract carries `machine.parts` from
 * the fixture/backend; the cab is derived from the seatbelt and motion state the snapshot already has.
 */
export const PART_IDS = ["boom_ram", "tracks", "engine", "cab", "bucket", "rear_sensor"] as const;
export type PartId = (typeof PART_IDS)[number];
export type PartState = "ok" | "caution" | "warning" | "critical";

export const PART_STATE_ORDER: Record<PartState, number> = { ok: 0, caution: 1, warning: 2, critical: 3 };

export type MachinePartView = {
  id: PartId;
  /** 1-based, the number shown on the drawing pin and in the list. */
  n: number;
  state: PartState;
  /** i18n key (full path, "bay.note.*") for the one-line note. */
  noteKey: string;
  derived: boolean;
};

const worse = (a: PartState, b: PartState): PartState => (PART_STATE_ORDER[a] >= PART_STATE_ORDER[b] ? a : b);

/** Cab: belt off while moving is a warning, belt off while stopped a caution, otherwise ok. */
export function cabState(machine: { moving: boolean; seatbelt_fastened: boolean | null }): { state: PartState; noteKey: string } {
  if (machine.seatbelt_fastened === false) {
    return machine.moving
      ? { state: "warning", noteKey: "bay.note.cab_belt_moving" }
      : { state: "caution", noteKey: "bay.note.cab_belt_off" };
  }
  return { state: "ok", noteKey: "bay.note.ok" };
}

/** Snapshot -> the six parts, always in PART_IDS order. No machine: an empty list. */
export function machineParts(snapshot: Pick<Snapshot, "machine"> | null | undefined): MachinePartView[] {
  const machine = snapshot?.machine;
  if (!machine) return [];
  const given = new Map((machine.parts ?? []).map((p) => [p.id, p]));
  return PART_IDS.map((id, i): MachinePartView => {
    const p = given.get(id);
    if (id === "cab") {
      const d = cabState(machine);
      if (!p || PART_STATE_ORDER[d.state] >= PART_STATE_ORDER[p.state]) {
        return { id, n: i + 1, state: p ? worse(p.state, d.state) : d.state, noteKey: d.state === "ok" && p ? p.note_key : d.noteKey, derived: true };
      }
    }
    return { id, n: i + 1, state: p?.state ?? "ok", noteKey: p?.note_key ?? "bay.note.ok", derived: false };
  });
}

/** The part to draw attention to: the worst non-ok one (first in list order on a tie), else null. */
export function worstPart(parts: MachinePartView[]): MachinePartView | null {
  let best: MachinePartView | null = null;
  for (const p of parts) if (p.state !== "ok" && (!best || PART_STATE_ORDER[p.state] > PART_STATE_ORDER[best.state])) best = p;
  return best;
}
