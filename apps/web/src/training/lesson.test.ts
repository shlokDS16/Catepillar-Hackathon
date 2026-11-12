import { describe, expect, it } from "vitest";
import { lessonGlyph, lessonProgress, lessonReduce, quizCorrect, quizScore, startLesson, type LessonAction, type LessonState } from "@/training/lesson";

const text = (s: string) => ({ en: s });
const lesson = {
  cards: [1, 2, 3].map((n) => ({ id: `k${n}`, kind: "rule" as const, title: text("t"), body: text("b"), pictogram: null, image_path: null, audio_id: null })),
  quiz: [1, 2, 3].map((n) => ({
    id: `q${n}`, prompt: text("p"), why: text("w"), correct_id: "a",
    choices: [{ id: "a", label: text("A"), pictogram: null }, { id: "b", label: text("B"), pictogram: null }],
  })),
} as unknown as Parameters<typeof startLesson>[0];

const run = (actions: LessonAction[], from: LessonState = startLesson(lesson)) => actions.reduce((s, a) => lessonReduce(s, a, lesson), from);
const toQuiz: LessonAction[] = [{ type: "next" }, { type: "next" }, { type: "next" }];

describe("lesson reducer", () => {
  it("starts on card 1 and walks the cards, then enters the quiz", () => {
    expect(startLesson(lesson).view).toEqual({ phase: "cards", card: 0 });
    expect(run([{ type: "next" }]).view).toEqual({ phase: "cards", card: 1 });
    expect(run(toQuiz).view).toEqual({ phase: "quiz", q: 0, picked: null });
  });
  it("goes back through cards but not before the first, and never inside the quiz", () => {
    expect(run([{ type: "back" }]).view).toEqual({ phase: "cards", card: 0 });
    expect(run([{ type: "next" }, { type: "back" }]).view).toEqual({ phase: "cards", card: 0 });
    expect(run([...toQuiz, { type: "back" }]).view).toEqual({ phase: "quiz", q: 0, picked: null });
  });
  it("locks on the first tap and ignores a second tap", () => {
    const s = run([...toQuiz, { type: "answer", choiceId: "b" }, { type: "answer", choiceId: "a" }]);
    expect(s.view).toEqual({ phase: "quiz", q: 0, picked: "b" });
    expect(s.answers).toEqual({ q1: "b" });
  });
  it("ignores an unknown choice and a Next before the reveal", () => {
    expect(run([...toQuiz, { type: "answer", choiceId: "zzz" }]).view).toEqual({ phase: "quiz", q: 0, picked: null });
    expect(run([...toQuiz, { type: "next" }]).view).toEqual({ phase: "quiz", q: 0, picked: null });
  });
  it("reaches the end after question 3 and scores 2 of 3 as 67", () => {
    const s = run([
      ...toQuiz,
      { type: "answer", choiceId: "a" }, { type: "next" },
      { type: "answer", choiceId: "b" }, { type: "next" },
      { type: "answer", choiceId: "a" }, { type: "next" },
    ]);
    expect(s.view).toEqual({ phase: "end" });
    expect(quizCorrect(lesson, s.answers)).toBe(2);
    expect(quizScore(lesson, s.answers)).toBe(67);
  });
  it("scores 0 and 100 at the extremes", () => {
    expect(quizScore(lesson, {})).toBe(0);
    expect(quizScore(lesson, { q1: "a", q2: "a", q3: "a" })).toBe(100);
  });
  it("ignores actions at the end", () => {
    const end: LessonState = { view: { phase: "end" }, answers: {} };
    expect(lessonReduce(end, { type: "next" }, lesson)).toBe(end);
    expect(lessonReduce(end, { type: "answer", choiceId: "a" }, lesson)).toBe(end);
  });
  it("reports progress as n / total", () => {
    expect(lessonProgress(run([{ type: "next" }]), lesson)).toEqual({ done: 2, total: 3 });
    expect(lessonProgress(run(toQuiz), lesson)).toEqual({ done: 1, total: 3 });
  });
});

describe("lessonGlyph", () => {
  it("maps authored names to signs and marks, with an info mark as the fallback", () => {
    expect(lessonGlyph("belt")).toEqual({ kind: "sign", name: "seatbelt" });
    expect(lessonGlyph("no")).toEqual({ kind: "mark", mark: "cross" });
    expect(lessonGlyph("whatever")).toEqual({ kind: "mark", mark: "info" });
    expect(lessonGlyph(null)).toEqual({ kind: "mark", mark: "info" });
  });
});
