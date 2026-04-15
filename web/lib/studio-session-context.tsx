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
import { RELAY_CREATOR_ID_STORAGE_KEY } from "./relay-api";

function readLocalStorage(): { token: string | null; creatorId: string | null } {
  if (typeof window === "undefined") {
    return { token: null, creatorId: null };
  }
  const token = window.localStorage.getItem("relay_session_token")?.trim() || null;
  const creatorId = window.localStorage.getItem(RELAY_CREATOR_ID_STORAGE_KEY)?.trim() || null;
  return { token, creatorId };
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

function resolveCreatorId(token: string | null, stored: string | null): string {
  if (token && stored) return stored;
  return envFallbackCreatorId;
}

export function StudioSessionProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [storedCreatorId, setStoredCreatorId] = useState<string | null>(null);

  const refresh = useCallback(() => {
    const { token: t, creatorId: c } = readLocalStorage();
    setToken(t);
    setStoredCreatorId(c);
  }, []);

  useEffect(() => {
    refresh();
    setReady(true);
    const onStorage = (e: StorageEvent) => {
      if (e.key === "relay_session_token" || e.key === RELAY_CREATOR_ID_STORAGE_KEY) {
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
    const hasRelaySession = Boolean(token);
    const creatorId = resolveCreatorId(token, storedCreatorId);
    return {
      ready,
      hasRelaySession,
      storedRelayCreatorId: storedCreatorId,
      creatorId
    };
  }, [ready, token, storedCreatorId]);

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
