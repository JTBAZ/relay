import { notFound } from "next/navigation";
import DevBenchClient from "./DevBenchClient";

export default function DevBenchPage() {
  if (
    process.env.NODE_ENV === "production" &&
    process.env.NEXT_PUBLIC_RELAY_SHOW_DEV_BENCH !== "true"
  ) {
    notFound();
  }

  return <DevBenchClient />;
}
