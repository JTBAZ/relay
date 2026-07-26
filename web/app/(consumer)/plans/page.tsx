import type { Metadata } from "next";
import { Suspense } from "react";
import FanPlansClient from "./FanPlansClient";

export const metadata: Metadata = {
  title: "Relay · Plans",
  description: "Support artists with Tips — Free, Supporter, and Curator plans."
};

export default function FanPlansPage() {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8">
      <Suspense fallback={null}>
        <FanPlansClient />
      </Suspense>
    </main>
  );
}
