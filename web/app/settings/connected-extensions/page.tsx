import Link from "next/link";
import { ConnectedExtensionsClient } from "./ConnectedExtensionsClient";

export default function ConnectedExtensionsPage() {
  return (
    <main className="mx-auto max-w-3xl space-y-6 p-8 text-stone-200">
      <p>
        <Link
          href="/patron/profile"
          className="text-amber-400 underline decoration-amber-400/60 hover:text-amber-300"
        >
          ← Profile
        </Link>
        {" · "}
        <Link
          href="/"
          className="text-amber-400 underline decoration-amber-400/60 hover:text-amber-300"
        >
          Gallery
        </Link>
      </p>

      <div>
        <h1 className="font-[family-name:var(--font-display)] text-2xl text-stone-50">
          Connected extensions
        </h1>
        <p className="mt-2 text-sm text-stone-400">
          Devices and browsers where you approved the Relay extension. Revoke any session you no
          longer trust.
        </p>
      </div>

      <ConnectedExtensionsClient />
    </main>
  );
}
