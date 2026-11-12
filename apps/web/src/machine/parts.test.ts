import { describe, expect, it } from "vitest";
import { cabState, machineParts, PART_IDS, worstPart } from "./parts";
import type { Snapshot } from "@/data/types";

type M = NonNullable<Snapshot["machine"]>;
const base: M = {
  id: "00000000-0000-4000-8000-000000000001", code: "EXC-007", model_name: null, moving: false, speed_kmh: 0, health: "ok",
  location: { lat: 0, lon: 0 }, seatbelt_fastened: true, parking_brake: true,
};
const snap = (m: Partial<M> | null): Pick<Snapshot, "machine"> => ({ machine: m ? { ...base, ...m } : null });

describe("machineParts", () => {
  it("returns nothing without a machine", () => {
    expect(machineParts(snap(null))).toEqual([]);
    expect(machineParts(null)).toEqual([]);
  });
  it("defaults every part to ok when machine.parts is absent, in a fixed order with numbers 1-6", () => {
    const p = machineParts(snap({}));
    expect(p.map((x) => x.id)).toEqual([...PART_IDS]);
    expect(p.map((x) => x.n)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(p.every((x) => x.state === "ok" && x.noteKey === "bay.note.ok")).toBe(true);
  });
  it("maps machine.parts for the non-cab parts", () => {
    const p = machineParts(snap({ parts: [{ id: "boom_ram", state: "caution", note_key: "bay.note.boom_ram_drift" }, { id: "tracks", state: "critical", note_key: "bay.note.ok" }] }));
    expect(p.find((x) => x.id === "boom_ram")).toMatchObject({ state: "caution", noteKey: "bay.note.boom_ram_drift" });
    expect(p.find((x) => x.id === "tracks")?.state).toBe("critical");
    expect(p.find((x) => x.id === "engine")?.state).toBe("ok");
  });
  it("derives the cab from seatbelt and motion", () => {
    expect(cabState({ moving: true, seatbelt_fastened: false }).state).toBe("warning");
    expect(cabState({ moving: false, seatbelt_fastened: false }).state).toBe("caution");
    expect(cabState({ moving: true, seatbelt_fastened: true }).state).toBe("ok");
    expect(cabState({ moving: true, seatbelt_fastened: null }).state).toBe("ok");
    const cab = machineParts(snap({ moving: true, seatbelt_fastened: false })).find((x) => x.id === "cab");
    expect(cab).toMatchObject({ state: "warning", noteKey: "bay.note.cab_belt_moving" });
  });
  it("never lets a cab entry in machine.parts hide a worse derived state, nor the reverse", () => {
    const worseDerived = machineParts(snap({ moving: true, seatbelt_fastened: false, parts: [{ id: "cab", state: "caution", note_key: "x" }] }));
    expect(worseDerived.find((x) => x.id === "cab")?.state).toBe("warning");
    const worseGiven = machineParts(snap({ seatbelt_fastened: true, parts: [{ id: "cab", state: "critical", note_key: "bay.note.x" }] }));
    expect(worseGiven.find((x) => x.id === "cab")).toMatchObject({ state: "critical", noteKey: "bay.note.x" });
  });
  it("worstPart picks the highest tier, null when all ok", () => {
    expect(worstPart(machineParts(snap({})))).toBeNull();
    const p = machineParts(snap({ moving: true, seatbelt_fastened: false, parts: [{ id: "boom_ram", state: "caution", note_key: "k" }] }));
    expect(worstPart(p)?.id).toBe("cab");
  });
});
