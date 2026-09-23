/** Card-based micro-lesson content (api-contracts §5, D10): 3-5 cards + a 3-question icon quiz. */
import { z } from "zod";
import { I18nText } from "./enums";

export const LessonCard = z.object({ id: z.string(), kind: z.enum(["rule", "why", "how", "example", "check"]),
  title: I18nText, body: I18nText, pictogram: z.string(), image_path: z.string().nullable(),
  audio_id: z.string().nullable() });                                 // phrase id → AUDIO_MANIFEST (§13, UI-17)
export const QuizQuestion = z.object({ id: z.string(), prompt: I18nText,
  choices: z.array(z.object({ id: z.string(), label: I18nText, pictogram: z.string() })).min(2).max(4),
  correct_id: z.string(), why: I18nText });                          // correct_id is sent: lessons are practice, not assessment
export const LessonContent = z.object({
  code: z.string(), title: I18nText, duration_s: z.number().int().max(120),
  cards: z.array(LessonCard).min(3).max(5),
  quiz: z.array(QuizQuestion).length(3),
  video_path: z.string().nullable(),                                  // P1 (Flow video)
  source_refs: z.array(z.string()),
});

export type LessonContent = z.infer<typeof LessonContent>;
