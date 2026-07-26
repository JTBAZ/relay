import { redirect } from "next/navigation";

/** Hatch Console lands on Library truth (audit before structure). */
export default function HomePage() {
  redirect("/library");
}
