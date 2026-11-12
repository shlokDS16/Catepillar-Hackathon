import { LessonScreen } from "@/components/training/lesson-screen";

/** S5c `/op/training/lesson/[code]`: the lesson cards, the quiz and the end, all inside one route. */
export default async function Page({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return <LessonScreen code={code} />;
}
