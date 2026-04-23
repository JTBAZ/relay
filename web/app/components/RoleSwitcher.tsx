"use client";

/**
 * PE-I (BO-P4-01) — role switcher.
 *
 * Renders a small toggle that flips between "creator" (studio) and "supporter" (patron)
 * shells. Mount in the studio AppNav and the patron shell header (relay-shell.tsx); the
 * component is a no-op when the account only has one role available.
 *
 * Behavior:
 *   1. Fetch /me/session on mount; cache the available + active roles in local state.
 *   2. On click, POST /me/active-role with the requested role; on success, push the user
 *      to the role's natural landing page so the next render uses the new shell.
 *   3. Surface a small inline error if the server rejects the role (defensive — UI hides
 *      the unavailable option so the only way this fires is a stale tab).
 *
 * Why a redirect? The active-role cookie is read at module init in `useStudioSession()` and
 * other shell guards. A push() to the canonical landing page guarantees those reads see the
 * fresh cookie. Refusing to redirect would leave the user staring at the wrong shell until
 * they manually navigated.
 */

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Repeat } from "lucide-react";
import {
  fetchPatronSessionIfPresent,
  setActiveRole,
  type ActiveRole,
  type PatronSessionMe
} from "@/lib/relay-api";
import { emitStudioSessionUpdate } from "@/lib/studio-session-context";

const LANDING_BY_ROLE: Record<ActiveRole, string> = {
  creator: "/designer",
  supporter: "/patron/feed"
};

const LABEL_BY_ROLE: Record<ActiveRole, string> = {
  creator: "Studio",
  supporter: "Supporter"
};

export interface RoleSwitcherProps {
  /** Visual variant for the surrounding shell. */
  variant?: "studio" | "patron";
  /**
   * When true, redirect to the role's landing page after a successful switch. Default true.
   * Set false in narrow contexts (e.g. unit tests, or future surfaces that already render the
   * correct shell for both roles).
   */
  redirectAfterSwitch?: boolean;
}

export function RoleSwitcher({
  variant = "studio",
  redirectAfterSwitch = true
}: RoleSwitcherProps): React.ReactElement | null {
  const router = useRouter();
  const [me, setMe] = useState<PatronSessionMe | null | "loading">("loading");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshMe = useCallback(() => {
    void fetchPatronSessionIfPresent().then((m) => setMe(m ?? null));
  }, []);

  useEffect(() => {
    refreshMe();
    window.addEventListener("relay-studio-session", refreshMe);
    return () => window.removeEventListener("relay-studio-session", refreshMe);
  }, [refreshMe]);

  // Hidden when no session, when API didn't enrich (older builds), or when only one role available.
  if (me === "loading" || me === null) return null;
  const available = me.available_roles ?? [];
  if (available.length <= 1) return null;
  const current = (me.active_role ?? available[0]) as ActiveRole;
  const target = current === "creator" ? "supporter" : "creator";
  if (!available.includes(target)) return null;

  const handleSwitch = async () => {
    setBusy(true);
    setError(null);
    try {
      await setActiveRole(target);
      emitStudioSessionUpdate();
      if (redirectAfterSwitch) {
        router.push(LANDING_BY_ROLE[target]);
      } else {
        // Keep local state coherent for tests / non-redirecting callers.
        setMe({ ...me, active_role: target });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to switch role.");
    } finally {
      setBusy(false);
    }
  };

  const styles =
    variant === "studio"
      ? {
          btn: "border-[oklch(0.35_0.02_160)] bg-[oklch(0.2_0.01_160)] text-[oklch(0.88_0.008_160)] hover:border-[#00aa6f]/50 hover:bg-[oklch(0.24_0.02_160)]",
          muted: "text-[oklch(0.55_0.008_160)]"
        }
      : {
          btn: "border-[#2A2A2A] bg-[#141414] text-[#E0E0E0] hover:border-[#3A3A3A]",
          muted: "text-[#888]"
        };

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => void handleSwitch()}
        disabled={busy}
        title={`Switch to ${LABEL_BY_ROLE[target]} shell`}
        className={[
          "inline-flex items-center gap-1.5 rounded border px-2 py-1 text-[10px] font-semibold uppercase tracking-wider transition-colors",
          styles.btn,
          busy ? "opacity-60" : ""
        ].join(" ")}
      >
        {busy ? (
          <Loader2 size={11} className="animate-spin" aria-hidden />
        ) : (
          <Repeat size={11} aria-hidden />
        )}
        <span className="hidden sm:inline">
          Switch to {LABEL_BY_ROLE[target]}
        </span>
        <span className="sm:hidden">{LABEL_BY_ROLE[target]}</span>
      </button>
      {error ? (
        <span
          role="alert"
          className={`text-[10px] ${variant === "studio" ? "text-[#d36a6a]" : "text-[#d36a6a]"}`}
        >
          {error}
        </span>
      ) : (
        <span className={`hidden text-[10px] sm:inline ${styles.muted}`}>
          Currently {LABEL_BY_ROLE[current]}
        </span>
      )}
    </div>
  );
}
