import { redirect } from "next/navigation";

/** Legacy `/patron` entry — supporter home is `/feed`. */
export default function LegacyPatronIndexPage() {
  redirect("/feed");
}
