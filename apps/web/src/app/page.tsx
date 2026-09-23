import { Plate } from "@/components/ui/plate";

/** Placeholder until the shells land (F03): the first-launch flow will own this route. */
export default function Home() {
  return (
    <main className="mx-auto flex max-w-content flex-col gap-6 px-gutter py-6">
      <Plate rule="heavy" className="max-w-hero">
        <p className="t-label text-ink-2">Spotter</p>
        <p className="t-state">Ready</p>
        <p className="t-body">An operator companion for Cat machines.</p>
      </Plate>
    </main>
  );
}
