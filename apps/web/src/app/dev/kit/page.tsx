import { notFound } from "next/navigation";
import { Kit } from "./kit";

export const metadata = { title: "Spotter · kit" };

/**
 * Design-kit page for visual QA. Development only (404 in production) unless KIT_PUBLIC=1,
 * which the integrator sets only for a review where the alert tiers must be shown on a phone.
 */
export default function KitPage() {
  if (process.env.NODE_ENV === "production" && process.env.KIT_PUBLIC !== "1") notFound();
  return <Kit />;
}
