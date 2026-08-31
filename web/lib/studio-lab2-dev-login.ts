/**
 * Studio Lab 2 local playground login (independent password, not Supabase).
 * Keep aligned with `src/studio/lab2/corpus-spec.ts`.
 */

export const STUDIO_LAB2_DEV_EMAIL = "studio-lab2@relay.test";
export const STUDIO_LAB2_DEFAULT_DEV_PASSWORD = "studio-lab2-dev-only";
export const STUDIO_LAB2_LOGIN_PATH = "/login/studio-lab2";
export const STUDIO_LAB2_DESTINATION = "/studio/lab2";

export function isStudioLab2Path(path: string): boolean {
  const p = path.split("?")[0] ?? "";
  return p === "/studio/lab2" || p.startsWith("/studio/lab2/");
}

export function studioLab2DevLoginEnabled(): boolean {
  if (typeof process !== "undefined" && process.env.NODE_ENV === "production") {
    return (process.env.NEXT_PUBLIC_RELAY_PILOT_UX_DEV_LOGIN ?? "").trim().toLowerCase() === "true";
  }
  return true;
}
