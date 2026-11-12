import type { LessonContent } from "@cat/shared";

/**
 * The Lesson (S5c, T11/T12) as a small state machine: cards, then the quiz, then the end.
 * A quiz answer locks at once and shows its result (lessons are practice, not assessment); Next
 * only works after the reveal; there is no Back inside the quiz and no retry.
 */
export type LessonView =
  | { phase: "cards"; card: number }
  | { phase: "quiz"; q: number; picked: string | null }
  | { phase: "end" };

export type LessonState = {
  view: LessonView;
  /** question id to the choice id the operator tapped. */
  answers: Record<string, string>;
};

export type LessonAction = { type: "next" } | { type: "back" } | { type: "answer"; choiceId: string };

type Shape = Pick<LessonContent, "cards" | "quiz">;

export function startLesson(lesson: Shape): LessonState {
  const view: LessonView =
    lesson.cards.length > 0 ? { phase: "cards", card: 0 } : lesson.quiz.length > 0 ? { phase: "quiz", q: 0, picked: null } : { phase: "end" };
  return { view, answers: {} };
}

export function lessonReduce(state: LessonState, action: LessonAction, lesson: Shape): LessonState {
  const v = state.view;
  switch (action.type) {
    case "next": {
      if (v.phase === "cards") {
        if (v.card < lesson.cards.length - 1) return { ...state, view: { phase: "cards", card: v.card + 1 } };
        return { ...state, view: lesson.quiz.length > 0 ? { phase: "quiz", q: 0, picked: null } : { phase: "end" } };
      }
      if (v.phase === "quiz") {
        if (v.picked == null) return state; // Next is not available before the reveal
        return { ...state, view: v.q < lesson.quiz.length - 1 ? { phase: "quiz", q: v.q + 1, picked: null } : { phase: "end" } };
      }
      return state;
    }
    case "back":
      return v.phase === "cards" && v.card > 0 ? { ...state, view: { phase: "cards", card: v.card - 1 } } : state;
    case "answer": {
      if (v.phase !== "quiz" || v.picked != null) return state; // the first tap locks
      const q = lesson.quiz[v.q];
      if (!q || !q.choices.some((c) => c.id === action.choiceId)) return state;
      return { view: { ...v, picked: action.choiceId }, answers: { ...state.answers, [q.id]: action.choiceId } };
    }
  }
}

export function quizCorrect(lesson: Shape, answers: Record<string, string>): number {
  return lesson.quiz.filter((q) => answers[q.id] === q.correct_id).length;
}

/** 0-100, rounded: 2 of 3 is 67 (interaction-map T12). No quiz scores 100. */
export function quizScore(lesson: Shape, answers: Record<string, string>): number {
  const n = lesson.quiz.length;
  return n === 0 ? 100 : Math.round((quizCorrect(lesson, answers) / n) * 100);
}

/** "2 / 4" for the cards; the quiz counts its own questions. */
export function lessonProgress(state: LessonState, lesson: Shape): { done: number; total: number } {
  const v = state.view;
  if (v.phase === "cards") return { done: v.card + 1, total: lesson.cards.length };
  if (v.phase === "quiz") return { done: v.q + 1, total: lesson.quiz.length };
  return { done: lesson.quiz.length, total: lesson.quiz.length };
}

/**
 * Lesson pictogram names (authored as "belt", "rollover"...) to the sign set we draw. A name with
 * no sign falls back to a result mark or, failing that, nothing (the label always carries it).
 */
export type LessonGlyph = { kind: "sign"; name: "seatbelt" | "proximity" | "vest" | "fault" | "heat" | "sos" } | { kind: "mark"; mark: "check" | "cross" | "info" };

const GLYPHS: Record<string, LessonGlyph> = {
  belt: { kind: "sign", name: "seatbelt" },
  seatbelt: { kind: "sign", name: "seatbelt" },
  rollover: { kind: "sign", name: "fault" },
  fault: { kind: "sign", name: "fault" },
  proximity: { kind: "sign", name: "proximity" },
  vest: { kind: "sign", name: "vest" },
  heat: { kind: "sign", name: "heat" },
  sos: { kind: "sign", name: "sos" },
  check: { kind: "mark", mark: "check" },
  yes: { kind: "mark", mark: "check" },
  no: { kind: "mark", mark: "cross" },
};

export function lessonGlyph(pictogram: string | null | undefined): LessonGlyph {
  return (pictogram && GLYPHS[pictogram]) || { kind: "mark", mark: "info" };
}
