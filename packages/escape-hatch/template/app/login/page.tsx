import { ConsoleNav } from "@/components/ConsoleNav";
import { LoginForm } from "@/components/LoginForm";
import {
  isSupabaseIdentityConfigured,
  loadEnv
} from "@/lib/env";

export const dynamic = "force-dynamic";

export default function LoginPage() {
  const configured = isSupabaseIdentityConfigured(loadEnv());

  return (
    <>
      <ConsoleNav />
      <main className="console-page shell">
        <header className="console-hero">
          <p className="eyebrow">Account</p>
          <h1>Sign in</h1>
          <p className="lede">
            Creator-owned Supabase Auth for this site kit. Soft demo personas on
            visitor preview are not a substitute for this session.
          </p>
          <p className="meta muted">productionSafe: false · EH-030 identity path</p>
        </header>
        {configured ? (
          <LoginForm />
        ) : (
          <section className="admin-banner admin-banner--degraded" aria-live="polite">
            <p>
              <strong>Identity not configured</strong> — set{" "}
              <span className="mono">NEXT_PUBLIC_SUPABASE_URL</span> and{" "}
              <span className="mono">NEXT_PUBLIC_SUPABASE_ANON_KEY</span> (see{" "}
              <span className="mono">.env.example</span> and{" "}
              <span className="mono">scripts/bootstrap-identity.md</span>). Local
              preview continues with soft personas only.
            </p>
          </section>
        )}
      </main>
    </>
  );
}
