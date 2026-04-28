"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Catches Supabase email-link hash params landing on any page (e.g. /#access_token=... or /#error=...)
 * and forwards them to /auth/confirm where they're properly handled.
 */
export function SupabaseHashRedirect() {
  const router = useRouter();
  useEffect(() => {
    const hash = window.location.hash;
    if (hash && (hash.includes("access_token") || hash.includes("error_code") || hash.includes("type=signup"))) {
      const q = window.location.search;
      router.replace(q ? `/auth/confirm${q}${hash}` : `/auth/confirm${hash}`);
    }
  }, [router]);
  return null;
}
