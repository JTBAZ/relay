import { redirect } from "next/navigation";

/**
 * Root `/` is handled by middleware (onboarding when logged out; role home when signed in).
 * This page is a fallback for direct renders.
 */
export default function RootPage() {
  redirect("/onboarding");
}
