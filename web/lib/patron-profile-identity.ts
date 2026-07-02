export type PatronProfileIdentityInput = {
  display_name: string | null | undefined;
  handle: string | null | undefined;
};

function normalizeIdentityLabel(value: string): string {
  return value.trim().toLowerCase();
}

/** Primary profile title — matches `/p/[handle]` hero: display name, or @handle when absent. */
export function patronProfilePrimaryTitle(input: PatronProfileIdentityInput): string {
  const display = input.display_name?.trim();
  const handle = input.handle?.trim();
  if (display) return display;
  if (handle) return `@${handle}`;
  return "Patron";
}

/**
 * Secondary @handle line — shown only when a display name exists and differs from handle.
 * When display name and handle are the same (case-insensitive), the @ line is omitted.
 */
/** Case-insensitive @handle match for "viewing own profile" UI gates. */
export function patronProfileHandlesMatch(
  viewerHandle: string | null | undefined,
  pageHandle: string | null | undefined
): boolean {
  const a = viewerHandle?.trim().replace(/^@+/, "").toLowerCase();
  const b = pageHandle?.trim().replace(/^@+/, "").toLowerCase();
  if (!a || !b) return false;
  return a === b;
}

export function patronProfileHandleSubtitle(input: PatronProfileIdentityInput): string | null {
  const display = input.display_name?.trim();
  const handle = input.handle?.trim();
  if (!handle) return null;
  if (!display) return null;
  if (normalizeIdentityLabel(display) === normalizeIdentityLabel(handle)) {
    return null;
  }
  return `@${handle}`;
}
