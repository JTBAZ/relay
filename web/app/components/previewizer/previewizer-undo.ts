"use client";

import { useCallback, useMemo, useRef, useState } from "react";

const MAX_HISTORY = 40;

export type UndoSnapshot<T> = {
  label: string;
  state: T;
};

export function usePreviewizerUndo<T>(initial: T) {
  const [present, setPresent] = useState<T>(initial);
  const presentRef = useRef(present);
  presentRef.current = present;
  const pastRef = useRef<UndoSnapshot<T>[]>([]);
  const futureRef = useRef<UndoSnapshot<T>[]>([]);
  const [historyTick, setHistoryTick] = useState(0);

  const setWithUndo = useCallback((label: string, updater: T | ((prev: T) => T)) => {
    // Functional update so a mutatePresent in the same tick is not overwritten by a stale closure.
    setPresent((prev) => {
      const next = typeof updater === "function" ? (updater as (prev: T) => T)(prev) : updater;
      pastRef.current = [...pastRef.current.slice(-MAX_HISTORY + 1), { label, state: prev }];
      futureRef.current = [];
      return next;
    });
    setHistoryTick((n) => n + 1);
  }, []);

  const replace = useCallback((next: T, resetHistory = false) => {
    setPresent(next);
    if (resetHistory) {
      pastRef.current = [];
      futureRef.current = [];
    }
    setHistoryTick((n) => n + 1);
  }, []);

  /** Update present state without creating an undo snapshot (e.g. live drag). */
  const mutatePresent = useCallback((updater: (prev: T) => T) => {
    setPresent((prev) => updater(prev));
  }, []);

  const undo = useCallback(() => {
    const prev = pastRef.current.pop();
    if (!prev) return false;
    futureRef.current = [{ label: "redo", state: presentRef.current }, ...futureRef.current];
    setPresent(prev.state);
    setHistoryTick((n) => n + 1);
    return true;
  }, []);

  const redo = useCallback(() => {
    const next = futureRef.current.shift();
    if (!next) return false;
    pastRef.current = [...pastRef.current, { label: "undo", state: presentRef.current }];
    setPresent(next.state);
    setHistoryTick((n) => n + 1);
    return true;
  }, []);

  void historyTick;
  const canUndo = pastRef.current.length > 0;
  const canRedo = futureRef.current.length > 0;

  return useMemo(
    () => ({
      present,
      setPresent: setWithUndo,
      replace,
      mutatePresent,
      undo,
      redo,
      canUndo,
      canRedo
    }),
    [present, setWithUndo, replace, mutatePresent, undo, redo, canUndo, canRedo]
  );
}
