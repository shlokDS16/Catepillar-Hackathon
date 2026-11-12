import { LivePanel } from "./live-panel";

export const metadata = { title: "Spotter · live switch" };

/** The Live switch (D18). Hidden like the director, English only; fixtures stay the default. */
export default function LivePage() {
  return <LivePanel />;
}
