"use client";

import { LabStagingDock } from "@/app/components/studio/LabStagingDock";
import type { ImportBinItem } from "@/app/components/LibraryImportBay";
import { Lab3Overlay } from "./Lab3Overlay";

type Props = {
  open: boolean;
  creatorId: string;
  onClose: () => void;
  onError?: (message: string) => void;
  onAddToNewPost?: (items: ImportBinItem[]) => void;
  restoreFocusRef?: { current: HTMLElement | null };
};

export function Lab3ImportDialog({
  open,
  creatorId,
  onClose,
  onError,
  onAddToNewPost,
  restoreFocusRef
}: Props) {
  return (
    <Lab3Overlay
      open={open}
      title="Import"
      onClose={onClose}
      variant="center"
      size="lg"
      testId="import"
      restoreFocusRef={restoreFocusRef}
    >
      <LabStagingDock
        creatorId={creatorId}
        onError={onError}
        onAddToNewPost={(items) => {
          onAddToNewPost?.(items);
          onClose();
        }}
        libraryOnly
      />
    </Lab3Overlay>
  );
}
