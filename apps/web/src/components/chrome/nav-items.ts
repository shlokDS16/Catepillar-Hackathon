import { BarChart3, ClipboardList, GraduationCap, House, Inbox, Link2, Map, ShieldAlert } from "lucide-react";
import type { LucideIcon } from "lucide-react";

/**
 * The navigation tables (interaction-map §1, amended by D14). Labels are message keys under `nav`.
 * The operator dock has four destinations; Map moved inside Safety and keeps its /op/map route.
 */
export type NavItem = {
  key: "home" | "task" | "safety" | "training" | "inbox" | "fleetMap" | "analytics" | "ledger";
  href: string;
  icon: LucideIcon;
  /** Routes that live inside this destination but are not in the dock (the operator's Map, under Safety). */
  also?: readonly string[];
};

export const OPERATOR_NAV: readonly NavItem[] = [
  { key: "home", href: "/op", icon: House },
  { key: "task", href: "/op/task", icon: ClipboardList },
  { key: "safety", href: "/op/safety", icon: ShieldAlert, also: ["/op/map"] },
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
  const within = (root: string) => pathname === root || pathname.startsWith(`${root}/`);
  // An alias is more specific than Home's "/op" prefix, so it is checked first.
  return (
    items.find((item) => item.also?.some(within)) ??
    [...items].sort((a, b) => b.href.length - a.href.length).find((item) => within(item.href))
  );
}
