import type { ReactNode } from "react";
import Link from "next/link";
import { AdminNav } from "./AdminNav";
import type { AdminIdentityState } from "@/lib/identity/admin-access";

type Props = {
  children: ReactNode;
  title: string;
  lede: string;
  identity?: AdminIdentityState;
};

/**
 * Operator chrome for /admin — distinct from visitor patron gallery.
 * Reuses Hatch Console tokens; no hero branding leak.
 */
export function AdminShell({ children, title, lede, identity }: Props) {
  const identityLine =
    identity?.mode === "local_preview"
      ? "identity not configured · local-preview mutations (not authentication)"
      : identity?.session && identity.isStaff
        ? `signed in as staff · ${identity.session.email ?? identity.session.userId}`
        : identity?.session
          ? "signed in · staff membership required for mutations"
          : "supabase identity configured · sign in required for mutations";

  return (
    <main className="console-page shell admin-shell">
      <header className="console-hero admin-hero">
        <p className="eyebrow">Operator · Admin</p>
        <h1>{title}</h1>
        <p className="lede">{lede}</p>
        <p className="meta muted">
          productionSafe: false · {identityLine} · not visitor gallery
        </p>
        <div className="admin-audit-links console-cta-row">
          <Link href="/library" className="admin-link-btn">
            Library truth
          </Link>
          <Link href="/structure" className="admin-link-btn">
            Structure
          </Link>
          <Link href="/preview" className="admin-link-btn admin-link-btn--quiet">
            Visitor preview
          </Link>
          {identity?.mode === "supabase" ? (
            identity.session ? (
              <form action="/auth/logout" method="post">
                <button type="submit" className="admin-link-btn admin-link-btn--quiet">
                  Sign out
                </button>
              </form>
            ) : (
              <Link href="/login" className="admin-link-btn">
                Sign in
              </Link>
            )
          ) : null}
        </div>
      </header>
      <AdminNav />
      {children}
    </main>
  );
}
