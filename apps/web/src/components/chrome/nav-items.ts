import { BarChart3, ClipboardList, GraduationCap, House, Inbox, Link2, Map, ShieldAlert } from "lucide-react";
import type { LucideIcon } from "lucide-react";

/** The navigation tables (interaction-map §1). Labels are message keys under `nav`. */
export type NavItem = { key: "home" | "task" | "safety" | "map" | "training" | "inbox" | "fleetMap" | "analytics" | "ledger"; href: string; icon: LucideIcon };

export const OPERATOR_NAV: readonly NavItem[] = [
  { key: "home", href: "/op", icon: House },
  { key: "task", href: "/op/task", icon: ClipboardList },
  { key: "safety", href: "/op/safety", icon: ShieldAlert },
  { key: "map", href: "/op/map", icon: Map },
  { key: "training", href: "/op/training", icon: GraduationCap },
];

export const FLEET_MANAGER_NAV: readonly NavItem[] = [
  { key: "inbox", href: "/fm", icon: Inbox },
  { key: "fleetMap", href: "/fm/map", icon: Map },
  { key: "analytics", href: "/fm/analytics", icon: BarChart3 },
  { key: "ledger", href: "/fm/ledger", icon: Link2 },
];

export type ShellRole = "operator" | "fleet_manager";

/** Icons are components, so the table is resolved inside client components from the role. */
export function navFor(role: ShellRole): readonly NavItem[] {
  return role === "operator" ? OPERATOR_NAV : FLEET_MANAGER_NAV;
}

/** An item is active for its own route and its sub-screens (e.g. Training for a replay). */
export function activeItem(items: readonly NavItem[], pathname: string): NavItem | undefined {
  return [...items]
    .sort((a, b) => b.href.length - a.href.length)
    .find((item) => pathname === item.href || pathname.startsWith(`${item.href}/`));
}
