import type { ReplayScores } from "@cat/shared";
import type { Assignment } from "@/data/types";

/**
 * Training progress kept in the client state: lesson quiz scores by assignment id, replay scores
 * by replay id. Filled when the port confirms a lesson_complete or a replay_submit.
 */
export type TrainingProgress = {
  lessonDone: Record<string, number>;
  replayDone: Record<string, ReplayScores>;
};

export const emptyProgress: TrainingProgress = { lessonDone: {}, replayDone: {} };

/** Lessons an operator may open without an assignment (S5a empty state). The fixture authors one lesson only. */
export const OPEN_LESSONS: readonly string[] = ["seatbelt_slopes"];

export type TrainingItem =
  | { key: string; kind: "replay"; assignmentId: string; lessonCode: string; replayId: string; status: "todo" | "done"; scores: ReplayScores | null; eventAt: string | null }
  | { key: string; kind: "lesson"; assignmentId: string; lessonCode: string; replayId: string | null; status: "todo" | "done"; quizScore: number | null; eventAt: string | null };

type EventRef = { id: string; sim_ts: string | null; recorded_at: string };

/** The time of the event an assignment came from, when that event is among the recent ones. */
export function eventTime(events: readonly EventRef[], eventId: string | null): string | null {
  if (!eventId) return null;
  const e = events.find((x) => x.id === eventId);
  return e ? (e.sim_ts ?? e.recorded_at) : null;
}

/**
 * One row per replay and per lesson. Open rows come first, oldest event first (an older event is
 * closer to forgotten), events with no known time last; within one assignment the replay comes
 * before its lesson, as in the loop (event, replay, lesson). Done rows follow, in the same order.
 * Equal times keep the order the assignments arrived in.
 */
export function trainingItems(assignments: readonly Assignment[], progress: TrainingProgress, events: readonly EventRef[] = []): TrainingItem[] {
  const rows: Array<{ item: TrainingItem; order: number }> = [];
  assignments.forEach((a, i) => {
    const eventAt = eventTime(events, a.because_event_id);
    if (a.replay_id) {
      const scores = progress.replayDone[a.replay_id] ?? null;
      rows.push({
        order: i * 2,
        item: { key: `r:${a.id}`, kind: "replay", assignmentId: a.id, lessonCode: a.lesson_code, replayId: a.replay_id, status: scores ? "done" : "todo", scores, eventAt },
      });
    }
    const quizScore = progress.lessonDone[a.id] ?? null;
    rows.push({
      order: i * 2 + 1,
      item: { key: `l:${a.id}`, kind: "lesson", assignmentId: a.id, lessonCode: a.lesson_code, replayId: a.replay_id, status: quizScore != null ? "done" : "todo", quizScore, eventAt },
    });
  });
  const time = (it: TrainingItem) => (it.eventAt ? Date.parse(it.eventAt) : Number.POSITIVE_INFINITY);
  rows.sort((x, y) => {
    const dx = x.item.status === "done" ? 1 : 0;
    const dy = y.item.status === "done" ? 1 : 0;
    if (dx !== dy) return dx - dy;
    const tx = time(x.item);
    const ty = time(y.item);
    if (tx !== ty) return tx < ty ? -1 : 1;
    return x.order - y.order;
  });
  return rows.map((r) => r.item);
}

/** My next assignment: the first open row, or null when everything is done. */
export function nextItem(items: readonly TrainingItem[]): TrainingItem | null {
  return items.find((i) => i.status === "todo") ?? null;
}

/** The most recently assigned lesson that is done, for the recurrence hint on Home. */
export function lastLessonDone(assignments: readonly Assignment[], progress: TrainingProgress): string | null {
  for (let i = assignments.length - 1; i >= 0; i--) {
    const a = assignments[i]!;
    if (progress.lessonDone[a.id] != null) return a.lesson_code;
  }
  return null;
}
