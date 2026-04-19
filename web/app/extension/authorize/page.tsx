import { Suspense } from "react";
import { AuthorizeClient } from "./AuthorizeClient";

export default function ExtensionAuthorizePage() {
  return (
    <Suspense
      fallback={
        <main className="mx-auto max-w-lg p-8 text-stone-300">
          <p>Loading…</p>
        </main>
      }
    >
      <AuthorizeClient />
    </Suspense>
  );
}
