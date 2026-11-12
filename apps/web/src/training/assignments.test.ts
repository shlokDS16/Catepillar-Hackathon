import { describe, expect, it } from "vitest";
import { emptyProgress, lastLessonDone, nextItem, trainingItems } from "@/training/assignments";

const A = { id: "a1", lesson_code: "seatbelt_slopes", because_event_id: "e1", replay_id: "r1" };
const B = { id: "a2", lesson_code: "faulty_machine_nearby", because_event_id: "e2", replay_id: null };
const events = [
  { id: "e1", sim_ts: "2026-11-12T10:42:00Z", recorded_at: "2026-11-12T10:42:05Z" },
  { id: "e2", sim_ts: null, recorded_at: "2026-11-12T09:00:00Z" },
];

describe("trainingItems", () => {
  it("puts a replay before its own lesson and gives lesson-only assignments one row", () => {
    expect(trainingItems([A], emptyProgress).map((i) => i.key)).toEqual(["r:a1", "l:a1"]);
    expect(trainingItems([B], emptyProgress).map((i) => i.kind)).toEqual(["lesson"]);
  });
  it("orders open rows oldest event first, unknown times last", () => {
    const c = { id: "a3", lesson_code: "x", because_event_id: "nope", replay_id: null };
    expect(trainingItems([c, A, B], emptyProgress, events).map((i) => i.key)).toEqual(["l:a2", "r:a1", "l:a1", "l:a3"]);
  });
  it("moves done rows after open ones, keeping the same order", () => {
    const progress = { lessonDone: { a2: 67 }, replayDone: {} };
    const items = trainingItems([A, B], progress, events);
    expect(items.map((i) => [i.key, i.status])).toEqual([["r:a1", "todo"], ["l:a1", "todo"], ["l:a2", "done"]]);
    expect(items[2]).toMatchObject({ quizScore: 67 });
  });
  it("marks a replay done with its scores and picks the next open row", () => {
    const scores = { safety: 80, procedure: 70, efficiency: 60 };
    const items = trainingItems([A], { lessonDone: {}, replayDone: { r1: scores } }, events);
    expect(items[0]).toMatchObject({ key: "l:a1", status: "todo" });
    expect(items[1]).toMatchObject({ key: "r:a1", status: "done", scores });
    expect(nextItem(items)?.key).toBe("l:a1");
  });
  it("has no next item when everything is done, and none for an empty list", () => {
    expect(nextItem(trainingItems([B], { lessonDone: { a2: 100 }, replayDone: {} }))).toBeNull();
    expect(nextItem([])).toBeNull();
  });
  it("keeps arrival order for equal times", () => {
    const x = { id: "x", lesson_code: "p", because_event_id: null, replay_id: null };
    const y = { id: "y", lesson_code: "q", because_event_id: null, replay_id: null };
    expect(trainingItems([x, y], emptyProgress).map((i) => i.key)).toEqual(["l:x", "l:y"]);
  });
});

describe("lastLessonDone", () => {
  it("returns the code of the latest finished lesson", () => {
    expect(lastLessonDone([A, B], emptyProgress)).toBeNull();
    expect(lastLessonDone([A, B], { lessonDone: { a1: 100 }, replayDone: {} })).toBe("seatbelt_slopes");
  });
});
