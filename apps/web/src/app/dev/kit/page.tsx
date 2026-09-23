import { notFound } from "next/navigation";
import { Kit } from "./kit";

export const metadata = { title: "Spotter · kit" };

/** Design-kit page for visual QA. Development only: it is a 404 in production builds. */
export default function KitPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <Kit />;
}
