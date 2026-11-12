"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { activeItem, navFor, type NavItem, type ShellRole } from "@/components/chrome/nav-items";
import { useAppState } from "@/data/store";
import { useMotionLock } from "@/hero/use-motion-lock";

type NavProps = {
  role: ShellRole;
  /** Short badge text per item key, e.g. { safety: "2", training: "1 new" }. */
  badges?: Partial<Record<NavItem["key"], string>>;
};

/**
 * The dock: an ink bar below 1024 px, the left rail from 1024 px. Icon + label always, 96 px tall.
 * The operator's last dock slot is the SOS plate (SosControl), fixed over the reserved cell.
 */
export function Nav({ role, badges }: NavProps) {
  const items = navFor(role);
  const pathname = usePathname();
  const t = useTranslations("nav");
  const active = activeItem(items, pathname);
  const serverLocked = useAppState((s) => s.operator?.motion_locked ?? false);
  const shown = useMotionLock(serverLocked);
  return (
    <nav className="nav" data-sos={role === "operator" || undefined} aria-label={t("primary")} inert={shown || undefined}>
      {items.map(({ key, href, icon: Icon }) => {
        const badge = badges?.[key];
        return (
          <Link key={key} href={href} className="nav-item" aria-current={active?.key === key ? (pathname === href || pathname.startsWith(`${href}/`) ? "page" : "true") : undefined}>
            <span className="nav-icon">
              <Icon className="icon" aria-hidden="true" />
              {badge ? <span className="nav-badge tnum">{badge}</span> : null}
            </span>
            <span className="t-label">{t(key)}</span>
          </Link>
        );
      })}
    </nav>
  );
}

/** The page h1: the active nav item's name, except the operator Map, which has its own. Hidden for operators (the dock shows it); a display title in the FM band. */
export function ActiveTitle({ role, className }: { role: ShellRole; className?: string }) {
  const items = navFor(role);
  const pathname = usePathname();
  const t = useTranslations("nav");
  const active = activeItem(items, pathname);
  if (pathname === "/op/map" || pathname.startsWith("/op/map/")) return <h1 className={className}>{t("map")}</h1>;
  return active ? <h1 className={className}>{t(active.key)}</h1> : null;
}
