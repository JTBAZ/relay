"use client";

import type { ReactNode } from "react";
import { Lab3Overlay } from "./Lab3Overlay";

type Props = {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  restoreFocusRef?: { current: HTMLElement | null };
};

export function Lab3FilterSheet({ open, onClose, children, restoreFocusRef }: Props) {
  return (
    <Lab3Overlay
      open={open}
      title="Filters"
      onClose={onClose}
      variant="sheet-left"
      testId="filters"
      restoreFocusRef={restoreFocusRef}
    >
      {children}
    </Lab3Overlay>
  );
}
