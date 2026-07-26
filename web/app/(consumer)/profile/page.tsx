import type { Metadata } from "next";
import { PatronProfileDraftPage } from "@/components/dev/patron-profile/PatronProfileDraftPage";

export const metadata: Metadata = {
  title: "Your profile · Relay",
  description: "Your patron profile, collections, and favorites.",
  robots: { index: false, follow: false },
};

/** Signed-in patron's own profile — collections, favorites, and profile edit. */
export default function PatronProfilePage() {
  return <PatronProfileDraftPage />;
}
