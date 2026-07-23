import { LoginForm } from "@/components/LoginForm";
import { PatronChrome } from "@/components/PatronChrome";
import { PortableLoginForm } from "@/components/PortableLoginForm";
import {
  isPortableIdentityConfigured,
  isSupabaseIdentityConfigured,
  loadEnv,
  resolveIdentityProviderSafe
} from "@/lib/env";
import { loadSite } from "@/lib/load-site";
import type { IdentityProviderUx } from "@/lib/paywall/types";

export const dynamic = "force-dynamic";

export default function LoginPage() {
  const site = loadSite();
  const env = loadEnv();
  const mode = resolveIdentityProviderSafe(env);
  const identityMode: IdentityProviderUx =
    mode === "invalid" ? "invalid" : mode;
  const supabaseReady =
    mode === "supabase" && isSupabaseIdentityConfigured(env);
  const portableReady =
    mode === "portable" && isPortableIdentityConfigured(env);

  const title =
    mode === "portable"
      ? "Sign in"
      : mode === "supabase"
        ? "Sign in"
        : "Sign in";

  return (
    <PatronChrome site={site} identityMode={identityMode} compact>
      <div className="patron-account">
        <header className="eh-account-header">
          <h1>{title}</h1>
          <p className="lede">
            {mode === "portable"
              ? "Use your site account (email and password) on creator-owned Postgres."
              : mode === "supabase"
                ? "Use your site account on creator-owned Supabase Auth."
                : "Configure an identity provider to enable an authoritative session. Soft personas on the gallery are preview-only."}
          </p>
        </header>
        {mode === "invalid" ? (
          <section
            className="admin-banner admin-banner--degraded"
            aria-live="polite"
          >
            <p>
              <strong>Identity provider invalid</strong> —{" "}
              <span className="mono">ESCAPE_HATCH_IDENTITY_PROVIDER</span> must
              be <span className="mono">none</span>,{" "}
              <span className="mono">supabase</span>, or{" "}
              <span className="mono">portable</span>.
            </p>
          </section>
        ) : portableReady ? (
          <PortableLoginForm />
        ) : supabaseReady ? (
          <LoginForm />
        ) : (
          <section
            className="admin-banner admin-banner--degraded"
            aria-live="polite"
          >
            <p>
              <strong>Identity not configured</strong> — set{" "}
              <span className="mono">ESCAPE_HATCH_IDENTITY_PROVIDER</span> to{" "}
              <span className="mono">supabase</span> or{" "}
              <span className="mono">portable</span> with matching env. Local
              preview continues with soft personas only.
            </p>
            <p>
              <a href="/preview">Back to gallery</a>
              {" · "}
              <a href="/account">Account</a>
            </p>
          </section>
        )}
      </div>
    </PatronChrome>
  );
}
