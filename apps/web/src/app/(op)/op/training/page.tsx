import { GuideEntry } from "@/components/training/guide-entry";
import { Stub } from "@/components/ui/stub";

/**
 * S5a Training. The assignment list and the done scores are F17; this screen currently carries the
 * way into "How practice works", which also opens itself once before an operator's first practice.
 */
export default function Page() {
  return (
    <div className="training">
      <GuideEntry />
      <Stub task="F17" />
    </div>
  );
}
