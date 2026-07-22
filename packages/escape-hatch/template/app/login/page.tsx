import { ConsoleNav } from "@/components/ConsoleNav";
import { LoginForm } from "@/components/LoginForm";
import { PortableLoginForm } from "@/components/PortableLoginForm";
import {
  isPortableIdentityConfigured,
  isSupabaseIdentityConfigured,
  loadEnv,
  resolveIdentityProviderSafe
} from "@/lib/env";

export const dynamic = "force-dynamic";

export default function LoginPage() {
  const env = loadEnv();
  const mode = resolveIdentityProviderSafe(env);
  const supabaseReady =
    mode === "supabase" && isSupabaseIdentityConfigured(env);
  const portableReady =
    mode === "portable" && isPortableIdentityConfigured(env);

  const title =
    mode === "portable"
      ? "Sign in (portable)"
      : mode === "supabase"
        ? "Sign in (Supabase)"
        : "Sign in";

  return (
    <>
      <ConsoleNav />
      <main className="console-page shell">
        <header className="console-hero">
          <p className="eyebrow">Account</p>
          <h1>{title}</h1>
          <p className="lede">
            {mode === "portable"
              ? "Creator-owned portable auth (email + password) against your Postgres. Soft demo personas on visitor preview are not a substitute for this session."
              : mode === "supabase"
                ? "Creator-owned Supabase Auth for this site kit. Soft demo personas on visitor preview are not a substitute for this session."
                : "Configure ESCAPE_HATCH_IDENTITY_PROVIDER=supabase|portable with matching env to enable an authoritative session."}
          </p>
          <p className="meta muted">
            productionSafe: false · EH-031 identity paths
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
              <span className="mono">supabase</span> (Path A) or{" "}
              <span className="mono">portable</span> (Path B) and the matching
              env names in <span className="mono">.env.example</span> /{" "}
              <span className="mono">scripts/bootstrap-identity.md</span>. Local
              preview continues with soft personas only.
            </p>
          </section>
        )}
      </main>
    </>
  );
}
