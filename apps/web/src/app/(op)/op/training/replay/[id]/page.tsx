import { ReplayScreen } from "@/components/replay/replay-screen";

/**
 * S5b `/op/training/replay/[id]`: one route for the whole replay. The phase is internal state,
 * so the browser Back cannot skip into a later phase (interaction-map §1).
 */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ReplayScreen replayId={id} />;
}
