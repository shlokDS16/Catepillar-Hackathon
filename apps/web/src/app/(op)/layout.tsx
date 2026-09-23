import type { ReactNode } from "react";
import { Shell } from "@/components/chrome/shell";

export default function OperatorLayout({ children }: { children: ReactNode }) {
  return <Shell role="operator">{children}</Shell>;
}
