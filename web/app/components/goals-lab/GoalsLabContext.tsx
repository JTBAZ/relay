"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode
} from "react";

type GoalsLabContextValue = {
  open: boolean;
  setOpen: (open: boolean) => void;
  toggle: () => void;
  close: () => void;
};

const GoalsLabContext = createContext<GoalsLabContextValue | null>(null);

export function GoalsLabProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const toggle = useCallback(() => setOpen((v) => !v), []);
  const value = useMemo(
    () => ({ open, setOpen, toggle, close }),
    [open, toggle, close]
  );
  return <GoalsLabContext.Provider value={value}>{children}</GoalsLabContext.Provider>;
}

export function useGoalsLab(): GoalsLabContextValue {
  const ctx = useContext(GoalsLabContext);
  if (!ctx) {
    throw new Error("useGoalsLab must be used within GoalsLabProvider");
  }
  return ctx;
}

/** Safe for nav when provider may be absent outside lab. */
export function useGoalsLabOptional(): GoalsLabContextValue | null {
  return useContext(GoalsLabContext);
}
