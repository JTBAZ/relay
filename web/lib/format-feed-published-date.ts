/** ISO timestamps → MM/DD/YYYY; human-relative fixture strings pass through unchanged. */
export function formatFeedPublishedDate(raw: string): string {
  const time = Date.parse(raw);
  if (!Number.isFinite(time)) return raw;
  return new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(time));
}
