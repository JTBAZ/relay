import { isDeepStrictEqual } from "node:util";
import { RENAME_NOTICE, type ChangeCart, type CommitReceipt } from "./types.js";

const count = (n: number, singular: string, plural = `${singular}s`) => `${n} ${n === 1 ? singular : plural}`;

/** Copy comes only from the server's simulated cart, never from model prose. */
export function previewCopy(cart: ChangeCart): string {
  const changed = cart.items.filter(item => !isDeepStrictEqual(item.before, item.after));
  const preserved = cart.items.filter(item => item.targetType === "post" &&
    (item.exception || item.preservedReason) && isDeepStrictEqual(item.before, item.after));
  const parts: string[] = [];
  if (changed.length) {
    const summary = (["post", "work", "series", "collection"] as const)
      .map(type => ({ type, n: changed.filter(item => item.targetType === type).length }))
      .filter(({ n }) => n > 0)
      .map(({ type, n }) => count(n, type, type === "series" ? "series" : `${type}s`));
    parts.push(`Preview: ${summary.join(", ")} would change.`);
  } else {
    parts.push("No Library changes are proposed.");
  }
  if (preserved.length) parts.push(`${count(preserved.length, "post title exception")} preserved.`);

  const modes = changed.filter(item => item.targetType === "post").map(item =>
    item.after && typeof item.after === "object" && "titleMode" in item.after ? item.after.titleMode : undefined);
  const modeLabels = [
    ["source", "use the last synced source title"],
    ["inherit_work", "inherit the work title"],
    ["custom", "use a custom Relay title"],
  ] as const;
  for (const [mode, label] of modeLabels) {
    const n = modes.filter(value => value === mode).length;
    if (n) parts.push(`After Apply, ${count(n, "post")} would ${label}.`);
  }
  if (cart.conflicts.length) parts.push("Resolve the preview conflicts before applying changes.");
  parts.push("No Library changes have been applied. Changes require Apply.", RENAME_NOTICE);
  return parts.join(" ");
}

/** Receipts attest only recorded actions and posts; they do not contain naming modes. */
export function receiptCopy(receipt: CommitReceipt): string {
  const posts = new Set(receipt.affectedPostIds).size;
  const preserved = new Set(receipt.preservedExceptions).size;
  const summary = `${count(receipt.actionCount, "action")}; ${count(posts, "post")} affected`;
  const parts = [receipt.reversedAt ? `Undone: ${summary} in the original Apply.` : `Applied: ${summary}.`];
  if (preserved) parts.push(`${count(preserved, "post title exception")} preserved in the original Apply.`);
  const labels={source:'posts using last synced source titles',inherit_work:'posts inheriting work titles',custom:'posts using custom titles',independent:'works using independent titles',inherit_series:'works inheriting series titles'};
  for(const mode of Object.keys(labels) as Array<keyof typeof labels>){const n=receipt.titleModeCounts?.[mode];if(n)parts.push(`Recorded at Apply: ${n} ${labels[mode]}.`);}
  parts.push(RENAME_NOTICE);
  return parts.join(" ");
}
