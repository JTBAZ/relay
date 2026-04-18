export type ActiveRole = "creator" | "supporter";

export function readActiveRoleFromDocumentCookie(): ActiveRole | null {
  if (typeof document === "undefined") return null;
  const m = document.cookie.match(/(?:^|;\s*)relay_active_role=(creator|supporter)/);
  return m ? (m[1] as ActiveRole) : null;
}

export function readActiveRoleFromHeaderCookie(cookieHeader: string | null): ActiveRole | null {
  if (!cookieHeader) return null;
  const m = cookieHeader.match(/(?:^|;\s*)relay_active_role=(creator|supporter)/);
  return m ? (m[1] as ActiveRole) : null;
}
