import type { AnchorHTMLAttributes, ReactNode } from "react";

/**
 * Test-only stub for `next/link`. The real component pulls in Next.js' AppRouter context;
 * under bare RTL render there's no provider, which crashes with `useContext is null`.
 *
 * Stub rendering is deliberately dumb: same href + children + className passthrough, no
 * prefetch behavior, no client-side routing. Tests that need to assert click navigation
 * should mock `useRouter` separately.
 */
export default function Link({
  href,
  children,
  ...rest
}: { href: string; children: ReactNode } & Omit<
  AnchorHTMLAttributes<HTMLAnchorElement>,
  "href"
>) {
  return (
    <a href={typeof href === "string" ? href : "#"} {...rest}>
      {children}
    </a>
  );
}
