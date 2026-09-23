import type { ReactNode } from "react";
import { Shell } from "@/components/chrome/shell";

export default function FleetManagerLayout({ children }: { children: ReactNode }) {
  return <Shell role="fleet_manager">{children}</Shell>;
}
