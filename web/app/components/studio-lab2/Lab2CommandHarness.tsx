"use client";

import CommandBox, {
  type CommandBoxProps,
  type Lab2CommandAppliedHint,
  type Lab2CommandHarnessState
} from "@/app/components/studio/command/CommandBox";

export type { Lab2CommandAppliedHint, Lab2CommandHarnessState };

/** Lab 2 strip: shared CommandBox plus playground Reset. */
export default function Lab2CommandHarness(props: CommandBoxProps) {
  return (
    <CommandBox
      {...props}
      surface="lab2"
      showResetBaseline
      label={props.label ?? "Lab 2 command"}
    />
  );
}
