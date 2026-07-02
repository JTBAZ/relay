import { redirect } from "next/navigation";
import { pilotUxDevLoginEnabled } from "@/lib/pilot-ux-dev-accounts";

/** Dev alias — canonical patron profile lives at `/profile`. */
export default function DevPatronProfilePage() {
  if (!pilotUxDevLoginEnabled()) {
    redirect("/profile");
  }
  redirect("/profile");
}
