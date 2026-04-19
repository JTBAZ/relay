import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Relay Extension Privacy",
  description:
    "What the Relay browser extension reads, sends, stores, and does not do — Patreon session cookie and Relay grant."
};

const sectionClass = "mt-10 space-y-3 text-sm leading-relaxed text-[color:var(--lib-fg)]";
const h2Class =
  "font-[family-name:var(--font-display)] text-xl font-semibold tracking-tight text-[color:var(--lib-fg)]";

export default function ExtensionPrivacyPage() {
  return (
    <main className="mx-auto min-h-dvh max-w-2xl px-4 py-12 pb-24">
      <p className="text-xs font-medium uppercase tracking-wide text-[color:var(--lib-fg-muted)]">
        Legal
      </p>
      <h1
        className={`mt-2 font-[family-name:var(--font-display)] text-3xl font-semibold tracking-tight text-[color:var(--lib-fg)]`}
      >
        Relay browser extension — privacy notice
      </h1>
      <p className="mt-4 text-sm leading-relaxed text-[color:var(--lib-fg-muted)]">
        This page describes the Relay connector extension for{" "}
        <a
          className="underline decoration-[color:var(--lib-fg-muted)] underline-offset-2 hover:text-[color:var(--lib-fg)]"
          href="https://www.patreon.com"
          rel="noopener noreferrer"
          target="_blank"
        >
          Patreon
        </a>{" "}
        creators. Production URL:{" "}
        <span className="text-[color:var(--lib-fg)]">https://relayapp.me/legal/extension-privacy</span>
        .
      </p>

      <section className={sectionClass} aria-labelledby="what-reads">
        <h2 id="what-reads" className={h2Class}>
          What the extension reads
        </h2>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            Only the Patreon web session cookie named <code className="rounded bg-black/10 px-1 py-0.5">session_id</code>{" "}
            on <code className="rounded bg-black/10 px-1 py-0.5">patreon.com</code>, and only when you connect the
            extension (consent flow) or when that cookie changes while the extension is installed (
            <code className="rounded bg-black/10 px-1 py-0.5">cookies.onChanged</code>).
          </li>
          <li>
            The extension does not read Relay&apos;s web session cookie (<code className="rounded bg-black/10 px-1 py-0.5">relay_session</code>
            ); that cookie stays <strong>httpOnly</strong> and is never available to extension JavaScript.
          </li>
        </ul>
      </section>

      <section className={sectionClass} aria-labelledby="what-sends">
        <h2 id="what-sends" className={h2Class}>
          What it sends to Relay
        </h2>
        <ul className="list-disc space-y-2 pl-5">
          <li>The Patreon session cookie value (over HTTPS).</li>
          <li>Your Relay studio identifier (<code className="rounded bg-black/10 px-1 py-0.5">creator_id</code>).</li>
          <li>
            The extension grant token issued after you authorize — sent as{" "}
            <code className="rounded bg-black/10 px-1 py-0.5">Authorization: Bearer</code> on Relay API requests from
            the extension.
          </li>
        </ul>
      </section>

      <section className={sectionClass} aria-labelledby="what-not">
        <h2 id="what-not" className={h2Class}>
          What it does not do
        </h2>
        <ul className="list-disc space-y-2 pl-5">
          <li>No telemetry or analytics from the extension (product invariant P-5).</li>
          <li>No third-party SDKs, ads, or trackers.</li>
          <li>Does not read other cookies or arbitrary web pages.</li>
        </ul>
      </section>

      <section className={sectionClass} aria-labelledby="storage">
        <h2 id="storage" className={h2Class}>
          How Relay stores the Patreon session server-side
        </h2>
        <p>
          On Relay&apos;s servers, the Patreon session material is encrypted at rest using{" "}
          <strong>AES-256-GCM</strong> via <code className="rounded bg-black/10 px-1 py-0.5">TokenEncryption</code> in{" "}
          <code className="rounded bg-black/10 px-1 py-0.5">src/auth/cookie-store.ts</code> (see also{" "}
          <code className="rounded bg-black/10 px-1 py-0.5">src/lib/crypto.ts</code>).
        </p>
        <p>
          Cookie records are retained for up to <strong>90 days</strong> from when they were stored, per the default{" "}
          <code className="rounded bg-black/10 px-1 py-0.5">FilePatreonCookieStoreOptions.maxAgeDays</code> in that
          module (default <strong>90</strong> unless configured otherwise).
        </p>
        <p>
          Extension grants use a <strong>sliding 30-day</strong> validity window: successful use can extend the grant
          (product invariant P-6). Idle grants expire.
        </p>
      </section>

      <section className={sectionClass} aria-labelledby="revoke">
        <h2 id="revoke" className={h2Class}>
          Revocation and contact
        </h2>
        <p>
          You can review and revoke extension access anytime while signed into Relay:{" "}
          <Link
            className="font-medium text-[color:var(--lib-fg)] underline underline-offset-2"
            href="/settings/connected-extensions"
          >
            Connected extensions
          </Link>
          .
        </p>
        <p>
          Uninstalling the extension removes the grant from this device; a server-side grant may remain until it expires
          or until you revoke it in settings.
        </p>
        <p>
          Questions:{" "}
          <a className="font-medium underline underline-offset-2" href="mailto:support@relay.example">
            support@relay.example
          </a>{" "}
          (update to your live support address if different).
        </p>
      </section>

      <p className="mt-14 text-sm text-[color:var(--lib-fg-muted)]">
        <Link className="font-medium text-[color:var(--lib-fg)] underline underline-offset-2" href="/">
          Back to Relay
        </Link>
      </p>
    </main>
  );
}
