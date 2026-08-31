import type { Collection } from "@/lib/relay-api";

export function lab3RailShouldOpen(lens: "collections" | "schedule" | null): boolean {
  return lens === "schedule";
}

export function newestCollectionId(items: Collection[]): string | null {
  if (items.length === 0) return null;
  const newest = [...items].sort(
    (a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at)
  )[0];
  return newest?.collection_id ?? null;
}
