"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode
} from "react";
import { type ActiveRole, readActiveRoleFromDocumentCookie } from "./active-role";
import {
  RELAY_CREATOR_ID_STORAGE_KEY,
  fetchPatronSessionIfPresent,
  hasRelaySignedInCookie
} from "./relay-api";

/**
 * When true (default), prefer `primary_relay_creator_id` / `studios[]` from `/me/session`.
 * Set `NEXT_PUBLIC_RELAY_STUDIO_FROM_SESSION=0` to force localStorage during rollback.
 */
function preferSessionStudioId(): boolean {
  if (typeof process === "undefined") return true;
  const raw = process.env.NEXT_PUBLIC_RELAY_STUDIO_FROM_SESSION?.trim();
  if (raw === "0" || raw === "false") return false;
  return true;
}

function readLocalStorage(): {
  signedIn: boolean;
  creatorId: string | null;
  activeRole: ActiveRole | null;
} {
  if (typeof window === "undefined") {
    return { signedIn: false, creatorId: null, activeRole: null };
  }
  const signedIn = hasRelaySignedInCookie();
  const creatorId = window.localStorage.getItem(RELAY_CREATOR_ID_STORAGE_KEY)?.trim() || null;
  const activeRole = signedIn ? readActiveRoleFromDocumentCookie() : null;
  return { signedIn, creatorId, activeRole };
}

/** Call after bootstrap or Patreon flows update localStorage / session in the same tab. */
export function emitStudioSessionUpdate(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event("relay-studio-session"));
}

type StudioSessionValue = {
  /** True once client has read localStorage (and optionally session). */
  ready: boolean;
  /** Opaque Relay patron session (MT-033). */
  hasRelaySession: boolean;
  /** UI lens from `relay_active_role` cookie (GR-T0-2); authz must not use this. */
  activeRole: ActiveRole | null;
  /** Studio creator id from session projection or localStorage fallback. */
  storedRelayCreatorId: string | null;
  /**
   * Effective creator id for Library / Designer / Action Center.
   * Prefer server session studio id; localStorage / env are soak-period fallbacks only.
   */
  creatorId: string;
  /** True when creatorId came from `/me/session` rather than localStorage/env. */
  studioIdFromSession: boolean;
};

const StudioSessionContext = createContext<StudioSessionValue | null>(null);

const envFallbackCreatorId =
  (typeof process !== "undefined" && process.env.NEXT_PUBLIC_RELAY_CREATOR_ID?.trim()) || "creator_1";

function resolveCreatorId(
  signedIn: boolean,
  sessionStudioId: string | null,
  localStudioId: string | null
): { creatorId: string; fromSession: boolean } {
  if (signedIn && preferSessionStudioId() && sessionStudioId) {
    return { creatorId: sessionStudioId, fromSession: true };
  }
  if (signedIn && localStudioId) {
    return { creatorId: localStudioId, fromSession: false };
  }
  return { creatorId: envFallbackCreatorId, fromSession: false };
}

export function StudioSessionProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [localCreatorId, setLocalCreatorId] = useState<string | null>(null);
  const [sessionCreatorId, setSessionCreatorId] = useState<string | null>(null);
  const [activeRole, setActiveRole] = useState<ActiveRole | null>(null);

  const refresh = useCallback(() => {
    const { signedIn: s, creatorId: localId, activeRole: ar } = readLocalStorage();
    setSignedIn(s);
    setLocalCreatorId(localId);
    setActiveRole(ar);

    if (!s || !preferSessionStudioId()) {
      setSessionCreatorId(null);
      return;
    }

    void fetchPatronSessionIfPresent()
      .then((me) => {
        if (!me) {
          setSessionCreatorId(null);
          return;
        }
        const fromStudios = me.studios?.find((x) => x.is_primary)?.relay_creator_id?.trim();
        const primary = me.primary_relay_creator_id?.trim() || fromStudios || null;
        setSessionCreatorId(primary);
        // Keep localStorage as a telemetry-visible dual-write during soak.
        if (primary && typeof window !== "undefined") {
          try {
            window.localStorage.setItem(RELAY_CREATOR_ID_STORAGE_KEY, primary);
          } catch {
            /* ignore quota */
          }
        }
        if (me.active_role) setActiveRole(me.active_role);
      })
      .catch(() => {
        setSessionCreatorId(null);
      });
  }, []);

  useEffect(() => {
    refresh();
    setReady(true);
    const onStorage = (e: StorageEvent) => {
      if (e.key === RELAY_CREATOR_ID_STORAGE_KEY) {
        refresh();
      }
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener("relay-studio-session", refresh);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("relay-studio-session", refresh);
    };
  }, [refresh]);

  const value = useMemo<StudioSessionValue>(() => {
    const hasRelaySession = signedIn;
    const resolved = resolveCreatorId(signedIn, sessionCreatorId, localCreatorId);
    return {
      ready,
      hasRelaySession,
      activeRole,
      storedRelayCreatorId: sessionCreatorId ?? localCreatorId,
      creatorId: resolved.creatorId,
      studioIdFromSession: resolved.fromSession
    };
  }, [ready, signedIn, activeRole, localCreatorId, sessionCreatorId]);

  return (
    <StudioSessionContext.Provider value={value}>{children}</StudioSessionContext.Provider>
  );
}

export function useStudioSession(): StudioSessionValue {
  const ctx = useContext(StudioSessionContext);
  if (!ctx) {
    throw new Error("useStudioSession must be used within StudioSessionProvider");
  }
  return ctx;
}
