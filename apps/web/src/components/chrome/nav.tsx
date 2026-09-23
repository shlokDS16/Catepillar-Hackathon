"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { activeItem, navFor, type NavItem, type ShellRole } from "@/components/chrome/nav-items";

type NavProps = {
  role: ShellRole;
  /** Short badge text per item key, e.g. { safety: "2", training: "1 new" }. */
  badges?: Partial<Record<NavItem["key"], string>>;
};

/** Bottom bar below 1024 px, left rail from 1024 px. Icon + label always, 80 px targets. */
export function Nav({ role, badges }: NavProps) {
  const items = navFor(role);
  const pathname = usePathname();
  const t = useTranslations("nav");
  const active = activeItem(items, pathname);
  return (
    <nav className="nav" aria-label={t("primary")}>
      {items.map(({ key, href, icon: Icon }) => {
        const badge = badges?.[key];
        return (
          <Link key={key} href={href} className="nav-item" aria-current={active?.key === key ? "page" : undefined}>
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

/** The title row's screen name, taken from the active nav item. Sub-screens render their own. */
export function ActiveTitle({ role }: { role: ShellRole }) {
  const items = navFor(role);
  const pathname = usePathname();
  const t = useTranslations("nav");
  const active = activeItem(items, pathname);
  return active ? <h1 className="t-title">{t(active.key)}</h1> : null;
}
