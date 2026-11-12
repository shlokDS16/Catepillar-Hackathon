import { describe, expect, it } from "vitest";
import { estimateLabel, placeLabels, type LabelItem } from "./label-layout";

const frame = { w: 600, h: 400 };
const item = (id: string, x: number, y: number, priority: number, lines = ["EXC-014"]): LabelItem => ({ id, x, y, priority, ...estimateLabel(lines) });

describe("placeLabels", () => {
  it("puts a lone label below its marker", () => {
    expect(placeLabels([item("a", 300, 100, 0)], frame)).toEqual({ a: "below" });
  });
  it("flips a label that would leave the frame", () => {
    expect(placeLabels([item("a", 300, 380, 0)], frame).a).not.toBe("below");
    expect(placeLabels([item("a", 590, 200, 0)], frame).a).toBe("left");
  });
  it("gives the higher priority the preferred side and moves the other clear of it", () => {
    const out = placeLabels([item("hazard", 300, 100, 1), item("own", 300, 130, 0)], frame);
    expect(out.own).toBe("below");
    expect(out.hazard).not.toBe("below");
  });
  it("still places every label when the frame is crowded", () => {
    const many = Array.from({ length: 6 }, (_, i) => item(`m${i}`, 300 + i * 4, 200, i));
    expect(Object.keys(placeLabels(many, frame))).toHaveLength(6);
  });
});
