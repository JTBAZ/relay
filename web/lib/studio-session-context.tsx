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
import { RELAY_CREATOR_ID_STORAGE_KEY, hasRelaySignedInCookie } from "./relay-api";

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

/** Call after bootstrap or Patreon flows update localStorage in the same tab. */
export function emitStudioSessionUpdate(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event("relay-studio-session"));
}

type StudioSessionValue = {
  /** True once client has read localStorage (avoids SSR/CSR mismatch). */
  ready: boolean;
  /** Opaque Relay patron session (MT-033). */
  hasRelaySession: boolean;
  /** UI lens from `relay_active_role` cookie (GR-T0-2); authz must not use this. */
  activeRole: ActiveRole | null;
  /** Studio creator id when session + workspace row exist in storage. */
  storedRelayCreatorId: string | null;
  /**
   * Effective creator id for Library / Designer / Action Center.
   * When logged in with a stored workspace id, uses that; otherwise build-time env default (legacy dev).
   */
  creatorId: string;
};

const StudioSessionContext = createContext<StudioSessionValue | null>(null);

const envFallbackCreatorId =
  (typeof process !== "undefined" && process.env.NEXT_PUBLIC_RELAY_CREATOR_ID?.trim()) || "creator_1";

function resolveCreatorId(signedIn: boolean, stored: string | null): string {
  if (signedIn && stored) return stored;
  return envFallbackCreatorId;
}

export function StudioSessionProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [storedCreatorId, setStoredCreatorId] = useState<string | null>(null);
  const [activeRole, setActiveRole] = useState<ActiveRole | null>(null);

  const refresh = useCallback(() => {
    const { signedIn: s, creatorId: c, activeRole: ar } = readLocalStorage();
    setSignedIn(s);
    setStoredCreatorId(c);
    setActiveRole(ar);
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
    const creatorId = resolveCreatorId(signedIn, storedCreatorId);
    return {
      ready,
      hasRelaySession,
      activeRole,
      storedRelayCreatorId: storedCreatorId,
      creatorId
    };
  }, [ready, signedIn, activeRole, storedCreatorId]);

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
