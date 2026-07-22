import type { ReactNode } from "react";
import Link from "next/link";
import { AdminNav } from "./AdminNav";

type Props = {
  children: ReactNode;
  title: string;
  lede: string;
};

/**
 * Operator chrome for /admin — distinct from visitor patron gallery.
 * Reuses Hatch Console tokens; no hero branding leak.
 */
export function AdminShell({ children, title, lede }: Props) {
  return (
    <main className="console-page shell admin-shell">
      <header className="console-hero admin-hero">
        <p className="eyebrow">Operator · Admin</p>
        <h1>{title}</h1>
        <p className="lede">{lede}</p>
        <p className="meta muted">
          productionSafe: false · stub adapters · local-operator mutations only
          (not authentication) · not visitor gallery
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
        </div>
      </header>
      <AdminNav />
      {children}
    </main>
  );
}
